export const PREPAREDNESS_STAGES = [
  {
    id: 'protect', number: 1, title: '命を守る土台', subtitle: '発災直後を生き抜く', icon: 'shield',
    clearMessage: '危険を知り、迷わず動くための土台ができました。次は自宅で72時間をしのぐ力を整えましょう。',
    tasks: [
      { id: 'hazard-map', pillar: 'risk', title: '地域の災害リスクを確認', detail: 'ハザードマップで洪水・土砂・津波・地震リスクと避難先を確認する。', action: '自治体のハザードマップを開き、自宅と避難経路に印を付ける', xp: 20, gate: true },
      { id: 'furniture', pillar: 'home', title: '寝室と避難路の安全化', detail: '家具の転倒、ガラス、出口の閉塞を防ぎ、枕元に靴と灯りを置く。', action: '寝室から玄関まで歩き、倒れる家具を1つ固定する', xp: 20, gate: true },
      { id: 'alerts', pillar: 'information', title: '警報を受け取れるようにする', detail: '自治体通知、緊急速報、携帯ラジオなど複数の情報経路を用意する。', action: 'スマートフォンの緊急速報設定を確認する', xp: 15 },
      { id: 'medicine', pillar: 'health', title: '常用薬と健康情報を確保', detail: '最低3日分の薬、処方内容、眼鏡など生命に直結するものを揃える。', action: '薬とお薬手帳の置き場所を家族で共有する', xp: 20, gate: true },
    ],
  },
  {
    id: 'survive72', number: 2, title: '72時間をしのぐ', subtitle: '水・食料・排泄を一体化', icon: 'backpack',
    clearMessage: '最低限の在宅避難基盤が整いました。次は避難バッグと一週間の継続力へ広げましょう。',
    tasks: [
      { id: 'water-3', pillar: 'water', title: '飲料水を3日分', detail: '1人1日3Lを基準に、家族人数×3日分を確保する。', action: '備蓄画面で水の本数と容量を登録する', xp: 20, auto: 'water3', gate: true },
      { id: 'food-core', pillar: 'food', title: '食料を3日分', detail: '主食・たんぱく源・補助食品を、加熱できない場合も想定して揃える。', action: '食べ慣れた食品を3日分書き出して不足を購入する', xp: 20, auto: 'food3', gate: true },
      { id: 'toilet-3', pillar: 'sanitation', title: '携帯トイレを3日分', detail: '1人1日5回×家族人数×3日を最低ラインにする。', action: '必要回数を計算し、備蓄画面の目標数を更新する', xp: 20, auto: 'toilet3', gate: true },
      { id: 'light-fire', pillar: 'power', title: '灯り・消火・防寒', detail: '停電時の照明、初期消火、季節に応じた体温維持を準備する。', action: '枕元のライトを点灯し、消火器の期限を確認する', xp: 15 },
    ],
  },
  {
    id: 'evacuate', number: 3, title: '避難を二層化', subtitle: '持出しと在宅継続を分ける', icon: 'route',
    clearMessage: '持ち出す備えと、自宅に残す備えを分けられました。次は一週間と代替手段を確保します。',
    tasks: [
      { id: 'bag-primary', pillar: 'evacuation', title: '1次避難バッグ', detail: '命を守ってすぐ逃げるため、軽量な水・薬・灯り・笛・防寒具をまとめる。', action: '実際に背負い、玄関まで30秒で出られるか試す', xp: 25, gate: true },
      { id: 'bag-secondary', pillar: 'evacuation', title: '2次避難バッグ', detail: '避難生活を続ける着替え、衛生品、充電、書類の控えを別に用意する。', action: '1次バッグと重複させず、後から運ぶ物を箱にまとめる', xp: 25 },
      { id: 'family-route', pillar: 'family', title: '家族の集合・連絡ルール', detail: '別々の場所で被災した場合の集合先、171、遠方連絡先を決める。', action: '緊急メモを家族と読み合わせる', xp: 20, auto: 'contactReady', gate: true },
      { id: 'cash-docs', pillar: 'recovery', title: '現金と重要書類の控え', detail: '小銭を含む現金、身分証・保険・連絡先の控えを防水して保管する。', action: '停電時に使える小額紙幣と硬貨を分けておく', xp: 15 },
    ],
  },
  {
    id: 'sustain7', number: 4, title: '一週間を継続', subtitle: '途切れても暮らせる冗長性', icon: 'calendar',
    clearMessage: '一週間を支える備えができました。ここからは電力・通信を自前で回す仕組みへ進みます。',
    tasks: [
      { id: 'water-7', pillar: 'water', title: '水を7日分へ拡張', detail: '飲料水に加え、給水容器と生活用水の確保手段を持つ。', action: '3日分とは別の場所に追加分を分散保管する', xp: 30, auto: 'water7', gate: true },
      { id: 'toilet-7', pillar: 'sanitation', title: 'トイレを7日分へ拡張', detail: '臭気対策、凝固剤、袋、手指衛生まで一組で備える。', action: '一度組み立て、家族全員が使い方を確認する', xp: 25, auto: 'toilet7', gate: true },
      { id: 'cooking-water', pillar: 'food', title: '代替調理と節水運用', detail: 'カセットコンロ、湯せん、食器を汚さない方法で燃料と水を節約する。', action: '備蓄食だけで一食を作り、必要な水と燃料を測る', xp: 25 },
      { id: 'distributed-stock', pillar: 'home', title: '備蓄を分散する', detail: '玄関・寝室・車などに分け、1か所が使えなくても最低限を残す。', action: 'ライト・水・トイレを2か所以上へ分ける', xp: 20, gate: true },
    ],
  },
  {
    id: 'energy', number: 5, title: '電力と通信を自立', subtitle: '蓄電・発電・情報の生態系', icon: 'solar',
    clearMessage: '停電が長引いても情報と最低限の電力を維持できます。最後は復旧力と地域連携です。',
    tasks: [
      { id: 'power-budget', pillar: 'power', title: '必要電力量を算定', detail: 'スマートフォン、照明、医療・季節家電のW数と使用時間を積み上げる。', action: '絶対に止めたくない機器を3つ選び、Whを計算する', xp: 25, gate: true },
      { id: 'battery-system', pillar: 'power', title: '蓄電池を運用できる', detail: '必要Wh、安全な保管、定期充電、出力端子を実機で確認する。', action: '蓄電池だけでスマートフォンとライトを充電する', xp: 30, gate: true },
      { id: 'solar-system', pillar: 'power', title: '太陽光で再充電できる', detail: 'パネル・ケーブル・蓄電池を接続し、季節と設置場所別の発電量を把握する。', action: '晴天時に実接続し、1時間の入力Whを記録する', xp: 35 },
      { id: 'comms-redundancy', pillar: 'information', title: '通信手段を多重化', detail: '携帯回線以外にラジオ、伝言サービス、紙の連絡先を確保する。', action: '171の体験利用日を家族の訓練日にする', xp: 20 },
    ],
  },
  {
    id: 'recover', number: 6, title: '復旧力を育てる', subtitle: '訓練・記録・助け合い', icon: 'community',
    clearMessage: '全段階を踏破しました。完成ではなく、季節ごとの訓練と見直しで防災力を維持しましょう。',
    tasks: [
      { id: 'home-assessment', pillar: 'home', title: '住まいの耐震・保険確認', detail: '耐震性、火災・水害補償、罹災時の記録方法を確認する。', action: '建築年と保険の補償範囲を1枚にまとめる', xp: 25, gate: true },
      { id: 'drill', pillar: 'skills', title: '半日防災訓練', detail: '停電・断水を仮定し、備蓄と機材を実際に使って詰まりを見つける。', action: '次の休日に「電気と水を使わない半日」を予約する', xp: 35, gate: true },
      { id: 'mutual-aid', pillar: 'community', title: '地域の助け合いを確認', detail: '自治会、防災倉庫、要支援者、近隣との連絡方法を知る。', action: '最寄りの防災倉庫と地域訓練の日程を確認する', xp: 25 },
      { id: 'season-review', pillar: 'skills', title: '季節ごとの見直し', detail: '年4回、期限・家族構成・季節リスク・機器動作を再点検する。', action: '次回点検日をカレンダーに登録する', xp: 25 },
    ],
  },
];

