import { describe, expect, it } from 'vitest';
import { buildRotationQueue, consumeByRotation, createInitialInventory, inventorySummary, isDrinkingCookingWater, isValidLocalDate, itemStats, localDateKey, normalizeStockpileTargetDays, portableToiletUses, redistributeProductTargets, stockpileBudgetProjection, stockpileUnitNeeds, transactionInsights, usableInventory } from './domain.js';

describe('itemStats', () => {
  it('不足数と補充費用を計算する', () => {
    const stats = itemStats({ quantity: 2, target: 5, price: 180, expiry: '' });
    expect(stats.shortage).toBe(3);
    expect(stats.replenishmentCost).toBe(540);
    expect(stats.ratio).toBe(0.4);
  });

  it('期限30日以内を検出する', () => {
    const stats = itemStats({ quantity: 1, target: 1, price: 0, expiry: '2026-08-30' }, new Date('2026-08-14T12:00:00'));
    expect(stats.daysToExpiry).toBe(16);
    expect(stats.isExpiring).toBe(true);
    expect(stats.isExpired).toBe(false);
  });

  it('期限切れ数量を達成率と不足数に含めない', () => {
    const stats = itemStats({ quantity: 6, target: 6, price: 100, expiry: '2026-08-16' }, new Date('2026-08-17T12:00:00'));
    expect(stats).toMatchObject({ usableQuantity: 0, ratio: 0, shortage: 6, isExpired: true, replenishmentCost: 600 });
  });

  it.each([
    [{ quantity: 6, target: 6, price: 100, expiry: '2026-02-30' }, 'invalid expiry'],
    [{ quantity: 6, target: 6, price: 100, expiry: '2026-12-01', verificationStatus: 'needs-review' }, 'review pending'],
  ])('%s is not treated as usable stock while its data needs verification', (item) => {
    const stats = itemStats(item, new Date('2026-08-17T12:00:00'));
    expect(stats).toMatchObject({ usableQuantity: 0, needsVerification: true, ratio: 0, shortage: 6, replenishmentCost: 0 });
    expect(stats.daysToExpiry).toBe(item.expiry === '2026-02-30' ? null : 106);
    expect(stats.isExpiring).toBe(false);
  });
});

