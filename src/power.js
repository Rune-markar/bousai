export const POWER_DEVICES = [
  { id: 'phone', symbol: '📱', name: 'スマートフォン', watts: 12, hours: 2, defaultQuantity: 2, note: 'USB充電を1日1回行う想定' },
  { id: 'fan', symbol: '🌀', name: '扇風機', watts: 25, hours: 8, defaultQuantity: 1, note: '省電力モデルの弱〜中運転' },
  { id: 'led', symbol: '💡', name: 'LEDライト', watts: 8, hours: 6, defaultQuantity: 2, note: '夜間の居室・手元照明' },
  { id: 'radio', symbol: '📻', name: 'ラジオ', watts: 5, hours: 8, defaultQuantity: 1, note: '情報収集用の連続運転' },
  { id: 'laptop', symbol: '💻', name: 'ノートPC', watts: 45, hours: 4, defaultQuantity: 0, note: 'USB-C充電対応機を想定' },
  { id: 'router', symbol: '📡', name: '通信ルーター', watts: 12, hours: 12, defaultQuantity: 0, note: '回線設備側の停電状況にも依存' },
  { id: 'cpap', symbol: '🫁', name: 'CPAP等医療機器', watts: 40, hours: 8, defaultQuantity: 0, note: '実機ラベルと医療者の指示を優先' },
  { id: 'fridge', symbol: '🧊', name: '小型冷蔵庫', watts: 60, hours: 12, defaultQuantity: 0, note: '間欠運転の平均。起動電力は別確認' },
];

export const BATTERY_BENCHMARKS = [
  { maker: 'Jackery', model: '1000 New', capacityWh: 1070, priceYen: 119800, sourceUrl: 'https://www.jackery.jp/products/explorer-1000-new' },
  { maker: 'Anker', model: 'Solix C1000', capacityWh: 1056, priceYen: 119900, sourceUrl: 'https://www.ankerjapan.com/products/a1761' },
];

export const SOLAR_BENCHMARKS = [
  { maker: 'Anker', model: 'Solix PS100 Compact', watts: 100, priceYen: 34900, sourceUrl: 'https://www.ankerjapan.com/products/a2435' },
  { maker: 'Jackery', model: 'SolarSaga 200', watts: 200, priceYen: 51960, sourceUrl: 'https://www.jackery.jp/products/jackery-solarsaga-200-js200a' },
];

export const POWER_PRICE_CHECKED_AT = '2026-08-15';

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const roundUp = (value, unit) => Math.ceil(value / unit) * unit;
const roundPrice = (value) => Math.round(value / 1000) * 1000;

export function createDefaultPowerPlan() {
  return {
    mode: 'simple',
    autonomyDays: 3,
    sunHours: 3,
    devices: Object.fromEntries(POWER_DEVICES.map((device) => [device.id, {
      quantity: device.defaultQuantity,
      expectedWatts: device.watts,
      actualWatts: 0,
      hours: device.hours,
    }])),
  };
}

export function normalizePowerPlan(input = {}) {
  const fallback = createDefaultPowerPlan();
  const sourceDevices = input.devices && typeof input.devices === 'object' ? input.devices : {};
  return {
    mode: input.mode === 'detail' ? 'detail' : 'simple',
    autonomyDays: clamp(input.autonomyDays, 1, 7, fallback.autonomyDays),
    sunHours: clamp(input.sunHours, 1, 6, fallback.sunHours),
    devices: Object.fromEntries(POWER_DEVICES.map((device) => {
      const source = sourceDevices[device.id] || {};
      return [device.id, {
        quantity: Math.round(clamp(source.quantity, 0, 20, fallback.devices[device.id].quantity)),
        expectedWatts: clamp(source.expectedWatts, 1, 3000, device.watts),
        actualWatts: clamp(source.actualWatts, 0, 3000, 0),
        hours: clamp(source.hours, 0.1, 24, device.hours),
      }];
    })),
  };
}

export function calculatePowerSystem(rawPlan = {}) {
  const plan = normalizePowerPlan(rawPlan);
  const rows = POWER_DEVICES.map((device) => {
    const setting = plan.devices[device.id];
    const watts = plan.mode === 'detail' && setting.actualWatts > 0 ? setting.actualWatts : setting.expectedWatts;
    const dailyWh = watts * setting.hours * setting.quantity;
    return { ...device, ...setting, watts, dailyWh };
  });
  const selected = rows.filter((row) => row.quantity > 0);
  const dailyLoadWh = selected.reduce((sum, row) => sum + row.dailyWh, 0);
  const peakLoadW = selected.reduce((sum, row) => sum + row.watts * row.quantity, 0);
  const inverterEfficiency = 0.88;
  const batteryUsableFraction = 0.9;
  const reserveFraction = 0.2;
  const solarSystemEfficiency = 0.75;
  const batteryInputWhPerDay = dailyLoadWh / inverterEfficiency;
  const conversionLossWh = batteryInputWhPerDay - dailyLoadWh;
  const requiredBatteryWh = dailyLoadWh
    ? roundUp((batteryInputWhPerDay * plan.autonomyDays) / (batteryUsableFraction * (1 - reserveFraction)), 50)
    : 0;
  const protectedMarginWh = Math.max(0, requiredBatteryWh - batteryInputWhPerDay * plan.autonomyDays);
  const requiredSolarW = dailyLoadWh ? roundUp(batteryInputWhPerDay / (plan.sunHours * solarSystemEfficiency), 50) : 0;
  const recommendedOutputW = peakLoadW ? roundUp(peakLoadW * 1.25, 100) : 0;
  const batteryYenPer10Wh = Math.round(BATTERY_BENCHMARKS.reduce((sum, item) => sum + item.priceYen / item.capacityWh * 10, 0) / BATTERY_BENCHMARKS.length);
  const solarYenPerW = Math.round(SOLAR_BENCHMARKS.reduce((sum, item) => sum + item.priceYen / item.watts, 0) / SOLAR_BENCHMARKS.length);
  const batteryEstimateYen = roundPrice(requiredBatteryWh / 10 * batteryYenPer10Wh);
  const solarEstimateYen = roundPrice(requiredSolarW * solarYenPerW);

  return {
    plan,
    rows,
    selected,
    dailyLoadWh: Math.round(dailyLoadWh),
    peakLoadW: Math.round(peakLoadW),
    batteryInputWhPerDay: Math.round(batteryInputWhPerDay),
    conversionLossWh: Math.round(conversionLossWh),
    protectedMarginWh: Math.round(protectedMarginWh),
    requiredBatteryWh,
    requiredSolarW,
    recommendedOutputW,
    batteryYenPer10Wh,
    solarYenPerW,
    batteryEstimateYen,
    solarEstimateYen,
    totalEstimateYen: batteryEstimateYen + solarEstimateYen,
    assumptions: { inverterEfficiency, batteryUsableFraction, reserveFraction, solarSystemEfficiency },
  };
}