export const ALL_PREPAREDNESS_TASKS = PREPAREDNESS_STAGES.flatMap((stage) => stage.tasks.map((task) => ({ ...task, stageId: stage.id, stageNumber: stage.number })));

export const TARGET_REQUIREMENTS = [
  { maxDays: 3, stageNumber: 2, label: '72時間をしのぐ力' },
  { maxDays: 7, stageNumber: 4, label: '一週間を継続する力' },
  { maxDays: 14, stageNumber: 5, label: '電力・通信まで自立する力' },
  { maxDays: 30, stageNumber: 6, label: '長期化から復旧する力' },
];

export function targetRequirement(days = 7) {
  const normalizedDays = Math.min(30, Math.max(3, Number(days) || 7));
  return TARGET_REQUIREMENTS.find((requirement) => normalizedDays <= requirement.maxDays) || TARGET_REQUIREMENTS.at(-1);
}

const toiletQuantity = (inventory) => inventory.filter((item) => item.category === 'hygiene' && /(トイレ|便袋|凝固)/.test(String(item.name || ''))).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

export function getAutomaticTaskIds(state, inventorySummary) {
  const people = Math.max(1, Number(state.household) || 1);
  const toiletUnits = toiletQuantity(state.inventory || []);
  const contact = state.contact || {};
  const checks = {
    water3: inventorySummary.waterDays >= 3,
    water7: inventorySummary.waterDays >= 7,
    food3: inventorySummary.foodDays >= 3,
    toilet3: toiletUnits >= people * 5 * 3,
    toilet7: toiletUnits >= people * 5 * 7,
    contactReady: Boolean(String(contact.shelter || '').trim() && String(contact.note || '').trim()),
  };
  return new Set(ALL_PREPAREDNESS_TASKS.filter((task) => task.auto && checks[task.auto]).map((task) => task.id));
}