describe('stockpileBudgetProjection', () => {
  it('目標日数までの概算費用と年間予算から到達月数を返す', () => {
    const result = stockpileBudgetProjection([
      { name: '水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 3, volumeMl: 1000, price: 100 },
      { name: '食料', category: 'food', quantity: 3, foodWeightG: 450, price: 300 },
      { name: '携帯トイレ', category: 'hygiene', quantity: 15, price: 50 },
    ], 1, 7, 12000);
    expect(result.resources.map((item) => item.currentDays)).toEqual([1, 3, 3]);
    expect(result.totalCost).toBe(4000);
    expect(result.months).toBe(4);
    expect(result.purchasePlan.map((item) => item.label)).toEqual(['水', '食料', '携帯トイレ']);
    expect(result.annualPlan.map((item) => item.recommendation && `${item.recommendation.name} ${item.recommendation.quantity}${item.recommendation.unit}`)).toEqual(['水 18個', '食料 4個', '携帯トイレ 20個']);
    expect(result.plannedThisYear).toBe(4000);
    expect(result.remainingAnnualBudget).toBe(8000);
    expect(result.costComplete).toBe(true);
  });

  it('年間予算内で優先順に購入数量を割り当てる', () => {
    const result = stockpileBudgetProjection([
      { id: 'water', name: '2L水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
      { id: 'food', name: '保存食', category: 'food', tier: 1, unit: '食', quantity: 0, foodWeightG: 150, price: 300 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回分', quantity: 0, price: 50 },
    ], 1, 3, 1000);
    expect(result.annualPlan.map((item) => [item.label, item.plannedQuantity])).toEqual([['水', 5], ['食料', 1], ['携帯トイレ', 4]]);
    expect(result.plannedThisYear).toBe(1000);
    expect(result.remainingAnnualBudget).toBe(0);
  });

  it('期限切れ品を在庫にも購入候補にも含めず、未期限の登録商品を提案する', () => {
    const result = stockpileBudgetProjection([
      { id: 'expired', name: '期限切れ水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 10, volumeMl: 2000, price: 50, expiry: '2026-08-16' },
      { id: 'fresh', name: '補充用の水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 0, volumeMl: 2000, price: 100, expiry: '' },
    ], 1, 1, 1000, new Date('2026-08-17T12:00:00'));

    const water = result.resources.find((item) => item.key === 'water');
    expect(water.currentDays).toBe(0);
    expect(water.recommendation).toMatchObject({ itemId: 'fresh', quantity: 2 });
  });

  it('期限切れ数量は在庫に数えず、他に候補がない時だけ内容量と単価を新規購入の見積りへ使う', () => {
    const result = stockpileBudgetProjection([
      { id: 'expired', name: '買い直す飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 10, volumeMl: 2000, price: 100, expiry: '2026-08-16' },
    ], 1, 1, 1000, new Date('2026-08-17T12:00:00'));

    const water = result.resources.find((item) => item.key === 'water');
    expect(water).toMatchObject({ currentDays: 0, missing: 3000, estimatedCost: 200, hasPrice: true });
    expect(water.recommendation).toMatchObject({ itemId: 'expired', quantity: 2, unitPrice: 100 });
  });

  it('単価が不足している分野を除外した到達月数を表示しない', () => {
    const result = stockpileBudgetProjection([
      { id: 'water', name: '2L水', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
      { id: 'food', name: '保存食', category: 'food', unit: '食', quantity: 0, foodWeightG: 150, price: 0 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 0, price: 0 },
    ], 1, 3, 12000);

    expect(result.costComplete).toBe(false);
    expect(result.totalCost).toBe(500);
    expect(result.months).toBeNull();
  });

  it('180日を指定しても量の購入計画は30日を上限にする', () => {
    const result = stockpileBudgetProjection([
      { id: 'water', name: '2L水', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
    ], 1, 180, 0);
    expect(result.targetDays).toBe(30);
    expect(result.resources.find((item) => item.key === 'water').recommendation.quantity).toBe(45);
  });

  it('便袋と凝固剤を組にした購入費用を見積もる', () => {
    const result = stockpileBudgetProjection([
      { id: 'bag', name: '非常用便袋', category: 'hygiene', unit: '枚', quantity: 0, price: 20 },
      { id: 'gel', name: '非常用凝固剤', category: 'hygiene', unit: '個', quantity: 0, price: 30 },
    ], 1, 1, 1000);

    const toilet = result.resources.find((item) => item.key === 'toilet');
    expect(toilet).toMatchObject({ currentDays: 0, missing: 5, estimatedCost: 250, hasPrice: true });
    expect(toilet.recommendation).toMatchObject({ itemId: 'bag+gel', quantity: 5, unit: '組', unitPrice: 50 });
    expect(toilet.recommendation.components).toHaveLength(2);
    expect(result.costComplete).toBe(false); // Water and food prices remain unregistered.
  });

  it('既に余っている便袋を再購入せず不足する凝固剤だけを見積もる', () => {
    const result = stockpileBudgetProjection([
      { id: 'bag', name: '非常用便袋', category: 'hygiene', unit: '枚', quantity: 35, price: 20 },
      { id: 'gel', name: '非常用凝固剤', category: 'hygiene', unit: '個', quantity: 0, price: 30 },
    ], 1, 7, 1050);

    const toilet = result.resources.find((item) => item.key === 'toilet');
    expect(toilet).toMatchObject({ currentDays: 0, missing: 35, estimatedCost: 1050, hasPrice: true });
    expect(toilet.recommendation).toMatchObject({ itemId: 'gel', name: '非常用凝固剤', quantity: 35, unit: '個', unitPrice: 30 });
    expect(toilet.recommendation.components).toEqual([expect.objectContaining({ itemId: 'gel', quantity: 35 })]);
    expect(result.annualPlan.find((item) => item.key === 'toilet')).toMatchObject({ plannedQuantity: 35, plannedCost: 1050, deferredQuantity: 0 });
  });

  it('余剰部品を完成させた後は最安の完成キットへ切り替える', () => {
    const result = stockpileBudgetProjection([
      { id: 'bag', name: '非常用便袋', category: 'hygiene', unit: '枚', quantity: 5, price: 20 },
      { id: 'gel', name: '非常用凝固剤', category: 'hygiene', unit: '個', quantity: 0, price: 30 },
      { id: 'kit', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 0, price: 40 },
    ], 1, 2, 1000);

    const toilet = result.resources.find((item) => item.key === 'toilet');
    expect(toilet).toMatchObject({ missing: 10, estimatedCost: 350 });
    expect(toilet.recommendation.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'gel', quantity: 5 }),
      expect.objectContaining({ itemId: 'kit', quantity: 5 }),
    ]));
    expect(result.annualPlan.find((item) => item.key === 'toilet').plannedComponents).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId: 'gel', quantity: 5 }),
      expect.objectContaining({ itemId: 'kit', quantity: 5 }),
    ]));
  });

  it('混合トイレ計画の今年分を実際に買える部品内訳で返す', () => {
    const result = stockpileBudgetProjection([
      { id: 'bag', name: '非常用便袋', category: 'hygiene', unit: '枚', quantity: 5, price: 20 },
      { id: 'gel', name: '非常用凝固剤', category: 'hygiene', unit: '個', quantity: 0, price: 30 },
      { id: 'kit', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 0, price: 40 },
    ], 1, 2, 150);

    expect(result.annualPlan.find((item) => item.key === 'toilet')).toMatchObject({ plannedQuantity: 5, plannedCost: 150, deferredQuantity: 5 });
    expect(result.annualPlan.find((item) => item.key === 'toilet').plannedComponents).toEqual([
      expect.objectContaining({ itemId: 'gel', quantity: 5, unit: '個' }),
    ]);
  });
});

