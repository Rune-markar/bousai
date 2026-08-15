import { describe, expect, it } from 'vitest';
import { buildRotationQueue, consumeByRotation, inventorySummary, itemStats, transactionInsights } from './domain.js';

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
