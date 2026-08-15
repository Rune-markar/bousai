export const PRACTICAL_LOADOUTS = {
  'light-fire': {
    label: 'BEDSIDE KIT', title: '枕元セーフティケース', subtitle: '暗闇・ガラス・初期消火へ、起きてすぐ対応する装備', accent: '#e17b4f',
    items: [
      { id: 'shoes', symbol: '👟', name: '底の厚い靴', detail: '割れたガラスを踏まない。左右を揃えて置く。', size: 'wide', required: true },
      { id: 'light', symbol: '🔦', name: 'LEDライト', detail: '点灯と電池残量を実機で確認する。', required: true },
      { id: 'gloves', symbol: '🧤', name: '作業用手袋', detail: '瓦礫や破損物に素手で触れない。', required: true },
      { id: 'whistle', symbol: '📣', name: '救助笛', detail: '閉じ込め時に少ない体力で位置を知らせる。', required: true },
      { id: 'helmet', symbol: '⛑️', name: '頭部保護', detail: 'ヘルメットまたは防災ずきん。', size: 'tall' },
      { id: 'extinguisher', symbol: '🧯', name: '消火器', detail: '設置場所、使用期限、圧力表示を確認する。', size: 'wide', required: true },
    ],
  },
  'bag-primary': {
    label: 'GO BAG / 01', title: '1次避難バッグ', subtitle: '命を守って即時退避する、軽量・最優先の装備', accent: '#d4a13a',
    items: [
      { id: 'water', symbol: '💧', name: '飲料水 500ml', detail: '移動を妨げない量。期限と開封状態を確認。', required: true },
      { id: 'medicine', symbol: '💊', name: '常用薬', detail: '最低3日分と処方情報。', required: true },
      { id: 'light', symbol: '🔦', name: 'ライト', detail: '両手が空く小型ライト。実際に点灯する。', required: true },
      { id: 'whistle', symbol: '📣', name: '救助笛', detail: 'バッグ外側からすぐ取れる位置へ。', required: true },
      { id: 'toilet', symbol: '🚻', name: '携帯トイレ', detail: '家族分の便袋・凝固剤を小分けにする。', size: 'wide', required: true },
      { id: 'thermal', symbol: '🧣', name: '防寒シート', detail: '雨風と低体温を防ぐ。', required: true },
      { id: 'battery', symbol: '🔋', name: '小型充電池', detail: 'ケーブルと残量を同時に確認。', required: true },
      { id: 'idcopy', symbol: '🪪', name: '身分証の控え', detail: '防水袋に入れ、番号の露出を避ける。', required: true },
      { id: 'food', symbol: '🍫', name: '行動食', detail: '開封してすぐ食べられる物。', size: 'wide' },
    ],
  },
  'bag-secondary': {
    label: 'STAY BAG / 02', title: '2次避難バッグ', subtitle: '避難生活を継続する装備。1次バッグと役割を重ねない', accent: '#668ca1',
    items: [
      { id: 'clothes', symbol: '👕', name: '着替え', detail: '季節に合う下着・靴下を圧縮する。', size: 'wide', required: true },
      { id: 'hygiene', symbol: '🧼', name: '衛生ポーチ', detail: '歯磨き、手指衛生、生理用品など。', required: true },
      { id: 'towel', symbol: '🧻', name: '速乾タオル', detail: '身体・目隠し・応急手当に転用できる。', required: true },
      { id: 'charger', symbol: '🔌', name: '充電器一式', detail: '端子が家族の端末に合うか接続する。', required: true },
      { id: 'radio', symbol: '📻', name: '携帯ラジオ', detail: '受信と電池を確認する。', required: true },
      { id: 'documents', symbol: '📄', name: '書類の控え', detail: '保険・連絡先を防水して保管。', size: 'wide', required: true },
      { id: 'sleep', symbol: '🛏️', name: '就寝補助', detail: '耳栓、アイマスク、簡易マット。', size: 'wide' },
      { id: 'comfort', symbol: '🃏', name: '安心用品', detail: '子どもの玩具など、落ち着きを取り戻す物。' },
    ],
  },
  'cash-docs': {
    label: 'RECOVERY WALLET', title: '復旧ウォレット', subtitle: '停電・通信断でも本人確認と支払いを継続する', accent: '#7b8d59',
    items: [
      { id: 'cash', symbol: '💴', name: '小額紙幣', detail: '高額紙幣だけにせず、分散して保管。', size: 'wide', required: true },
      { id: 'coins', symbol: '🪙', name: '硬貨', detail: '公衆電話や自販機を想定する。', required: true },
      { id: 'identity', symbol: '🪪', name: '身分証控え', detail: '必要部分のみ複写して防水する。', required: true },
      { id: 'insurance', symbol: '🏥', name: '保険情報', detail: '保険証・保険契約の番号を控える。', required: true },
      { id: 'contacts', symbol: '☎️', name: '紙の連絡先', detail: '端末なしで家族・勤務先へ連絡できる。', size: 'wide', required: true },
      { id: 'waterproof', symbol: '🛡️', name: '防水ケース', detail: '中身を入れて口が閉じるか確認する。', required: true },
    ],
  },
  'cooking-water': {
    label: 'FIELD KITCHEN', title: '代替調理ケース', subtitle: '電気・水道を使わず、一食を安全に作る装備', accent: '#b56b3c',
    items: [
      { id: 'stove', symbol: '🔥', name: 'カセットコンロ', detail: '屋内では換気し、周囲の可燃物を離す。', size: 'wide', required: true },
      { id: 'gas', symbol: '🧯', name: 'ガスボンベ', detail: '変形・錆・期限を確認し、高温を避ける。', required: true },
      { id: 'igniter', symbol: '✨', name: '点火具', detail: 'コンロの点火不良に備える。', required: true },
      { id: 'pot', symbol: '🍲', name: '鍋・ふた', detail: '湯せん可能でコンロからはみ出さない物。', size: 'wide', required: true },
      { id: 'gloves', symbol: '🧤', name: '耐熱手袋', detail: '熱い容器を素手で扱わない。', required: true },
      { id: 'bags', symbol: '🥣', name: '耐熱ポリ袋', detail: '食品用・湯せん対応表示を確認する。', required: true },
      { id: 'wipes', symbol: '🧻', name: 'ウェットティッシュ', detail: '食器を洗えない時の衛生維持。', required: true },
      { id: 'meal', symbol: '🍚', name: '試す備蓄食', detail: '一食を実際に作り、水と燃料を記録する。', size: 'wide', required: true },
    ],
  },
};

