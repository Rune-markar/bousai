import { createInitialInventory, daysFromNow, uid } from './domain.js';
import { createDefaultPowerPlan, normalizePowerPlan } from './power.js';

export const STORAGE_KEY = 'sonae-note-state-v1';
export const SCHEMA_VERSION = 7;

const today = () => new Date().toISOString().slice(0, 10);

export function normalizeInventoryItem(item = {}, index = 0) {
  const barcode = String(item.barcode || '').replace(/\D/g, '');
  const id = String(item.id || uid());
  return {
    id,
    productId: item.productId || (barcode ? `gtin:${barcode}` : `legacy:${id || index}`),
    name: String(item.name || `備蓄品 ${index + 1}`),
    category: item.category || 'food',
    tier: Math.min(3, Math.max(1, Number(item.tier) || 2)),
    unit: String(item.unit || '個'),
    quantity: Math.max(0, Number(item.quantity) || 0),
    target: Math.max(0, Number(item.target) || 0),
    price: Math.max(0, Number(item.price) || 0),
    expiry: item.expiry || '',
    note: String(item.note || ''),
    barcode,
    brand: String(item.brand || ''),
    packageSize: String(item.packageSize || ''),
    volumeMl: Math.max(0, Number(item.volumeMl) || 0),
    imageUrl: String(item.imageUrl || ''),
    source: String(item.source || ''),
    sourceUrl: String(item.sourceUrl || ''),
    location: String(item.location || ''),
    lastChecked: item.lastChecked || today(),
    nextCheck: item.nextCheck || daysFromNow(30),
    rotationEnabled: item.rotationEnabled !== false,
    rotationLeadDays: Math.max(0, Number(item.rotationLeadDays) || 30),
    replenishmentPriority: ['high', 'medium', 'low'].includes(item.replenishmentPriority) ? item.replenishmentPriority : ((Number(item.tier) || 2) === 1 ? 'high' : (Number(item.tier) || 2) === 2 ? 'medium' : 'low'),
    replenishBy: item.replenishBy || '',
    purchaseFrom: String(item.purchaseFrom || ''),
  };
}

export function createDefaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    inventory: createInitialInventory().map(normalizeInventoryItem),
    household: 2,
    contact: { name: '家族の集合場所', phone: '', shelter: '〇〇小学校 体育館', note: '災害用伝言ダイヤル 171' },
    completedTips: [],
    preparedness: { completed: [], loadouts: {}, updatedAt: '' },
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
  const inventory = Array.isArray(input.inventory) ? input.inventory.map(normalizeInventoryItem) : fallback.inventory;
  const contact = input.contact && typeof input.contact === 'object' ? input.contact : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    inventory,
    household: Math.min(12, Math.max(1, Number(input.household) || fallback.household)),
    contact: {
      name: String(contact.name || fallback.contact.name),
      phone: String(contact.phone || ''),
      shelter: String(contact.shelter || ''),
      note: String(contact.note || ''),
    },
    completedTips: Array.isArray(input.completedTips) ? input.completedTips.filter((value) => typeof value === 'string') : [],
    preparedness: {
      completed: Array.isArray(input.preparedness?.completed) ? input.preparedness.completed.filter((value) => typeof value === 'string') : [],
      loadouts: Object.fromEntries(Object.entries(input.preparedness?.loadouts || {}).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, [...new Set(value.filter((item) => typeof item === 'string'))]])),
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
