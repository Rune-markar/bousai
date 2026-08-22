import { describe, expect, it } from 'vitest';
import { inventorySummary } from './domain.js';
import { getLoadout, requiredLoadoutItemIds } from './loadouts.js';
import { ALL_PREPAREDNESS_TASKS, defensePower, essentialPreparednessGates, foodInventoryFingerprint, hasVerifiedSeasonalTemperature, preparednessProgress, targetRequirement, togglePreparednessTask } from './preparedness.js';

const base = {
  household: 2,
  inventory: [
    { category: 'water', waterPurpose: 'drinking-cooking', quantity: 36, target: 36, volumeMl: 500 },
    { category: 'food', quantity: 6, target: 6, foodWeightG: 450 },
    { name: '携帯トイレ', category: 'hygiene', quantity: 30, target: 30 },
  ],
  contact: { shelter: '小学校', phone: '090-0000-0000', note: '171を使う' },
  preparedness: { completed: [] },
};

describe('preparedness roadmap', () => {
  it('derives inventory and emergency-note achievements automatically', () => {
    const progress = preparednessProgress(base, inventorySummary(base.inventory, base.household));
    expect([...progress.automatic]).toEqual(expect.arrayContaining(['water-3', 'toilet-3', 'family-route']));
    expect(progress.automatic.has('food-core')).toBe(true);
    expect(progress.completed.has('water-7')).toBe(false);
  });

  it('does not mark the family route complete without an emergency contact number', () => {
    const noPhone = { ...base, contact: { shelter: '小学校', phone: '', note: '171を使う' } };
    const progress = preparednessProgress(noPhone, inventorySummary(noPhone.inventory, noPhone.household));
    expect(progress.automatic.has('family-route')).toBe(false);
  });

  it('derives toilet achievements from the expiry- and component-safe summary', () => {
    const state = {
      ...base,
      household: 1,
      inventory: [
        { name: '期限切れ携帯トイレ', category: 'hygiene', quantity: 35, expiry: '2026-08-16' },
        { name: '凝固剤', category: 'hygiene', quantity: 35 },
      ],
      contact: {},
    };
    const summary = inventorySummary(state.inventory, state.household, new Date('2026-08-17T12:00:00'));
    const progress = preparednessProgress(state, summary);

    expect(summary.toiletDays).toBe(0);
    expect(progress.automatic.has('toilet-3')).toBe(false);
    expect(progress.automatic.has('toilet-7')).toBe(false);
  });

  it('ignores unknown, stale automatic, and unverified loadout completions', () => {
    const state = {
      household: 1,
      inventory: [],
      contact: {},
      preparedness: {
        completed: ['unknown-task', 'food-core', 'bag-primary', 'light-fire', 'hazard-map'],
        loadouts: { 'bag-primary': ['water'], 'light-fire': ['light'] },
      },
    };
    const summary = inventorySummary([], 1);
    const progress = preparednessProgress(state, summary);

    expect([...progress.completed]).toEqual(['hazard-map']);
    expect(progress.totalDone).toBe(1);
    expect(progress.totalDone).toBeLessThanOrEqual(progress.totalTasks);
    expect(essentialPreparednessGates(state, summary).gates.find((gate) => gate.key === 'light').complete).toBe(false);
  });

  it('keeps a persisted loadout completion only while every required item remains packed', () => {
    const required = requiredLoadoutItemIds(getLoadout('bag-primary'));
    const state = {
      ...base,
      preparedness: { completed: ['bag-primary'], loadouts: { 'bag-primary': required } },
    };

    expect(preparednessProgress(state, inventorySummary(state.inventory, state.household)).completed.has('bag-primary')).toBe(true);
  });

  it('keeps automatic tasks authoritative and toggles manual tasks', () => {
    const summary = inventorySummary(base.inventory, base.household);
    const unchanged = togglePreparednessTask(base, 'water-3', summary);
    expect(unchanged).toBe(base);
    const changed = togglePreparednessTask(base, 'hazard-map', summary);
    expect(changed.preparedness.completed).toContain('hazard-map');
  });

  it('unlocks the next stage when all prior automatic gate tasks are complete', () => {
    const completeProtect = { ...base, preparedness: { completed: ['hazard-map', 'furniture', 'medicine'] } };
    const progress = preparednessProgress(completeProtect, inventorySummary(base.inventory, base.household));
    expect(progress.stages[0].gateClear).toBe(true);
    expect(progress.stages[1].unlocked).toBe(true);
    expect(progress.stages[2].unlocked).toBe(true);
  });

  it('keeps every stage actionable even when an earlier food target is incomplete', () => {
    const lowFood = { ...base, inventory: base.inventory.map((item) => item.category === 'food' ? { ...item, quantity: 1 } : item), preparedness: { completed: ['hazard-map', 'furniture', 'medicine'] } };
    const progress = preparednessProgress(lowFood, inventorySummary(lowFood.inventory, lowFood.household));
    expect(progress.completed.has('food-core')).toBe(false);
    expect(progress.stages[2].unlocked).toBe(true);
    expect(progress.stages[2].priorGateClear).toBe(false);
  });

  it('raises the required roadmap stage as the stockpile target grows', () => {
    expect(targetRequirement(3).stageNumber).toBe(2);
    expect(targetRequirement(7).stageNumber).toBe(4);
    expect(targetRequirement(14).stageNumber).toBe(5);
    expect(targetRequirement(30).stageNumber).toBe(6);
    expect(targetRequirement(45).stageNumber).toBe(6);
  });

  it('scores against both the selected duration and its required tasks', () => {
    const state = { ...base, preparedness: { completed: [], targetDays: 7 } };
    const model = defensePower(state, { ...inventorySummary(base.inventory, base.household), waterDays: 3, foodDays: 2, survivalDays: 2 });
    expect(model.targetDays).toBe(7);
    expect(model.requiredStage.stageNumber).toBe(4);
    expect(model.score).toBeLessThan(100);
    expect(model.requirementCount).toBeGreaterThan(2);
  });

  it('lowers readiness when the target duration adds stock and roadmap requirements', () => {
    const summary = { ...inventorySummary(base.inventory, base.household), waterDays: 7, foodDays: 7, survivalDays: 7 };
    const threeDay = defensePower({ ...base, preparedness: { completed: [], targetDays: 3 } }, summary);
    const thirtyDay = defensePower({ ...base, preparedness: { completed: [], targetDays: 30 } }, summary);
    expect(thirtyDay.requirementCount).toBeGreaterThan(threeDay.requirementCount);
    expect(thirtyDay.score).toBeLessThan(threeDay.score);
  });

  it('caps quantity-based readiness at 30 days', () => {
    const summary = inventorySummary(base.inventory, base.household);
    expect(defensePower({ ...base, preparedness: { completed: [], targetDays: 180 } }, summary).targetDays).toBe(30);
  });

  it('includes portable-toilet coverage in the selected target-day score', () => {
    const completed = ALL_PREPAREDNESS_TASKS.filter((task) => !task.auto).map((task) => task.id);
    const loadouts = Object.fromEntries(completed.filter((taskId) => getLoadout(taskId)).map((taskId) => [taskId, requiredLoadoutItemIds(getLoadout(taskId))]));
    const state = { ...base, preparedness: { completed, loadouts, targetDays: 30 } };
    const summary = { ...inventorySummary(base.inventory, base.household), waterDays: 30, foodDays: 30, toiletDays: 7 };
    const model = defensePower(state, summary);

    expect(model.completedTasks).toBe(model.requiredTasks.length);
    expect(model.toiletCoverage).toBeCloseTo(7 / 30);
    expect(model.requirementCount).toBe(model.requiredTasks.length + 3);
    expect(model.score).toBeLessThan(100);
  });

  it('requires eight life-and-hygiene gates without treating a power calculation as an achievement', () => {
    const state = {
      ...base,
      preparedness: {
        completed: ['hazard-map', 'furniture', 'medicine', 'food-fit', 'light-fire'],
        loadouts: { 'light-fire': requiredLoadoutItemIds(getLoadout('light-fire')) },
      },
      powerPlan: { autonomyDays: 7 },
    };
    const plan = essentialPreparednessGates(state, inventorySummary(state.inventory, state.household));

    expect(plan.gates.map(({ key }) => key)).toEqual(['home', 'risk', 'contact', 'medicine', 'water', 'food', 'toilet', 'light']);
    expect(plan.gates.find((gate) => gate.key === 'power')).toBeUndefined();
    expect(plan.complete).toBe(true);
    expect(plan.completeCount).toBe(8);
  });

  it('keeps missing safety checks visible even when stockpile day counts are sufficient', () => {
    const state = {
      ...base,
      inventory: [...base.inventory, { name: '乾電池', category: 'light', quantity: 12, expiry: '' }],
      contact: { shelter: '', phone: '', note: '' },
    };
    const plan = essentialPreparednessGates(state, inventorySummary(state.inventory, state.household));

    expect(plan.gates.filter((gate) => gate.complete).map((gate) => gate.key)).toEqual(['water', 'toilet']);
    expect(plan.completeCount).toBe(2);
    expect(plan.complete).toBe(false);
  });

  it('requires a manual food-composition check in addition to three days of food by weight', () => {
    const summary = inventorySummary(base.inventory, base.household);
    const quantityOnly = essentialPreparednessGates(base, summary).gates.find((gate) => gate.key === 'food');
    const verified = essentialPreparednessGates({
      ...base,
      preparedness: { completed: ['food-fit'] },
    }, summary).gates.find((gate) => gate.key === 'food');

    expect(quantityOnly).toMatchObject({ complete: false, statusLabel: '構成を実物確認', page: 'roadmap' });
    expect(verified).toMatchObject({ complete: true, statusLabel: '量・構成を確認済み', page: 'roadmap' });
  });

  it('invalidates food composition verification when food or household context changes', () => {
    const today = new Date('2026-08-22T12:00:00');
    const onePerson = { ...base, schemaVersion: 15, household: 1 };
    const fingerprint = foodInventoryFingerprint(onePerson.inventory, today, onePerson.household);
    const verified = {
      ...onePerson,
      preparedness: { completed: ['food-fit'], taskVerifications: { 'food-fit': { fingerprint, checkedAt: today.toISOString(), season: '' } } },
    };
    const changedFood = { ...verified, inventory: verified.inventory.map((item) => item.category === 'food' ? { ...item, name: '白米だけ' } : item) };
    const changedHousehold = { ...verified, household: 2 };

    expect(essentialPreparednessGates(verified, inventorySummary(verified.inventory, 1, today)).gates.find((gate) => gate.key === 'food').complete).toBe(true);
    expect(essentialPreparednessGates(changedFood, inventorySummary(changedFood.inventory, 1, today)).gates.find((gate) => gate.key === 'food')).toMatchObject({ complete: false, statusLabel: '構成を実物確認' });
    expect(inventorySummary(changedHousehold.inventory, 2, today).foodDays).toBe(3);
    expect(essentialPreparednessGates(changedHousehold, inventorySummary(changedHousehold.inventory, 2, today)).gates.find((gate) => gate.key === 'food')).toMatchObject({ complete: false, statusLabel: '構成を実物確認' });
  });

  it('requires a recent matching-season temperature verification', () => {
    const state = (season, checkedAt) => ({ schemaVersion: 15, preparedness: { completed: ['seasonal-temperature'], taskVerifications: { 'seasonal-temperature': { season, checkedAt } } } });
    const winter = new Date('2026-01-15T12:00:00');

    expect(hasVerifiedSeasonalTemperature(state('cold', '2025-12-01T12:00:00Z'), { today: winter, requiredSeason: 'cold' })).toBe(true);
    expect(hasVerifiedSeasonalTemperature(state('hot', '2026-01-01T12:00:00Z'), { today: winter, requiredSeason: 'cold' })).toBe(false);
    expect(hasVerifiedSeasonalTemperature(state('cold', '2020-01-01T12:00:00Z'), { today: winter, requiredSeason: 'cold' })).toBe(false);
  });

  it('does not complete essential preparedness when food is below three days', () => {
    const state = {
      ...base,
      inventory: base.inventory.filter((item) => item.category !== 'food'),
      preparedness: {
        completed: ['hazard-map', 'furniture', 'medicine', 'food-fit', 'light-fire'],
        loadouts: { 'light-fire': requiredLoadoutItemIds(getLoadout('light-fire')) },
      },
    };
    const plan = essentialPreparednessGates(state, inventorySummary(state.inventory, state.household));
    expect(plan.gates.find((gate) => gate.key === 'food')).toMatchObject({ complete: false, page: 'inventory' });
    expect(plan.complete).toBe(false);
  });

  it('does not treat a registered light as a verified working light', () => {
    const state = { ...base, inventory: [...base.inventory, { name: 'LEDライト', category: 'light', quantity: 1, target: 1 }] };
    const light = essentialPreparednessGates(state, inventorySummary(state.inventory, state.household)).gates.find((gate) => gate.key === 'light');
    expect(light).toMatchObject({ complete: false, statusLabel: 'ライトを点検', page: 'roadmap' });
  });

  it('does not award a later stage badge before prior stage gates are clear', () => {
    const state = { ...base, preparedness: { completed: ['bag-primary'], loadouts: { 'bag-primary': requiredLoadoutItemIds(getLoadout('bag-primary')) } } };
    const progress = preparednessProgress(state, inventorySummary(state.inventory, state.household));
    expect(progress.stages[2]).toMatchObject({ ownGateClear: true, priorGateClear: false, gateClear: false, unlocked: true });
  });
});
