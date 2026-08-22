import { CATEGORY_META, createInitialInventory, daysFromNow, isValidLocalDate, localDateKey, MAX_STOCKPILE_TARGET_DAYS, normalizeStockpileTargetDays, uid } from './domain.js';
import { createDefaultPowerPlan, normalizePowerPlan } from './power.js';
import { parseWeightGrams } from '../shared/productLookup.mjs';

export const STORAGE_KEY = 'sonae-note-state-v1';
export const RECOVERY_KEY_PREFIX = `${STORAGE_KEY}-recovery`;
export const SCHEMA_VERSION = 16;

const PRODUCT_LOT_SCHEMA_VERSION = 15;

const today = () => localDateKey();
const INVENTORY_CATEGORIES = new Set(Object.keys(CATEGORY_META));
const LEGACY_SAMPLE_IDENTITIES = Object.freeze({
  water: { name: '飲料水 500ml', category: 'water' },
  rice: { name: 'アルファ米', category: 'food' },
  gas: { name: 'カセットボンベ', category: 'heat' },
  stove: { name: 'カセットコンロ', category: 'heat' },
  toilet: { name: '携帯トイレ', category: 'hygiene' },
  battery: { name: '乾電池（単3）', category: 'light' },
  coffee: { name: 'ドリップコーヒー', category: 'comfort' },
});
const LEGACY_SHELTER_PLACEHOLDER = '〇〇小学校 体育館';
const PRODUCT_SAFETY_FIELD_KEYS = Object.freeze(['name', 'category', 'waterPurpose', 'tier', 'unit', 'volumeMl', 'foodWeightG']);
const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const boundedNumber = (value, minimum, maximum, fallback = minimum) => Math.min(maximum, Math.max(minimum, finiteNumber(value, fallback)));
const safeText = (value, fallback = '') => value == null ? fallback : String(value);

function normalizeTransaction(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const allowedTypes = new Set(['add', 'edit', 'verify', 'consume', 'rotate', 'discard', 'delete']);
  return {
    id: safeText(entry.id, `transaction-${index + 1}`),
    type: allowedTypes.has(entry.type) ? entry.type : 'edit',
    itemId: safeText(entry.itemId),
    productId: safeText(entry.productId),
    name: safeText(entry.name, '名称未登録の備蓄品'),
    quantityDelta: finiteNumber(entry.quantityDelta),
    unit: safeText(entry.unit),
    note: safeText(entry.note),
    reason: safeText(entry.reason),
    source: safeText(entry.source),
    at: safeText(entry.at),
  };
}

function normalizeDialogueEntry(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return {
    id: safeText(entry.id, `dialogue-${index + 1}`),
    characterId: safeText(entry.characterId),
    choiceId: safeText(entry.choiceId),
    at: safeText(entry.at),
  };
}

