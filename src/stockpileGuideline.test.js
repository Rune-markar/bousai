import { describe, expect, it } from 'vitest';
import { buildStockpileGuideline } from './stockpileGuideline.js';

const summary = (days) => ({ waterDays: days, foodDays: days + 2, toiletDays: days + 1 });

describe('buildStockpileGuideline', () => {
  it('水・食料・携帯トイレの最短で着手1日、最低3日、推奨7日の次段階を決める', () => {
    expect(buildStockpileGuideline(summary(0.5)).nextMilestone).toBe(1);
    expect(buildStockpileGuideline(summary(1)).nextMilestone).toBe(3);
    expect(buildStockpileGuideline(summary(3)).nextMilestone).toBe(7);
    expect(buildStockpileGuideline(summary(7)).nextMilestone).toBeNull();
  });

  it('期限内で在庫がある多様性用品だけを登録済みとする', () => {
    const result = buildStockpileGuideline(summary(7), [
      { name: 'チョコレート', category: 'food', quantity: 1, expiry: '2030-01-01' },
      { name: 'トランプ', category: 'comfort', quantity: 1, expiry: '' },
      { name: 'ポータブル電源', category: 'light', quantity: 0, expiry: '' },
      { name: '発電機', category: 'light', quantity: 1, expiry: '2020-01-01' },
      { name: '発電機の本', category: 'food', quantity: 1, expiry: '' },
    ], new Date('2026-08-20T00:00:00'));

    expect(result.registeredBranches).toBe(2);
    expect(result.branches.find((branch) => branch.id === 'food-variety').registered).toBe(true);
    expect(result.branches.find((branch) => branch.id === 'calm').registered).toBe(true);
    expect(result.branches.find((branch) => branch.id === 'power').registered).toBe(false);
  });

  it('登録品に一致した分類を返し、導線先でその品を隠さない', () => {
    const result = buildStockpileGuideline(summary(7), [
      { name: 'チョコレート', category: 'comfort', quantity: 1, expiry: '2030-01-01' },
      { name: '常用薬', category: 'hygiene', quantity: 1, expiry: '' },
    ], new Date('2026-08-20T00:00:00'));

    expect(result.branches.find((branch) => branch.id === 'food-variety')).toMatchObject({ registered: true, matchedCategory: 'comfort' });
    expect(result.branches.find((branch) => branch.id === 'personal')).toMatchObject({ registered: true, matchedCategory: 'hygiene' });
  });

  it('comfort分類の食品は期限確認済みになるまで食の多様性へ数えない', () => {
    const result = buildStockpileGuideline(summary(7), [
      { name: 'チョコレート', category: 'comfort', quantity: 1, expiry: '' },
    ], new Date('2026-08-20T00:00:00'));

    expect(result.branches.find((branch) => branch.id === 'food-variety').registered).toBe(false);
  });

  it('薬用日用品を家族固有の常用薬と誤判定しない', () => {
    const result = buildStockpileGuideline(summary(7), [
      { name: '薬用ウェットティッシュ', category: 'hygiene', quantity: 1, expiry: '' },
    ]);

    expect(result.branches.find((branch) => branch.id === 'personal').registered).toBe(false);
  });

  it('30日分以上では量より快適性を優先する設計方針を返す', () => {
    const result = buildStockpileGuideline(summary(30));
    expect(result.quantityBoundaryReached).toBe(true);
    expect(result.policyMessage).toContain('快適性');
  });

  it.each([[2.99, 3], [3, 7], [6.99, 7], [7, null], [30, null]])('%s日分の境界から次の目安%sを返す', (days, next) => {
    expect(buildStockpileGuideline(summary(days)).nextMilestone).toBe(next);
  });
});
