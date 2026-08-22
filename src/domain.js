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
export const MAX_STOCKPILE_TARGET_DAYS = 30;
export const FIRST_GOAL_CATEGORY_PRIORITY = Object.freeze({ water: 0, food: 1, hygiene: 2, light: 3, heat: 4, comfort: 5 });

export function normalizeStockpileTargetDays(value, fallback = 7) {
  const parsed = Number(value);
  const fallbackValue = Number(fallback);
  const safeFallback = Number.isFinite(fallbackValue) && fallbackValue > 0 ? fallbackValue : 7;
  const selected = Number.isFinite(parsed) && parsed > 0 ? parsed : safeFallback;
  return Math.round(Math.min(MAX_STOCKPILE_TARGET_DAYS, Math.max(1, selected)));
}

export function isValidLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function localDateKey(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return isValidLocalDate(value) ? value : '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const part = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

export function isDrinkingCookingWater(item = {}) {
  if (item.category !== 'water') return false;
  if (item.waterPurpose === 'utility' || item.waterPurpose === 'needs-review') return false;
  if (item.waterPurpose === 'drinking-cooking') return true;
  const text = `${item.name || ''} ${item.note || ''}`;
  if (/(生活用水|雑用水|浴槽|風呂|トイレ用|洗濯用)/.test(text)) return false;
  return /(飲料|飲み水|保存水|ミネラルウォーター|ペットボトル|drinking|potable)/i.test(text);
}

function isUnexpiredInventoryItem(item, today = new Date()) {
  if (item.verificationStatus === 'needs-review') return false;
  const currentDate = localDateKey(today);
  return !item.expiry || (isValidLocalDate(item.expiry) && currentDate && String(item.expiry) >= currentDate);
}

const PORTABLE_TOILET_KIT_PATTERN = /(携帯|簡易|非常用|災害用).{0,8}トイレ|トイレ.{0,8}(携帯|簡易|非常用|災害用)/;
const PORTABLE_TOILET_ACCESSORY_PATTERN = /(掃除|清掃|洗剤|ブラシ|トイレットペーパー|衛生|消臭|防臭袋|ポリ袋|手袋|目隠し|ポンチョ|テント|便座|本体|収納|ケース|カバー)/;
const TOILET_CONTEXT_PATTERN = /(携帯|簡易|非常用|災害用).{0,8}トイレ|トイレ|排便|排泄|し尿/;
const TOILET_STRONG_BAG_PATTERN = /(便袋|排便袋|排泄袋)/;
const TOILET_CONTEXTUAL_BAG_PATTERN = /(汚物袋|処理袋|交換袋|トイレ(?:交換用|専用|用|の)?袋)/;
const TOILET_STRONG_COAGULANT_PATTERN = /(凝固剤|凝固材)/;
const TOILET_CONTEXTUAL_COAGULANT_PATTERN = /(吸水剤|吸水シート)/;
const NON_TOILET_COMPONENT_CONTEXT_PATTERN = /(ペット|犬|猫|おむつ|オムツ|生ごみ|油処理|廃油|清掃|掃除|嘔吐|血液)/;
const TOILET_STANDALONE_KIT_PATTERN = /トイレ(?:\s*[（(][^）)]*[）)])?\s*$/;
const TOILET_DIRECT_COMPLETE_MARKER_PATTERN = /トイレ\s*(?:セット|キット|\d+\s*回(?:分)?)(?:\s|$)/;

