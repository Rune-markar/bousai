export const CATEGORY_META = {
  water: { label: '水分', icon: 'drop', color: '#4b9ed7' },
  food: { label: '食料', icon: 'food', color: '#e49a43' },
  heat: { label: '燃料', icon: 'flame', color: '#e26e55' },
  hygiene: { label: '衛生', icon: 'sparkle', color: '#63a983' },
  light: { label: '灯り・電源', icon: 'bolt', color: '#b18a33' },
  comfort: { label: '快適', icon: 'heart', color: '#a87cb9' },
};

export const FOOD_GRAMS_PER_MEAL = 150;
export const MEALS_PER_PERSON_PER_DAY = 3;
export const FOOD_GRAMS_PER_PERSON_DAY = FOOD_GRAMS_PER_MEAL * MEALS_PER_PERSON_PER_DAY;
export const WATER_ML_PER_PERSON_DAY = 3000;
export const TOILET_USES_PER_PERSON_DAY = 5;
export const GAS_CANISTERS_PER_PERSON_WEEK = 6;
export const WATER_BOTTLE_REFERENCE_ML = 2000;
export const STOCKPILE_TARGET_DAYS = 3;
export const FIRST_GOAL_CATEGORY_PRIORITY = Object.freeze({ light: 0, food: 1, hygiene: 2 });

function isUnexpiredInventoryItem(item, today = new Date()) {
  const currentDate = new Date(today);
  currentDate.setHours(0, 0, 0, 0);
  return !item.expiry || new Date(`${item.expiry}T00:00:00`) >= currentDate;
}

const PORTABLE_TOILET_KIT_PATTERN = /(携帯|簡易|非常用|災害用).{0,8}トイレ|トイレ.{0,8}(セット|キット|一式)/;
const PORTABLE_TOILET_ACCESSORY_PATTERN = /(テント|便座|本体|収納|ケース|カバー)/;
const TOILET_BAG_PATTERN = /(便袋|排便袋)/;
const TOILET_COAGULANT_PATTERN = /(凝固剤|凝固材)/;
const TOILET_COMPONENT_ONLY_PATTERN = /トイレ.{0,4}(用|の|交換|追加).{0,4}(便袋|排便袋|凝固剤|凝固材)|(便袋|排便袋|凝固剤|凝固材).{0,4}(単品|のみ|交換|追加|詰替)/;

function portableToiletItemKind(item) {
  if (item.category !== 'hygiene') return null;
  const name = String(item.name || '');
  const hasBag = TOILET_BAG_PATTERN.test(name);
  const hasCoagulant = TOILET_COAGULANT_PATTERN.test(name);
  if (hasBag && hasCoagulant) return 'kit';
  const hasKitName = PORTABLE_TOILET_KIT_PATTERN.test(name) && !PORTABLE_TOILET_ACCESSORY_PATTERN.test(name);
  if (hasKitName && !TOILET_COMPONENT_ONLY_PATTERN.test(name)) return 'kit';
  if (hasBag) return 'bag';
  if (hasCoagulant) return 'coagulant';
  if (hasKitName) return 'kit';
  return null;
}

export function usableInventory(items = [], today = new Date()) {
  return items.filter((item) => Number(item.quantity) > 0 && isUnexpiredInventoryItem(item, today));
}

export function portableToiletUses(items = [], today = new Date()) {
  const counts = { kit: 0, bag: 0, coagulant: 0 };
  for (const item of usableInventory(items, today)) {
    const kind = portableToiletItemKind(item);
    if (kind) counts[kind] += Math.max(0, Number(item.quantity) || 0);
  }
  return counts.kit + Math.min(counts.bag, counts.coagulant);
}

