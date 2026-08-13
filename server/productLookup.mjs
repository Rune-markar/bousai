const OPEN_FOOD_FACTS_ORIGIN = 'https://world.openfoodfacts.org';
const PRODUCT_FIELDS = [
  'code', 'product_name', 'product_name_ja', 'generic_name', 'brands', 'quantity',
  'categories', 'categories_tags', 'image_front_small_url', 'image_front_url',
].join(',');

export function normalizeBarcode(value) {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

export function hasValidGtinCheckDigit(value) {
  const code = normalizeBarcode(value);
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const digits = [...code].map(Number);
  const expected = digits.pop();
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === expected;
}

export function inferInventoryCategory(product = {}) {
  const text = [product.categories, ...(product.categories_tags || []), product.product_name, product.generic_name]
    .filter(Boolean).join(' ').toLowerCase();
  if (/battery|batteries|flashlight|lamp|lighting|power bank|電池|ライト|照明/.test(text)) return 'light';
  if (/hygiene|toilet|soap|tissue|sanitary|cleaning|beauty|衛生|トイレ|石鹸|ティッシュ/.test(text)) return 'hygiene';
  if (/fuel|gas cartridge|燃料|ガスボンベ|カセットボンベ/.test(text)) return 'heat';
  if (/coffee|tea|chocolate|confection|snack|candy|コーヒー|菓子|チョコ/.test(text)) return 'comfort';
  if (/water|waters|beverage|drink|juice|飲料|ミネラルウォーター|飲料水/.test(text)) return 'water';
  return 'food';
}

export function parseVolumeMl(quantity = '') {
  const text = String(quantity).toLowerCase().replace(',', '.');
  const multi = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/);
  const single = text.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/);
  const toMl = (value, unit) => Number(value) * (unit === 'l' ? 1000 : unit === 'cl' ? 10 : 1);
  if (multi) return Math.round(Number(multi[1]) * toMl(multi[2], multi[3]));
  if (single) return Math.round(toMl(single[1], single[2]));
  return 0;
}

export function normalizeProduct(code, product = {}) {
  const name = product.product_name_ja || product.product_name || product.generic_name || product.brands || '';
  if (!name) return null;
  const remoteImage = product.image_front_small_url || product.image_front_url || '';
  return {
    barcode: code,
    name,
    brand: product.brands || '',
    packageSize: product.quantity || '',
    volumeMl: parseVolumeMl(product.quantity),
    category: inferInventoryCategory(product),
    imageUrl: remoteImage ? `/api/product-image?url=${encodeURIComponent(remoteImage)}` : '',
    source: 'Open Food Facts',
    sourceUrl: `${OPEN_FOOD_FACTS_ORIGIN}/product/${encodeURIComponent(code)}`,
  };
}

export async function handleProductImageApi(req, res, rawUrl) {
  let imageUrl;
  try {
    imageUrl = new URL(rawUrl);
  } catch {
    res.statusCode = 400;
    res.end('Invalid image URL');
    return;
  }
  if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'images.openfoodfacts.org') {
    res.statusCode = 403;
    res.end('Image host not allowed');
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(imageUrl, { signal: controller.signal, headers: { 'User-Agent': `SonaeNote/0.2 (${process.env.APP_CONTACT_URL || 'http://localhost'})` } });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) throw new Error('Invalid image response');
    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    const fallback = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" rx="24" fill="#f2eee5"/><path d="M50 52h60v60H50z" fill="none" stroke="#aa9b82" stroke-width="8"/><path d="m58 99 18-20 14 15 12-11 8 16" fill="none" stroke="#aa9b82" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="96" cy="69" r="7" fill="#aa9b82"/></svg>';
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(fallback);
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupProduct(rawCode, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const code = normalizeBarcode(rawCode);
  if (!hasValidGtinCheckDigit(code)) {
    return { status: 400, body: { found: false, code, error: 'invalid_barcode', message: 'JAN/EANコードの桁数またはチェックデジットが正しくありません。' } };
  }

  const params = new URLSearchParams({ product_type: 'all', cc: 'jp', lc: 'ja', fields: PRODUCT_FIELDS });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${OPEN_FOOD_FACTS_ORIGIN}/api/v3/product/${code}?${params}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `SonaeNote/0.2 (${process.env.APP_CONTACT_URL || 'http://localhost'})`,
      },
      signal: controller.signal,
    });
    if (response.status === 404) return { status: 200, body: { found: false, code, message: '公開商品データベースに未登録の商品です。' } };
    if (!response.ok) throw new Error(`Open Food Facts returned ${response.status}`);
    const payload = await response.json();
    const product = normalizeProduct(code, payload.product);
    if (!product) return { status: 200, body: { found: false, code, message: '商品名を取得できませんでした。' } };
    return { status: 200, body: { found: true, product } };
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return { status: 502, body: { found: false, code, error: timedOut ? 'timeout' : 'upstream_error', message: timedOut ? '商品情報の照会がタイムアウトしました。' : '商品情報サービスへ接続できませんでした。' } };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleProductApi(req, res, code) {
  const client = req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (requestRates.size > 1000) {
    for (const [address, entry] of requestRates) if (now - entry.startedAt >= RATE_WINDOW_MS) requestRates.delete(address);
  }
  const rate = requestRates.get(client);
  if (!rate || now - rate.startedAt >= RATE_WINDOW_MS) requestRates.set(client, { startedAt: now, count: 1 });
  else if ((rate.count += 1) > RATE_LIMIT) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Retry-After', '60');
    res.end(JSON.stringify({ found: false, error: 'rate_limited', message: '検索回数が多すぎます。少し待ってから再試行してください。' }));
    return;
  }
  const normalized = normalizeBarcode(code);
  const cached = productCache.get(normalized);
  const result = cached && cached.expiresAt > now ? cached.result : await lookupProduct(normalized);
  if (result.status === 200) {
    productCache.set(normalized, { expiresAt: now + CACHE_TTL_MS, result });
    if (productCache.size > 500) productCache.delete(productCache.keys().next().value);
  }
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', result.status === 200 ? 'private, max-age=3600' : 'no-store');
  res.end(JSON.stringify(result.body));
}

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const requestRates = new Map();
const productCache = new Map();
