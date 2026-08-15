import {
  hasValidGtinCheckDigit,
  normalizeBarcode,
  normalizeProduct,
  OPEN_FOOD_FACTS_ORIGIN,
  PRODUCT_FIELDS,
} from '../shared/productLookup.mjs';

const isJsonResponse = (response) => (response.headers?.get?.('content-type') || '').toLowerCase().includes('json');

async function readAppResponse(response) {
  if (!isJsonResponse(response)) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '商品情報を取得できませんでした。');
  return body;
}

async function lookupDirectly(code, { fetchImpl, signal }) {
  const params = new URLSearchParams({ product_type: 'all', cc: 'jp', lc: 'ja', fields: PRODUCT_FIELDS });
  const response = await fetchImpl(`${OPEN_FOOD_FACTS_ORIGIN}/api/v3/product/${code}?${params}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (response.status === 404) return { found: false, code, message: '公開商品データベースに未登録の商品です。' };
  if (!response.ok) throw new Error('商品情報サービスへ接続できませんでした。');
  const payload = await response.json();
  const product = normalizeProduct(code, payload.product, { proxyImages: false });
  return product
    ? { found: true, product }
    : { found: false, code, message: '商品名を取得できませんでした。' };
}

export async function lookupProductFromBrowser(rawCode, { fetchImpl = fetch, signal } = {}) {
  const code = normalizeBarcode(rawCode);
  if (!hasValidGtinCheckDigit(code)) throw new Error('JAN/EANコードの桁数またはチェックデジットが正しくありません。');

  let response;
  try {
    response = await fetchImpl(`/api/products/${encodeURIComponent(code)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
  }
  if (response) {
    const result = await readAppResponse(response);
    if (result) return result;
  }

  return lookupDirectly(code, { fetchImpl, signal });
}
