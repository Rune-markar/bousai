export const CATEGORY_META = {
  water: { label: '水分', icon: 'drop', color: '#4b9ed7' },
  food: { label: '食料', icon: 'food', color: '#e49a43' },
  heat: { label: '燃料', icon: 'flame', color: '#e26e55' },
  hygiene: { label: '衛生', icon: 'sparkle', color: '#63a983' },
  light: { label: '灯り・電源', icon: 'bolt', color: '#b18a33' },
  comfort: { label: '快適', icon: 'heart', color: '#a87cb9' },
};

export const daysFromNow = (amount) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
};

export const createInitialInventory = () => [
  { id: 'water', name: '飲料水 500ml', category: 'water', tier: 1, unit: '本', quantity: 18, target: 24, price: 80, volumeMl: 500, expiry: daysFromNow(94), note: 'ケース単位で管理' },
  { id: 'rice', name: 'アルファ米', category: 'food', tier: 1, unit: '食', quantity: 9, target: 12, price: 360, expiry: daysFromNow(420), note: '味の違うものを混ぜる' },
  { id: 'gas', name: 'カセットボンベ', category: 'heat', tier: 2, unit: '本', quantity: 6, target: 9, price: 180, expiry: '', note: '高温を避けて保管' },
  { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回分', quantity: 20, target: 35, price: 110, expiry: '', note: '家族5人×7日分' },
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

  return {
    shortage,
    ratio,
    replenishmentCost: shortage * Math.max(Number(item.price) || 0, 0),
    daysToExpiry,
    isExpiring: daysToExpiry !== null && daysToExpiry <= 30,
    isExpired: daysToExpiry !== null && daysToExpiry < 0,
    daysToCheck,
    isCheckDue: daysToCheck !== null && daysToCheck <= 0,
    priority: (daysToExpiry !== null && daysToExpiry < 0) || (quantity === 0 && target > 0) ? 'high' : ratio < 0.5 || (daysToExpiry !== null && daysToExpiry <= 7) ? 'medium' : shortage > 0 || (daysToExpiry !== null && daysToExpiry <= 30) || (daysToCheck !== null && daysToCheck <= 0) ? 'low' : 'ok',
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
  const candidates = items.filter((item) => productKey(item) === key && Number(item.quantity) > 0)
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

export function inventorySummary(items, household = 2) {
  const rows = items.map((item) => ({ ...item, ...itemStats(item) }));
  const notificationRows = rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue);
  const tierWeight = (tier) => ({ 1: 3, 2: 2, 3: 1 }[tier] || 1);
  const categoryScores = Object.keys(CATEGORY_META).map((key) => {
    const categoryRows = rows.filter((item) => item.category === key);
    if (!categoryRows.length) return { key, score: 0 };
    const weights = categoryRows.reduce((total, item) => total + tierWeight(item.tier), 0);
    const sum = categoryRows.reduce((total, item) => total + Math.min(item.ratio, 1) * tierWeight(item.tier), 0);
    return { key, score: Math.round((sum / weights) * 100) };
  });
  const categoryWeight = { water: 3, food: 3, hygiene: 2.5, heat: 2, light: 2, comfort: 0.5 };
  const totalCategoryWeight = categoryScores.reduce((sum, item) => sum + categoryWeight[item.key], 0);
  const score = totalCategoryWeight ? Math.round(categoryScores.reduce((sum, item) => sum + item.score * categoryWeight[item.key], 0) / totalCategoryWeight) : 0;
  const waterMl = rows.filter((item) => item.category === 'water').reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.volumeMl) || 0), 0);
  const waterDays = household ? Math.floor(waterMl / (household * 3000)) : 0;
  const rotationQueue = buildRotationQueue(items);

  return {
    rows,
    score,
    categoryScores,
    waterDays,
    shortageCount: rows.filter((item) => item.shortage > 0).length,
    expiringCount: rows.filter((item) => item.isExpiring).length,
    checkDueCount: rows.filter((item) => item.isCheckDue).length,
    notificationCount: notificationRows.length,
    replenishmentCost: rows.reduce((sum, item) => sum + item.replenishmentCost, 0),
    replenishmentPlan: rows.filter((item) => item.shortage > 0).sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return (priority[a.replenishmentPriority] ?? a.tier) - (priority[b.replenishmentPriority] ?? b.tier)
        || String(a.replenishBy || '9999-12-31').localeCompare(String(b.replenishBy || '9999-12-31'))
        || a.ratio - b.ratio;
    }),
    rotationQueue,
    rotationDueCount: rotationQueue.filter((item) => item.daysToRotate <= 0).length,
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