export function getLoadout(taskId) {
  return PRACTICAL_LOADOUTS[taskId] || null;
}

export function requiredLoadoutItemIds(loadout) {
  return (loadout?.items || []).filter((item) => item.required).map((item) => item.id);
}

export function loadoutStatus(state, taskId) {
  const loadout = getLoadout(taskId);
  const packed = new Set(state.preparedness?.loadouts?.[taskId] || []);
  const required = requiredLoadoutItemIds(loadout);
  const done = required.filter((id) => packed.has(id)).length;
  return { packed, done, total: required.length, ready: Boolean(loadout && required.length && done === required.length) };
}

export function updateLoadout(state, taskId, packedIds) {
  const loadout = getLoadout(taskId);
  if (!loadout) return state;
  const allowed = new Set(loadout.items.map((item) => item.id));
  const packed = [...new Set(packedIds)].filter((id) => allowed.has(id));
  const preparedness = state.preparedness || {};
  const completed = new Set(preparedness.completed || []);
  const required = requiredLoadoutItemIds(loadout);
  if (!required.every((id) => packed.includes(id))) completed.delete(taskId);
  return {
    ...state,
    preparedness: {
      ...preparedness,
      completed: [...completed],
      loadouts: { ...(preparedness.loadouts || {}), [taskId]: packed },
      updatedAt: new Date().toISOString(),
    },
  };
}

export function completeLoadout(state, taskId) {
  const status = loadoutStatus(state, taskId);
  if (!status.ready) return state;
  const completed = new Set(state.preparedness?.completed || []);
  if (completed.has(taskId)) return state;
  completed.add(taskId);
  return { ...state, preparedness: { ...state.preparedness, completed: [...completed], updatedAt: new Date().toISOString() } };
}
