import { CATEGORY_META, createInitialInventory, daysFromNow, uid } from './domain.js';
import { createDefaultPowerPlan, normalizePowerPlan } from './power.js';
import { parseWeightGrams } from '../shared/productLookup.mjs';

export const STORAGE_KEY = 'sonae-note-state-v1';
export const SCHEMA_VERSION = 13;

const today = () => new Date().toISOString().slice(0, 10);
const INVENTORY_CATEGORIES = new Set(Object.keys(CATEGORY_META));

export function normalizeInventoryItem(item = {}, index = 0) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const barcode = String(source.barcode || '').replace(/\D/g, '');
  const id = String(source.id || uid());
  const category = INVENTORY_CATEGORIES.has(source.category) ? source.category : 'food';
  return {
    id,
    productId: source.productId || (barcode ? `gtin:${barcode}` : `legacy:${id || index}`),
    name: String(source.name || `備蓄品 ${index + 1}`),
    category,
    tier: Math.min(3, Math.max(1, Number(source.tier) || 2)),
    unit: String(source.unit || '個'),
    quantity: Math.max(0, Number(source.quantity) || 0),
    target: Math.max(0, Number(source.target) || 0),
    price: Math.max(0, Number(source.price) || 0),
    expiry: source.expiry || '',
    note: String(source.note || ''),
    barcode,
    brand: String(source.brand || ''),
    packageSize: String(source.packageSize || ''),
    volumeMl: Math.max(0, Number(source.volumeMl) || 0),
    foodWeightG: Math.max(0, Number(source.foodWeightG) || (category === 'food' ? parseWeightGrams(`${source.packageSize || ''} ${source.name || ''}`) : 0)),
    packingVolumeMl: Math.max(0, Number(source.packingVolumeMl) || 0),
    imageUrl: String(source.imageUrl || ''),
    source: String(source.source || ''),
    sourceUrl: String(source.sourceUrl || ''),
    location: String(source.location || ''),
    lastChecked: source.lastChecked || today(),
    nextCheck: source.nextCheck || daysFromNow(30),
    rotationEnabled: source.rotationEnabled !== false,
    rotationLeadDays: Math.max(0, Number(source.rotationLeadDays) || 30),
    rotationReminderDate: source.rotationReminderDate || '',
    replenishmentPriority: ['high', 'medium', 'low'].includes(source.replenishmentPriority) ? source.replenishmentPriority : ((Number(source.tier) || 2) === 1 ? 'high' : (Number(source.tier) || 2) === 2 ? 'medium' : 'low'),
    replenishBy: source.replenishBy || '',
    purchaseFrom: String(source.purchaseFrom || ''),
  };
}

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarding: { completed: false, completedAt: '' },
    inventory: createInitialInventory().map(normalizeInventoryItem),
    household: 2,
    contact: { name: '家族の緊急メモ', phone: '', shelter: '', note: '災害用伝言ダイヤル 171' },
    completedTips: [],
    preparedness: { completed: [], loadouts: {}, bagSettings: {}, disasterChecks: {}, targetDays: 7, annualBudget: 0, updatedAt: '' },
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
  const inventory = Array.isArray(input.inventory)
    ? input.inventory.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map(normalizeInventoryItem)
    : fallback.inventory;
  if ((Number(input.schemaVersion) || 0) < 12 && !inventory.some((item) => item.category === 'heat' && /(カセット|ガス).*(コンロ|こんろ)/.test(item.name))) {
    inventory.push(normalizeInventoryItem(createInitialInventory().find((item) => item.id === 'stove'), inventory.length));
  }
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    // States saved before onboarding existed belong to current users, so do not
    // interrupt them with the first-run flow after an update.
    onboarding: input.onboarding && typeof input.onboarding === 'object'
      ? { completed: Boolean(input.onboarding.completed), completedAt: String(input.onboarding.completedAt || '') }
      : { completed: true, completedAt: '' },
    inventory,
    household: Math.min(12, Math.max(1, Number(input.household) || fallback.household)),
    contact: {
      name: String(contact.name || fallback.contact.name),
      phone: String(contact.phone || ''),
      shelter: String(contact.shelter === '〇〇小学校 体育館' ? '' : contact.shelter || ''),
      note: String(contact.note || ''),
    },
    completedTips: Array.isArray(input.completedTips) ? input.completedTips.filter((value) => typeof value === 'string') : [],
    preparedness: {
      completed: Array.isArray(input.preparedness?.completed) ? input.preparedness.completed.filter((value) => typeof value === 'string') : [],
      loadouts: Object.fromEntries(Object.entries(input.preparedness?.loadouts || {}).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, [...new Set(value.filter((item) => typeof item === 'string'))]])),
      bagSettings: Object.fromEntries(Object.entries(input.preparedness?.bagSettings || {}).filter(([, value]) => value && typeof value === 'object').map(([key, value]) => [key, { mode: value.mode === 'custom' ? 'custom' : 'standard', customCapacityL: Math.min(100, Math.max(1, Number(value.customCapacityL) || 20)) }])),
      disasterChecks: Object.fromEntries(Object.entries(input.preparedness?.disasterChecks || {}).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, [...new Set(value.filter((item) => typeof item === 'string'))]])),
      targetDays: Math.min(180, Math.max(1, Number(input.preparedness?.targetDays) || fallback.preparedness.targetDays)),
      annualBudget: Math.min(10000000, Math.max(0, Number(input.preparedness?.annualBudget) || 0)),
      updatedAt: String(input.preparedness?.updatedAt || ''),
    },
    transactions: Array.isArray(input.transactions) ? input.transactions.filter(Boolean).slice(0, 500) : [],
    lastVisitAt: String(input.lastVisitAt || ''),
    selectedCharacter: ['akane', 'yui', 'riko', 'hikari', 'noa'].includes(input.selectedCharacter) ? input.selectedCharacter : 'hikari',
    characterAffinity: Object.fromEntries(['akane', 'yui', 'riko', 'hikari', 'noa'].map((id) => [id, Math.min(100, Math.max(0, Number(input.characterAffinity?.[id]) || 0))])),
    dialogueLog: Array.isArray(input.dialogueLog) ? input.dialogueLog.filter(Boolean).slice(0, 100) : [],
    powerPlan: normalizePowerPlan(input.powerPlan || fallback.powerPlan),
  };
}

export function loadState(storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

export function createTransaction(type, item, quantityDelta = 0, note = '', metadata = {}) {
  return {
    id: uid(),
    type,
    itemId: item.id,
    productId: item.productId,
    name: item.name,
    quantityDelta: Number(quantityDelta) || 0,
    unit: item.unit,
    note,
    ...metadata,
    at: new Date().toISOString(),
  };
}