export function preparednessProgress(state, inventorySummary) {
  const manual = new Set(Array.isArray(state.preparedness?.completed) ? state.preparedness.completed : []);
  const automatic = getAutomaticTaskIds(state, inventorySummary);
  const completed = new Set([...manual, ...automatic]);
  const stages = PREPAREDNESS_STAGES.map((stage, index) => {
    const done = stage.tasks.filter((task) => completed.has(task.id)).length;
    const gateTasks = stage.tasks.filter((task) => task.gate);
    const gateClear = gateTasks.every((task) => completed.has(task.id));
    const priorGateClear = PREPAREDNESS_STAGES.slice(0, index).every((prior) => prior.tasks.filter((task) => task.gate).every((task) => completed.has(task.id)));
    return { ...stage, done, total: stage.tasks.length, percent: Math.round(done / stage.tasks.length * 100), gateClear, unlocked: index === 0 || priorGateClear };
  });
  const xp = ALL_PREPAREDNESS_TASKS.reduce((sum, task) => sum + (completed.has(task.id) ? task.xp : 0), 0);
  const maxXp = ALL_PREPAREDNESS_TASKS.reduce((sum, task) => sum + task.xp, 0);
  const pillars = [...new Set(ALL_PREPAREDNESS_TASKS.map((task) => task.pillar))].map((pillar) => {
    const tasks = ALL_PREPAREDNESS_TASKS.filter((task) => task.pillar === pillar);
    return { pillar, completed: tasks.filter((task) => completed.has(task.id)).length, total: tasks.length };
  });
  const weakest = pillars.filter((item) => item.completed < item.total).sort((a, b) => a.completed / a.total - b.completed / b.total)[0] || null;
  const currentStage = stages.find((stage) => stage.unlocked && !stage.gateClear) || stages.find((stage) => stage.done < stage.total) || stages.at(-1);
  const nextTask = currentStage?.tasks.find((task) => !completed.has(task.id) && task.gate) || currentStage?.tasks.find((task) => !completed.has(task.id)) || null;
  const level = Math.min(6, 1 + stages.filter((stage) => stage.gateClear).length);
  const titles = ['備えの芽', '命を守る人', '72時間サバイバー', '避難設計者', '暮らしの守り手', '自立防災士'];
  return { completed, automatic, stages, xp, maxXp, level, title: titles[level - 1], weakest, currentStage, nextTask, totalDone: completed.size, totalTasks: ALL_PREPAREDNESS_TASKS.length };
}

export function defensePower(state, inventorySummary) {
  const targetDays = Math.min(30, Math.max(3, Number(state.preparedness?.targetDays) || 7));
  const requiredStage = targetRequirement(targetDays);
  const progress = preparednessProgress(state, inventorySummary);
  const requiredTasks = ALL_PREPAREDNESS_TASKS.filter((task) => task.stageNumber <= requiredStage.stageNumber);
  const completedTasks = requiredTasks.filter((task) => progress.completed.has(task.id)).length;
  const waterCoverage = Math.min(1, Math.max(0, Number(inventorySummary.waterDays) || 0) / targetDays);
  const foodCoverage = Math.min(1, Math.max(0, Number(inventorySummary.foodDays) || 0) / targetDays);
  const earned = completedTasks + waterCoverage + foodCoverage;
  const requirementCount = requiredTasks.length + 2;
  return {
    targetDays,
    requiredStage,
    requiredTasks,
    completedTasks,
    requirementCount,
    fulfilled: completedTasks + Number(waterCoverage === 1) + Number(foodCoverage === 1),
    waterCoverage,
    foodCoverage,
    score: Math.round(earned / requirementCount * 100),
    nextTask: requiredTasks.find((task) => !progress.completed.has(task.id)) || null,
  };
}

export function togglePreparednessTask(state, taskId, inventorySummary) {
  const task = ALL_PREPAREDNESS_TASKS.find((item) => item.id === taskId);
  if (!task || task.auto) return state;
  const automatic = getAutomaticTaskIds(state, inventorySummary);
  if (automatic.has(taskId)) return state;
  const completed = new Set(state.preparedness?.completed || []);
  completed.has(taskId) ? completed.delete(taskId) : completed.add(taskId);
  return { ...state, preparedness: { ...state.preparedness, completed: [...completed], updatedAt: new Date().toISOString() } };
}
