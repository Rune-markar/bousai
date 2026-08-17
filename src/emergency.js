import { CATEGORY_META } from './domain.js';

const EMERGENCY_CATEGORY_LABELS = {
  water: '飲料水',
  food: '食料',
  fuel: '燃料',
  hygiene: '衛生',
  light: '灯り・電源',
  comfort: '生活用品',
  heat: '防寒',
};

export const DISASTER_SCENARIOS = [
  { id: 'earthquake', name: '大地震・断水', days: 3, categories: ['water', 'food', 'hygiene', 'light'], opening: 'まず身を守り、揺れが収まってから出口と火元を確認します。' },
  { id: 'typhoon', name: '台風・洪水', days: 3, categories: ['water', 'food', 'light', 'comfort'], opening: '暗くなる前に屋外物を固定し、浸水前の早期避難判断を優先します。' },
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
  if (summary.waterDays < 3) gaps.push(`飲料水は約${formatDays(summary.waterDays)}日分。まず3日分まで増やす`);
  if (toiletDays < 3) gaps.push(`携帯トイレは約${toiletDays}日分。1人1日5回で3日分まで増やす`);
  if (!contactReady) gaps.push('集合場所・緊急連絡先・171などの連絡ルールを家族で決める');
  if (!summary.rows.some((item) => item.category === 'light' && item.quantity > 0 && !item.isExpired && /(ライト|懐中電灯|ランタン|ヘッドライト)/.test(String(item.name || '')))) gaps.push('停電用の灯りと予備電池を確保する');
  return {
    contactReady,
    foodDays,
    waterDays: summary.waterDays,
    toiletDays,
    immediate: ['今いる場所で身の安全を確保し、災害の種類を確認', '気象庁・自治体などの公的情報を確認', '自宅と移動経路が安全な場合だけ在宅避難を選ぶ', `避難先候補：${state.contact?.shelter || '未登録（災害別に確認）'}`],
    first72Hours: [`食料を1人1日3食で計画配分（重量による現在日数は簡易換算で約${formatDays(foodDays)}日分）`, `水を1人1日3L以内で計画配分（現在 約${formatDays(summary.waterDays)}日分）`, `携帯トイレを1人1日5回で配分（現在 約${toiletDays}日分）`, '期限の近い食品から開封し、入出庫を記録'],
    gaps,
  };
}

export function simulateDisaster(state, summary, scenarioId, days = 3) {
  const scenario = DISASTER_SCENARIOS.find((item) => item.id === scenarioId) || DISASTER_SCENARIOS[0];
  const categoryMap = Object.fromEntries(summary.categoryScores.map((item) => [item.key, item.score]));
  const categoryScore = Math.round(scenario.categories.reduce((sum, key) => sum + (categoryMap[key] || 0), 0) / scenario.categories.length);
  const durationPenalty = Math.max(0, Number(days) - scenario.days) * 5;
  const score = Math.max(0, Math.min(100, categoryScore - durationPenalty));
  const criticalGaps = scenario.categories.filter((key) => (categoryMap[key] || 0) < 70).map((key) => ({ key, score: categoryMap[key] || 0 }));
  return {
    scenario,
    days: Number(days),
    score,
    statusKey: score >= 80 ? 'reference-ready' : score >= 50 ? 'needs-stock' : 'large-gap',
    status: score >= 80 ? '参考上は充足' : score >= 50 ? '備蓄不足あり' : '大きな不足',
    criticalGaps,
    advice: criticalGaps.length ? `${EMERGENCY_CATEGORY_LABELS[criticalGaps[0].key] || CATEGORY_META[criticalGaps[0].key]?.label || '不足している'}分野を最優先で補強してください。` : '主要分野は整っています。実物を使う訓練で確認してください。',
  };
}