export const daysFromNow = (amount) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const createInitialInventory = () => [
  { id: 'water', name: '飲料水 500ml', category: 'water', tier: 1, unit: '本', quantity: 18, target: 24, price: 80, volumeMl: 500, expiry: daysFromNow(94), note: 'ケース単位で管理' },
  { id: 'rice', name: 'アルファ米', category: 'food', tier: 1, unit: '食', quantity: 9, target: 12, price: 360, foodWeightG: 150, expiry: daysFromNow(420), note: '味の違うものを混ぜる' },
  { id: 'gas', name: 'カセットボンベ', category: 'heat', tier: 2, unit: '本', quantity: 6, target: 9, price: 180, expiry: '', note: '高温を避けて保管' },
  { id: 'stove', name: 'カセットコンロ', category: 'heat', tier: 1, unit: '台', quantity: 0, target: 1, price: 5000, expiry: '', note: '製造から10年を目安に点検・交換' },
  { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回分', quantity: 20, target: 35, price: 110, expiry: '', note: '1人1日5回、まず7日分を目安に家族人数で計算' },
  { id: 'battery', name: '乾電池（単3）', category: 'light', tier: 2, unit: '本', quantity: 8, target: 12, price: 90, expiry: daysFromNow(21), note: 'ライトとラジオ用' },
  { id: 'coffee', name: 'ドリップコーヒー', category: 'comfort', tier: 3, unit: '袋', quantity: 6, target: 6, price: 85, expiry: daysFromNow(180), note: '気持ちを落ち着けるもの' },
];

export function itemStats(item, today = new Date()) {
  const target = Math.max(Number(item.target) || 0, 0);
  const quantity = Math.max(Number(item.quantity) || 0, 0);
  const shortage = Math.max(target - quantity, 0);
  const ratio = target ? quantity / target : quantity ? 1 : 0;
  let daysToExpiry = null;
  let daysToCheck = null;
  let daysToRotationReminder = null;
  if (item.expiry) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    const end = new Date(`${item.expiry}T00:00:00`);
    daysToExpiry = Math.ceil((end - start) / 86400000);
  }
  if (item.nextCheck) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    daysToCheck = Math.ceil((new Date(`${item.nextCheck}T00:00:00`) - start) / 86400000);
  }
  if (item.rotationReminderDate) {
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    daysToRotationReminder = Math.ceil((new Date(`${item.rotationReminderDate}T00:00:00`) - start) / 86400000);
  }

  return {
    shortage,
    ratio,
    replenishmentCost: shortage * Math.max(Number(item.price) || 0, 0),
    daysToExpiry,
    isExpiring: daysToExpiry !== null && daysToExpiry <= 30,
    isExpired: daysToExpiry !== null && daysToExpiry < 0,
    daysToCheck,
    isCheckDue: daysToCheck !== null && daysToCheck <= 0,
    daysToRotationReminder,
    isRotationReminderDue: daysToRotationReminder !== null && daysToRotationReminder <= 0,
    priority: (daysToExpiry !== null && daysToExpiry < 0) || (quantity === 0 && target > 0) ? 'high' : ratio < 0.5 || (daysToExpiry !== null && daysToExpiry <= 7) ? 'medium' : shortage > 0 || (daysToExpiry !== null && daysToExpiry <= 30) || (daysToCheck !== null && daysToCheck <= 0) || (daysToRotationReminder !== null && daysToRotationReminder <= 0) ? 'low' : 'ok',
  };
}

const productKey = (item) => item.productId || (item.barcode ? `gtin:${item.barcode}` : `name:${item.name}`);

export function buildRotationQueue(items, today = new Date()) {
  const groups = new Map();
  for (const item of items) {
    if (item.rotationEnabled === false || Number(item.quantity) <= 0 || !item.expiry) continue;
    const key = productKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, ...itemStats(item, today) });
  }
  return [...groups.entries()].map(([key, lots]) => {
    lots.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    const nextLot = lots[0];
    const leadDays = Math.max(0, Number(nextLot.rotationLeadDays) || 30);
    const daysToRotate = nextLot.daysToExpiry - leadDays;
    return {
      key,
      nextLot,
      lots,
      totalQuantity: lots.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      daysToRotate,
      status: nextLot.isExpired ? 'expired' : daysToRotate <= 0 ? 'due' : daysToRotate <= 30 ? 'upcoming' : 'scheduled',
    };
  }).sort((a, b) => a.daysToRotate - b.daysToRotate || a.nextLot.tier - b.nextLot.tier);
}