export function portableToiletItemKind(item) {
  if (item.category !== 'hygiene') return null;
  const name = String(item.name || '');
  if (NON_TOILET_COMPONENT_CONTEXT_PATTERN.test(name)) return null;
  const hasToiletContext = TOILET_CONTEXT_PATTERN.test(name);
  const hasBag = TOILET_STRONG_BAG_PATTERN.test(name) || (hasToiletContext && TOILET_CONTEXTUAL_BAG_PATTERN.test(name));
  const hasCoagulant = TOILET_STRONG_COAGULANT_PATTERN.test(name) || (hasToiletContext && TOILET_CONTEXTUAL_COAGULANT_PATTERN.test(name));
  if (hasBag && hasCoagulant) return 'kit';
  // An explicit single component is not a complete toilet, even when the name
  // also contains a broad product phrase such as "携帯トイレ" or "セット".
  if (hasBag) return 'bag';
  if (hasCoagulant) return 'coagulant';
  const hasKitName = PORTABLE_TOILET_KIT_PATTERN.test(name) && !PORTABLE_TOILET_ACCESSORY_PATTERN.test(name);
  // Broad words such as "portable toilet" are not enough when another noun
  // follows: it may be a mat, sheet, pouch, or an unknown accessory. Accept a
  // standalone toilet name or a completion marker directly after "toilet".
  if (hasKitName && (TOILET_STANDALONE_KIT_PATTERN.test(name) || TOILET_DIRECT_COMPLETE_MARKER_PATTERN.test(name))) return 'kit';
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
  return localDateKey(date);
};

export const createInitialInventory = () => [
  { id: 'water', name: '飲料水 500ml', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 18, target: 24, price: 80, volumeMl: 500, expiry: daysFromNow(94), note: 'ケース単位で管理' },
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
  let daysToExpiry = null;
  let daysToCheck = null;
  let daysToRotationReminder = null;
  const hasInvalidExpiry = Boolean(item.expiry) && !isValidLocalDate(item.expiry);
  if (item.expiry && !hasInvalidExpiry) {
    const start = new Date(`${localDateKey(today)}T00:00:00`);
    const end = new Date(`${item.expiry}T00:00:00`);
    daysToExpiry = Math.ceil((end - start) / 86400000);
  }
  if (item.nextCheck) {
    const start = new Date(`${localDateKey(today)}T00:00:00`);
    daysToCheck = Math.ceil((new Date(`${item.nextCheck}T00:00:00`) - start) / 86400000);
  }
  if (item.rotationReminderDate) {
    const start = new Date(`${localDateKey(today)}T00:00:00`);
    daysToRotationReminder = Math.ceil((new Date(`${item.rotationReminderDate}T00:00:00`) - start) / 86400000);
  }
  const isExpired = daysToExpiry !== null && daysToExpiry < 0;
  const needsVerification = item.verificationStatus === 'needs-review' || hasInvalidExpiry;
  const usableQuantity = isExpired || needsVerification ? 0 : quantity;
  const shortage = Math.max(target - usableQuantity, 0);
  const ratio = target ? usableQuantity / target : usableQuantity ? 1 : 0;

  return {
    usableQuantity,
    needsVerification,
    shortage,
    ratio,
    replenishmentCost: needsVerification ? 0 : shortage * Math.max(Number(item.price) || 0, 0),
    daysToExpiry,
    isExpiring: !needsVerification && daysToExpiry !== null && daysToExpiry <= 30,
    isExpired,
    daysToCheck,
    isCheckDue: !needsVerification && daysToCheck !== null && daysToCheck <= 0,
    daysToRotationReminder,
    isRotationReminderDue: !needsVerification && daysToRotationReminder !== null && daysToRotationReminder <= 0,
    priority: needsVerification || isExpired || (usableQuantity === 0 && target > 0) ? 'high' : ratio < 0.5 || (daysToExpiry !== null && daysToExpiry <= 7) ? 'medium' : shortage > 0 || (daysToExpiry !== null && daysToExpiry <= 30) || (daysToCheck !== null && daysToCheck <= 0) || (daysToRotationReminder !== null && daysToRotationReminder <= 0) ? 'low' : 'ok',
  };
}

const productKey = (item) => item.productId || (item.barcode ? `gtin:${item.barcode}` : `name:${item.name}`);