describe('transactionInsights', () => {
  it('直近30日の消費と廃棄を理由付きで集計する', () => {
    const insights = transactionInsights([
      { type: 'consume', name: '水', quantityDelta: -2, at: '2026-08-10T00:00:00Z', reason: '日常消費' },
      { type: 'discard', name: '保存食', quantityDelta: -1, at: '2026-08-11T00:00:00Z', reason: '期限切れ・廃棄' },
      { type: 'consume', name: '古い品', quantityDelta: -9, at: '2026-05-01T00:00:00Z' },
      { type: 'consume', name: '未来の品', quantityDelta: -20, at: '2026-09-01T00:00:00Z' },
    ], new Date('2026-08-14T12:00:00Z'));
    expect(insights.consumed30Days).toBe(3);
    expect(insights.discarded30Days).toBe(1);
    expect(insights.topConsumed).toEqual({ name: '水', quantity: 2 });
  });
});

describe('rolling stock', () => {
  const lots = [
    { id: 'late', productId: 'gtin:1', name: '保存食', tier: 1, unit: '個', quantity: 2, expiry: '2026-12-01', rotationLeadDays: 30 },
    { id: 'early', productId: 'gtin:1', name: '保存食', tier: 1, unit: '個', quantity: 1, expiry: '2026-09-01', rotationLeadDays: 30 },
  ];

  it('puts the earliest expiry lot first', () => {
    const queue = buildRotationQueue(lots, new Date('2026-08-14T12:00:00'));
    expect(queue[0].nextLot.id).toBe('early');
    expect(queue[0].status).toBe('due');
  });

  it('allows rotation to begin on the expiry day when lead days is zero', () => {
    const queue = buildRotationQueue([{ ...lots[0], expiry: '2026-08-24', rotationLeadDays: 0 }], new Date('2026-08-14T12:00:00'));
    expect(queue[0]).toMatchObject({ daysToRotate: 10, status: 'upcoming' });
  });

  it('consumes across lots using FEFO order', () => {
    const result = consumeByRotation(lots, 'gtin:1', 2, new Date('2026-08-14T12:00:00'));
    expect(result.inventory.find((item) => item.id === 'early').quantity).toBe(0);
    expect(result.inventory.find((item) => item.id === 'late').quantity).toBe(1);
    expect(result.consumed.map(({ item }) => item.id)).toEqual(['early', 'late']);
  });

  it('moves a shared product goal to the remaining lot after consumption', () => {
    const targetLots = [
      { id: 'early', productId: 'gtin:1', name: '保存食', quantity: 1, target: 2, expiry: '2026-09-01', rotationEnabled: true },
      { id: 'late', productId: 'gtin:1', name: '保存食', quantity: 1, target: 0, expiry: '2026-12-01', rotationEnabled: true },
    ];
    const result = consumeByRotation(targetLots, 'gtin:1', 1, new Date('2026-08-14T12:00:00'));

    expect(result.inventory.map(({ quantity, target }) => ({ quantity, target }))).toEqual([
      { quantity: 0, target: 1 },
      { quantity: 1, target: 1 },
    ]);
    expect(inventorySummary(result.inventory, 1, new Date('2026-08-14T12:00:00')).shortageCount).toBe(1);
  });

  it('does not consume a lot excluded from rotation', () => {
    const items = [
      { id: 'reserved', productId: 'gtin:1', name: '保存食', quantity: 2, expiry: '2026-08-20', rotationEnabled: false },
      { id: 'rolling', productId: 'gtin:1', name: '保存食', quantity: 2, expiry: '2026-09-01', rotationEnabled: true },
    ];
    const result = consumeByRotation(items, 'gtin:1', 1, new Date('2026-08-14T12:00:00'));

    expect(result.consumed.map(({ item }) => item.id)).toEqual(['rolling']);
    expect(result.inventory.find((item) => item.id === 'reserved').quantity).toBe(2);
    expect(result.inventory.find((item) => item.id === 'rolling').quantity).toBe(1);
  });

  it('does not consume an expired lot as ordinary rolling stock', () => {
    const items = [{ id: 'expired', productId: 'gtin:1', name: '保存食', quantity: 2, expiry: '2026-08-13', rotationEnabled: true }];
    const result = consumeByRotation(items, 'gtin:1', 1, new Date('2026-08-14T12:00:00'));

    expect(result.consumed).toEqual([]);
    expect(result.inventory[0].quantity).toBe(2);
    expect(result.unfulfilled).toBe(1);
  });

  it('keeps an expired opt-out lot visible in the disposal queue', () => {
    const items = [{ id: 'expired-reserved', productId: 'gtin:1', name: '保存食', quantity: 2, expiry: '2026-08-13', rotationEnabled: false }];
    const queue = buildRotationQueue(items, new Date('2026-08-14T12:00:00'));

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ status: 'expired', nextLot: expect.objectContaining({ id: 'expired-reserved' }) });
  });

  it('does not queue or consume a lot that still needs review', () => {
    const items = [
      { ...lots[0], id: 'review', verificationStatus: 'needs-review' },
      { ...lots[1], id: 'verified' },
    ];

    expect(buildRotationQueue(items, new Date('2026-08-14T12:00:00')).map(({ nextLot }) => nextLot.id)).toEqual(['verified']);
    expect(consumeByRotation(items, 'gtin:1', 2, new Date('2026-08-14T12:00:00')).consumed.map(({ item }) => item.id)).toEqual(['verified']);
  });
});

