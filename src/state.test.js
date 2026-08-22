import { describe, expect, it } from 'vitest';
import { createInitialInventory, inventorySummary } from './domain.js';
import { createDefaultState, loadState, normalizeState, parseStateData, RECOVERY_KEY_PREFIX, SCHEMA_VERSION, STORAGE_KEY } from './state.js';

describe('state migration', () => {
  it('migrates a v1 inventory while preserving user data', () => {
    const state = normalizeState({ inventory: [{ id: 'old', name: '水', category: 'water', quantity: 2, target: 3, unit: '本' }], household: 4 });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.onboarding.completed).toBe(true);
    expect(state.inventory[0]).toMatchObject({ id: 'old', name: '水', quantity: 2 });
    expect(state.inventory[0].productId).toBe('legacy:old');
    expect(state.preparedness).toEqual({ completed: [], loadouts: {}, bagSettings: {}, disasterChecks: {}, taskVerifications: {}, stockpileSkillClaims: [], targetDays: 7, annualBudget: 0, updatedAt: '' });
    expect(state.inventory[0].packingVolumeMl).toBe(0);
    expect(state.inventory[0].foodWeightG).toBe(0);
    expect(state.inventory[0]).toMatchObject({ waterPurpose: 'needs-review', verificationStatus: 'needs-review', verificationReason: 'ambiguous-water' });
    expect(state.transactions).toEqual([]);
    expect(state.inventory[0].replenishmentPriority).toBe('medium');
    expect(state.powerPlan.devices.phone.quantity).toBe(2);
    expect(state.inventory).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'カセットコンロ', category: 'heat', quantity: 0, target: 1 })]));
  });

  it('normalizes the preparedness target duration', () => {
    expect(normalizeState({ preparedness: { targetDays: 14 } }).preparedness.targetDays).toBe(14);
    expect(normalizeState({ preparedness: { targetDays: 999 } }).preparedness).toMatchObject({ targetDays: 30, requestedHorizonDays: 999 });
    expect(normalizeState({ preparedness: { targetDays: 0 } }).preparedness.targetDays).toBe(7);
    expect(normalizeState({ preparedness: { targetDays: 'Infinity' } }).preparedness.targetDays).toBe(7);
  });

  it('starts a new user with no unverified physical inventory', () => {
    const state = createDefaultState();
    expect(state.inventory).toEqual([]);
    expect(state.onboarding.completed).toBe(false);
  });

  it('quarantines every untouched v14 sample until the user verifies physical stock', () => {
    const sampleInventory = createInitialInventory();
    const state = normalizeState({ schemaVersion: 14, inventory: sampleInventory, household: 2 });
    const summary = inventorySummary(state.inventory, state.household, new Date('2026-08-17T12:00:00'));

    expect(state.inventory).toHaveLength(sampleInventory.length);
    expect(state.inventory.map(({ id, verificationStatus, verificationReason }) => ({ id, verificationStatus, verificationReason }))).toEqual(
      sampleInventory.map(({ id }) => ({ id, verificationStatus: 'needs-review', verificationReason: 'legacy-sample' })),
    );
    expect(summary).toMatchObject({ waterDays: 0, foodDays: 0, toiletDays: 0, householdStockpileDays: 0, score: 0 });
  });

  it('quarantines a renamed v14 seed because its fixed ID still carries sample provenance', () => {
    const state = normalizeState({
      schemaVersion: 14,
      household: 2,
      inventory: [{ ...createInitialInventory()[0], name: '自宅で確認した飲料水' }],
    });

    expect(state.inventory[0]).toMatchObject({ verificationStatus: 'needs-review', verificationReason: 'legacy-sample' });
    expect(inventorySummary(state.inventory, state.household).waterDays).toBe(0);
  });

  it('keeps structural water uncertainty ahead of v14 sample provenance', () => {
    const legacyWater = { ...createInitialInventory()[0], name: '水タンク' };
    delete legacyWater.waterPurpose;
    const state = normalizeState({ schemaVersion: 14, household: 2, inventory: [legacyWater] });

    expect(state.inventory[0]).toMatchObject({
      verificationStatus: 'needs-review',
      verificationReason: 'ambiguous-water',
      waterPurpose: 'needs-review',
    });
    expect(inventorySummary(state.inventory, state.household).waterDays).toBe(0);
  });

  it('quarantines every duplicate v14 fixed ID before assigning unique IDs', () => {
    const water = createInitialInventory()[0];
    const state = normalizeState({ schemaVersion: 14, inventory: [water, { ...water, name: '別の保管場所の水' }] });

    expect(new Set(state.inventory.map((item) => item.id)).size).toBe(2);
    expect(new Set(state.inventory.map((item) => item.productId)).size).toBe(2);
    expect(state.inventory).toHaveLength(2);
    expect(state.inventory.every((item) => item.verificationReason === 'legacy-sample' && item.verificationStatus === 'needs-review')).toBe(true);
    expect(inventorySummary(state.inventory, 2).waterDays).toBe(0);
  });

  it('does not merge unrelated legacy products that reused the same row ID', () => {
    const state = normalizeState({ schemaVersion: 14, inventory: [
      { id: 'same', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 6, target: 6, volumeMl: 500, expiry: '2030-01-01' },
      { id: 'same', name: '保存食', category: 'food', unit: '食', quantity: 3, target: 3, foodWeightG: 150, expiry: '2030-01-01' },
    ] });

    expect(state.inventory.map(({ id, productId, category, target }) => ({ id, productId, category, target }))).toEqual([
      { id: 'same', productId: 'legacy:same', category: 'water', target: 6 },
      { id: 'same-duplicate-2', productId: 'legacy:same-duplicate-2', category: 'food', target: 3 },
    ]);
  });

  it('does not double-count cloned per-lot targets from older versions', () => {
    const state = normalizeState({ schemaVersion: 14, inventory: [
      { id: 'lot-a', productId: 'gtin:4900000000000', name: '保存食', category: 'food', quantity: 5, target: 10, foodWeightG: 150, expiry: '2099-12-31' },
      { id: 'lot-b', productId: 'gtin:4900000000000', name: '保存食', category: 'food', quantity: 5, target: 10, foodWeightG: 150, expiry: '2099-12-31' },
    ] });

    expect(state.inventory.reduce((sum, item) => sum + item.target, 0)).toBe(10);
    expect(inventorySummary(state.inventory, 1).rows.reduce((sum, item) => sum + item.shortage, 0)).toBe(0);
  });

  it('canonicalizes v15 barcode identities without summing duplicate product targets', () => {
    const barcode = '4900000000000';
    const state = normalizeState({ schemaVersion: 15, inventory: [
      { id: 'lot-a', productId: 'manual:first', barcode, name: '保存食', category: 'food', quantity: 3, target: 3, foodWeightG: 150, expiry: '2099-12-31' },
      { id: 'lot-b', productId: 'manual:first', barcode, name: '保存食', category: 'food', quantity: 2, target: 2, foodWeightG: 150, expiry: '2099-12-31' },
      { id: 'lot-c', productId: 'gtin:old-code', barcode, name: '保存食', category: 'food', quantity: 8, target: 8, foodWeightG: 150, expiry: '2099-12-31' },
    ] });

    expect(new Set(state.inventory.map((item) => item.productId))).toEqual(new Set([`gtin:${barcode}`]));
    expect(state.inventory.reduce((sum, item) => sum + item.target, 0)).toBe(8);
  });

  it('quarantines conflicting safety fields across lots sharing one barcode', () => {
    const barcode = '4900000000000';
    const state = normalizeState({ schemaVersion: 14, household: 1, inventory: [
      { id: 'lot-a', productId: 'manual:first', barcode, name: '保存食', category: 'food', unit: '袋', quantity: 1, target: 2, foodWeightG: 100, expiry: '2099-12-31' },
      { id: 'lot-b', productId: 'manual:second', barcode, name: '保存食', category: 'food', unit: '袋', quantity: 1, target: 1, foodWeightG: 10000, expiry: '2099-12-31' },
    ] });

    expect(state.inventory.every((item) => item.verificationReason === 'product-conflict' && item.verificationStatus === 'needs-review')).toBe(true);
    expect(inventorySummary(state.inventory, 1).foodDays).toBe(0);
  });

  it('does not preserve a stale GTIN identity after its barcode is removed', () => {
    const state = normalizeState({ schemaVersion: 15, inventory: [
      { id: 'manual-lot', productId: 'gtin:4900000000000', barcode: '', name: '手入力品', category: 'light', quantity: 1, target: 1 },
    ] });

    expect(state.inventory[0].productId).toBe('manual:manual-lot');
  });

  it('restores one identity for matching manual lots created by older replenishment', () => {
    const state = normalizeState({ schemaVersion: 14, inventory: [
      { id: 'lot-a', productId: 'manual:first', name: '保存食', category: 'food', unit: '袋', quantity: 5, target: 10, foodWeightG: 150 },
      { id: 'lot-b', productId: 'manual:second', name: '保存食', category: 'food', unit: '袋', quantity: 5, target: 10, foodWeightG: 150 },
    ] });

    expect(new Set(state.inventory.map((item) => item.productId))).toEqual(new Set(['manual:first']));
    expect(state.inventory.reduce((sum, item) => sum + item.target, 0)).toBe(10);
  });

  it('preserves valid disaster checklist state', () => {
    expect(normalizeState({ preparedness: { disasterChecks: { earthquake: ['furniture-brace', 'furniture-brace', 42] } } }).preparedness.disasterChecks).toEqual({ earthquake: ['furniture-brace'] });
  });

  it('normalizes and preserves claimed stockpile skill IDs', () => {
    const state = normalizeState({ preparedness: { stockpileSkillClaims: ['food-3', ' food-3 ', 42, '', 'home-3'] } });

    expect(state.preparedness.stockpileSkillClaims).toEqual(['food-3', 'home-3']);
  });

  it('migrates food weight from an existing package label', () => {
    const state = normalizeState({ inventory: [{ id: 'food', name: '保存食', category: 'food', quantity: 2, packageSize: '2 x 120g' }] });
    expect(state.inventory[0].foodWeightG).toBe(240);
  });

  it('keeps a structurally valid imported state and quarantines an unknown category', () => {
    const raw = {
      schemaVersion: SCHEMA_VERSION,
      household: 4,
      contact: { name: '重要メモ', phone: '090', shelter: '避難所', note: '171' },
      inventory: [
        { id: 'water', name: '飲料水', category: 'water', quantity: 6, volumeMl: 500 },
        { id: 'mapped', name: '分類不明品', category: 'edited-category', quantity: 1 },
      ],
    };
    const state = loadState({ getItem: () => JSON.stringify(raw) });

    expect(state.household).toBe(4);
    expect(state.contact).toMatchObject({ name: '重要メモ', phone: '090', shelter: '避難所', note: '171' });
    expect(state.inventory.map((item) => item.id)).toEqual(['water', 'mapped']);
    expect(state.inventory.find((item) => item.id === 'mapped')).toMatchObject({
      category: 'unclassified',
      verificationStatus: 'needs-review',
      verificationReason: 'unknown-category',
    });
  });

  it('classifies water purpose and quarantines ambiguous water or invalid expiry dates', () => {
    const state = normalizeState({ schemaVersion: SCHEMA_VERSION, inventory: [
      { id: 'potable', name: '水タンク', category: 'water', waterPurpose: 'drinking-cooking', quantity: 1, expiry: '2099-12-31' },
      { id: 'explicit-potable', name: '生活用水と書かれた容器', category: 'water', waterPurpose: 'drinking-cooking', quantity: 1, expiry: '2099-12-31' },
      { id: 'utility', name: '浴槽の水', category: 'water', waterPurpose: 'utility', quantity: 1 },
      { id: 'ambiguous', name: '水タンク', category: 'water', quantity: 1 },
      { id: 'invalid-purpose', name: '飲料水', category: 'water', waterPurpose: 'industrial', quantity: 1, volumeMl: 1000 },
      { id: 'review-purpose', name: '保存水', category: 'water', waterPurpose: 'needs-review', quantity: 1, volumeMl: 1000 },
      { id: 'invalid-expiry', name: '保存水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 1, expiry: '2026-02-30' },
    ] });

    expect(state.inventory.find((item) => item.id === 'potable')).toMatchObject({ waterPurpose: 'drinking-cooking' });
    expect(state.inventory.find((item) => item.id === 'potable').verificationStatus).toBeUndefined();
    expect(state.inventory.find((item) => item.id === 'explicit-potable')).toMatchObject({ waterPurpose: 'drinking-cooking' });
    expect(state.inventory.find((item) => item.id === 'utility')).toMatchObject({ waterPurpose: 'utility' });
    expect(state.inventory.find((item) => item.id === 'utility').verificationStatus).toBeUndefined();
    expect(state.inventory.find((item) => item.id === 'ambiguous')).toMatchObject({ waterPurpose: 'needs-review', verificationStatus: 'needs-review', verificationReason: 'ambiguous-water' });
    expect(state.inventory.find((item) => item.id === 'invalid-purpose')).toMatchObject({ waterPurpose: 'needs-review', verificationStatus: 'needs-review', verificationReason: 'ambiguous-water' });
    expect(state.inventory.find((item) => item.id === 'review-purpose')).toMatchObject({ waterPurpose: 'needs-review', verificationStatus: 'needs-review', verificationReason: 'ambiguous-water' });
    expect(inventorySummary(state.inventory, 1).waterDays).toBe(0);
    expect(state.inventory.find((item) => item.id === 'invalid-expiry')).toMatchObject({ verificationStatus: 'needs-review', verificationReason: 'invalid-expiry' });
  });

  it('requires expiry confirmation only for food and drinking water', () => {
    const state = normalizeState({ schemaVersion: SCHEMA_VERSION, inventory: [
      { id: 'unknown-water', name: '飲料水', category: 'water', waterPurpose: 'drinking-cooking', quantity: 1, volumeMl: 500 },
      { id: 'unknown-food', name: '保存食', category: 'food', quantity: 1, foodWeightG: 150 },
      { id: 'no-date-food', name: '期限表示のない食品', category: 'food', quantity: 1, foodWeightG: 150, expiryMode: 'no-date-confirmed' },
      { id: 'utility', name: '浴槽の生活用水', category: 'water', waterPurpose: 'utility', quantity: 1, volumeMl: 1000 },
      { id: 'toilet', name: '携帯トイレ', category: 'hygiene', quantity: 5 },
    ] });

    expect(state.inventory.find((item) => item.id === 'unknown-water')).toMatchObject({ verificationStatus: 'needs-review', verificationReason: 'missing-expiry' });
    expect(state.inventory.find((item) => item.id === 'unknown-food')).toMatchObject({ verificationStatus: 'needs-review', verificationReason: 'missing-expiry' });
    expect(state.inventory.find((item) => item.id === 'no-date-food')).toMatchObject({ expiryMode: 'no-date-confirmed' });
    expect(state.inventory.find((item) => item.id === 'no-date-food').verificationStatus).toBeUndefined();
    expect(state.inventory.find((item) => item.id === 'utility').verificationStatus).toBeUndefined();
    expect(state.inventory.find((item) => item.id === 'toilet').verificationStatus).toBeUndefined();
  });

  it('preserves a current-schema shelter name even when it matches the setup example', () => {
    const shelter = '〇〇小学校 体育館';
    const state = loadState({ getItem: () => JSON.stringify({ schemaVersion: SCHEMA_VERSION, inventory: [], contact: { shelter } }) });

    expect(state.contact.shelter).toBe(shelter);
  });

  it('removes the untouched legacy shelter placeholder', () => {
    const state = normalizeState({ schemaVersion: 14, contact: { shelter: '〇〇小学校 体育館' } });
    expect(state.contact.shelter).toBe('');
  });

  it('normalizes history rows to render-safe scalar values', () => {
    const state = normalizeState({ schemaVersion: SCHEMA_VERSION, transactions: [
      { id: {}, type: {}, name: { unsafe: true }, quantityDelta: 'Infinity', unit: ['個'], note: { memo: true }, at: {} },
      null,
    ], dialogueLog: [{ id: {}, characterId: {}, choiceId: [], at: {} }, null] });

    expect(state.transactions).toEqual([expect.objectContaining({
      id: '[object Object]', type: 'edit', name: '[object Object]', quantityDelta: 0, unit: '個', note: '[object Object]', at: '[object Object]',
    })]);
    expect(state.dialogueLog).toEqual([expect.objectContaining({ id: '[object Object]', characterId: '[object Object]', choiceId: '', at: '[object Object]' })]);
  });

  it('protects corrupt JSON without overwriting the original key', () => {
    const values = new Map([[STORAGE_KEY, '{broken']]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const state = loadState(storage);
    expect(state.inventory).toEqual([]);
    expect(state.contact.name).toBeTruthy();
    expect(state.onboarding.completed).toBe(true);
    expect(state.storageRecovery).toMatchObject({ blocked: true, backupStored: true, reason: 'invalid-json' });
    expect(values.get(STORAGE_KEY)).toBe('{broken');
    expect(state.storageRecovery.backupKey).toMatch(new RegExp(`^${RECOVERY_KEY_PREFIX}-\\d+$`));
    expect(values.get(state.storageRecovery.backupKey)).toBe('{broken');
  });

  it('does not accept arbitrary valid JSON as an empty app state', () => {
    const raw = JSON.stringify({ foo: 'bar' });
    const values = new Map([[STORAGE_KEY, raw]]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const state = loadState(storage);

    expect(state.storageRecovery).toMatchObject({ blocked: true, backupStored: true, reason: 'invalid-data' });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.get(state.storageRecovery.backupKey)).toBe(raw);
  });

  it.each([
    ['a string inventory', { schemaVersion: SCHEMA_VERSION, inventory: 'not-an-array' }],
    ['a null inventory', { schemaVersion: SCHEMA_VERSION, inventory: null }],
    ['an invalid inventory row', { schemaVersion: SCHEMA_VERSION, inventory: [{ id: 'valid' }, null] }],
  ])('blocks structurally corrupt state with %s and preserves the source', (_label, value) => {
    const raw = JSON.stringify(value);
    const values = new Map([[STORAGE_KEY, raw]]);
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, stored) => values.set(key, stored) };
    const state = loadState(storage);

    expect(state.storageRecovery).toMatchObject({ blocked: true, backupStored: true, reason: 'invalid-data' });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.get(state.storageRecovery.backupKey)).toBe(raw);
    expect(() => parseStateData(raw)).toThrowError('invalid-data');
  });

  it('blocks loading when the original storage key cannot be read', () => {
    let writes = 0;
    const state = loadState({
      getItem: () => { throw new Error('read denied'); },
      setItem: () => { writes += 1; },
    });

    expect(state.storageRecovery).toEqual({ blocked: true, backupKey: '', backupStored: false, reason: 'read-error' });
    expect(state.onboarding.completed).toBe(true);
    expect(writes).toBe(0);
  });

  it('returns recovery state when accessing the storage object itself throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('storage denied'); } });
    try {
      expect(loadState().storageRecovery).toEqual({ blocked: true, backupKey: '', backupStored: false, reason: 'read-error' });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete globalThis.localStorage;
    }
  });

  it('does not claim recovery backup success when storage refuses the write', () => {
    const raw = '{broken';
    const storage = {
      getItem: (key) => key === STORAGE_KEY ? raw : null,
      setItem: () => { throw new Error('write denied'); },
    };
    const state = loadState(storage);

    expect(state.storageRecovery).toEqual({ blocked: true, backupKey: '', backupStored: false, reason: 'invalid-json' });
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('refuses to downgrade a future schema and preserves its raw data', () => {
    const raw = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, inventory: [{ id: 'future' }] });
    const values = new Map([[STORAGE_KEY, raw]]);
    const state = loadState({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });

    expect(() => parseStateData(raw)).toThrowError('future-schema');
    expect(state.storageRecovery).toMatchObject({ blocked: true, backupStored: true, reason: 'future-schema' });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.get(state.storageRecovery.backupKey)).toBe(raw);
  });

  it('preserves explicit zero rotation lead, empty check dates, and unique IDs', () => {
    const state = normalizeState({ inventory: [
      { id: 'same', name: 'A', category: 'food', rotationLeadDays: 0, nextCheck: '', foodWeightG: 0 },
      { id: 'same', name: 'B', category: 'food', rotationLeadDays: 'Infinity' },
    ], household: 1.5 });

    expect(state.household).toBe(2);
    expect(state.inventory[0]).toMatchObject({ rotationLeadDays: 0, nextCheck: '', foodWeightG: 0 });
    expect(state.inventory[1].rotationLeadDays).toBe(30);
    expect(new Set(state.inventory.map((item) => item.id)).size).toBe(state.inventory.length);
  });
});
