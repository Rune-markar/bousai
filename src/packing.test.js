import { describe, expect, it } from 'vitest';
import { autoPackInventory, bagSettings, BAG_VOLUME_EXAMPLES, EVACUATION_BAG_PROFILES, packingVolumeForItem, updateBagSettings } from './packing.js';

describe('inventory auto packing', () => {
  it('shows relatable volume examples for bag capacity', () => {
    expect(BAG_VOLUME_EXAMPLES).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '飲料水 500ml', volumeMl: 600 }),
      expect.objectContaining({ label: '防寒シート' }),
      expect.objectContaining({ label: '小型ライト' }),
    ]));
  });
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

  it('identifies a different purpose and explanation for each evacuation stage', () => {
    expect(EVACUATION_BAG_PROFILES['bag-primary']).toMatchObject({ stageLabel: '一時避難' });
    expect(EVACUATION_BAG_PROFILES['bag-secondary']).toMatchObject({ stageLabel: '2次避難' });
    const inventory = [{ id: 'water', name: '飲料水', category: 'water', tier: 1, unit: '本', quantity: 20, volumeMl: 500 }];
    const primary = autoPackInventory(inventory, 'bag-primary', 20, 1);
    const secondary = autoPackInventory(inventory, 'bag-secondary', 40, 1, { reservedItems: primary.items });
    expect(primary.items[0]).toMatchObject({ quantity: 2, reason: '移動中の最低限の水分' });
    expect(secondary.items[0]).toMatchObject({ quantity: 4, reason: '避難生活で追加する水分' });
  });

  it('reserves the primary allocation before proposing secondary bag stock', () => {
    const inventory = [{ id: 'water', name: '飲料水', category: 'water', tier: 1, unit: '本', quantity: 5, volumeMl: 500 }];
    const primary = autoPackInventory(inventory, 'bag-primary', 20, 1);
    const secondary = autoPackInventory(inventory, 'bag-secondary', 40, 1, { reservedItems: primary.items });
    expect(primary.items[0].quantity).toBe(2);
    expect(secondary.items[0].quantity).toBe(3);
    expect(primary.items[0].quantity + secondary.items[0].quantity).toBeLessThanOrEqual(inventory[0].quantity);
  });

  it('does not mistake an item usage note for the item itself', () => {
    const result = autoPackInventory([{ id: 'battery', name: '乾電池（単3）', note: 'ライトとラジオ用', category: 'light', tier: 2, unit: '本', quantity: 8 }], 'bag-secondary', 40, 1);
    expect(result.matchedSlotIds).not.toContain('radio');
  });
});