describe('stockpile target and local date normalization', () => {
  it.each([[0, 7], [1, 1], [3, 3], [7, 7], [14, 14], [30, 30], [31, 30], [180, 30], ['Infinity', 7]])('normalizes %s to %s days', (input, expected) => {
    expect(normalizeStockpileTargetDays(input)).toBe(expected);
  });

  it('uses the device-local calendar day rather than the UTC date', () => {
    const localMidnight = new Date(2026, 7, 22, 0, 30);
    expect(localDateKey(localMidnight)).toBe('2026-08-22');
    expect(localDateKey('2026-08-22')).toBe('2026-08-22');
  });

  it('rejects impossible or malformed local calendar dates', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true);
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-8-2')).toBe(false);
    expect(localDateKey('2026-02-30')).toBe('');
    expect(localDateKey('not-a-date')).toBe('');
  });

  it('redistributes one product goal across its usable lots without duplicated shortages', () => {
    const items = redistributeProductTargets([
      { id: 'old', productId: 'manual:food', quantity: 20, target: 35, expiry: '2026-09-01' },
      { id: 'new', productId: 'manual:food', quantity: 15, target: 35, expiry: '2027-09-01' },
    ], 'manual:food', 35, new Date('2026-08-17T12:00:00'));

    expect(items.map((item) => item.target).reduce((sum, target) => sum + target, 0)).toBe(35);
    expect(items.map((item) => itemStats(item, new Date('2026-08-17T12:00:00')).shortage)).toEqual([0, 0]);
  });

  it('keeps the unmet product goal visible when an old lot has expired', () => {
    const today = new Date('2026-08-17T12:00:00');
    const items = redistributeProductTargets([
      { id: 'expired', productId: 'manual:food', quantity: 20, target: 35, expiry: '2026-08-16' },
      { id: 'fresh', productId: 'manual:food', quantity: 15, target: 35, expiry: '2027-09-01' },
    ], 'manual:food', 35, today);

    expect(items.map((item) => itemStats(item, today).shortage).reduce((sum, shortage) => sum + shortage, 0)).toBe(20);
  });
});

