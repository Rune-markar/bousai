import { describe, expect, it } from 'vitest';
import { addBagPurchaseItem, completeLoadout, getLoadout, loadoutStatus, requiredLoadoutItemIds, updateBagPurchaseItem, updateLoadout } from './loadouts.js';

const state = { preparedness: { completed: [], loadouts: {}, updatedAt: '' } };

describe('practical loadouts', () => {
  it('defines distinct primary and secondary evacuation bags', () => {
    expect(getLoadout('bag-primary').items.map((item) => item.id)).toContain('medicine');
    expect(getLoadout('bag-secondary').items.map((item) => item.id)).toContain('clothes');
    expect(getLoadout('bag-primary').label).not.toBe(getLoadout('bag-secondary').label);
  });

  it('persists only known items and reports required progress', () => {
    const changed = updateLoadout(state, 'cash-docs', ['cash', 'coins', 'unknown']);
    expect(changed.preparedness.loadouts['cash-docs']).toEqual(['cash', 'coins']);
    expect(loadoutStatus(changed, 'cash-docs')).toMatchObject({ done: 2, total: 6, ready: false });
  });

  it('only completes a mission after every required item is checked', () => {
    expect(completeLoadout(state, 'bag-primary')).toBe(state);
    const required = requiredLoadoutItemIds(getLoadout('bag-primary'));
    const ready = updateLoadout(state, 'bag-primary', required);
    expect(loadoutStatus(ready, 'bag-primary').ready).toBe(true);
    expect(completeLoadout(ready, 'bag-primary').preparedness.completed).toContain('bag-primary');
  });

  it('revokes completion when a required item is unchecked', () => {
    const required = requiredLoadoutItemIds(getLoadout('light-fire'));
    const ready = completeLoadout(updateLoadout(state, 'light-fire', required), 'light-fire');
    const changed = updateLoadout(ready, 'light-fire', required.slice(1));
    expect(changed.preparedness.completed).not.toContain('light-fire');
  });

  it('adds each missing bag item to the purchase plan once and keeps its price', () => {
    const added = addBagPurchaseItem(state, 'bag-primary', 'medicine');
    expect(added.preparedness.bagPurchasePlan).toEqual([{ taskId: 'bag-primary', itemId: 'medicine', price: 0 }]);
    expect(addBagPurchaseItem(added, 'bag-primary', 'medicine')).toBe(added);
    const priced = updateBagPurchaseItem(added, 'bag-primary', 'medicine', { price: 1800 });
    expect(priced.preparedness.bagPurchasePlan[0].price).toBe(1800);
    expect(updateBagPurchaseItem(priced, 'bag-primary', 'medicine', { remove: true }).preparedness.bagPurchasePlan).toEqual([]);
  });
});