export function consumeByRotation(items, key, amount = 1, today = new Date()) {
  let remaining = Math.max(0, Number(amount) || 0);
  const candidates = items.filter((item) => item.rotationEnabled !== false && productKey(item) === key && Number(item.quantity) > 0)
    .sort((a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31'));
  const consumed = new Map();
  for (const item of candidates) {
    if (!remaining) break;
    const quantity = Math.min(Number(item.quantity), remaining);
    consumed.set(item.id, quantity);
    remaining -= quantity;
  }
  const checked = new Date(today).toISOString().slice(0, 10);
  return {
    inventory: items.map((item) => consumed.has(item.id) ? { ...item, quantity: Number(item.quantity) - consumed.get(item.id), lastChecked: checked } : item),
    consumed: candidates.filter((item) => consumed.has(item.id)).map((item) => ({ item, quantity: consumed.get(item.id) })),
    unfulfilled: remaining,
  };
}

export function inventorySummary(items, household = 2, today = new Date()) {
  const rows = items.map((item) => ({ ...item, ...itemStats(item, today) }));
  const usableItems = new Set(usableInventory(items, today));
  const readinessRows = rows.map((item, index) => usableItems.has(items[index]) ? item : { ...item, ratio: 0 });
  const notificationRows = rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue || item.isRotationReminderDue);
  const tierWeight = (tier) => ({ 1: 3, 2: 2, 3: 1 }[tier] || 1);
  const categoryScores = Object.keys(CATEGORY_META).map((key) => {
    const categoryRows = readinessRows.filter((item) => item.category === key);
    if (!categoryRows.length) return { key, score: 0 };
    const weights = categoryRows.reduce((total, item) => total + tierWeight(item.tier), 0);
    const sum = categoryRows.reduce((total, item) => total + Math.min(item.ratio, 1) * tierWeight(item.tier), 0);
    return { key, score: Math.round((sum / weights) * 100) };
  });
  const categoryWeight = { water: 3, food: 3, hygiene: 2.5, heat: 2, light: 2, comfort: 0.5 };
  const totalCategoryWeight = categoryScores.reduce((sum, item) => sum + categoryWeight[item.key], 0);
  const score = totalCategoryWeight ? Math.round(categoryScores.reduce((sum, item) => sum + item.score * categoryWeight[item.key], 0) / totalCategoryWeight) : 0;
  const people = Math.max(1, Number(household) || 1);
  const usableRows = rows.filter((item, index) => usableItems.has(items[index]));
  const foodRows = usableRows.filter((item) => item.category === 'food');
  const waterRows = usableRows.filter((item) => item.category === 'water');
  const foodGrams = foodRows.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.foodWeightG) || 0), 0);
  const waterMl = waterRows.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.volumeMl) || 0), 0);
  const foodDays = foodGrams / (people * FOOD_GRAMS_PER_PERSON_DAY);
  const waterDays = waterMl / (people * WATER_ML_PER_PERSON_DAY);
  const toiletUnits = portableToiletUses(items, today);
  const toiletDays = toiletUnits / (people * TOILET_USES_PER_PERSON_DAY);
  const foodTargetGrams = people * FOOD_GRAMS_PER_PERSON_DAY * STOCKPILE_TARGET_DAYS;
  const waterTargetMl = people * WATER_ML_PER_PERSON_DAY * STOCKPILE_TARGET_DAYS;
  const rotationQueue = buildRotationQueue(items, today);

  return {
    rows,
    score,
    categoryScores,
    foodGrams,
    foodDays,
    foodTargetGrams,
    foodItemsMissingWeight: foodRows.filter((item) => Number(item.quantity) > 0 && !(Number(item.foodWeightG) > 0)).length,
    waterMl,
    waterDays,
    waterTargetMl,
    waterItemsMissingVolume: waterRows.filter((item) => Number(item.quantity) > 0 && !(Number(item.volumeMl) > 0)).length,
    survivalDays: Math.min(foodDays, waterDays),
    toiletUnits,
    toiletDays,
    householdStockpileDays: Math.min(foodDays, waterDays, toiletDays),
    shortageCount: rows.filter((item) => item.shortage > 0).length,
    expiringCount: rows.filter((item) => item.isExpiring).length,
    checkDueCount: rows.filter((item) => item.isCheckDue).length,
    rotationReminderDueCount: rows.filter((item) => item.isRotationReminderDue).length,
    notificationCount: notificationRows.length,
    replenishmentCost: rows.reduce((sum, item) => sum + item.replenishmentCost, 0),
    replenishmentPlan: rows.filter((item) => item.shortage > 0).sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3)
        || (priority[a.replenishmentPriority] ?? a.tier) - (priority[b.replenishmentPriority] ?? b.tier)
        || String(a.replenishBy || '9999-12-31').localeCompare(String(b.replenishBy || '9999-12-31'))
        || a.ratio - b.ratio;
    }),
    rotationQueue,
    rotationDueCount: rotationQueue.filter((item) => item.daysToRotate <= 0).length,
  };
}