describe('portableToiletUses', () => {
  const today = new Date('2026-08-17T12:00:00');

  it('counts complete kits and only matched bag/coagulant component pairs', () => {
    const items = [
      { name: '携帯トイレ', category: 'hygiene', quantity: 10 },
      { name: '非常用トイレの便袋', category: 'hygiene', quantity: 40 },
      { name: '携帯トイレ用凝固剤', category: 'hygiene', quantity: 25 },
      { name: '期限切れ携帯トイレ', category: 'hygiene', quantity: 100, expiry: '2026-08-16' },
      { name: 'ウェットティッシュ', category: 'hygiene', quantity: 100 },
    ];

    expect(portableToiletUses(items, today)).toBe(35);
    expect(portableToiletUses([{ name: '便袋', category: 'hygiene', quantity: 35 }], today)).toBe(0);
    expect(portableToiletUses([{ name: '凝固剤', category: 'hygiene', quantity: 35 }], today)).toBe(0);
  });

  it.each(['トイレ掃除セット', 'トイレットペーパーセット', 'トイレ衛生セット', '非常用トイレ用テント'])('does not treat %s as disposal uses', (name) => {
    expect(portableToiletUses([{ name, category: 'hygiene', quantity: 35 }], today)).toBe(0);
  });

  it.each(['携帯トイレ 便袋セット', '災害用トイレ 凝固剤セット', '携帯トイレ凝固剤', '災害用トイレ凝固剤10個', '非常用トイレ便袋', '簡易トイレ排便袋', '非常用トイレ排泄袋', '携帯トイレ用汚物袋', '簡易トイレ交換袋', '災害用トイレ処理袋', '携帯トイレ用吸水シート'])('does not mistake the single component %s for a complete kit', (name) => {
    expect(portableToiletUses([{ name, category: 'hygiene', quantity: 35 }], today)).toBe(0);
  });

  it.each(['災害用トイレ袋', '携帯トイレ袋', '携帯トイレ交換用袋', '非常用トイレ専用袋'])('requires coagulant before counting the generic bag %s', (name) => {
    expect(portableToiletUses([{ name, category: 'hygiene', quantity: 15 }], today)).toBe(0);
    expect(portableToiletUses([
      { name, category: 'hygiene', quantity: 15 },
      { name: '凝固剤', category: 'hygiene', quantity: 15 },
    ], today)).toBe(15);
  });

  it('does not pair pet or diaper accessories as portable-toilet components', () => {
    expect(portableToiletUses([
      { name: 'ペット用吸水シート', category: 'hygiene', quantity: 35 },
      { name: 'おむつ用汚物袋', category: 'hygiene', quantity: 35 },
    ], today)).toBe(0);
    expect(portableToiletUses([
      { name: '油処理用吸水剤', category: 'hygiene', quantity: 35 },
      { name: '生ごみ処理袋', category: 'hygiene', quantity: 35 },
    ], today)).toBe(0);
    expect(portableToiletUses([
      { name: '犬の汚物袋', category: 'hygiene', quantity: 35 },
      { name: '猫用吸水シート', category: 'hygiene', quantity: 35 },
      { name: '嘔吐物用凝固剤', category: 'hygiene', quantity: 35 },
      { name: '血液吸収シート', category: 'hygiene', quantity: 35 },
    ], today)).toBe(0);
  });

  it.each(['災害用トイレシート', '携帯トイレマット', '非常用トイレ防災ポーチ'])('does not infer an unknown accessory %s as a complete kit', (name) => {
    expect(portableToiletUses([{ name, category: 'hygiene', quantity: 15 }], today)).toBe(0);
  });

  it.each([
    '携帯トイレ用防臭袋',
    '携帯トイレ用ポリ袋',
    '非常用トイレ用目隠しポンチョ',
    '簡易トイレ用手袋',
    '非常用トイレ用手袋セット',
    '携帯トイレ用防臭袋セット',
    '災害用トイレ用目隠しポンチョセット',
    '簡易トイレ用ポリ袋セット',
  ])('does not treat dependent accessory %s as a complete kit', (name) => {
    expect(portableToiletUses([{ name, category: 'hygiene', quantity: 35 }], today)).toBe(0);
  });

  it('accepts a qualified emergency kit and paired components', () => {
    expect(portableToiletUses([{ name: '非常用トイレセット', category: 'hygiene', quantity: 5 }], today)).toBe(5);
    expect(portableToiletUses([
      { name: '非常用便袋', category: 'hygiene', quantity: 5 },
      { name: '非常用凝固剤', category: 'hygiene', quantity: 3 },
    ], today)).toBe(3);
  });

  it('uses the same safe count for summary, unit needs, and budget stock', () => {
    const items = [
      { name: '便袋', category: 'hygiene', quantity: 12, price: 10 },
      { name: '凝固剤', category: 'hygiene', quantity: 8, price: 10 },
      { name: '携帯トイレ', category: 'hygiene', quantity: 2, price: 100, unit: '回分' },
    ];
    const summary = inventorySummary(items, 1, today);
    const needs = stockpileUnitNeeds(items, 1, 2, today).find((item) => item.key === 'toilet');
    const budget = stockpileBudgetProjection(items, 1, 2, 1000, today).resources.find((item) => item.key === 'toilet');

    expect(summary.toiletUnits).toBe(10);
    expect(summary.toiletDays).toBe(2);
    expect(needs).toMatchObject({ shortage: 0, current: '10回分' });
    expect(budget).toMatchObject({ currentDays: 2, missing: 0 });
  });

  it('describes the default portable-toilet target without a fixed household mismatch', () => {
    expect(createInitialInventory().find((item) => item.id === 'toilet').note).toContain('家族人数で計算');
  });
});

