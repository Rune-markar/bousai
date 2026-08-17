export const DISASTER_PREPAREDNESS = [
  {
    id: 'earthquake',
    name: '地震',
    shortName: '地震',
    icon: 'house',
    theme: 'earthquake',
    summary: '家具の転倒と出口のふさがりを防ぎ、揺れの直後に安全に動ける家にします。',
    immediate: ['まず頭を守り、丈夫な机の下などで揺れが収まるのを待つ', '揺れが収まってから火元と出口を確認する', '倒壊・火災の危険があれば、ブレーカーを切って避難する'],
    tasks: [
      { id: 'furniture-brace', title: '家具に突っ張り棒・L字金具などを取り付けた', detail: '本棚や食器棚は壁に固定し、突っ張り棒は家具の奥側へ設置します。' },
      { id: 'safe-layout', title: '寝室と避難経路に倒れる家具を置いていない', detail: 'ベッドや出入口へ家具が倒れない向きに配置します。' },
      { id: 'glass', title: '窓・食器棚のガラスに飛散防止対策をした', detail: '飛散防止フィルムやカーテンで、割れたガラスから身を守ります。' },
      { id: 'bedside', title: '枕元に靴・ライト・笛を置いた', detail: '停電や割れたガラスを想定し、手の届く位置にまとめます。' },
      { id: 'breaker', title: '感震ブレーカーや分電盤の操作を確認した', detail: '避難時の通電火災を防ぐため、家族で場所と操作を共有します。' },
    ],
  },
  {
    id: 'typhoon-flood', name: '台風・洪水', shortName: '台風', icon: 'rain', theme: 'flood',
    summary: '風雨が強くなる前に家の外を片づけ、浸水前に避難を判断できるようにします。',
    immediate: ['気象情報と自治体の避難情報を確認する', '川や用水路、地下空間には近づかない', '浸水前に安全な場所または建物の高い階へ移動する'],
    tasks: [
      { id: 'hazard-map', title: '洪水ハザードマップで浸水深を確認した', detail: '自宅・職場・避難先までの危険箇所も確認します。' },
      { id: 'outdoor-items', title: '植木鉢や物干し竿など屋外物を固定できる', detail: '強風前に屋内へ移す物と固定する物を決めます。' },
      { id: 'drain', title: '雨どい・側溝・排水口を清掃した', detail: '落ち葉やごみを除き、雨水が流れる状態を保ちます。' },
      { id: 'upper-floor', title: '重要品を高い場所へ移す手順を決めた', detail: '書類、薬、電源、備蓄を浸水しにくい高さへ移します。' },
      { id: 'evacuation-timing', title: '避難を始める条件を家族で決めた', detail: '高齢者等避難や警戒レベルを基準に、暗くなる前に動きます。' },
    ],
  },
  {
    id: 'tsunami', name: '津波', shortName: '津波', icon: 'waves', theme: 'tsunami',
    summary: '強い揺れや津波警報を合図に、海から離れてより高い場所へ逃げます。',
    immediate: ['強い揺れや長い揺れを感じたら、警報を待たず高い場所へ逃げる', '海岸や川沿いから離れ、徒歩で避難する', '警報・注意報が解除されるまで戻らない'],
    tasks: [
      { id: 'hazard-zone', title: '津波浸水想定区域を確認した', detail: '自宅だけでなく、学校や職場など普段いる場所も確認します。' },
      { id: 'high-ground', title: '最寄りの高台・津波避難ビルを確認した', detail: '距離と高さを確認し、候補を2か所以上持ちます。' },
      { id: 'walking-route', title: '徒歩の避難経路を実際に歩いた', detail: '階段、夜間、混雑、道路の損傷も想定します。' },
      { id: 'no-car', title: '原則として車を使わない避難方法を決めた', detail: '渋滞や道路寸断を想定し、徒歩で逃げられる準備をします。' },
      { id: 'family-rule', title: '家族と「戻らず各自で逃げる」ルールを共有した', detail: '迎えに戻らず、それぞれが避難先へ向かう約束をします。' },
    ],
  },
  {
    id: 'fire', name: '火災', shortName: '火災', icon: 'flame', theme: 'fire',
    summary: '早期発見・初期消火・すぐ逃げる判断の3つを準備します。',
    immediate: ['大声で周囲に知らせ、119番通報する', '炎が小さく退路がある場合だけ初期消火する', '煙を避けて低い姿勢で逃げ、一度出たら戻らない'],
    tasks: [
      { id: 'alarm', title: '住宅用火災警報器を点検した', detail: '作動ボタンで確認し、設置後10年を目安に交換を検討します。' },
      { id: 'extinguisher', title: '消火器の場所・期限・使い方を確認した', detail: '出口を背にして使える場所へ置きます。' },
      { id: 'escape-routes', title: '2方向の避難経路を確認した', detail: '玄関が使えない場合の窓・ベランダ側の逃げ方も考えます。' },
      { id: 'heating-clearance', title: 'コンロや暖房器具の周囲を片づけた', detail: '燃えやすい物を離し、使用中はその場を離れません。' },
      { id: 'family-drill', title: '家族で通報と避難の役割を決めた', detail: '子どもには火を消そうとせず、すぐ逃げることを伝えます。' },
    ],
  },
  {
    id: 'landslide', name: '土砂災害', shortName: '土砂', icon: 'mountain', theme: 'landslide',
    summary: '危険区域と前兆を知り、雨が強まる前に斜面から離れます。',
    immediate: ['自治体の避難情報と土砂災害警戒情報を確認する', '崖や沢から離れた安全な場所へ早めに避難する', '外へ出る方が危険な場合は、斜面と反対側の上階へ移動する'],
    tasks: [
      { id: 'hazard-zone', title: '土砂災害警戒区域か確認した', detail: 'ハザードマップで自宅、避難経路、避難先を確認します。' },
      { id: 'slope-direction', title: '自宅から見た崖・斜面の方向を把握した', detail: '屋内退避する場合に、斜面から最も離れた部屋を選びます。' },
      { id: 'warning-signs', title: '土砂災害の前兆を家族で確認した', detail: '小石が落ちる、湧水が濁る、地鳴りなどを確認します。' },
      { id: 'early-evacuation', title: '雨が強まる前の避難先を決めた', detail: '夜間や豪雨になる前に移動できる親戚宅なども候補にします。' },
      { id: 'route', title: '崖・沢を避ける避難経路を歩いた', detail: '通行止めを想定して別の経路も確認します。' },
    ],
  },
  {
    id: 'heavy-snow', name: '大雪・低温', shortName: '大雪', icon: 'snow', theme: 'snow',
    summary: '外出できない期間と停電を想定し、暖房・除雪・一酸化炭素中毒を対策します。',
    immediate: ['不要不急の外出を控え、気象・道路情報を確認する', '暖房は換気し、一酸化炭素中毒を防ぐ', '車内で立ち往生したら排気口周辺の雪をこまめに除く'],
    tasks: [
      { id: 'heating', title: '停電時にも使える安全な防寒手段を用意した', detail: '衣類、毛布、湯たんぽなど火を使わない方法も準備します。' },
      { id: 'fuel', title: '暖房燃料を安全に備蓄・点検した', detail: '使用期限と保管場所を確認し、室内で発電機を使いません。' },
      { id: 'snow-tools', title: '除雪道具・手袋・滑りにくい靴を用意した', detail: '屋根からの落雪や無理な雪下ろしにも注意します。' },
      { id: 'car-kit', title: '車に防寒具・水・スコップを積んだ', detail: '毛布、携帯トイレ、充電手段も車載します。' },
      { id: 'pipes', title: '水道管の凍結防止方法を確認した', detail: '保温材や水抜き栓の場所と操作を確認します。' },
    ],
  },
];

export function disasterCompletion(checks = {}, disaster) {
  const completed = new Set(Array.isArray(checks?.[disaster.id]) ? checks[disaster.id] : []);
  const done = disaster.tasks.filter((task) => completed.has(task.id)).length;
  return { completed, done, total: disaster.tasks.length, percent: Math.round(done / disaster.tasks.length * 100) };
}

export function toggleDisasterTask(checks = {}, disasterId, taskId) {
  const disaster = DISASTER_PREPAREDNESS.find((item) => item.id === disasterId);
  if (!disaster?.tasks.some((task) => task.id === taskId)) return checks;
  const completed = new Set(Array.isArray(checks?.[disasterId]) ? checks[disasterId] : []);
  completed.has(taskId) ? completed.delete(taskId) : completed.add(taskId);
  return { ...checks, [disasterId]: [...completed] };
}
