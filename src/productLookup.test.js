import { describe, expect, it, vi } from 'vitest';
import { lookupProductFromBrowser } from './productLookup.js';

const response = ({ body, contentType = 'application/json', ok = true, status = 200 }) => ({
  ok,
  status,
  headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
  json: async () => body,
});

describe('browser product lookup', () => {
  it('uses the app API when it returns JSON', async () => {
    const product = { barcode: '3017620422003', name: 'Nutella' };
    const fetchImpl = vi.fn(async () => response({ body: { found: true, product } }));

    await expect(lookupProductFromBrowser(product.barcode, { fetchImpl })).resolves.toEqual({ found: true, product });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('falls back to Open Food Facts when static hosting returns the SPA HTML', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ body: null, contentType: 'text/html', status: 200 }))
      .mockResolvedValueOnce(response({ body: { product: { product_name: 'Blended Scotch whiskey', brands: 'JOHNNIE WALKER', image_front_small_url: 'https://images.openfoodfacts.org/product.jpg' } } }));

    const result = await lookupProductFromBrowser('5000267014203', { fetchImpl });

    expect(result.found).toBe(true);
    expect(result.product.name).toBe('Blended Scotch whiskey');
    expect(result.product.imageUrl).toBe('https://images.openfoodfacts.org/product.jpg');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, expect.stringContaining('https://world.openfoodfacts.org/api/v3/product/5000267014203'), expect.any(Object));
  });

  it('reports invalid GTIN before making a request', async () => {
    const fetchImpl = vi.fn();
    await expect(lookupProductFromBrowser('1234', { fetchImpl })).rejects.toThrow('チェックデジット');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not bypass an application API error with a direct request', async () => {
    const fetchImpl = vi.fn(async () => response({ body: { message: '検索回数が多すぎます。' }, ok: false, status: 429 }));
    await expect(lookupProductFromBrowser('3017620422003', { fetchImpl })).rejects.toThrow('検索回数が多すぎます。');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
