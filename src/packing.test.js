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
    expect(packingVolumeForItem({ name: '水', category: 'water', waterPurpose: 'drinking-cooking', packingVolumeMl: 720, volumeMl: 500 })).toMatchObject({ ml: 720, source: 'user' });
    expect(packingVolumeForItem({ name: '水', category: 'water', waterPurpose: 'drinking-cooking', volumeMl: 500 })).toMatchObject({ ml: 600, source: 'content' });
    expect(packingVolumeForItem({ name: '携帯トイレ', category: 'hygiene' })).toMatchObject({ ml: 80, source: 'backup' });
  });

  it('selects owned high-priority stock without exceeding usable capacity', () => {
    const inventory = [
      { id: 'water', name: '飲料水 500ml', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 10, volumeMl: 500 },
      { id: 'rice', name: 'アルファ米', category: 'food', tier: 1, unit: '食', quantity: 10, foodWeightG: 150 },
      { id: 'gas', name: 'カセットボンベ', category: 'heat', tier: 1, unit: '本', quantity: 3 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', tier: 1, unit: '回', quantity: 20 },
    ];
    const result = autoPackInventory(inventory, 'bag-primary', 4);
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

  it('keeps auto mode unset until explicitly selected and persists custom ideal items', () => {
    const state = { preparedness: { bagSettings: {} } };
    expect(bagSettings(state, 'bag-primary')).toMatchObject({ autoMode: '', customIdealIds: [] });
    const changed = updateBagSettings(state, 'bag-primary', { autoMode: 'custom', customIdealIds: ['water', 'medicine', 'water'] });
    expect(bagSettings(changed, 'bag-primary')).toMatchObject({ autoMode: 'custom', customIdealIds: ['water', 'medicine'] });
  });

  it('identifies a different purpose and explanation for each evacuation stage', () => {
    expect(EVACUATION_BAG_PROFILES['bag-primary']).toMatchObject({ stageLabel: '一時避難' });
    expect(EVACUATION_BAG_PROFILES['bag-secondary']).toMatchObject({ stageLabel: '2次避難' });
    const inventory = [{ id: 'water', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 20, volumeMl: 500 }];
    const primary = autoPackInventory(inventory, 'bag-primary', 20, 1);
    const secondary = autoPackInventory(inventory, 'bag-secondary', 40, 1, { reservedItems: primary.items });
    expect(primary.items[0]).toMatchObject({ quantity: 2, reason: '移動中の最低限の水分' });
    expect(secondary.items[0]).toMatchObject({ quantity: 4, reason: '避難生活で追加する水分' });
  });

  it('reserves the primary allocation before proposing secondary bag stock', () => {
    const inventory = [{ id: 'water', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 5, volumeMl: 500 }];
    const primary = autoPackInventory(inventory, 'bag-primary', 20, 1);
    const secondary = autoPackInventory(inventory, 'bag-secondary', 40, 1, { reservedItems: primary.items });
    expect(primary.items[0].quantity).toBe(2);
    expect(secondary.items[0].quantity).toBe(3);
    expect(primary.items[0].quantity + secondary.items[0].quantity).toBeLessThanOrEqual(inventory[0].quantity);
  });

  it('excludes expired stock and prefers the nearest usable expiry', () => {
    const inventory = [
      { id: 'expired', name: '期限切れの水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500, expiry: '2026-08-15' },
      { id: 'later', name: '期限が先の水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500, expiry: '2026-09-30' },
      { id: 'sooner', name: '期限が近い水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500, expiry: '2026-08-18' },
    ];
    const result = autoPackInventory(inventory, 'bag-primary', 20, 1, { today: '2026-08-17' });
    expect(result.items.map((item) => item.id)).toEqual(['sooner']);
    expect(result.items.map((item) => item.id)).not.toContain('expired');
  });

  it('packs only verified drinking/cooking water', () => {
    const inventory = [
      { id: 'utility', name: '生活用水', category: 'water', waterPurpose: 'utility', tier: 1, unit: '本', quantity: 10, volumeMl: 500 },
      { id: 'ambiguous', name: '水タンク', category: 'water', waterPurpose: 'needs-review', verificationStatus: 'needs-review', tier: 1, unit: '本', quantity: 10, volumeMl: 500 },
      { id: 'review', name: '未確認の飲料水', category: 'water', waterPurpose: 'drinking-cooking', verificationStatus: 'needs-review', tier: 1, unit: '本', quantity: 10, volumeMl: 500 },
      { id: 'potable', name: '確認済み飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500 },
    ];

    const result = autoPackInventory(inventory, 'bag-primary', 20, 1, { today: '2026-08-17' });
    expect(result.items.map((item) => item.id)).toEqual(['potable']);
    expect(result.items[0]).toMatchObject({ quantity: 2, category: 'water' });
  });

  it('does not clear the required water slot with only 200ml', () => {
    const result = autoPackInventory([
      { id: 'tiny', name: '100mlの飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 100 },
    ], 'bag-primary', 20, 1);

    expect(result.items[0]).toMatchObject({ id: 'tiny', quantity: 2 });
    expect(result.matchedSlotIds).not.toContain('water');
  });

  it('does not auto-place a five-liter container in the light primary bag', () => {
    const result = autoPackInventory([
      { id: 'large', name: '5L飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 5000 },
    ], 'bag-primary', 20, 1);

    expect(result.items).toEqual([]);
    expect(result.matchedSlotIds).not.toContain('water');
  });

  it('does not clear the required food slot without a registered food weight', () => {
    const result = autoPackInventory([
      { id: 'unknown-food', name: '重量未登録の保存食', category: 'food', tier: 1, unit: '袋', quantity: 10 },
    ], 'bag-primary', 20, 1);

    expect(result.items).toEqual([]);
    expect(result.matchedSlotIds).not.toContain('food');
  });

  it.each([5000, 10000])('does not auto-pack a %sg bulk staple into the primary bag', (foodWeightG) => {
    const result = autoPackInventory([
      { id: `rice-${foodWeightG}`, name: `米${foodWeightG / 1000}kg`, category: 'food', tier: 1, unit: '袋', quantity: 1, foodWeightG },
    ], 'bag-primary', 20, 1);

    expect(result.items).toEqual([]);
    expect(result.matchedSlotIds).not.toContain('food');
    expect(packingVolumeForItem({ name: `米${foodWeightG / 1000}kg`, category: 'food', foodWeightG }).ml).toBeGreaterThanOrEqual(foodWeightG);
  });

  it('does not pack an item with an impossible expiry date', () => {
    const inventory = [
      { id: 'invalid', name: '期限不正の飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500, expiry: '2026-99-99' },
      { id: 'valid', name: '確認済み飲料水', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 2, volumeMl: 500, expiry: '2026-08-18' },
    ];

    const result = autoPackInventory(inventory, 'bag-primary', 20, 1, { today: '2026-08-17' });
    expect(result.items.map((item) => item.id)).toEqual(['valid']);
  });

  it('does not mistake an item usage note for the item itself', () => {
    const result = autoPackInventory([{ id: 'battery', name: '乾電池（単3）', note: 'ライトとラジオ用', category: 'light', tier: 2, unit: '本', quantity: 8 }], 'bag-secondary', 40, 1);
    expect(result.matchedSlotIds).not.toContain('radio');
  });

  it('requires a complete portable-toilet kit or a paired bag and coagulant before matching the toilet slot', () => {
    const bagOnly = autoPackInventory([{ id: 'bag', name: '非常用便袋', category: 'hygiene', tier: 1, unit: '枚', quantity: 2 }], 'bag-primary', 20, 1);
    const paired = autoPackInventory([
      { id: 'bag', name: '非常用便袋', category: 'hygiene', tier: 1, unit: '枚', quantity: 2 },
      { id: 'gel', name: '非常用凝固剤', category: 'hygiene', tier: 1, unit: '個', quantity: 2 },
    ], 'bag-primary', 20, 1);

    expect(bagOnly.matchedSlotIds).not.toContain('toilet');
    expect(paired.matchedSlotIds).toContain('toilet');
  });

  it('does not mistake medicated toiletries for regular medicine', () => {
    const toiletries = autoPackInventory([{ id: 'soap', name: '薬用ハンドソープ', category: 'hygiene', tier: 1, unit: '本', quantity: 1 }], 'bag-primary', 20, 1);
    const medicine = autoPackInventory([{ id: 'medicine', name: '常用薬', category: 'comfort', tier: 1, unit: '袋', quantity: 1 }], 'bag-primary', 20, 1);

    expect(toiletries.matchedSlotIds).not.toContain('medicine');
    expect(medicine.matchedSlotIds).toContain('medicine');
  });
});
