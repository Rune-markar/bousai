import { describe, expect, it } from 'vitest';
import { loadState, normalizeState, SCHEMA_VERSION } from './state.js';

describe('state migration', () => {
  it('migrates a v1 inventory while preserving user data', () => {
    const state = normalizeState({ inventory: [{ id: 'old', name: '水', category: 'water', quantity: 2, target: 3, unit: '本' }], household: 4 });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.inventory[0]).toMatchObject({ id: 'old', name: '水', quantity: 2 });
    expect(state.inventory[0].productId).toBe('legacy:old');
    expect(state.preparedness).toEqual({ completed: [], loadouts: {}, bagSettings: {}, targetDays: 7, updatedAt: '' });
    expect(state.inventory[0].packingVolumeMl).toBe(0);
    expect(state.inventory[0].foodWeightG).toBe(0);
    expect(state.transactions).toEqual([]);
    expect(state.inventory[0].replenishmentPriority).toBe('medium');
    expect(state.powerPlan.devices.phone.quantity).toBe(2);
  });

  it('normalizes the preparedness target duration', () => {
    expect(normalizeState({ preparedness: { targetDays: 14 } }).preparedness.targetDays).toBe(14);
    expect(normalizeState({ preparedness: { targetDays: 999 } }).preparedness.targetDays).toBe(90);
    expect(normalizeState({ preparedness: { targetDays: 0 } }).preparedness.targetDays).toBe(7);
  });

  it('migrates food weight from an existing package label', () => {
    const state = normalizeState({ inventory: [{ id: 'food', name: '保存食', category: 'food', quantity: 2, packageSize: '2 x 120g' }] });
    expect(state.inventory[0].foodWeightG).toBe(240);
  });

  it('recovers from corrupt JSON', () => {
    const state = loadState({ getItem: () => '{broken' });
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.contact.name).toBeTruthy();
  });
});
