import { describe, expect, it } from 'vitest';
import { buildRotationQueue, consumeByRotation, inventorySummary, itemStats } from './domain.js';

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
    expect(summary.score).toBe(75);
    expect(summary.shortageCount).toBe(1);
    expect(summary.replenishmentCost).toBe(250);
  });

  it('uses explicit water volume instead of guessing from the name', () => {
    const summary = inventorySummary([{ name: '大容量ボトル', category: 'water', tier: 1, quantity: 3, target: 3, volumeMl: 2000, price: 0, expiry: '' }], 2);
    expect(summary.waterDays).toBe(1);
  });
});