export function buildRotationQueue(items, today = new Date()) {
  const groups = new Map();
  for (const item of items) {
    const stats = itemStats(item, today);
    if (stats.needsVerification || Number(item.quantity) <= 0 || !item.expiry) continue;
    // Opting out of normal rotation must never hide an already expired lot
    // from the only disposal workflow.
    if (item.rotationEnabled === false && !stats.isExpired) continue;
    const key = productKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...item, ...stats });
  }
  return [...groups.entries()].map(([key, lots]) => {
    lots.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    const nextLot = lots[0];
    const parsedLeadDays = Number(nextLot.rotationLeadDays);
    const leadDays = Number.isFinite(parsedLeadDays) ? Math.min(365, Math.max(0, parsedLeadDays)) : 30;
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
  const candidates = items.filter((item) => isUnexpiredInventoryItem(item, today) && item.rotationEnabled !== false && productKey(item) === key && Number(item.quantity) > 0)
    .sort((a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31'));
  const consumed = new Map();
  for (const item of candidates) {
    if (!remaining) break;
    const quantity = Math.min(Number(item.quantity), remaining);
    consumed.set(item.id, quantity);
    remaining -= quantity;
  }
  const checked = localDateKey(today);
  const updatedInventory = items.map((item) => consumed.has(item.id) ? { ...item, quantity: Number(item.quantity) - consumed.get(item.id), lastChecked: checked } : item);
  const affectedProductIds = [...new Set(candidates.filter((item) => consumed.has(item.id)).map((item) => item.productId).filter(Boolean))];
  return {
    inventory: affectedProductIds.reduce((inventory, productId) => redistributeProductTargets(
      inventory,
      productId,
      items.filter((item) => item.productId === productId).reduce((sum, item) => sum + Math.max(0, Number(item.target) || 0), 0),
      today,
    ), updatedInventory),
    consumed: candidates.filter((item) => consumed.has(item.id)).map((item) => ({ item, quantity: consumed.get(item.id) })),
    unfulfilled: remaining,
  };
}

export function inventorySummary(items, household = 2, today = new Date()) {
  // A product goal belongs to all of its expiry lots together. Re-evaluate the
  // allocation for today's usable lots so consumption or midnight expiry does
  // not create a false shortage while another lot remains available.
  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  const effectiveItems = productIds.reduce((inventory, productId) => redistributeProductTargets(
    inventory,
    productId,
    items.filter((item) => item.productId === productId).reduce((sum, item) => sum + Math.max(0, Number(item.target) || 0), 0),
    today,
  ), items);
  const rows = effectiveItems.map((item) => ({ ...item, ...itemStats(item, today) }));
  const usableItems = new Set(usableInventory(effectiveItems, today));
  const readinessRows = rows.map((item, index) => usableItems.has(effectiveItems[index]) ? item : { ...item, ratio: 0 });
  const notificationRows = rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue || item.isRotationReminderDue);
  const tierWeight = (tier) => ({ 1: 3, 2: 2, 3: 1 }[tier] || 1);
  const categoryScores = Object.keys(CATEGORY_META).map((key) => {
    const categoryRows = readinessRows.filter((item) => item.category === key
      && (key !== 'water' || (isDrinkingCookingWater(item) && Number(item.volumeMl) > 0))
      && (key !== 'food' || Number(item.foodWeightG) > 0));
    if (!categoryRows.length) return { key, score: 0 };
    const weights = categoryRows.reduce((total, item) => total + tierWeight(item.tier), 0);
    const sum = categoryRows.reduce((total, item) => total + Math.min(item.ratio, 1) * tierWeight(item.tier), 0);
    return { key, score: Math.round((sum / weights) * 100) };
  });
  const categoryWeight = { water: 3, food: 3, hygiene: 2.5, heat: 2, light: 2, comfort: 0.5 };
  const totalCategoryWeight = categoryScores.reduce((sum, item) => sum + categoryWeight[item.key], 0);
  const score = totalCategoryWeight ? Math.round(categoryScores.reduce((sum, item) => sum + item.score * categoryWeight[item.key], 0) / totalCategoryWeight) : 0;
  const people = Math.max(1, Number(household) || 1);
  const usableRows = rows.filter((item, index) => usableItems.has(effectiveItems[index]));
  const foodRows = usableRows.filter((item) => item.category === 'food');
  const waterRows = usableRows.filter(isDrinkingCookingWater);
  const utilityWaterRows = usableRows.filter((item) => item.category === 'water' && item.waterPurpose === 'utility');
  const foodGrams = foodRows.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.foodWeightG) || 0), 0);
  const waterMl = waterRows.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.volumeMl) || 0), 0);
  const utilityWaterMl = utilityWaterRows.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.volumeMl) || 0), 0);
  const foodDays = foodGrams / (people * FOOD_GRAMS_PER_PERSON_DAY);
  const waterDays = waterMl / (people * WATER_ML_PER_PERSON_DAY);
  const toiletUnits = portableToiletUses(effectiveItems, today);
  const toiletDays = toiletUnits / (people * TOILET_USES_PER_PERSON_DAY);
  const foodTargetGrams = people * FOOD_GRAMS_PER_PERSON_DAY * STOCKPILE_TARGET_DAYS;
  const waterTargetMl = people * WATER_ML_PER_PERSON_DAY * STOCKPILE_TARGET_DAYS;
  const rotationQueue = buildRotationQueue(effectiveItems, today);
  const threeDayNeeds = new Map(stockpileUnitNeeds(effectiveItems, people, 3, today).map((need) => [need.key, need]));
  const essentialNotificationGaps = [
    { key: 'water', category: 'water', label: '飲料・調理用水', currentDays: waterDays },
    { key: 'food', category: 'food', label: '食料', currentDays: foodDays },
    { key: 'toilet', category: 'hygiene', label: '携帯トイレ', currentDays: toiletDays },
  ].filter((resource) => resource.currentDays < 3).map((resource) => ({
    ...resource,
    missingDays: Math.max(0, 3 - resource.currentDays),
    shortage: threeDayNeeds.get(resource.key)?.shortage || 0,
    unit: threeDayNeeds.get(resource.key)?.unit || '回分',
    reference: threeDayNeeds.get(resource.key)?.reference || '',
  }));

  return {
    rows,
    score,
    categoryScores,
    foodGrams,
    foodDays,
    foodTargetGrams,
    foodItemsMissingWeight: foodRows.filter((item) => Number(item.quantity) > 0 && !(Number(item.foodWeightG) > 0)).length,
    waterMl,
    utilityWaterMl,
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
    itemNotificationCount: notificationRows.length,
    essentialNotificationGaps,
    notificationCount: notificationRows.length + essentialNotificationGaps.length,
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

export function redistributeProductTargets(items = [], productId, productTarget = 0, today = new Date()) {
  const target = Math.max(0, Number(productTarget) || 0);
  const group = items.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.productId === productId)
    .sort((a, b) => {
      const aUsable = isUnexpiredInventoryItem(a.item, today);
      const bUsable = isUnexpiredInventoryItem(b.item, today);
      return Number(bUsable) - Number(aUsable)
        || String(a.item.expiry || '9999-12-31').localeCompare(String(b.item.expiry || '9999-12-31'));
    });
  if (!group.length) return items;
  const allocations = new Map(group.map(({ index }) => [index, 0]));
  let remaining = target;
  group.forEach(({ item, index }) => {
    const allocation = Math.min(remaining, Math.max(0, Number(item.quantity) || 0));
    allocations.set(index, allocation);
    remaining -= allocation;
  });
  if (remaining > 0) allocations.set(group[0].index, allocations.get(group[0].index) + remaining);
  return items.map((item, index) => allocations.has(index) ? { ...item, target: allocations.get(index) } : item);
}