function allocateLegacyProductTargets(inventory, sourceSchemaVersion) {
  if (sourceSchemaVersion >= PRODUCT_LOT_SCHEMA_VERSION) return;
  const groups = new Map();
  inventory.forEach((item) => {
    const normalizedName = item.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ja-JP');
    const manualSignature = [item.category, item.unit, normalizedName, item.brand, item.packageSize, item.waterPurpose || '', item.volumeMl, item.foodWeightG]
      .map((value) => String(value || '').trim().toLocaleLowerCase('ja-JP')).join(':');
    const key = item.barcode
      ? `gtin:${item.barcode}`
      : item.productId.startsWith('manual:') ? `legacy-manual:${manualSignature}` : item.productId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const currentDay = today();
  groups.forEach((lots) => {
    if (lots.length < 2) return;
    // Old manual replenishment created a fresh product ID for each lot. Restore
    // one identity only when the visible product fields match exactly.
    const canonicalProductId = lots[0].productId;
    lots.forEach((item) => { item.productId = canonicalProductId; });
    const groupTarget = Math.max(...lots.map((item) => Math.max(0, Number(item.target) || 0)));
    lots.forEach((item) => { item.target = 0; });
    const preferredLots = [...lots].sort((a, b) => {
      const usable = (item) => item.verificationStatus !== 'needs-review' && (!item.expiry || (isValidLocalDate(item.expiry) && item.expiry >= currentDay));
      return Number(usable(b)) - Number(usable(a));
    });
    let remaining = groupTarget;
    preferredLots.forEach((item) => {
      const allocation = Math.min(remaining, Math.max(0, Number(item.quantity) || 0));
      item.target = allocation;
      remaining -= allocation;
    });
    if (remaining > 0) preferredLots[0].target += remaining;
  });
}

function allocateV15BarcodeTargets(inventory, sourceRows, sourceSchemaVersion) {
  if (sourceSchemaVersion !== PRODUCT_LOT_SCHEMA_VERSION) return;
  const groups = new Map();
  inventory.forEach((item, index) => {
    if (!item.barcode) return;
    if (!groups.has(item.barcode)) groups.set(item.barcode, []);
    groups.get(item.barcode).push({ item, index, source: sourceRows[index] || {} });
  });
  const currentDay = today();
  groups.forEach((entries) => {
    if (entries.length < 2) return;
    const targetsByPriorIdentity = new Map();
    entries.forEach(({ item, source }) => {
      const priorIdentity = String(source.productId || `gtin:${item.barcode}`);
      targetsByPriorIdentity.set(priorIdentity, (targetsByPriorIdentity.get(priorIdentity) || 0) + Math.max(0, Number(item.target) || 0));
    });
    const groupTarget = Math.max(0, ...targetsByPriorIdentity.values());
    entries.forEach(({ item }) => { item.target = 0; });
    const preferred = [...entries].sort((left, right) => {
      const usable = ({ item }) => item.verificationStatus !== 'needs-review' && (!item.expiry || (isValidLocalDate(item.expiry) && item.expiry >= currentDay));
      return Number(usable(right)) - Number(usable(left))
        || String(left.item.expiry || '9999-12-31').localeCompare(String(right.item.expiry || '9999-12-31'));
    });
    let remaining = groupTarget;
    preferred.forEach(({ item }) => {
      const allocation = Math.min(remaining, Math.max(0, Number(item.quantity) || 0));
      item.target = allocation;
      remaining -= allocation;
    });
    if (remaining > 0) preferred[0].item.target += remaining;
  });
}

function quarantineConflictingBarcodeProducts(inventory) {
  const groups = new Map();
  inventory.forEach((item) => {
    if (!item.barcode) return;
    if (!groups.has(item.barcode)) groups.set(item.barcode, []);
    groups.get(item.barcode).push(item);
  });
  groups.forEach((lots) => {
    if (lots.length < 2) return;
    const signatures = new Set(lots.map((item) => JSON.stringify(PRODUCT_SAFETY_FIELD_KEYS.map((key) => item[key] ?? ''))));
    if (signatures.size < 2) return;
    lots.forEach((item) => {
      item.verificationStatus = 'needs-review';
      item.verificationReason = 'product-conflict';
    });
  });
}

export function normalizeInventoryItem(item = {}, index = 0) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const barcode = String(source.barcode || '').replace(/\D/g, '');
  const id = String(source.id || uid());
  const name = String(source.name || `備蓄品 ${index + 1}`);
  const category = INVENTORY_CATEGORIES.has(source.category) ? source.category : 'unclassified';
  const expiry = String(source.expiry || '');
  const waterText = `${source.name || ''} ${source.note || ''}`;
  const declaredWaterPurpose = String(source.waterPurpose ?? '').trim();
  const hasDeclaredWaterPurpose = Object.prototype.hasOwnProperty.call(source, 'waterPurpose') && declaredWaterPurpose !== '';
  const waterPurpose = category !== 'water' ? ''
    : declaredWaterPurpose === 'utility' ? 'utility'
      : declaredWaterPurpose === 'drinking-cooking' ? 'drinking-cooking'
        // A present but unsupported value is imported data, not evidence that
        // the water is potable. Name-based inference is limited to old rows
        // where the purpose field was genuinely absent or blank.
        : hasDeclaredWaterPurpose ? 'needs-review'
        : /(生活用水|雑用水|浴槽|風呂|トイレ用|洗濯用)/.test(waterText) ? 'utility'
          : /(飲料|飲み水|保存水|ミネラルウォーター|ペットボトル|drinking|potable)/i.test(waterText) ? 'drinking-cooking'
            : 'needs-review';
  const expiryMode = isValidLocalDate(expiry)
    ? 'dated'
    : category === 'food' && source.expiryMode === 'no-date-confirmed'
      ? 'no-date-confirmed'
      : 'unknown';
  const missingCoreExpiry = !expiry && expiryMode === 'unknown'
    && (category === 'food' || (category === 'water' && waterPurpose === 'drinking-cooking'));
  const inheritedReason = ['legacy-sample', 'invalid-expiry', 'unknown-category', 'ambiguous-water', 'missing-expiry', 'product-conflict', 'data-review'].includes(source.verificationReason) ? source.verificationReason : 'data-review';
  const inheritedSpecificReview = source.verificationStatus === 'needs-review' && inheritedReason !== 'data-review';
  const verificationReason = category === 'unclassified' ? 'unknown-category'
    : expiry && !isValidLocalDate(expiry) ? 'invalid-expiry'
      : waterPurpose === 'needs-review' ? 'ambiguous-water'
        : inheritedSpecificReview ? inheritedReason
          : missingCoreExpiry ? 'missing-expiry'
            : source.verificationStatus === 'needs-review' ? inheritedReason : '';
  const suppliedProductId = String(source.productId || '');
  const productId = barcode
    ? `gtin:${barcode}`
    : suppliedProductId.startsWith('gtin:')
      ? `manual:${id}`
      : suppliedProductId || `legacy:${id || index}`;
  return {
    id,
    productId,
    name,
    category,
    tier: Math.round(boundedNumber(source.tier, 1, 3, 2)),
    unit: String(source.unit || '個'),
    quantity: Math.max(0, finiteNumber(source.quantity)),
    target: Math.max(0, finiteNumber(source.target)),
    price: Math.max(0, finiteNumber(source.price)),
    expiry,
    expiryMode,
    note: String(source.note || ''),
    barcode,
    brand: String(source.brand || ''),
    packageSize: String(source.packageSize || ''),
    volumeMl: Math.max(0, finiteNumber(source.volumeMl)),
    ...(category === 'water' ? { waterPurpose } : {}),
    foodWeightG: Math.max(0, finiteNumber(source.foodWeightG, category === 'food' ? parseWeightGrams(`${source.packageSize || ''} ${source.name || ''}`) : 0)),
    packingVolumeMl: Math.max(0, finiteNumber(source.packingVolumeMl)),
    imageUrl: String(source.imageUrl || ''),
    source: String(source.source || ''),
    sourceUrl: String(source.sourceUrl || ''),
    location: String(source.location || ''),
    lastChecked: typeof source.lastChecked === 'string' ? source.lastChecked : today(),
    nextCheck: typeof source.nextCheck === 'string' ? source.nextCheck : daysFromNow(30),
    rotationEnabled: source.rotationEnabled !== false,
    rotationLeadDays: boundedNumber(source.rotationLeadDays, 0, 365, 30),
    rotationReminderDate: String(source.rotationReminderDate || ''),
    replenishmentPriority: ['high', 'medium', 'low'].includes(source.replenishmentPriority) ? source.replenishmentPriority : ((Number(source.tier) || 2) === 1 ? 'high' : (Number(source.tier) || 2) === 2 ? 'medium' : 'low'),
    replenishBy: String(source.replenishBy || ''),
    purchaseFrom: String(source.purchaseFrom || ''),
    ...(verificationReason ? { verificationStatus: 'needs-review', verificationReason } : {}),
  };
}

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarding: { completed: false, completedAt: '' },
    // A new user must register what physically exists. Sample quantities here
    // would otherwise be mistaken for verified stock and unlock achievements.
    inventory: [],
    household: 2,
    contact: { name: '家族の緊急メモ', phone: '', shelter: '', note: '災害用伝言ダイヤル 171' },
    completedTips: [],
    preparedness: { completed: [], loadouts: {}, bagSettings: {}, disasterChecks: {}, taskVerifications: {}, stockpileSkillClaims: [], targetDays: 7, annualBudget: 0, updatedAt: '' },
    transactions: [],
    lastVisitAt: '',
    selectedCharacter: 'hikari',
    characterAffinity: { akane: 0, yui: 0, riko: 0, hikari: 0, noa: 0 },
    dialogueLog: [],
    powerPlan: createDefaultPowerPlan(),
  };
}

