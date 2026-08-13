import { describe, expect, it, vi } from 'vitest';
import { hasValidGtinCheckDigit, inferInventoryCategory, lookupProduct, normalizeProduct, parseVolumeMl } from './productLookup.mjs';

describe('barcode validation', () => {
  it('validates EAN-13 and rejects a broken check digit', () => {
    expect(hasValidGtinCheckDigit('3017620422003')).toBe(true);
    expect(hasValidGtinCheckDigit('3017620422004')).toBe(false);
  });
});

describe('product normalization', () => {
  it('prefers Japanese name and maps disaster inventory category', () => {
    const product = normalizeProduct('4900000000000', { product_name: 'Water', product_name_ja: '天然水', brands: 'Example', quantity: '500 ml', categories_tags: ['en:waters'] });
    expect(product.name).toBe('天然水');
    expect(product.category).toBe('water');
    expect(product.packageSize).toBe('500 ml');
  });

  it('maps hygiene products', () => expect(inferInventoryCategory({ categories: 'hygiene, soap' })).toBe('hygiene'));
  it('does not classify coffee beverages as emergency water', () => expect(inferInventoryCategory({ categories: 'beverages, coffee' })).toBe('comfort'));
  it('parses single and multipack volumes', () => {
    expect(parseVolumeMl('2 L')).toBe(2000);
    expect(parseVolumeMl('6 x 500 ml')).toBe(3000);
  });
});

describe('lookupProduct', () => {
  it('uses the upstream product response and returns a normalized result', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ product: { product_name: 'Nutella', brands: 'Ferrero', categories_tags: ['en:sweet-spreads'] } }) }));
    const result = await lookupProduct('3017620422003', { fetchImpl });
    expect(result.status).toBe(200);
    expect(result.body.product.name).toBe('Nutella');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not call upstream for an invalid code', async () => {
    const fetchImpl = vi.fn();
    const result = await lookupProduct('1234', { fetchImpl });
    expect(result.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