export function stockpileUnitNeeds(items, household = 1, targetDays = 7, today = new Date()) {
  const people = Math.min(12, Math.max(1, Number(household) || 1));
  const days = Math.min(180, Math.max(1, Number(targetDays) || 1));
  const usable = usableInventory(items, today);
  const amount = (predicate, unitAmount = () => 1) => usable.filter(predicate).reduce((sum, item) => sum + Number(item.quantity || 0) * unitAmount(item), 0);
  const waterMl = amount((item) => item.category === 'water', (item) => Math.max(0, Number(item.volumeMl) || 0));
  const foodGrams = amount((item) => item.category === 'food', (item) => Math.max(0, Number(item.foodWeightG) || 0));
  const toiletUnits = portableToiletUses(items, today);
  const gasCanisters = amount((item) => item.category === 'heat' && /(カセット|ガス).*(ボンベ|ガス缶)|ボンベ/.test(String(item.name || '')));
  const stoves = amount((item) => item.category === 'heat' && /(カセット|ガス).*(コンロ|こんろ)/.test(String(item.name || '')));
  const waterTargetMl = people * WATER_ML_PER_PERSON_DAY * days;
  const foodTargetGrams = people * FOOD_GRAMS_PER_PERSON_DAY * days;
  const toiletTarget = people * TOILET_USES_PER_PERSON_DAY * days;
  const gasTarget = Math.ceil(people * GAS_CANISTERS_PER_PERSON_WEEK * days / 7);
  const gasShortage = Math.ceil(Math.max(0, gasTarget - gasCanisters));
  return [
    { key: 'water', label: '飲料水', reference: '2Lペットボトル', shortage: Math.ceil(Math.max(0, waterTargetMl - waterMl) / WATER_BOTTLE_REFERENCE_ML), unit: '本', current: `${(waterMl / 1000).toFixed(1)}L`, target: `${(waterTargetMl / 1000).toFixed(1)}L` },
    { key: 'food', label: '主食・保存食', reference: '1食150g相当', shortage: Math.ceil(Math.max(0, foodTargetGrams - foodGrams) / FOOD_GRAMS_PER_MEAL), unit: '食', current: `${Math.floor(foodGrams / FOOD_GRAMS_PER_MEAL)}食相当`, target: `${Math.ceil(foodTargetGrams / FOOD_GRAMS_PER_MEAL)}食` },
    { key: 'toilet', label: '携帯トイレ', reference: '1回分', shortage: Math.ceil(Math.max(0, toiletTarget - toiletUnits)), unit: '回分', current: `${toiletUnits}回分`, target: `${toiletTarget}回分` },
    { key: 'gas', label: 'カセットボンベ', reference: '一般的なカセットボンベ', shortage: gasShortage, unit: '本', current: `${gasCanisters}本`, target: `${gasTarget}本` },
    { key: 'stove', label: 'カセットコンロ', reference: '家庭用1台', shortage: Math.ceil(Math.max(0, 1 - stoves)), unit: '台', current: `${stoves}台`, target: '1台' },
  ];
}

