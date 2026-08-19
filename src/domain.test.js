import { describe, expect, it } from 'vitest';
import { buildRotationQueue, consumeByRotation, createInitialInventory, inventorySummary, itemStats, portableToiletUses, stockpileBudgetProjection, stockpileUnitNeeds, transactionInsights } from './domain.js';

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
});

describe('stockpileBudgetProjection', () => {
  it('目標日数までの概算費用と年間予算から到達月数を返す', () => {
    const result = stockpileBudgetProjection([
      { name: '水', category: 'water', quantity: 3, volumeMl: 1000, price: 100 },
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
      { id: 'water', name: '2L水', category: 'water', tier: 1, unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
      { id: 'food', name: '保存食', category: 'food', tier: 1, unit: '食', quantity: 0, foodWeightG: 150, price: 300 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回分', quantity: 0, price: 50 },
    ], 1, 3, 1000);
    expect(result.annualPlan.map((item) => [item.label, item.plannedQuantity])).toEqual([['水', 5], ['食料', 1], ['携帯トイレ', 4]]);
    expect(result.plannedThisYear).toBe(1000);
    expect(result.remainingAnnualBudget).toBe(0);
  });

  it('期限切れ品を在庫にも購入候補にも含めず、未期限の登録商品を提案する', () => {
    const result = stockpileBudgetProjection([
      { id: 'expired', name: '期限切れ水', category: 'water', tier: 1, unit: '本', quantity: 10, volumeMl: 2000, price: 50, expiry: '2026-08-16' },
      { id: 'fresh', name: '補充用の水', category: 'water', tier: 1, unit: '本', quantity: 0, volumeMl: 2000, price: 100, expiry: '' },
    ], 1, 1, 1000, new Date('2026-08-17T12:00:00'));

    const water = result.resources.find((item) => item.key === 'water');
    expect(water.currentDays).toBe(0);
    expect(water.recommendation).toMatchObject({ itemId: 'fresh', quantity: 2 });
  });

  it('単価が不足している分野を除外した到達月数を表示しない', () => {
    const result = stockpileBudgetProjection([
      { id: 'water', name: '2L水', category: 'water', unit: '本', quantity: 0, volumeMl: 2000, price: 100 },
      { id: 'food', name: '保存食', category: 'food', unit: '食', quantity: 0, foodWeightG: 150, price: 0 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 0, price: 0 },
    ], 1, 3, 12000);

    expect(result.costComplete).toBe(false);
    expect(result.totalCost).toBe(500);
    expect(result.months).toBeNull();
  });
});

describe('transactionInsights', () => {
  it('直近30日の消費と廃棄を理由付きで集計する', () => {
    const insights = transactionInsights([
      { type: 'consume', name: '水', quantityDelta: -2, at: '2026-08-10T00:00:00Z', reason: '日常消費' },
      { type: 'discard', name: '保存食', quantityDelta: -1, at: '2026-08-11T00:00:00Z', reason: '期限切れ・廃棄' },
      { type: 'consume', name: '古い品', quantityDelta: -9, at: '2026-05-01T00:00:00Z' },
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

  it('consumes across lots using FEFO order', () => {
    const result = consumeByRotation(lots, 'gtin:1', 2, new Date('2026-08-14T12:00:00'));
    expect(result.inventory.find((item) => item.id === 'early').quantity).toBe(0);
    expect(result.inventory.find((item) => item.id === 'late').quantity).toBe(1);
    expect(result.consumed.map(({ item }) => item.id)).toEqual(['early', 'late']);
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
  it('目標を超えた在庫で総合点が100を超えない', () => {
    const summary = inventorySummary([
      { category: 'food', tier: 1, quantity: 20, target: 10, price: 100, expiry: '' },
      { category: 'water', tier: 1, quantity: 5, target: 10, price: 50, expiry: '' },
    ]);
    expect(summary.score).toBe(35);
    expect(summary.shortageCount).toBe(1);
    expect(summary.replenishmentCost).toBe(250);
  });

  it('uses explicit water volume instead of guessing from the name', () => {
    const summary = inventorySummary([{ name: '大容量ボトル', category: 'water', tier: 1, quantity: 3, target: 3, volumeMl: 2000, price: 0, expiry: '' }], 2);
    expect(summary.waterDays).toBe(1);
  });

  it('calculates food and survival days from 150g meals', () => {
    const summary = inventorySummary([
      { name: '水', category: 'water', tier: 1, quantity: 18, target: 18, volumeMl: 1000, price: 0, expiry: '' },
      { name: '保存食', category: 'food', tier: 1, quantity: 18, target: 18, foodWeightG: 150, price: 0, expiry: '' },
    ], 2);
    expect(summary.waterDays).toBe(3);
    expect(summary.foodDays).toBe(3);
    expect(summary.survivalDays).toBe(3);
  });

  it('uses the shorter of water and food for survival days', () => {
    const summary = inventorySummary([
      { category: 'water', tier: 1, quantity: 42, target: 42, volumeMl: 1000, price: 0, expiry: '' },
      { category: 'food', tier: 1, quantity: 9, target: 9, foodWeightG: 150, price: 0, expiry: '' },
    ], 1);
    expect(summary.waterDays).toBe(14);
    expect(summary.foodDays).toBe(3);
    expect(summary.survivalDays).toBe(3);
  });

  it('calculates household continuity from food, water, and portable toilets', () => {
    const summary = inventorySummary([
      { name: '飲料水', category: 'water', quantity: 18, target: 18, volumeMl: 500 },
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
      { name: '飲料水', category: 'water', tier: 1, quantity: 18, target: 18, volumeMl: 500, price: 0, expiry: '' },
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
      { name: '容量不明の水', category: 'water', tier: 1, quantity: 2, target: 2, price: 0, expiry: '' },
    ], 1);
    expect(summary.foodDays).toBe(0);
    expect(summary.waterDays).toBe(0);
    expect(summary.foodItemsMissingWeight).toBe(1);
    expect(summary.waterItemsMissingVolume).toBe(1);
  });

  it('excludes expired food, water, and portable toilets from usable day counts and readiness', () => {
    const summary = inventorySummary([
      { name: '期限切れ水', category: 'water', tier: 1, quantity: 6, target: 6, volumeMl: 500, expiry: '2026-08-16' },
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
    expect(summary.notificationCount).toBe(1);
  });

  it('重要カテゴリを削除しても備蓄力が上がらない', () => {
    const items = [
      { category: 'water', tier: 1, quantity: 10, target: 10, price: 0, expiry: '' },
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
      { name: '飲料水', category: 'water', quantity: 3, volumeMl: 2000 },
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
    const needs = stockpileUnitNeeds([{ name: '期限切れ水', category: 'water', quantity: 20, volumeMl: 2000, expiry: '2026-08-16' }], 1, 1, new Date('2026-08-17T12:00:00'));
    expect(needs.find((item) => item.key === 'water').shortage).toBe(2);
  });
});
