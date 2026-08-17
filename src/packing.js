export const BAG_CAPACITY_PRESETS = {
  'bag-primary': { capacityL: 20, label: '一般的な日常用リュック', source: '20Lクラスの市販リュックを基準' },
  'bag-secondary': { capacityL: 40, label: '中型バックパック', source: '40Lクラスの市販バックパックを基準' },
};

export const PACKING_EFFICIENCY = 0.85;

export const BAG_VOLUME_EXAMPLES = [
  { symbol: '💧', label: '飲料水 500ml', volumeMl: 600 },
  { symbol: '🧣', label: '防寒シート', volumeMl: 300 },
  { symbol: '🔦', label: '小型ライト', volumeMl: 250 },
];

// Package-envelope samples (ml) are deliberately conservative. The median is
// used when the user has not measured the actual product.
export const VOLUME_REFERENCE = {
  water: { samples: [575, 600, 625], medianMl: 600, label: '500ml飲料ボトル相当' },
  food: { samples: [350, 500, 700], medianMl: 500, label: '1食パウチ・包装食相当' },
  heat: { samples: [800, 900, 1000], medianMl: 900, label: 'カセットボンベ相当' },
  hygiene: { samples: [60, 100, 200], medianMl: 100, label: '衛生用品1単位相当' },
  light: { samples: [20, 80, 250], medianMl: 80, label: '乾電池・小型電源相当' },
  comfort: { samples: [80, 150, 300], medianMl: 150, label: '小型快適用品相当' },
};

export const EVACUATION_BAG_PROFILES = {
  'bag-primary': {
    stageLabel: '一時避難',
    timing: '発災直後から安全な場所へ移動するまで',
    policy: '命・移動・服薬を優先し、すぐ背負える軽さを保つ',
    categoryTargets: { water: 2, food: 3, hygiene: 5, light: 4, comfort: 1 },
    categoryReasons: {
      water: '移動中の最低限の水分', food: '開封してすぐ食べる行動食', hygiene: '移動中のトイレ・衛生', light: '避難路の灯りと携帯電源', comfort: '低体温や不安への最小限の備え',
    },
  },
  'bag-secondary': {
    stageLabel: '2次避難',
    timing: '安全確保後の避難生活を続ける期間',
    policy: '一時避難分を取り置き、生活継続・衛生・情報を補う',
    categoryTargets: { water: 4, food: 6, hygiene: 10, light: 4, comfort: 2 },
    categoryReasons: {
      water: '避難生活で追加する水分', food: '避難先での追加食', hygiene: '避難生活を続ける衛生用品', light: '充電・情報収集を続ける電源', comfort: '睡眠や心身の負担を減らす用品',
    },
  },
};

const BAG_CATEGORY_SCORE = {
  'bag-primary': { water: 60, food: 50, hygiene: 48, light: 44, comfort: 8 },
  'bag-secondary': { water: 52, food: 50, hygiene: 46, light: 40, comfort: 18 },
};

const directSlotRules = {
  'bag-primary': [
    { slotId: 'water', category: 'water' },
    { slotId: 'food', category: 'food' },
    { slotId: 'toilet', pattern: /(携帯トイレ|便袋|凝固)/ },
    { slotId: 'light', pattern: /(懐中電灯|ヘッドライト|LEDライト)/ },
    { slotId: 'battery', pattern: /(モバイルバッテリー|充電池|パワーバンク)/ },
    { slotId: 'medicine', pattern: /(常用薬|薬|医薬)/ },
  ],
  'bag-secondary': [
    { slotId: 'hygiene', pattern: /(衛生|歯磨|生理用品|ウェット)/ },
    { slotId: 'charger', pattern: /(充電器|充電ケーブル|USBケーブル)/ },
    { slotId: 'radio', pattern: /(ラジオ)/ },
    { slotId: 'towel', pattern: /(タオル)/ },
    { slotId: 'clothes', pattern: /(着替え|下着|靴下)/ },
  ],
};

export function packingVolumeForItem(item) {
  const userMl = Math.max(0, Number(item.packingVolumeMl) || 0);
  if (userMl) return { ml: userMl, source: 'user', label: '入力値' };
  const contentMl = Math.max(0, Number(item.volumeMl) || 0);
  if (item.category === 'water' && contentMl) return { ml: Math.ceil(contentMl * 1.2), source: 'content', label: '内容量から推定' };
  const text = `${item.name || ''} ${item.packageSize || ''}`;
  const named = text.match(/(\d+(?:\.\d+)?)\s*(ml|mL|ＭＬ|L|Ｌ)/);
  if (named) {
    const amount = Number(named[1]) * (/^(L|Ｌ)$/i.test(named[2]) ? 1000 : 1);
    if (amount > 0) return { ml: Math.ceil(amount * 1.2), source: 'package', label: '商品表記から推定' };
  }
  if (/(携帯トイレ|便袋|凝固)/.test(text)) return { ml: 80, source: 'backup', label: '内部基準値' };
  if (/(乾電池|単3|単4)/.test(text)) return { ml: 25, source: 'backup', label: '内部基準値' };
  if (/(アルファ米|レトルト|パウチ)/.test(text)) return { ml: 500, source: 'backup', label: '内部基準値' };
  const reference = VOLUME_REFERENCE[item.category] || VOLUME_REFERENCE.comfort;
  return { ml: reference.medianMl, source: 'backup', label: `内部中央値・${reference.label}` };
}

