import { describe, expect, it } from 'vitest';
import { inventorySummary } from './domain.js';
import { preparednessProgress, togglePreparednessTask } from './preparedness.js';

const base = {
  household: 2,
  inventory: [
    { category: 'water', quantity: 36, target: 36, volumeMl: 500 },
    { category: 'food', quantity: 6, target: 6 },
    { name: '携帯トイレ', category: 'hygiene', quantity: 30, target: 30 },
  ],
  contact: { shelter: '小学校', note: '171を使う' },
  preparedness: { completed: [] },
};

describe('preparedness roadmap', () => {
  it('derives inventory and emergency-note achievements automatically', () => {
    const progress = preparednessProgress(base, inventorySummary(base.inventory, base.household));
    expect([...progress.automatic]).toEqual(expect.arrayContaining(['water-3', 'toilet-3', 'family-route']));
    expect(progress.automatic.has('food-core')).toBe(false);
    expect(progress.completed.has('water-7')).toBe(false);
  });

  it('keeps automatic tasks authoritative and toggles manual tasks', () => {
    const summary = inventorySummary(base.inventory, base.household);
    const unchanged = togglePreparednessTask(base, 'water-3', summary);
    expect(unchanged).toBe(base);
    const changed = togglePreparednessTask(base, 'hazard-map', summary);
    expect(changed.preparedness.completed).toContain('hazard-map');
  });

  it('unlocks the next stage only after all prior gate tasks are complete', () => {
    const completeProtect = { ...base, preparedness: { completed: ['hazard-map', 'furniture', 'medicine'] } };
    const progress = preparednessProgress(completeProtect, inventorySummary(base.inventory, base.household));
    expect(progress.stages[0].gateClear).toBe(true);
    expect(progress.stages[1].unlocked).toBe(true);
    expect(progress.stages[2].unlocked).toBe(false);
  });
});
