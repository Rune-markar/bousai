export const CHARACTERS = [
  { id: 'akane', name: '風守アカネ', short: 'アカネ', disaster: '強風・台風', tone: '元気でおせっかい', color: '#d86b52', mark: '風', image: 'characters/kazemori-akane.webp', imageAlt: '防災ラジオと固定用ロープを持つ風守アカネ' },
  { id: 'yui', name: '水瀬ユイ', short: 'ユイ', disaster: '雨・洪水', tone: '優しく穏やか', color: '#4d91bd', mark: '水', image: 'characters/minase-yui.webp', imageAlt: 'レインポンチョと防水ポーチを持つ水瀬ユイ' },
  { id: 'riko', name: '地下リコ', short: 'リコ', disaster: '地震・避難', tone: '冷静で的確', color: '#6b6b86', mark: '地', image: 'characters/chika-riko.webp', imageAlt: '避難地図と懐中電灯を持つ地下リコ' },
  { id: 'hikari', name: '灯明ひかり', short: 'ひかり', disaster: '停電・備蓄', tone: '明るく前向き', color: '#d99b37', mark: '灯', image: 'characters/tomyo-hikari.webp', imageAlt: 'ランタンを手にほほえむ灯明ひかり' },
  { id: 'noa', name: '雪見ノア', short: 'ノア', disaster: '大雪・低温', tone: '静かで詩的', color: '#7e8faa', mark: '雪', image: 'characters/yukimi-noa.webp', imageAlt: '保温シートと水筒を持つ雪見ノア' },
];

const voices = {
  akane: { shortage: (item) => `ねえ、${item.name}があと${item.shortage}${item.unit}！ 次の買い物で忘れないでね！`, expiry: (item) => `${item.name}、そろそろ出番だよ。${['food', 'water', 'comfort'].includes(item.category) ? '今週おいしく使っちゃおう！' : '今週使って、新しいものと交換しよう！'}`, ready: () => 'いい感じ！次は避難路を一緒に見直そっか。' },
  yui: { shortage: (item) => `${item.name}が少し足りないみたい。無理のない日に、そっと足しておきましょう。`, expiry: (item) => `${item.name}の期限が近づいています。${['food', 'water', 'comfort'].includes(item.category) ? '今日の食事に使えそうですか？' : '動作を確かめて、必要なら交換しましょう。'}`, ready: () => '備えが整っていますね。安心をゆっくり育てていきましょう。' },
  riko: { shortage: (item) => `${item.name}、不足${item.shortage}${item.unit}。優先度を確認し、補充期限を決めて。`, expiry: (item) => `${item.name}は期限対応が必要。消費か廃棄かを記録して在庫を一致させて。`, ready: () => '在庫は安定。次は集合場所と連絡手段の実効性を確認する。' },
  hikari: { shortage: (item) => `${item.name}をあと${item.shortage}${item.unit}整えたら、もっと安心だよ。一緒にやろう！`, expiry: (item) => `${item.name}を今週使えば、無駄なく次の備えにつながるよ！`, ready: () => '準備ばっちり！今日も安心の輪が光ってるよ。' },
  noa: { shortage: (item) => `${item.name}の空白が、静かに知らせているわ。あと${item.shortage}${item.unit}で輪が閉じる。`, expiry: (item) => `${item.name}の季節が終わる前に、暮らしの中へ戻してあげて。`, ready: () => '静かな準備は、嵐の夜にいちばん強い光になるわ。' },
};

export function getCharacter(id) {
  return CHARACTERS.find((character) => character.id === id) || CHARACTERS.find((character) => character.id === 'hikari');
}

export function buildCharacterAdvice(state, summary) {
  const character = getCharacter(state.selectedCharacter);
  const rows = [...summary.rows].sort((a, b) => ({ high: 0, medium: 1, low: 2, ok: 3 }[a.priority] - ({ high: 0, medium: 1, low: 2, ok: 3 }[b.priority])));
  const expiring = rows.find((item) => item.isExpired || item.isExpiring);
  const shortage = rows.find((item) => item.shortage > 0);
  if (expiring) return { kind: 'expiry', itemId: expiring.id, text: voices[character.id].expiry(expiring), action: '期限を記録する', page: 'inventory' };
  if (shortage) return { kind: 'shortage', itemId: shortage.id, text: voices[character.id].shortage(shortage), action: '補充計画を見る', page: 'inventory' };
  return { kind: 'ready', text: voices[character.id].ready(), action: '防災力を育てる', page: 'roadmap' };
}

export const CONVERSATION_CHOICES = [
  { id: 'done', label: '今日やってみる', delta: 2, replies: { akane: 'よーし、その勢い！終わったらちゃんと自分を褒めてね！', yui: 'うれしいです。小さな一歩で十分ですよ。', riko: '了解。完了したら記録を更新して。', hikari: 'やった！一緒ならきっとできるよ！', noa: 'その一歩が、未来の静けさを守るわ。' } },
  { id: 'later', label: '今週中にやる', delta: 1, replies: { akane: '約束ね！忘れそうなら補充期限も入れとこ！', yui: '予定に入れておけば安心ですね。', riko: '期限を決めたなら実行可能。', hikari: 'うん、焦らなくて大丈夫。予定にしておこう！', noa: '日を決めれば、曖昧な不安は計画に変わるわ。' } },
  { id: 'help', label: 'どうすればいい？', delta: 1, replies: { akane: 'まず一個だけ！いちばん近いお店で買える物からね。', yui: '画面の「次の行動」を一つだけ選んでみましょう。', riko: '不足数、期限、購入先の順に決めればいい。', hikari: '大丈夫！補充計画の一番上から始めよう。', noa: '迷ったら、水と灯り。命に近いものから整えて。' } },
];

export function respondToCharacter(state, choiceId) {
  const character = getCharacter(state.selectedCharacter);
  const choice = CONVERSATION_CHOICES.find((item) => item.id === choiceId) || CONVERSATION_CHOICES[2];
  const affinity = { ...(state.characterAffinity || {}) };
  affinity[character.id] = Math.min(100, Math.max(0, Number(affinity[character.id]) || 0) + choice.delta);
  return {
    state: { ...state, characterAffinity: affinity, dialogueLog: [{ id: `${Date.now()}-${choice.id}`, characterId: character.id, choiceId: choice.id, at: new Date().toISOString() }, ...(state.dialogueLog || [])].slice(0, 100) },
    reply: choice.replies[character.id],
  };
}
