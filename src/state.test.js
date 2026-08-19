import { describe, expect, it } from 'vitest';
import { loadState, normalizeState, SCHEMA_VERSION } from './state.js';

describe('state migration', () => {
  it('migrates a v1 inventory while preserving user data', () => {
    const state = normalizeState({ inventory: [{ id: 'old', name: '水', category: 'water', quantity: 2, target: 3, unit: '本' }], household: 4 });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.onboarding.completed).toBe(true);
    expect(state.inventory[0]).toMatchObject({ id: 'old', name: '水', quantity: 2 });
    expect(state.inventory[0].productId).toBe('legacy:old');
    expect(state.preparedness).toEqual({ completed: [], loadouts: {}, bagSettings: {}, disasterChecks: {}, targetDays: 7, annualBudget: 0, updatedAt: '' });
    expect(state.inventory[0].packingVolumeMl).toBe(0);
    expect(state.inventory[0].foodWeightG).toBe(0);
    expect(state.transactions).toEqual([]);
    expect(state.inventory[0].replenishmentPriority).toBe('medium');
    expect(state.powerPlan.devices.phone.quantity).toBe(2);
    expect(state.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'カセットコンロ', category: 'heat', quantity: 0, target: 1 })]));
  });

  it('normalizes the preparedness target duration', () => {
    expect(normalizeState({ preparedness: { targetDays: 14 } }).preparedness.targetDays).toBe(14);
    expect(normalizeState({ preparedness: { targetDays: 999 } }).preparedness.targetDays).toBe(180);
    expect(normalizeState({ preparedness: { targetDays: 0 } }).preparedness.targetDays).toBe(7);
  });

  it('preserves valid disaster checklist state', () => {
    expect(normalizeState({ preparedness: { disasterChecks: { earthquake: ['furniture-brace', 'furniture-brace', 42] } } }).preparedness.disasterChecks).toEqual({ earthquake: ['furniture-brace'] });
  });

  it('migrates food weight from an existing package label', () => {
    const state = normalizeState({ inventory: [{ id: 'food', name: '保存食', category: 'food', quantity: 2, packageSize: '2 x 120g' }] });
    expect(state.inventory[0].foodWeightG).toBe(240);
  });

  it('keeps valid imported state when inventory contains null or invalid records', () => {
    const raw = {
      schemaVersion: SCHEMA_VERSION,
      household: 4,
      contact: { name: '重要メモ', phone: '090', shelter: '避難所', note: '171' },
      inventory: [
        { id: 'water', name: '飲料水', category: 'water', quantity: 6, volumeMl: 500 },
        null,
        'broken',
        [],
        { id: 'mapped', name: '分類不明品', category: 'edited-category', quantity: 1 },
      ],
    };
    const state = loadState({ getItem: () => JSON.stringify(raw) });

    expect(state.household).toBe(4);
    expect(state.contact).toMatchObject({ name: '重要メモ', phone: '090', shelter: '避難所', note: '171' });
    expect(state.inventory.map((item) => item.id)).toEqual(['water', 'mapped']);
    expect(state.inventory.find((item) => item.id === 'mapped').category).toBe('food');
  });

  it('recovers from corrupt JSON', () => {
    const state = loadState({ getItem: () => '{broken' });
    expect(state.inventory.length).toBeGreaterThan(0);
    expect(state.contact.name).toBeTruthy();
    expect(state.onboarding.completed).toBe(false);
  });
});