describe('inventorySummary', () => {
  it('moves a product goal off an expired lot when a fresh lot remains', () => {
    const summary = inventorySummary([
      { id: 'expired', productId: 'manual:food', name: '保存食', category: 'food', quantity: 10, target: 10, foodWeightG: 150, expiry: '2026-08-16' },
      { id: 'fresh', productId: 'manual:food', name: '保存食', category: 'food', quantity: 10, target: 0, foodWeightG: 150, expiry: '2027-08-16' },
    ], 1, new Date('2026-08-17T12:00:00'));

    expect(summary.rows.map(({ id, target, shortage }) => ({ id, target, shortage }))).toEqual([
      { id: 'expired', target: 0, shortage: 0 },
      { id: 'fresh', target: 10, shortage: 0 },
    ]);
    expect(summary.shortageCount).toBe(0);
  });

  it('目標を超えた在庫で総合点が100を超えない', () => {
    const summary = inventorySummary([
      { category: 'food', tier: 1, quantity: 20, target: 10, foodWeightG: 150, price: 100, expiry: '' },
      { category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 5, target: 10, volumeMl: 1000, price: 50, expiry: '' },
    ]);
    expect(summary.score).toBe(35);
    expect(summary.shortageCount).toBe(1);
    expect(summary.replenishmentCost).toBe(250);
  });

  it('uses explicit water volume instead of guessing from the name', () => {
    const summary = inventorySummary([{ name: '大容量ボトル', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 3, target: 3, volumeMl: 2000, price: 0, expiry: '' }], 2);
    expect(summary.waterDays).toBe(1);
  });

  it('counts only drinking/cooking water and reports utility water separately', () => {
    const items = [
      { id: 'potable', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 3, target: 3, volumeMl: 1000 },
      { id: 'utility', name: '浴槽の生活用水', category: 'water', waterPurpose: 'utility', tier: 1, quantity: 30, target: 30, volumeMl: 1000 },
      { id: 'ambiguous', name: '水タンク', category: 'water', waterPurpose: 'needs-review', verificationStatus: 'needs-review', tier: 1, quantity: 30, target: 30, volumeMl: 1000 },
    ];
    const summary = inventorySummary(items, 1, new Date('2026-08-17T12:00:00'));

    expect(isDrinkingCookingWater(items[0])).toBe(true);
    expect(isDrinkingCookingWater(items[1])).toBe(false);
    expect(isDrinkingCookingWater(items[2])).toBe(false);
    expect(summary.waterMl).toBe(3000);
    expect(summary.utilityWaterMl).toBe(30000);
    expect(summary.waterDays).toBe(1);
  });

  it('does not let utility water or water with no registered volume fill the potable-water score', () => {
    const utilityOnly = inventorySummary([
      { name: '生活用水', category: 'water', waterPurpose: 'utility', tier: 1, quantity: 30, target: 30, volumeMl: 1000 },
      { name: '容量未登録の飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 30, target: 30, volumeMl: 0 },
    ], 1);

    expect(utilityOnly.categoryScores.find((item) => item.key === 'water').score).toBe(0);
    expect(utilityOnly.waterDays).toBe(0);
  });

  it('excludes review-pending and invalid-expiry rows from all usable-day counts', () => {
    const items = [
      { id: 'review-water', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 20, target: 20, volumeMl: 2000, verificationStatus: 'needs-review' },
      { id: 'invalid-food', name: '保存食', category: 'food', quantity: 20, target: 20, foodWeightG: 150, expiry: '2026-99-99' },
      { id: 'review-toilet', name: '携帯トイレ', category: 'hygiene', quantity: 20, target: 20, verificationStatus: 'needs-review' },
    ];
    const summary = inventorySummary(items, 1, new Date('2026-08-17T12:00:00'));

    expect(usableInventory(items, new Date('2026-08-17T12:00:00'))).toEqual([]);
    expect(summary).toMatchObject({ waterDays: 0, foodDays: 0, toiletDays: 0, householdStockpileDays: 0, score: 0 });
  });

  it('calculates food and survival days from 150g meals', () => {
    const summary = inventorySummary([
      { name: '水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 18, target: 18, volumeMl: 1000, price: 0, expiry: '' },
      { name: '保存食', category: 'food', tier: 1, quantity: 18, target: 18, foodWeightG: 150, price: 0, expiry: '' },
    ], 2);
    expect(summary.waterDays).toBe(3);
    expect(summary.foodDays).toBe(3);
    expect(summary.survivalDays).toBe(3);
  });

  it('uses the shorter of water and food for survival days', () => {
    const summary = inventorySummary([
      { category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 42, target: 42, volumeMl: 1000, price: 0, expiry: '' },
      { category: 'food', tier: 1, quantity: 9, target: 9, foodWeightG: 150, price: 0, expiry: '' },
    ], 1);
    expect(summary.waterDays).toBe(14);
    expect(summary.foodDays).toBe(3);
    expect(summary.survivalDays).toBe(3);
  });

  it('calculates household continuity from food, water, and portable toilets', () => {
    const summary = inventorySummary([
      { name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 18, target: 18, volumeMl: 500 },
      { name: '保存食', category: 'food', quantity: 12, target: 12, foodWeightG: 150 },
      { name: '携帯トイレ', category: 'hygiene', quantity: 20, target: 20 },
    ], 2);
    expect(summary.waterDays).toBe(1.5);
    expect(summary.foodDays).toBe(2);
    expect(summary.toiletDays).toBe(2);
    expect(summary.householdStockpileDays).toBe(1.5);
  });

  it('converts total food weight and water volume into household days', () => {
    const summary = inventorySummary([
      { name: 'アルファ米', category: 'food', tier: 1, quantity: 9, target: 9, foodWeightG: 100, price: 0, expiry: '' },
      { name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 18, target: 18, volumeMl: 500, price: 0, expiry: '' },
    ], 2);
    expect(summary.foodGrams).toBe(900);
    expect(summary.waterMl).toBe(9000);
    expect(summary.foodDays).toBe(1);
    expect(summary.waterDays).toBe(1.5);
    expect(summary.survivalDays).toBe(1);
    expect(summary.foodTargetGrams).toBe(2700);
    expect(summary.waterTargetMl).toBe(18000);
  });

  it('does not guess missing amounts and reports items that need input', () => {
    const summary = inventorySummary([
      { name: '重量不明の缶詰', category: 'food', tier: 1, quantity: 3, target: 3, price: 0, expiry: '' },
      { name: '容量不明の水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 2, target: 2, price: 0, expiry: '' },
    ], 1);
    expect(summary.foodDays).toBe(0);
    expect(summary.waterDays).toBe(0);
    expect(summary.foodItemsMissingWeight).toBe(1);
    expect(summary.waterItemsMissingVolume).toBe(1);
  });

  it('excludes expired food, water, and portable toilets from usable day counts and readiness', () => {
    const summary = inventorySummary([
      { name: '期限切れ水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 6, target: 6, volumeMl: 500, expiry: '2026-08-16' },
      { name: '期限切れ保存食', category: 'food', tier: 1, quantity: 6, target: 6, foodWeightG: 150, expiry: '2026-08-16' },
      { name: '期限切れ携帯トイレ', category: 'hygiene', tier: 1, quantity: 10, target: 10, expiry: '2026-08-16' },
    ], 1, new Date('2026-08-17T12:00:00'));

    expect(summary.waterDays).toBe(0);
    expect(summary.foodDays).toBe(0);
    expect(summary.toiletDays).toBe(0);
    expect(summary.score).toBe(0);
  });

  it('counts one notification per item even when multiple alerts overlap', () => {
    const summary = inventorySummary([
      { name: '乾電池', category: 'light', tier: 2, unit: '本', quantity: 1, target: 3, expiry: '2026-08-20', nextCheck: '2026-08-01' },
    ]);
    expect(summary.shortageCount).toBe(1);
    expect(summary.expiringCount).toBe(1);
    expect(summary.checkDueCount).toBe(1);
    expect(summary.itemNotificationCount).toBe(1);
    expect(summary.notificationCount).toBe(4);
  });

  it('creates registration notifications for missing life-critical stock', () => {
    const summary = inventorySummary([], 2, new Date('2026-08-17T12:00:00'));

    expect(summary.essentialNotificationGaps.map(({ key }) => key)).toEqual(['water', 'food', 'toilet']);
    expect(summary.essentialNotificationGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'water', shortage: 9, unit: '本' }),
      expect.objectContaining({ key: 'food', shortage: 18, unit: '食' }),
      expect.objectContaining({ key: 'toilet', shortage: 30, unit: '回分' }),
    ]));
    expect(summary.notificationCount).toBe(3);
  });

  it('重要カテゴリを削除しても備蓄力が上がらない', () => {
    const items = [
      { category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 10, target: 10, price: 0, expiry: '' },
      { category: 'food', tier: 1, quantity: 10, target: 10, price: 0, expiry: '' },
      { category: 'hygiene', tier: 1, quantity: 2, target: 10, price: 0, expiry: '' },
    ];
    expect(inventorySummary(items.filter((item) => item.category !== 'hygiene')).score)
      .toBeLessThanOrEqual(inventorySummary(items).score);
  });
});