export function stockpileUnitNeeds(items, household = 1, targetDays = 7, today = new Date()) {
  const people = Math.min(12, Math.max(1, Number(household) || 1));
  const days = normalizeStockpileTargetDays(targetDays, 7);
  const usable = usableInventory(items, today);
  const amount = (predicate, unitAmount = () => 1) => usable.filter(predicate).reduce((sum, item) => sum + Number(item.quantity || 0) * unitAmount(item), 0);
  const waterMl = amount(isDrinkingCookingWater, (item) => Math.max(0, Number(item.volumeMl) || 0));
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
  const target = normalizeStockpileTargetDays(targetDays, 7);
  const budget = Math.max(0, Number(annualBudget) || 0);
  const definitions = [
    { key: 'water', label: '水', priority: 0, daily: people * WATER_ML_PER_PERSON_DAY, amount: (item) => isDrinkingCookingWater(item) ? Number(item.volumeMl) || 0 : 0 },
    { key: 'food', label: '食料', priority: 1, daily: people * FOOD_GRAMS_PER_PERSON_DAY, amount: (item) => item.category === 'food' ? Number(item.foodWeightG) || 0 : 0 },
    { key: 'toilet', label: '携帯トイレ', priority: 2, daily: people * TOILET_USES_PER_PERSON_DAY, amount: (item) => portableToiletItemKind(item) === 'kit' ? 1 : 0, stocked: () => portableToiletUses(items, today) },
  ];
  const toiletPurchaseOption = (pool, missing, currentCounts) => {
    const cheapest = (kind) => pool.filter((item) => portableToiletItemKind(item) === kind && Number(item.price) > 0)
      .sort((a, b) => Number(a.price) - Number(b.price) || (Number(a.tier) || 3) - (Number(b.tier) || 3))[0];
    const kit = cheapest('kit');
    const bag = cheapest('bag');
    const coagulant = cheapest('coagulant');
    const quantity = missing > 0 ? Math.ceil(missing) : 0;
    if (!quantity) return null;
    let bagCount = Math.max(0, Number(currentCounts.bag) || 0);
    let coagulantCount = Math.max(0, Number(currentCounts.coagulant) || 0);
    const purchaseSteps = [];
    const appendStep = (itemsToBuy) => {
      const unitPrice = itemsToBuy.reduce((sum, item) => sum + Number(item.price), 0);
      const key = itemsToBuy.map((item) => item.id).join('+');
      const previous = purchaseSteps.at(-1);
      if (previous?.key === key) previous.quantity += 1;
      else purchaseSteps.push({ key, quantity: 1, unitPrice, items: itemsToBuy });
    };

    // Each action below adds exactly one usable toilet use. Existing unmatched
    // bags or coagulant are completed first when that is cheaper than a kit;
    // once balanced, compare a new component pair with a complete kit.
    for (let index = 0; index < quantity; index += 1) {
      const options = [];
      if (kit) options.push({ cost: Number(kit.price), items: [kit], kind: 'kit' });
      if (bagCount > coagulantCount && coagulant) options.push({ cost: Number(coagulant.price), items: [coagulant], kind: 'coagulant' });
      else if (coagulantCount > bagCount && bag) options.push({ cost: Number(bag.price), items: [bag], kind: 'bag' });
      else if (bag && coagulant) options.push({ cost: Number(bag.price) + Number(coagulant.price), items: [bag, coagulant], kind: 'pair' });
      const selected = options.sort((a, b) => a.cost - b.cost)[0];
      if (!selected) return null;
      appendStep(selected.items);
      if (selected.kind === 'bag') bagCount += 1;
      if (selected.kind === 'coagulant') coagulantCount += 1;
      if (selected.kind === 'pair') {
        bagCount += 1;
        coagulantCount += 1;
      }
    }

    const estimatedCost = purchaseSteps.reduce((sum, step) => sum + step.quantity * step.unitPrice, 0);
    const componentMap = new Map();
    purchaseSteps.forEach((step) => step.items.forEach((item) => {
      const current = componentMap.get(item.id) || { itemId: item.id, name: item.name, unit: item.unit || '個', quantity: 0, unitPrice: Number(item.price) };
      current.quantity += step.quantity;
      componentMap.set(item.id, current);
    }));
    const components = [...componentMap.values()];
    const singleStep = purchaseSteps.length === 1 ? purchaseSteps[0] : null;
    const singleItem = singleStep?.items.length === 1 ? singleStep.items[0] : null;
    return {
      itemId: components.map((item) => item.itemId).join('+'),
      name: components.map((item) => item.name).join('＋'),
      unit: singleItem ? singleItem.unit || '個' : singleStep ? '組' : '回分',
      unitPrice: singleStep ? singleStep.unitPrice : estimatedCost / quantity,
      quantity,
      estimatedCost,
      components,
      purchaseSteps,
    };
  };
  const currentToiletCounts = usableInventory(items, today).reduce((counts, item) => {
    const kind = portableToiletItemKind(item);
    if (kind) counts[kind] += Math.max(0, Number(item.quantity) || 0);
    return counts;
  }, { kit: 0, bag: 0, coagulant: 0 });
  const resources = definitions.map((resource) => {
    const applicable = items.filter((item) => isUnexpiredInventoryItem(item, today) && resource.amount(item) > 0);
    const stocked = resource.stocked ? resource.stocked() : applicable.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * resource.amount(item), 0);
    const missing = Math.max(0, target * resource.daily - stocked);
    const usableTemplates = applicable.filter((item) => Number(item.price) > 0);
    // An expired lot is never stock, but its verified package size and price can
    // remain useful as a last-resort template for purchasing a separate new lot.
    const historicalTemplates = items.filter((item) => item.verificationStatus !== 'needs-review'
      && (!item.expiry || isValidLocalDate(item.expiry))
      && resource.amount(item) > 0
      && Number(item.price) > 0);
    const templatePool = usableTemplates.length ? usableTemplates : historicalTemplates;
    const candidate = [...templatePool].sort((a, b) => {
      const tierGap = (Number(a.tier) || 3) - (Number(b.tier) || 3);
      return tierGap || Number(a.price) / resource.amount(a) - Number(b.price) / resource.amount(b);
    })[0];
    const usableToiletTemplates = items.filter((item) => isUnexpiredInventoryItem(item, today) && Number(item.price) > 0);
    const historicalToiletTemplates = items.filter((item) => item.verificationStatus !== 'needs-review' && (!item.expiry || isValidLocalDate(item.expiry)) && Number(item.price) > 0);
    const toiletOption = resource.key === 'toilet'
      ? toiletPurchaseOption(usableToiletTemplates, missing, currentToiletCounts) || toiletPurchaseOption(historicalToiletTemplates, missing, currentToiletCounts)
      : null;
    const purchaseQuantity = candidate && missing > 0 ? Math.ceil(missing / resource.amount(candidate)) : 0;
    const estimatedCost = toiletOption ? toiletOption.estimatedCost : candidate ? purchaseQuantity * Number(candidate.price) : 0;
    const recommendation = toiletOption || (candidate ? { itemId: candidate.id, name: candidate.name, unit: candidate.unit || '個', quantity: purchaseQuantity, unitPrice: Number(candidate.price), estimatedCost } : null);
    return {
      key: resource.key,
      label: resource.label,
      priority: resource.priority,
      currentDays: stocked / resource.daily,
      missing,
      estimatedCost,
      hasPrice: Boolean(recommendation),
      recommendation,
    };
  });
  const totalCost = resources.reduce((sum, item) => sum + item.estimatedCost, 0);
  const purchasePlan = resources.filter((item) => item.missing > 0).sort((a, b) => a.currentDays - b.currentDays || a.priority - b.priority);
  const costComplete = purchasePlan.every((item) => item.hasPrice);
  let remainingAnnualBudget = budget;
  const annualPlan = purchasePlan.map((resource, index) => {
    const recommendation = resource.recommendation;
    let plannedQuantity = 0;
    let plannedCost = 0;
    const plannedComponentMap = new Map();
    if (recommendation?.purchaseSteps) {
      recommendation.purchaseSteps.forEach((step) => {
        const affordable = Math.min(step.quantity, Math.floor((remainingAnnualBudget - plannedCost) / step.unitPrice));
        plannedQuantity += Math.max(0, affordable);
        plannedCost += Math.max(0, affordable) * step.unitPrice;
        if (affordable > 0) step.items.forEach((item) => {
          const current = plannedComponentMap.get(item.id) || { itemId: item.id, name: item.name, unit: item.unit || '個', quantity: 0, unitPrice: Number(item.price) };
          current.quantity += affordable;
          plannedComponentMap.set(item.id, current);
        });
      });
    } else if (recommendation) {
      plannedQuantity = Math.min(recommendation.quantity, Math.floor(remainingAnnualBudget / recommendation.unitPrice));
      plannedCost = plannedQuantity * recommendation.unitPrice;
    }
    remainingAnnualBudget -= plannedCost;
    return { ...resource, order: index + 1, plannedQuantity, plannedCost, plannedComponents: [...plannedComponentMap.values()], deferredQuantity: recommendation ? recommendation.quantity - plannedQuantity : 0 };
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
  const upperBound = new Date(now);
  const recent = transactions.filter((entry) => {
    if (!['consume', 'rotate', 'discard'].includes(entry.type)) return false;
    const occurredAt = new Date(entry.at);
    return Number.isFinite(occurredAt.getTime()) && occurredAt >= cutoff && occurredAt <= upperBound;
  });
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
