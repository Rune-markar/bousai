import { describe, expect, it } from 'vitest';
import { generateEmergencyPlan, simulateDisaster } from './emergency.js';

const summary = { foodDays: 2, waterDays: 1, rows: [{ category: 'hygiene', quantity: 10 }, { category: 'light', quantity: 1 }], categoryScores: [{ key: 'water', score: 30 }, { key: 'food', score: 80 }, { key: 'hygiene', score: 20 }, { key: 'light', score: 90 }, { key: 'heat', score: 50 }, { key: 'comfort', score: 100 }] };

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
});
