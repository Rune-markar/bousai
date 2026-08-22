import { CATEGORY_META } from './domain.js';
import { hasVerifiedAlternativeCooking, hasVerifiedEmergencyLight, hasVerifiedFoodComposition, hasVerifiedSeasonalTemperature } from './preparedness.js';

const EMERGENCY_CATEGORY_LABELS = {
  water: '飲料水',
  food: '食料',
  fuel: '燃料',
  hygiene: '衛生',
  light: '灯り・電源',
  comfort: '生活用品',
  heat: '燃料・温度対策',
};
const EMERGENCY_GAP_PRIORITY = { water: 0, food: 1, hygiene: 2, heat: 3, light: 4, comfort: 5 };

export const DISASTER_SCENARIOS = [
  { id: 'earthquake', name: '大地震・断水', days: 3, categories: ['water', 'food', 'hygiene', 'light'], opening: 'まず身を守り、揺れが収まってから出口と火元を確認します。' },
  { id: 'typhoon', name: '台風・洪水', days: 3, categories: ['water', 'food', 'light', 'hygiene'], opening: '暗くなる前に屋外物を固定し、浸水前の早期避難判断を優先します。' },
  { id: 'blackout', name: '長期停電', days: 3, categories: ['light', 'food', 'water', 'heat'], opening: '灯りと通信を節電運用へ切り替え、冷蔵品から順に消費します。' },
  { id: 'snow', name: '大雪・低温', days: 3, categories: ['heat', 'food', 'water', 'light'], opening: '外出を控え、暖を一室に集めて燃料と体温を守ります。' },
];

export function generateEmergencyPlan(state, summary) {
  const toiletDays = Math.floor(Math.max(0, Number(summary.toiletDays) || 0));
  const contactReady = Boolean(String(state.contact?.shelter || '').trim() && String(state.contact?.phone || '').trim() && String(state.contact?.note || '').trim());
  const formatDays = (value) => (Math.floor(Math.max(0, Number(value) || 0) * 10) / 10).toFixed(1);
  const foodDays = Math.max(0, Number(summary.foodDays) || 0);
  const gaps = [];
  if (foodDays < 3) gaps.push(`食料は簡易換算で約${formatDays(foodDays)}日分。1人1日3食で3日分まで増やす`);
  if (!hasVerifiedFoodComposition(state)) gaps.push('3日分の食料を並べ、主食・たんぱく源・調理不要の一食と、家族のアレルギー・年齢・持病への適合を実物確認する');
  if (summary.waterDays < 3) gaps.push(`飲料水は約${formatDays(summary.waterDays)}日分。まず3日分まで増やす`);
  if (toiletDays < 3) gaps.push(`携帯トイレは約${toiletDays}日分。1人1日5回で3日分まで増やす`);
  if (!contactReady) gaps.push('集合場所・緊急連絡先・171などの連絡ルールを家族で決める');
  if (!hasVerifiedEmergencyLight(state)) gaps.push('停電用の灯りを実際に点灯し、予備電池と置き場所を確認する');
  return {
    contactReady,
    foodDays,
    waterDays: summary.waterDays,
    toiletDays,
    immediate: ['今いる場所で身の安全を確保し、災害の種類を確認', '気象庁・自治体などの公的情報を確認', '自宅と移動経路が安全な場合だけ在宅避難を選ぶ', `避難先候補：${state.contact?.shelter || '未登録（災害別に確認）'}`],
    first72Hours: [`食料を1人1日3食で計画配分（重量による現在日数は簡易換算で約${formatDays(foodDays)}日分）`, `水は1人1日3Lを備蓄設計の目安にし、健康上必要な飲水を我慢しない（現在 約${formatDays(summary.waterDays)}日分）`, `携帯トイレを1人1日5回で配分（現在 約${toiletDays}日分）`, '期限の近い食品から開封し、入出庫を記録'],
    gaps,
  };
}

export function simulateDisaster(state, summary, scenarioId, days = 3) {
  const scenario = DISASTER_SCENARIOS.find((item) => item.id === scenarioId) || DISASTER_SCENARIOS[0];
  const requestedDays = Number(days);
  const duration = Number.isFinite(requestedDays) ? Math.min(14, Math.max(1, requestedDays)) : scenario.days;
  const categoryMap = Object.fromEntries(summary.categoryScores.map((item) => [item.key, item.score]));
  const dayCoverageScore = (value) => {
    const ratio = Math.min(1, Math.max(0, Number(value) || 0) / duration);
    return ratio >= 1 ? 100 : Math.min(99, Math.floor(ratio * 100));
  };
  categoryMap.water = dayCoverageScore(summary.waterDays);
  categoryMap.food = hasVerifiedFoodComposition(state) ? dayCoverageScore(summary.foodDays) : 0;
  categoryMap.hygiene = dayCoverageScore(summary.toiletDays);
  const unmeasuredKeys = new Set();
  if (hasVerifiedEmergencyLight(state)) {
    categoryMap.light = 0;
    unmeasuredKeys.add('light');
  } else categoryMap.light = 0;
  categoryMap.heat = scenario.id === 'blackout'
    ? (hasVerifiedAlternativeCooking(state) ? (unmeasuredKeys.add('heat'), 0) : 0)
    : scenario.id === 'snow' ? (hasVerifiedSeasonalTemperature(state, { requiredSeason: 'cold' }) ? (unmeasuredKeys.add('heat'), 0) : 0) : 0;
  categoryMap.comfort = 0;
  const categoryScore = Math.round(scenario.categories.reduce((sum, key) => sum + (categoryMap[key] || 0), 0) / scenario.categories.length);
  const criticalGaps = scenario.categories
    .filter((key) => (categoryMap[key] || 0) < 100)
    .map((key) => ({ key, score: categoryMap[key] || 0, reason: unmeasuredKeys.has(key) ? 'duration-unmeasured' : 'stock-or-verification' }))
    .sort((a, b) => Number(a.reason === 'duration-unmeasured') - Number(b.reason === 'duration-unmeasured')
      || (EMERGENCY_GAP_PRIORITY[a.key] ?? 9) - (EMERGENCY_GAP_PRIORITY[b.key] ?? 9)
      || a.score - b.score);
  const score = Math.max(0, Math.min(criticalGaps.length ? 99 : 100, categoryScore));
  const onlyDurationUnmeasured = criticalGaps.length > 0 && criticalGaps.every((gap) => gap.reason === 'duration-unmeasured');
  const statusKey = score < 50 ? 'large-gap' : onlyDurationUnmeasured ? 'needs-verification' : criticalGaps.length || score < 80 ? 'needs-stock' : 'reference-ready';
  const firstGap = criticalGaps.find((gap) => gap.reason !== 'duration-unmeasured') || criticalGaps[0];
  const firstGapLabel = firstGap ? EMERGENCY_CATEGORY_LABELS[firstGap.key] || CATEGORY_META[firstGap.key]?.label || '不足している' : '';
  return {
    scenario,
    days: duration,
    score,
    statusKey,
    status: statusKey === 'reference-ready' ? '参考上は充足' : statusKey === 'needs-verification' ? '期間の確認が必要' : statusKey === 'needs-stock' ? '備蓄不足あり' : '大きな不足',
    criticalGaps,
    advice: firstGap ? firstGap.reason === 'duration-unmeasured'
      ? `${firstGapLabel}は実物確認済みですが、${duration}日間使える量・容量は未測定です。`
      : `${firstGapLabel}分野を最優先で補強してください。`
      : '主要分野は整っています。実物を使う訓練で確認してください。',
  };
}