export function bagSettings(state, taskId) {
  const preset = BAG_CAPACITY_PRESETS[taskId];
  if (!preset) return null;
  const stored = state.preparedness?.bagSettings?.[taskId] || {};
  const mode = stored.mode === 'custom' ? 'custom' : 'standard';
  const customCapacityL = Math.min(100, Math.max(1, Number(stored.customCapacityL) || preset.capacityL));
  return { mode, customCapacityL, capacityL: mode === 'custom' ? customCapacityL : preset.capacityL, preset };
}

export function updateBagSettings(state, taskId, next) {
  if (!BAG_CAPACITY_PRESETS[taskId]) return state;
  const current = bagSettings(state, taskId);
  const mode = next.mode === 'custom' ? 'custom' : 'standard';
  const customCapacityL = Math.min(100, Math.max(1, Number(next.customCapacityL) || current.customCapacityL));
  return {
    ...state,
    preparedness: {
      ...state.preparedness,
      bagSettings: { ...(state.preparedness?.bagSettings || {}), [taskId]: { mode, customCapacityL } },
      updatedAt: new Date().toISOString(),
    },
  };
}

function directSlots(taskId, item) {
  // Notes often describe a use target (for example, "ラジオ用" batteries),
  // so using them as product identity would falsely claim that the target item exists.
  const text = `${item.name || ''} ${item.brand || ''} ${item.packageSize || ''}`;
  return (directSlotRules[taskId] || []).filter((rule) => (rule.category && rule.category === item.category) || rule.pattern?.test(text)).map((rule) => rule.slotId);
}

export function autoPackInventory(inventory, taskId, capacityL, household = 1, options = {}) {
  const profile = EVACUATION_BAG_PROFILES[taskId];
  const baseTargets = profile?.categoryTargets;
  if (!baseTargets) return { items: [], capacityMl: 0, usableCapacityMl: 0, usedMl: 0, remainingMl: 0, utilization: 0, matchedSlotIds: [], profile: null };
  const people = Math.min(12, Math.max(1, Number(household) || 1));
  const targets = Object.fromEntries(Object.entries(baseTargets).map(([category, amount]) => [category, ['water', 'food', 'hygiene'].includes(category) ? amount * people : amount]));
  const capacityMl = Math.max(0, Number(capacityL) || 0) * 1000;
  const usableCapacityMl = Math.floor(capacityMl * PACKING_EFFICIENCY);
  const today = String(options.today || new Date().toISOString().slice(0, 10));
  const reservedById = new Map((options.reservedItems || []).map((item) => [item.id, Math.max(0, Number(item.quantity) || 0)]));
  const candidates = (inventory || []).map((item) => ({
    ...item,
    quantity: Math.max(0, Number(item.quantity) || 0) - (reservedById.get(item.id) || 0),
  })).filter((item) => Number(item.quantity) > 0 && targets[item.category] && item.category !== 'heat' && (!item.expiry || item.expiry >= today)).map((item) => {
    const volume = packingVolumeForItem(item);
    const score = (4 - Math.min(3, Math.max(1, Number(item.tier) || 2))) * 100 + (BAG_CATEGORY_SCORE[taskId]?.[item.category] || 0);
    return { item, volume, score };
  }).sort((a, b) => b.score - a.score || String(a.item.expiry || '9999').localeCompare(String(b.item.expiry || '9999')));
  const categoryPacked = {};
  const selected = [];
  let usedMl = 0;
  for (const candidate of candidates) {
    const category = candidate.item.category;
    const targetLeft = Math.max(0, targets[category] - (categoryPacked[category] || 0));
    const spaceLeft = usableCapacityMl - usedMl;
    const fit = candidate.volume.ml ? Math.floor(spaceLeft / candidate.volume.ml) : 0;
    const quantity = Math.min(Math.floor(Number(candidate.item.quantity)), targetLeft, fit);
    if (quantity <= 0) continue;
    const totalMl = quantity * candidate.volume.ml;
    selected.push({ id: candidate.item.id, name: candidate.item.name, unit: candidate.item.unit, category, quantity, unitVolumeMl: candidate.volume.ml, totalMl, volumeSource: candidate.volume.source, volumeLabel: candidate.volume.label, slotIds: directSlots(taskId, candidate.item), reason: profile.categoryReasons[category] });
    categoryPacked[category] = (categoryPacked[category] || 0) + quantity;
    usedMl += totalMl;
  }
  const matchedSlotIds = [...new Set(selected.flatMap((item) => item.slotIds))];
  return { items: selected, capacityMl, usableCapacityMl, usedMl, remainingMl: Math.max(0, usableCapacityMl - usedMl), utilization: usableCapacityMl ? Math.round(usedMl / usableCapacityMl * 100) : 0, matchedSlotIds, profile };
}
