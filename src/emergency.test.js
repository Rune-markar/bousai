import { describe, expect, it } from 'vitest';
import { inventorySummary } from './domain.js';
import { generateEmergencyPlan, simulateDisaster } from './emergency.js';

const summary = { foodDays: 2, waterDays: 1, toiletDays: 1, rows: [{ category: 'hygiene', quantity: 10 }, { category: 'light', quantity: 1 }], categoryScores: [{ key: 'water', score: 30 }, { key: 'food', score: 80 }, { key: 'hygiene', score: 20 }, { key: 'light', score: 90 }, { key: 'heat', score: 50 }, { key: 'comfort', score: 100 }] };

describe('emergency planning', () => {
  it('turns household stock and contact gaps into an action plan', () => {
    const plan = generateEmergencyPlan({ household: 2, contact: { shelter: '', note: '' } }, summary);
    expect(plan.waterDays).toBe(1);
    expect(plan.foodDays).toBe(2);
    expect(plan.toiletDays).toBe(1);
    expect(plan.gaps).toContain('集合場所・緊急連絡先・171などの連絡ルールを家族で決める');
    expect(plan.gaps).toContain('食料は簡易換算で約2.0日分。1人1日3食で3日分まで増やす');
  });

  it('scores a scenario and penalizes a longer outage', () => {
    const short = simulateDisaster({}, summary, 'blackout', 3);
    const long = simulateDisaster({}, summary, 'blackout', 7);
    expect(long.score).toBeLessThan(short.score);
    expect(short.criticalGaps.map((item) => item.key)).toContain('water');
    expect(short.advice).toBe('飲料水分野を最優先で補強してください。');
  });

  it('scores essential stock by selected-day coverage instead of per-item target ratios', () => {
    const thinSummary = inventorySummary([
      { name: '水500ml', category: 'water', tier: 1, quantity: 1, target: 1, volumeMl: 500 },
      { name: '非常食150g', category: 'food', tier: 1, quantity: 1, target: 1, foodWeightG: 150 },
      { name: 'ウェットティッシュ', category: 'hygiene', tier: 1, quantity: 1, target: 1 },
      { name: 'LEDライト', category: 'light', tier: 1, quantity: 1, target: 1 },
    ], 1);
    const result = simulateDisaster({}, thinSummary, 'earthquake', 3);

    expect(thinSummary.categoryScores.filter((item) => ['water', 'food', 'hygiene', 'light'].includes(item.key)).every((item) => item.score === 100)).toBe(true);
    expect(result.score).toBeLessThan(50);
    expect(result.statusKey).not.toBe('reference-ready');
    expect(result.criticalGaps.map((item) => item.key)).toEqual(expect.arrayContaining(['water', 'food', 'hygiene']));
  });

  it('does not report reference readiness while any required category is critically low', () => {
    const result = simulateDisaster({}, {
      waterDays: 1.8,
      foodDays: 3,
      toiletDays: 3,
      categoryScores: [{ key: 'light', score: 100 }],
    }, 'earthquake', 3);

    expect(result.score).toBe(90);
    expect(result.criticalGaps).toEqual([{ key: 'water', score: 60 }]);
    expect(result.statusKey).toBe('needs-stock');
    expect(result.status).toBe('備蓄不足あり');
  });

  it('clamps simulation duration to the supported 1-14 day range', () => {
    expect(simulateDisaster({}, summary, 'earthquake', 0).days).toBe(1);
    expect(simulateDisaster({}, summary, 'earthquake', 99).days).toBe(14);
    expect(simulateDisaster({}, summary, 'earthquake', 'invalid').days).toBe(3);
  });

  it('does not count general hygiene products as portable-toilet stock', () => {
    const hygieneOnly = inventorySummary([{ name: 'ウェットティッシュ', category: 'hygiene', quantity: 30, target: 30 }], 2);
    const plan = generateEmergencyPlan({ household: 2, contact: { shelter: '小学校', phone: '090', note: '171' } }, hygieneOnly);
    expect(hygieneOnly.toiletDays).toBe(0);
    expect(plan.toiletDays).toBe(0);
    expect(plan.gaps).toContain('携帯トイレは約0日分。1人1日5回で3日分まで増やす');
  });

  it('does not treat batteries alone as a usable light', () => {
    const batteriesOnly = inventorySummary([{ name: '乾電池', category: 'light', quantity: 12, target: 12 }], 1);
    const plan = generateEmergencyPlan({ household: 1, contact: { shelter: '小学校', phone: '090', note: '171' } }, batteriesOnly);
    expect(plan.gaps).toContain('停電用の灯りと予備電池を確保する');
  });
});