describe('stockpileUnitNeeds', () => {
  it('目標との差を2L水・食数・トイレ・ボンベ・コンロの実数へ換算する', () => {
    const needs = stockpileUnitNeeds([
      { name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 3, volumeMl: 2000 },
      { name: '保存食', category: 'food', quantity: 6, foodWeightG: 150 },
      { name: '携帯トイレ', category: 'hygiene', quantity: 10 },
      { name: 'カセットボンベ', category: 'heat', quantity: 6 },
    ], 2, 7, new Date('2026-08-17T12:00:00'));
    expect(needs.map(({ key, shortage, unit }) => ({ key, shortage, unit }))).toEqual([
      { key: 'water', shortage: 18, unit: '本' },
      { key: 'food', shortage: 36, unit: '食' },
      { key: 'toilet', shortage: 60, unit: '回分' },
      { key: 'gas', shortage: 6, unit: '本' },
      { key: 'stove', shortage: 1, unit: '台' },
    ]);
    expect(needs.find((item) => item.key === 'gas')).toMatchObject({
      reference: '一般的なカセットボンベ',
      current: '6本',
      target: '12本',
    });
  });

  it('期限切れ品を実物換算の現在庫に含めない', () => {
    const needs = stockpileUnitNeeds([{ name: '期限切れ水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 20, volumeMl: 2000, expiry: '2026-08-16' }], 1, 1, new Date('2026-08-17T12:00:00'));
    expect(needs.find((item) => item.key === 'water').shortage).toBe(2);
  });

  it('生活用水・用途未確認水・要確認品・不正な期限を飲料水の現在庫や購入候補に含めない', () => {
    const items = [
      { id: 'utility', name: '生活用水', category: 'water', waterPurpose: 'utility', quantity: 10, volumeMl: 2000, price: 10 },
      { id: 'ambiguous', name: '水タンク', category: 'water', waterPurpose: 'needs-review', verificationStatus: 'needs-review', quantity: 10, volumeMl: 2000, price: 10 },
      { id: 'review', name: '未確認の飲料水', category: 'water', waterPurpose: 'drinking-cooking', verificationStatus: 'needs-review', quantity: 10, volumeMl: 2000, price: 10 },
      { id: 'invalid', name: '期限不正の飲料水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 10, volumeMl: 2000, price: 10, expiry: '2026-99-99' },
      { id: 'verified', name: '補充用の飲料水', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
    ];
    const today = new Date('2026-08-17T12:00:00');
    const need = stockpileUnitNeeds(items, 1, 1, today).find((item) => item.key === 'water');
    const budget = stockpileBudgetProjection(items, 1, 1, 1000, today).resources.find((item) => item.key === 'water');

    expect(need).toMatchObject({ current: '0.0L', shortage: 2 });
    expect(budget).toMatchObject({ currentDays: 0, missing: 3000 });
    expect(budget.recommendation).toMatchObject({ itemId: 'verified', quantity: 2 });
  });
});
