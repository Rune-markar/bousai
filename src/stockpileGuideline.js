import { usableInventory } from './domain.js';

export const STOCKPILE_GUIDELINE_SOURCES = Object.freeze({
  cabinet: {
    label: '内閣府・最低3日、できれば1週間',
    url: 'https://www.bousai.go.jp/kaigirep/hakusho/r08/honbun/t1_3s_04_02.html',
  },
  food: {
    label: '農林水産省・家庭備蓄と食品の多様性',
    url: 'https://www.maff.go.jp/j/syokuiku/plan/4_plan/togo/html/part8.html',
  },
  generator: {
    label: '経済産業省・携帯発電機の安全な使用',
    url: 'https://www.meti.go.jp/product_safety/consumer/pdf/2024_generator.pdf',
  },
});

const DIVERSITY_BRANCHES = Object.freeze([
  {
    id: 'power',
    eyebrow: '停電・情報',
    title: '電力を多重化する',
    examples: ['ポータブル電源', '太陽光', '発電機'],
    description: '医療機器など止められない用途を最優先にし、通信・照明を含め必要な家庭だけ電源方式を増やします。',
    action: 'power',
    actionLabel: '電力を設計',
    categories: ['light'],
    pattern: /(ポータブル電源|蓄電池|モバイルバッテリー|ソーラー|太陽光|発電機)/,
    caution: '燃料式発電機は屋内・車内・テント内で絶対に使わず、屋外でも出入口・窓から離れた風通しのよい場所で、排気方向と取扱説明書を確認します。',
  },
  {
    id: 'food-variety',
    eyebrow: '栄養・食欲',
    title: '食べ慣れた味を足す',
    examples: ['チョコレート', 'お菓子', '調味料'],
    description: '同じ主食を増やすだけでなく、栄養と食欲を保てる選択肢を足します。',
    action: 'food',
    actionLabel: '食料を確認',
    categories: ['food', 'comfort'],
    pattern: /(チョコ|菓子|ビスケット|ようかん|羊羹|あめ|飴|ナッツ|コーヒー|茶|調味料)/,
    requiresFoodExpiryConfirmation: true,
  },
  {
    id: 'calm',
    eyebrow: '休息・心のケア（任意）',
    title: '平常に近い時間を作る',
    examples: ['トランプ', '本', '子どもの遊び'],
    description: '家族構成に合わせ、電気を使わず普段に近い時間を持てる物を選びます。',
    action: 'comfort',
    actionLabel: '快適用品を確認',
    categories: ['comfort'],
    pattern: /(トランプ|カードゲーム|ボードゲーム|おもちゃ|玩具|絵本|本|塗り絵|ぬりえ)/,
  },
  {
    id: 'personal',
    eyebrow: '家族固有',
    title: '代替しにくい物を守る',
    examples: ['常用薬', '乳幼児用品', 'ペット・季節品'],
    description: '日数より先に、切らすと健康や生活へ直結する家族固有品を確認します。',
    action: 'comfort',
    actionLabel: '個別用品を確認',
    categories: ['comfort', 'hygiene'],
    pattern: /(常用薬|処方(?:薬|内容)?|服薬|お薬手帳|医薬品|おむつ|オムツ|ミルク|離乳食|生理|ペット|補聴器|眼鏡|メガネ|カイロ|冷却)/,
  },
]);

const safeDays = (value) => Math.max(0, Number(value) || 0);

export function buildStockpileGuideline(summary = {}, inventory = [], today = new Date()) {
  const essentialDays = Math.min(
    safeDays(summary.waterDays),
    safeDays(summary.foodDays),
    safeDays(summary.toiletDays),
  );
  const milestones = [1, 3, 7].map((days) => ({
    days,
    complete: essentialDays >= days,
    current: essentialDays < days && (days === 1 || essentialDays >= (days === 3 ? 1 : 3)),
  }));
  const nextMilestone = milestones.find((milestone) => !milestone.complete)?.days ?? null;
  const usable = usableInventory(inventory, today);
  const branches = DIVERSITY_BRANCHES.map(({ pattern, categories, requiresFoodExpiryConfirmation = false, ...branch }) => {
    const matchedItem = usable.find((item) => categories.includes(item.category)
      && pattern.test(String(item.name || ''))
      // Foods filed under the broad "comfort" category are outside the core
      // expiry gate. Require a dated item here so an unknown-date snack cannot
      // unlock the food-variety achievement.
      && (!requiresFoodExpiryConfirmation || item.category === 'food' || Boolean(item.expiry)));
    return {
      ...branch,
      registered: Boolean(matchedItem),
      matchedCategory: matchedItem?.category || null,
    };
  });
  const registeredBranches = branches.filter((branch) => branch.registered).length;
  const quantityBoundaryReached = essentialDays >= 30;

  return {
    essentialDays,
    milestones,
    nextMilestone,
    branches,
    registeredBranches,
    diversityUnlocked: essentialDays >= 7,
    quantityBoundaryReached,
    nextMessage: nextMilestone
      ? nextMilestone === 1
        ? '着手点の1日分まで、水・食料・携帯トイレの最短をそろえる'
        : `${nextMilestone === 3 ? '公的な最低目安' : '推奨目安'}の${nextMilestone}日分まで、水・食料・携帯トイレの最短をそろえる`
      : registeredBranches < branches.length
        ? '7日分を保ちながら、未登録の多様性を一つずつ補う'
        : '量を増やす前に、期限・使い方・家族固有条件を点検する',
    policyMessage: quantityBoundaryReached
      ? '地域リスクと家族事情を確認したうえで、30日分以上は同じ物の上積みより快適性・代替手段・更新しやすさを優先します。'
      : '8〜30日分の上積みは地域リスクと保管負担で判断し、7日分を整えながら多様性も並行して確認します。',
  };
}
