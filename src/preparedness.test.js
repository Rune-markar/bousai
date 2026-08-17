import { describe, expect, it } from 'vitest';
import { inventorySummary } from './domain.js';
import { defensePower, essentialPreparednessGates, preparednessProgress, targetRequirement, togglePreparednessTask } from './preparedness.js';

const base = {
  household: 2,
  inventory: [
    { category: 'water', quantity: 36, target: 36, volumeMl: 500 },
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

  it('supports long-term targets up to 180 days', () => {
    const summary = inventorySummary(base.inventory, base.household);
    expect(defensePower({ ...base, preparedness: { completed: [], targetDays: 180 } }, summary).targetDays).toBe(180);
  });

  it('requires seven life-and-hygiene gates without treating a power calculation as an achievement', () => {
    const state = {
      ...base,
      preparedness: { completed: ['hazard-map', 'furniture', 'medicine', 'light-fire'] },
      powerPlan: { autonomyDays: 7 },
    };
    const plan = essentialPreparednessGates(state, inventorySummary(state.inventory, state.household));

    expect(plan.gates.map(({ key }) => key)).toEqual(['home', 'risk', 'contact', 'medicine', 'water', 'toilet', 'light']);
    expect(plan.gates.find((gate) => gate.key === 'power')).toBeUndefined();
    expect(plan.complete).toBe(true);
    expect(plan.completeCount).toBe(7);
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
});
