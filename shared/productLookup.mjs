export const OPEN_FOOD_FACTS_ORIGIN = 'https://world.openfoodfacts.org';
export const PRODUCT_FIELDS = [
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

export function normalizeProduct(code, product = {}, { proxyImages = true } = {}) {
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
    imageUrl: remoteImage ? (proxyImages ? `/api/product-image?url=${encodeURIComponent(remoteImage)}` : remoteImage) : '',
    source: 'Open Food Facts',
    sourceUrl: `${OPEN_FOOD_FACTS_ORIGIN}/product/${encodeURIComponent(code)}`,
  };
}