export function normalizeState(input) {
  const fallback = createDefaultState();
  if (!input || typeof input !== 'object') return fallback;
  const sourceSchemaVersion = finiteNumber(input.schemaVersion, 0);
  const sourceInventory = Array.isArray(input.inventory)
    ? input.inventory.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];
  const inventory = Array.isArray(input.inventory)
    ? sourceInventory.map(normalizeInventoryItem)
    : fallback.inventory;
  // Fixed IDs identify stock that old releases created automatically. Mark it
  // before duplicate IDs are rewritten so every copied seed remains excluded.
  if (sourceSchemaVersion < PRODUCT_LOT_SCHEMA_VERSION) {
    inventory.forEach((item) => {
      if (LEGACY_SAMPLE_IDENTITIES[item.id]) {
        item.verificationStatus = 'needs-review';
        // Structural uncertainty must remain visible and must be repaired
        // before a legacy seed can be confirmed as real stock.
        if (!['invalid-expiry', 'unknown-category', 'ambiguous-water'].includes(item.verificationReason)) {
          item.verificationReason = 'legacy-sample';
        }
      }
    });
  }
  const seenInventoryIds = new Set();
  inventory.forEach((item, index) => {
    if (!seenInventoryIds.has(item.id)) {
      seenInventoryIds.add(item.id);
      return;
    }
    const duplicatedId = item.id;
    const implicitProductPrefix = item.productId === `legacy:${duplicatedId}`
      ? 'legacy'
      : item.productId === `manual:${duplicatedId}` ? 'manual' : '';
    let replacementId = `${item.id}-duplicate-${index + 1}`;
    while (seenInventoryIds.has(replacementId)) replacementId += '-copy';
    item.id = replacementId;
    // An old row without an explicit barcode/product identity inherited its
    // productId from the row ID. If that ID was duplicated, keeping the old
    // implicit productId would merge unrelated physical products and make an
    // edit to one lot overwrite the other lot's category and safety fields.
    // Explicit GTIN/manual identities remain shared as the user intended.
    if (implicitProductPrefix) item.productId = `${implicitProductPrefix}:${replacementId}`;
    seenInventoryIds.add(replacementId);
  });
  if ((Number(input.schemaVersion) || 0) < 12 && !inventory.some((item) => item.category === 'heat' && /(カセット|ガス).*(コンロ|こんろ)/.test(item.name))) {
    const stove = normalizeInventoryItem(createInitialInventory().find((item) => item.id === 'stove'), inventory.length);
    stove.verificationStatus = 'needs-review';
    stove.verificationReason = 'legacy-sample';
    inventory.push(stove);
  }
  allocateLegacyProductTargets(inventory, sourceSchemaVersion);
  allocateV15BarcodeTargets(inventory, sourceInventory, sourceSchemaVersion);
  quarantineConflictingBarcodeProducts(inventory);
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  const importedTargetDays = finiteNumber(input.preparedness?.targetDays, fallback.preparedness.targetDays);
  const priorRequestedHorizon = finiteNumber(input.preparedness?.requestedHorizonDays, 0);
  const requestedHorizonDays = Math.max(importedTargetDays, priorRequestedHorizon) > MAX_STOCKPILE_TARGET_DAYS
    ? Math.max(importedTargetDays, priorRequestedHorizon)
    : 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    // States saved before onboarding existed belong to current users, so do not
    // interrupt them with the first-run flow after an update.
    onboarding: input.onboarding && typeof input.onboarding === 'object'
      ? { completed: Boolean(input.onboarding.completed), completedAt: String(input.onboarding.completedAt || '') }
      : { completed: true, completedAt: '' },
    inventory,
    household: Math.round(boundedNumber(input.household, 1, 12, fallback.household)),
    contact: {
      name: String(contact.name || fallback.contact.name),
      phone: String(contact.phone || ''),
      shelter: sourceSchemaVersion < PRODUCT_LOT_SCHEMA_VERSION && contact.shelter === LEGACY_SHELTER_PLACEHOLDER ? '' : String(contact.shelter || ''),
      note: String(contact.note || ''),
    },
    completedTips: Array.isArray(input.completedTips) ? input.completedTips.filter((value) => typeof value === 'string') : [],
    preparedness: {
      completed: Array.isArray(input.preparedness?.completed) ? input.preparedness.completed.filter((value) => typeof value === 'string') : [],
      loadouts: Object.fromEntries(Object.entries(input.preparedness?.loadouts || {}).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, [...new Set(value.filter((item) => typeof item === 'string'))]])),
      bagSettings: Object.fromEntries(Object.entries(input.preparedness?.bagSettings || {}).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => [key, { mode: value.mode === 'custom' ? 'custom' : 'standard', customCapacityL: Math.min(100, Math.max(1, Number(value.customCapacityL) || 20)) }])),
      disasterChecks: Object.fromEntries(Object.entries(input.preparedness?.disasterChecks || {}).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, [...new Set(value.filter((item) => typeof item === 'string'))]])),
      taskVerifications: Object.fromEntries(Object.entries(input.preparedness?.taskVerifications || {}).filter(([key, value]) => typeof key === 'string' && value && typeof value === 'object' && !Array.isArray(value)).map(([key, value]) => [key, {
        fingerprint: String(value.fingerprint || ''),
        season: String(value.season || ''),
        checkedAt: String(value.checkedAt || ''),
      }])),
      stockpileSkillClaims: [...new Set((Array.isArray(input.preparedness?.stockpileSkillClaims) ? input.preparedness.stockpileSkillClaims : []).filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))],
      targetDays: normalizeStockpileTargetDays(input.preparedness?.targetDays, fallback.preparedness.targetDays),
      ...(requestedHorizonDays ? { requestedHorizonDays } : {}),
      annualBudget: boundedNumber(input.preparedness?.annualBudget, 0, 10000000, 0),
      updatedAt: String(input.preparedness?.updatedAt || ''),
    },
    transactions: Array.isArray(input.transactions) ? input.transactions.map(normalizeTransaction).filter(Boolean).slice(0, 500) : [],
    lastVisitAt: String(input.lastVisitAt || ''),
    selectedCharacter: ['akane', 'yui', 'riko', 'hikari', 'noa'].includes(input.selectedCharacter) ? input.selectedCharacter : 'hikari',
    characterAffinity: Object.fromEntries(['akane', 'yui', 'riko', 'hikari', 'noa'].map((id) => [id, boundedNumber(input.characterAffinity?.[id], 0, 100, 0)])),
    dialogueLog: Array.isArray(input.dialogueLog) ? input.dialogueLog.map(normalizeDialogueEntry).filter(Boolean).slice(0, 100) : [],
    powerPlan: normalizePowerPlan(input.powerPlan || fallback.powerPlan),
  };
}

