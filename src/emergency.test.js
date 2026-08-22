import { describe, expect, it } from 'vitest';
import { inventorySummary } from './domain.js';
import { generateEmergencyPlan, simulateDisaster } from './emergency.js';
import { getLoadout, requiredLoadoutItemIds } from './loadouts.js';

const summary = { foodDays: 2, waterDays: 1, toiletDays: 1, rows: [{ category: 'hygiene', quantity: 10 }, { category: 'light', quantity: 1 }], categoryScores: [{ key: 'water', score: 30 }, { key: 'food', score: 80 }, { key: 'hygiene', score: 20 }, { key: 'light', score: 90 }, { key: 'heat', score: 50 }, { key: 'comfort', score: 100 }] };
const verifiedLightState = {
  preparedness: {
    completed: ['light-fire', 'food-fit'],
    loadouts: { 'light-fire': requiredLoadoutItemIds(getLoadout('light-fire')) },
  },
};
const verifiedBlackoutState = {
  preparedness: {
    completed: ['light-fire', 'food-fit', 'cooking-water'],
    loadouts: {
      'light-fire': requiredLoadoutItemIds(getLoadout('light-fire')),
      'cooking-water': requiredLoadoutItemIds(getLoadout('cooking-water')),
    },
  },
};

describe('emergency planning', () => {
  it('turns household stock and contact gaps into an action plan', () => {
    const plan = generateEmergencyPlan({ household: 2, contact: { shelter: '', note: '' } }, summary);
    expect(plan.waterDays).toBe(1);
    expect(plan.foodDays).toBe(2);
    expect(plan.toiletDays).toBe(1);
    expect(plan.gaps).toContain('集合場所・緊急連絡先・171などの連絡ルールを家族で決める');
    expect(plan.gaps).toContain('食料は簡易換算で約2.0日分。1人1日3食で3日分まで増やす');
    expect(plan.gaps).toContain('3日分の食料を並べ、主食・たんぱく源・調理不要の一食と、家族のアレルギー・年齢・持病への適合を実物確認する');
  });

  it('scores a scenario and penalizes a longer outage', () => {
    const short = simulateDisaster(verifiedLightState, summary, 'earthquake', 3);
    const long = simulateDisaster(verifiedLightState, summary, 'earthquake', 7);
    expect(long.score).toBeLessThan(short.score);
    expect(short.criticalGaps.map((item) => item.key)).toContain('water');
    expect(short.advice).toBe('飲料水分野を最優先で補強してください。');
  });

  it('scores essential stock by selected-day coverage instead of per-item target ratios', () => {
    const thinSummary = inventorySummary([
      { name: '水500ml', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, quantity: 1, target: 1, volumeMl: 500 },
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
    const result = simulateDisaster(verifiedLightState, {
      waterDays: 1.8,
      foodDays: 3,
      toiletDays: 3,
      categoryScores: [{ key: 'light', score: 100 }],
    }, 'earthquake', 3);

    expect(result.score).toBe(65);
    expect(result.criticalGaps).toEqual([
      { key: 'water', score: 60, reason: 'stock-or-verification' },
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
    expect(result.statusKey).toBe('needs-stock');
    expect(result.status).toBe('備蓄不足あり');
  });

  it('does not call partial three-day coverage ready even when every category is above 70 percent', () => {
    const result = simulateDisaster(verifiedLightState, {
      waterDays: 2.4,
      foodDays: 2.4,
      toiletDays: 2.4,
      categoryScores: [],
    }, 'earthquake', 3);

    expect(result.score).toBe(60);
    expect(result.criticalGaps).toEqual([
      { key: 'water', score: 80, reason: 'stock-or-verification' },
      { key: 'food', score: 80, reason: 'stock-or-verification' },
      { key: 'hygiene', score: 80, reason: 'stock-or-verification' },
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
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
    const state = { household: 1, contact: { shelter: '小学校', phone: '090', note: '171' } };
    const plan = generateEmergencyPlan(state, batteriesOnly);
    const result = simulateDisaster(state, {
      ...batteriesOnly,
      waterDays: 3,
      foodDays: 3,
      toiletDays: 3,
      categoryScores: [
        { key: 'water', score: 100 },
        { key: 'food', score: 100 },
        { key: 'hygiene', score: 100 },
        { key: 'light', score: 100 },
        { key: 'heat', score: 100 },
      ],
    }, 'blackout', 3);

    expect(plan.gaps).toContain('停電用の灯りを実際に点灯し、予備電池と置き場所を確認する');
    expect(result.criticalGaps).toContainEqual({ key: 'light', score: 0, reason: 'stock-or-verification' });
    expect(result.statusKey).not.toBe('reference-ready');
  });

  it('keeps food composition as a plan and simulation gap after weight reaches three days', () => {
    const readyByWeight = {
      ...summary,
      foodDays: 3,
      waterDays: 3,
      toiletDays: 3,
      categoryScores: [{ key: 'water', score: 100 }, { key: 'food', score: 100 }, { key: 'hygiene', score: 100 }, { key: 'light', score: 100 }, { key: 'heat', score: 100 }],
    };
    const baseState = { contact: { shelter: '小学校', phone: '090', note: '171' }, preparedness: { ...verifiedLightState.preparedness, completed: ['light-fire'] } };
    const unverifiedPlan = generateEmergencyPlan(baseState, readyByWeight);
    const unverifiedSimulation = simulateDisaster(baseState, readyByWeight, 'earthquake', 3);
    const verifiedState = { ...baseState, preparedness: { ...baseState.preparedness, completed: [...baseState.preparedness.completed, 'food-fit'] } };

    expect(unverifiedPlan.gaps).toContain('3日分の食料を並べ、主食・たんぱく源・調理不要の一食と、家族のアレルギー・年齢・持病への適合を実物確認する');
    expect(unverifiedSimulation.criticalGaps).toContainEqual({ key: 'food', score: 0, reason: 'stock-or-verification' });
    expect(unverifiedSimulation.statusKey).not.toBe('reference-ready');
    expect(generateEmergencyPlan(verifiedState, readyByWeight).gaps).not.toContain('3日分の食料を並べ、主食・たんぱく源・調理不要の一食と、家族のアレルギー・年齢・持病への適合を実物確認する');
    expect(simulateDisaster(verifiedState, readyByWeight, 'earthquake', 3).criticalGaps).toEqual([
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
  });

  it('uses a completed and fully checked light-fire loadout as the blackout light gate', () => {
    const readySummary = {
      waterDays: 3,
      foodDays: 3,
      toiletDays: 3,
      categoryScores: [
        { key: 'water', score: 100 },
        { key: 'food', score: 100 },
        { key: 'hygiene', score: 100 },
        { key: 'light', score: 0 },
        { key: 'heat', score: 100 },
      ],
    };

    const result = simulateDisaster(verifiedBlackoutState, readySummary, 'blackout', 3);
    expect(result.criticalGaps).toEqual([
      { key: 'heat', score: 0, reason: 'duration-unmeasured' },
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
    expect(result.score).toBe(50);
    expect(result.statusKey).toBe('needs-verification');
    expect(result.status).toBe('期間の確認が必要');
  });

  it('does not use generic heat or comfort item targets as scenario readiness', () => {
    const readySummary = {
      waterDays: 3,
      foodDays: 3,
      toiletDays: 3,
      categoryScores: [{ key: 'heat', score: 100 }, { key: 'comfort', score: 100 }],
    };
    const blackout = simulateDisaster(verifiedLightState, readySummary, 'blackout', 3);
    const snow = simulateDisaster(verifiedLightState, readySummary, 'snow', 3);
    const typhoonWithoutToilets = simulateDisaster(verifiedLightState, { ...readySummary, toiletDays: 0 }, 'typhoon', 3);
    const winterChecked = simulateDisaster({
      ...verifiedLightState,
      preparedness: { ...verifiedLightState.preparedness, completed: [...verifiedLightState.preparedness.completed, 'seasonal-temperature'] },
    }, readySummary, 'snow', 3);

    expect(blackout.criticalGaps).toContainEqual({ key: 'heat', score: 0, reason: 'stock-or-verification' });
    expect(snow.criticalGaps).toContainEqual({ key: 'heat', score: 0, reason: 'stock-or-verification' });
    expect(typhoonWithoutToilets.criticalGaps).toContainEqual({ key: 'hygiene', score: 0, reason: 'stock-or-verification' });
    expect(winterChecked.criticalGaps).toEqual([
      { key: 'heat', score: 0, reason: 'duration-unmeasured' },
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
    expect(winterChecked.statusKey).toBe('needs-verification');
  });

  it('scores unmeasured qualitative checks as unknown rather than near-complete for 14 days', () => {
    const readySummary = { waterDays: 14, foodDays: 14, toiletDays: 14, categoryScores: [] };
    const result = simulateDisaster(verifiedBlackoutState, readySummary, 'blackout', 14);

    expect(result.score).toBe(50);
    expect(result.statusKey).toBe('needs-verification');
    expect(result.criticalGaps).toEqual([
      { key: 'heat', score: 0, reason: 'duration-unmeasured' },
      { key: 'light', score: 0, reason: 'duration-unmeasured' },
    ]);
    expect(result.advice).toContain('14日間使える量・容量は未測定');
  });
});
