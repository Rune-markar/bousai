import { describe, expect, it } from 'vitest';
import { autoPackInventory, bagSettings, packingVolumeForItem, updateBagSettings } from './packing.js';

describe('inventory auto packing', () => {
  it('uses measured package volume before internal estimates', () => {
    expect(packingVolumeForItem({ name: '水', category: 'water', packingVolumeMl: 720, volumeMl: 500 })).toMatchObject({ ml: 720, source: 'user' });
    expect(packingVolumeForItem({ name: '水', category: 'water', volumeMl: 500 })).toMatchObject({ ml: 600, source: 'content' });
    expect(packingVolumeForItem({ name: '携帯トイレ', category: 'hygiene' })).toMatchObject({ ml: 80, source: 'backup' });
  });

  it('selects owned high-priority stock without exceeding usable capacity', () => {
    const inventory = [
      { id: 'water', name: '飲料水 500ml', category: 'water', tier: 1, unit: '本', quantity: 10, volumeMl: 500 },
      { id: 'rice', name: 'アルファ米', category: 'food', tier: 1, unit: '食', quantity: 10 },
      { id: 'gas', name: 'カセットボンベ', category: 'heat', tier: 1, unit: '本', quantity: 3 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回', quantity: 20 },
    ];
    const result = autoPackInventory(inventory, 'bag-primary', 3);
    expect(result.items.map((item) => item.id)).toEqual(expect.arrayContaining(['water', 'rice', 'toilet']));
    expect(result.items.map((item) => item.id)).not.toContain('gas');
    expect(result.usedMl).toBeLessThanOrEqual(result.usableCapacityMl);
    expect(result.matchedSlotIds).toEqual(expect.arrayContaining(['water', 'food', 'toilet']));
  });

  it('keeps standard and custom bag capacity settings', () => {
    const state = { preparedness: { bagSettings: {} } };
    expect(bagSettings(state, 'bag-primary').capacityL).toBe(20);
    const changed = updateBagSettings(state, 'bag-primary', { mode: 'custom', customCapacityL: 27 });
    expect(bagSettings(changed, 'bag-primary')).toMatchObject({ mode: 'custom', capacityL: 27 });
  });
});