export function parseStateData(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-data');
  // Every released app state contains an inventory array. Without this core
  // envelope, arbitrary JSON must not be mistaken for an empty valid backup.
  if (!Array.isArray(parsed.inventory)) throw new Error('invalid-data');
  if ('schemaVersion' in parsed && !Number.isFinite(Number(parsed.schemaVersion))) throw new Error('invalid-data');
  for (const key of ['inventory', 'transactions', 'completedTips', 'dialogueLog']) {
    if (key in parsed && !Array.isArray(parsed[key])) throw new Error('invalid-data');
  }
  if (Array.isArray(parsed.inventory) && parsed.inventory.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('invalid-data');
  for (const key of ['contact', 'preparedness', 'onboarding', 'characterAffinity', 'powerPlan']) {
    if (key in parsed && (!parsed[key] || typeof parsed[key] !== 'object' || Array.isArray(parsed[key]))) throw new Error('invalid-data');
  }
  if (Number(parsed.schemaVersion) > SCHEMA_VERSION) throw new Error('future-schema');
  return normalizeState(parsed);
}

export function loadState(storage) {
  let raw = '';
  let resolvedStorage;
  try {
    resolvedStorage = storage ?? globalThis.localStorage;
    raw = resolvedStorage.getItem(STORAGE_KEY);
  } catch {
    return {
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '' },
      storageRecovery: { blocked: true, backupKey: '', backupStored: false, reason: 'read-error' },
    };
  }
  if (!raw) return createDefaultState();
  try {
    return parseStateData(raw);
  } catch (error) {
    if (!raw) return createDefaultState();
    const backupKey = `${RECOVERY_KEY_PREFIX}-${Date.now()}`;
    let backupStored = false;
    try {
      resolvedStorage.setItem(backupKey, raw);
      backupStored = resolvedStorage.getItem(backupKey) === raw;
    } catch { /* Keep the original key untouched even if backup storage is unavailable. */ }
    return {
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '' },
      storageRecovery: {
        blocked: true,
        backupKey: backupStored ? backupKey : '',
        backupStored,
        reason: error?.message === 'future-schema' ? 'future-schema' : error instanceof SyntaxError ? 'invalid-json' : 'invalid-data',
      },
    };
  }
}

export function createTransaction(type, item, quantityDelta = 0, note = '', metadata = {}) {
  return {
    id: uid(),
    type,
    itemId: item.id,
    productId: item.productId,
    name: item.name,
    quantityDelta: finiteNumber(quantityDelta),
    unit: item.unit,
    note,
    ...metadata,
    at: new Date().toISOString(),
  };
}