export function stockpileBudgetProjection(items, household = 1, targetDays = 7, annualBudget = 0, today = new Date()) {
  const people = Math.max(1, Number(household) || 1);
  const target = Math.max(1, Number(targetDays) || 1);
  const budget = Math.max(0, Number(annualBudget) || 0);
  const definitions = [
    { key: 'water', label: '水', priority: 0, daily: people * WATER_ML_PER_PERSON_DAY, amount: (item) => item.category === 'water' ? Number(item.volumeMl) || 0 : 0 },
    { key: 'food', label: '食料', priority: 1, daily: people * FOOD_GRAMS_PER_PERSON_DAY, amount: (item) => item.category === 'food' ? Number(item.foodWeightG) || 0 : 0 },
    { key: 'toilet', label: '携帯トイレ', priority: 2, daily: people * TOILET_USES_PER_PERSON_DAY, amount: (item) => portableToiletItemKind(item) === 'kit' ? 1 : 0, stocked: () => portableToiletUses(items, today) },
  ];
  const resources = definitions.map((resource) => {
    const applicable = items.filter((item) => isUnexpiredInventoryItem(item, today) && resource.amount(item) > 0);
    const stocked = resource.stocked ? resource.stocked() : applicable.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * resource.amount(item), 0);
    const missing = Math.max(0, target * resource.daily - stocked);
    const candidate = applicable.filter((item) => Number(item.price) > 0).sort((a, b) => {
      const tierGap = (Number(a.tier) || 3) - (Number(b.tier) || 3);
      return tierGap || Number(a.price) / resource.amount(a) - Number(b.price) / resource.amount(b);
    })[0];
    const purchaseQuantity = candidate && missing > 0 ? Math.ceil(missing / resource.amount(candidate)) : 0;
    const estimatedCost = candidate ? purchaseQuantity * Number(candidate.price) : 0;
    return {
      key: resource.key,
      label: resource.label,
      priority: resource.priority,
      currentDays: stocked / resource.daily,
      missing,
      estimatedCost,
      hasPrice: Boolean(candidate),
      recommendation: candidate ? { itemId: candidate.id, name: candidate.name, unit: candidate.unit || '個', quantity: purchaseQuantity, unitPrice: Number(candidate.price), estimatedCost } : null,
    };
  });
  const totalCost = resources.reduce((sum, item) => sum + item.estimatedCost, 0);
  const purchasePlan = resources.filter((item) => item.missing > 0).sort((a, b) => a.currentDays - b.currentDays || a.priority - b.priority);
  const costComplete = purchasePlan.every((item) => item.hasPrice);
  let remainingAnnualBudget = budget;
  const annualPlan = purchasePlan.map((resource, index) => {
    const recommendation = resource.recommendation;
    const plannedQuantity = recommendation ? Math.min(recommendation.quantity, Math.floor(remainingAnnualBudget / recommendation.unitPrice)) : 0;
    const plannedCost = recommendation ? plannedQuantity * recommendation.unitPrice : 0;
    remainingAnnualBudget -= plannedCost;
    return { ...resource, order: index + 1, plannedQuantity, plannedCost, deferredQuantity: recommendation ? recommendation.quantity - plannedQuantity : 0 };
  });
  const months = !costComplete ? null : totalCost === 0 ? 0 : budget > 0 ? Math.ceil(totalCost / budget * 12) : null;
  return {
    resources,
    purchasePlan,
    annualPlan,
    totalCost,
    months,
    targetDays: target,
    annualBudget: budget,
    plannedThisYear: annualPlan.reduce((sum, item) => sum + item.plannedCost, 0),
    remainingAnnualBudget,
    costComplete,
    complete: resources.every((item) => item.currentDays >= target),
  };
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function transactionInsights(transactions = [], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const recent = transactions.filter((entry) => ['consume', 'rotate', 'discard'].includes(entry.type) && new Date(entry.at) >= cutoff);
  const totals = new Map();
  for (const entry of recent) totals.set(entry.name, (totals.get(entry.name) || 0) + Math.abs(Number(entry.quantityDelta) || 0));
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    consumed30Days: recent.reduce((sum, entry) => sum + Math.abs(Number(entry.quantityDelta) || 0), 0),
    discarded30Days: recent.filter((entry) => entry.type === 'discard' || entry.reason === '期限切れ・廃棄').reduce((sum, entry) => sum + Math.abs(Number(entry.quantityDelta) || 0), 0),
    topConsumed: top ? { name: top[0], quantity: top[1] } : null,
    entries30Days: recent.length,
  };
}
