import { describe, expect, it } from 'vitest';
import { loadState, normalizeState, SCHEMA_VERSION } from './state.js';

describe('state migration', () => {
  it('migrates a v1 inventory while preserving user data', () => {
    const state = normalizeState({ inventory: [{ id: 'old', name: '水', category: 'water', quantity: 2, target: 3, unit: '本' }], household: 4 });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.inventory[0]).toMatchObject({ id: 'old', name: '水', quantity: 2 });
    expect(state.inventory[0].productId).toBe('legacy:old');
    expect(state.preparedness).toEqual({ completed: [], updatedAt: '' });
    expect(state.transactions).toEqual([]);
    expect(state.inventory[0].replenishmentPriority).toBe('medium');
  });

  it('recovers from corrupt JSON', () => {
    const state = loadState({ getItem: () => '{broken' });
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.contact.name).toBeTruthy();
  });
});
