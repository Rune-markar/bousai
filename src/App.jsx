import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Bell, BookOpen, Box, CalendarDays,
  Check, ChevronRight, CircleHelp, ClipboardList, Copy, Droplets, Flame, Heart,
  Download, History, Home, Lightbulb, MapPin, Minus, PackagePlus, Pencil, Phone,
  Plus, QrCode, RefreshCw, Search, ShieldCheck, ShoppingBasket, Sparkles, Trash2, Upload, Users, WifiOff, X, Zap,
} from 'lucide-react';
import { CATEGORY_META, consumeByRotation, inventorySummary, uid } from './domain.js';
import BarcodeScanner from './BarcodeScanner.jsx';
import { createTransaction, loadState, normalizeState, STORAGE_KEY } from './state.js';

const nav = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'inventory', label: '備蓄', icon: Box },
  { id: 'plan', label: '緊急メモ', icon: ClipboardList },
  { id: 'learn', label: '知る', icon: BookOpen },
];

const emptyForm = { name: '', category: 'food', tier: 1, unit: '個', quantity: 1, target: 3, price: 0, expiry: '', note: '', barcode: '', brand: '', packageSize: '', imageUrl: '', source: '', sourceUrl: '', rotationEnabled: true, rotationLeadDays: 30 };

function Brand() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span><b>そなえメモ</b><small>暮らしに、ちいさな安心を。</small></span></div>;
}

function App() {
  const [state, setState] = useState(loadState);
  const [page, setPage] = useState('home');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const summary = useMemo(() => inventorySummary(state.inventory, state.household), [state.inventory, state.household]);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    const ready = () => setToast('オフライン利用の準備ができました');
    window.addEventListener('sonae-offline-ready', ready);
    return () => window.removeEventListener('sonae-offline-ready', ready);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateInventory = (inventory, message, transaction = null) => {
    setState((old) => ({ ...old, inventory, transactions: transaction ? [transaction, ...old.transactions].slice(0, 500) : old.transactions }));
    if (message) setToast(message);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {nav.map(({ id, label, icon: Icon }) => <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <div className="header-actions">{!online && <span className="offline-badge"><WifiOff />オフライン</span>}<button className="notification-button share-button" aria-label="アクセス用QRコードを開く" onClick={() => setShareOpen(true)}><QrCode size={20} /></button><button className="notification-button" aria-label="通知一覧を開く" onClick={() => setNotificationsOpen(true)}><Bell size={20} /><span>{summary.shortageCount + summary.expiringCount + summary.checkDueCount}</span></button></div>
      </header>

      <main>
        {page === 'home' && <Dashboard state={state} summary={summary} setState={setState} setPage={setPage} setModal={setModal} />}
        {page === 'inventory' && <Inventory state={state} summary={summary} transactions={state.transactions} setModal={setModal} updateInventory={updateInventory} setState={setState} setToast={setToast} />}
        {page === 'plan' && <EmergencyPlan contact={state.contact} setState={setState} setToast={setToast} />}
        {page === 'learn' && <Learn completed={state.completedTips} setState={setState} />}
      </main>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション">
        {nav.map(({ id, label, icon: Icon }) => <button className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={21} /><span>{label}</span></button>)}
      </nav>

      {modal && <ItemModal item={modal === 'new' ? null : modal} inventory={state.inventory} onClose={() => setModal(null)} onSave={(form) => {
        const { registrationMode, ...values } = form;
        let inventory;
        let transaction;
        if (modal === 'new' && registrationMode === 'merge' && values.barcode && state.inventory.some((entry) => entry.barcode === values.barcode)) {
          const existing = state.inventory.find((entry) => entry.barcode === values.barcode);
          inventory = state.inventory.map((entry) => entry.id === existing.id ? { ...entry, quantity: entry.quantity + values.quantity, lastChecked: values.lastChecked || entry.lastChecked } : entry);
          transaction = createTransaction('add', existing, values.quantity, '同一バーコードの商品へ補充');
        } else if (modal === 'new') {
          const created = { ...values, id: uid(), productId: values.barcode ? `gtin:${values.barcode}` : `manual:${uid()}` };
          inventory = [...state.inventory, created];
          transaction = createTransaction('add', created, created.quantity, values.barcode ? 'バーコードから登録' : '手入力で登録');
        } else {
          inventory = state.inventory.map((entry) => entry.id === modal.id ? { ...entry, ...values } : entry);
          transaction = createTransaction('edit', { ...modal, ...values }, values.quantity - modal.quantity, '備蓄情報を編集');
        }
        updateInventory(inventory, modal === 'new' ? '備蓄品を追加しました' : '変更を保存しました', transaction);
        setModal(null);
      }} />}
      {notificationsOpen && <NotificationPanel summary={summary} onClose={() => setNotificationsOpen(false)} onOpenItem={(item) => { setNotificationsOpen(false); setModal(item); }} />}
      {shareOpen && <ShareQrPanel onClose={() => setShareOpen(false)} setToast={setToast} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Dashboard({ state, summary, setState, setPage, setModal }) {
  const priorityOrder = { high: 0, medium: 1, low: 2, ok: 3 };
  const alerts = summary.rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue).sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 3);
  const scoreLabel = summary.score >= 90 ? '安心マスター' : summary.score >= 70 ? 'そなえ上手' : summary.score >= 45 ? '準備中' : 'はじめの一歩';
  return <>
    <section className="hero wrap">
      <div>
        <div className="eyebrow"><span />今日のそなえ状況</div>
        <h1>おかえりなさい。<br /><em>安心の輪</em>が育っています。</h1>
        <p>完璧じゃなくて大丈夫。足りないものを、ひとつずつ整えていきましょう。</p>
      </div>
      <CharacterBubble shortage={summary.shortageCount} />
    </section>

    <section className="score-grid wrap">
      <article className="card readiness-card">
        <div className="card-heading"><div><span className="kicker">TOTAL READINESS</span><h2>わが家の備蓄力</h2></div><span className="rank"><BadgeCheck size={16} />{scoreLabel}</span></div>
        <div className="readiness-body">
          <ScoreRing score={summary.score} />
          <div className="readiness-copy"><strong>{summary.score >= 70 ? 'かなり整ってきました！' : 'あと少し、育てていこう。'}</strong><p>今は家族{state.household}人で、水が約<b>{summary.waterDays}日分</b>。目標に近づくほど輪が完成します。</p><button className="text-button" onClick={() => setPage('inventory')}>不足を確認する <ArrowRight size={16} /></button></div>
        </div>
      </article>
      <article className="card radar-card">
        <div className="card-heading"><div><span className="kicker">BALANCE</span><h2>備えのバランス</h2></div><CircleHelp size={18} className="muted" /></div>
        <RadarChart values={summary.categoryScores} />
      </article>
    </section>

    <section className="wrap section-block">
      <div className="section-heading"><div><span className="kicker">NEXT ACTION</span><h2>今週、やっておきたいこと</h2></div><button className="text-button" onClick={() => setPage('inventory')}>すべて見る <ChevronRight size={16} /></button></div>
      <div className="action-grid">
        <article className="action-card primary"><div className="action-icon"><ShoppingBasket /></div><div><span className="pill warm">要補充 {summary.shortageCount}件</span><h3>不足しているものを補充</h3><p>合計の目安は <b>¥{summary.replenishmentCost.toLocaleString()}</b> です</p></div><button aria-label="備蓄を開く" onClick={() => setPage('inventory')}><ArrowRight /></button></article>
        <article className="action-card"><div className="action-icon amber"><CalendarDays /></div><div><span className="pill">期限チェック</span><h3>{summary.expiringCount ? `${summary.expiringCount}品目が期限間近です` : '期限は問題ありません'}</h3><p>ローリングストックでおいしく消費</p></div><button aria-label="期限を確認" onClick={() => setPage('inventory')}><ArrowRight /></button></article>
        <article className="action-card"><div className="action-icon green"><PackagePlus /></div><div><span className="pill green-pill">かんたん登録</span><h3>買ったものを追加</h3><p>数量と期限をメモしておきましょう</p></div><button aria-label="備蓄を追加" onClick={() => setModal('new')}><Plus /></button></article>
      </div>
    </section>

    <section className="wrap section-block two-column">
      <article className="card alert-panel">
        <div className="section-heading compact"><div><span className="kicker">ALERTS</span><h2>気になる備蓄</h2></div><AlertTriangle size={20} /></div>
        {alerts.length ? alerts.map((item) => <button className="alert-row" key={item.id} onClick={() => setModal(item)}><span className={`status-dot ${item.isExpiring || item.isCheckDue ? 'amber' : 'red'}`} /><span><b>{item.name}</b><small>{item.isExpired ? '期限が切れています' : item.isExpiring ? `期限まで${item.daysToExpiry}日` : item.isCheckDue ? '棚卸し確認日を過ぎています' : `${item.shortage}${item.unit}不足しています`}</small></span><ChevronRight /></button>) : <div className="empty-small"><Check />気になる備蓄はありません</div>}
      </article>
      <article className="card family-card">
        <div className="family-visual"><Users /><span>{state.household}</span></div>
        <div><span className="kicker">HOUSEHOLD</span><h2>家族に合わせた目標</h2><p>人数を変えると、水の備蓄日数を再計算します。</p><div className="stepper"><button onClick={() => setState((s) => ({ ...s, household: Math.max(1, s.household - 1) }))}><Minus /></button><b>{state.household} 人</b><button onClick={() => setState((s) => ({ ...s, household: Math.min(12, s.household + 1) }))}><Plus /></button></div></div>
      </article>
    </section>
  </>;
}

function CharacterBubble({ shortage }) {
  return <div className="character-wrap" aria-label="灯明ひかりからのメッセージ">
    <div className="speech"><span>灯明ひかり</span><b>{shortage ? `あと${shortage}つ整えたら、もっと安心だよ。` : '準備ばっちり！今日も安心だね。'}</b><small>一緒に、ゆっくり続けよう。</small></div>
    <div className="character-portrait"><img src="/characters/tomyo-hikari.png" alt="ランタンを手にほほえむ防災ナビゲーター、灯明ひかり" /></div>
  </div>;
}

function ScoreRing({ score }) {
  const radius = 70; const circumference = 2 * Math.PI * radius;
  return <div className="score-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r={radius} /><circle className="progress" cx="90" cy="90" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - score / 100) }} /></svg><div><b>{score}</b><span>%</span><small>充足率</small></div></div>;
}

function RadarChart({ values }) {
  const points = values.map((value, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / values.length;
    const r = 60 * value.score / 100;
    return `${90 + Math.cos(angle) * r},${83 + Math.sin(angle) * r}`;
  }).join(' ');
  const rings = [20, 40, 60].map((r) => values.map((_, index) => { const a = -Math.PI / 2 + index * Math.PI * 2 / values.length; return `${90 + Math.cos(a) * r},${83 + Math.sin(a) * r}`; }).join(' '));
  return <div className="radar"><svg viewBox="0 0 180 170">{rings.map((p, i) => <polygon points={p} key={i} className="radar-ring" />)}{values.map((_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / values.length; return <line key={i} x1="90" y1="83" x2={90 + Math.cos(a) * 60} y2={83 + Math.sin(a) * 60} />; })}<polygon points={points} className="radar-value" />{values.map((value, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / values.length; return <text key={value.key} x={90 + Math.cos(a) * 76} y={87 + Math.sin(a) * 72} textAnchor="middle">{CATEGORY_META[value.key].label}</text>; })}</svg></div>;
}

function Inventory({ state, summary, transactions, setModal, updateInventory, setState, setToast }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const importRef = useRef(null);
  const rows = summary.rows.filter((item) => (filter === 'all' || item.category === filter) && item.name.toLowerCase().includes(query.toLowerCase()));
  const rawRows = () => summary.rows.map(({ shortage, ratio, replenishmentCost, daysToExpiry, isExpiring, isExpired, daysToCheck, isCheckDue, priority, ...item }) => item);
  const adjust = (id, delta) => {
    const item = summary.rows.find((entry) => entry.id === id);
    if (delta < 0 && item.quantity <= 0) return;
    const nextQuantity = Math.max(0, Number(item.quantity) + delta);
    const inventory = rawRows().map((entry) => entry.id === id ? { ...entry, quantity: nextQuantity, lastChecked: new Date().toISOString().slice(0, 10) } : entry);
    updateInventory(inventory, delta > 0 ? '1つ補充しました' : '1つ消費しました', createTransaction(delta > 0 ? 'add' : 'consume', item, delta, delta > 0 ? 'クイック補充' : 'クイック消費'));
  };
  const remove = (id) => {
    const item = summary.rows.find((entry) => entry.id === id);
    if (window.confirm('この期限ロットを削除しますか？履歴には削除記録が残ります。')) updateInventory(rawRows().filter((entry) => entry.id !== id), '備蓄品を削除しました', createTransaction('delete', item, -item.quantity, '期限ロットを削除'));
  };
  const rotateOne = (entry) => {
    const result = consumeByRotation(rawRows(), entry.key, 1);
    const consumed = result.consumed[0];
    if (!consumed) return;
    const note = `${consumed.item.expiry || '期限未設定'}のロットから先入れ先出し。補充分を買い足し計画へ反映`;
    updateInventory(result.inventory, `${consumed.item.name}を消費し、買い足し候補へ反映しました`, createTransaction('rotate', consumed.item, -1, note));
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sonae-note-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = normalizeState(JSON.parse(await file.text()));
      if (!window.confirm(`${imported.inventory.length}件の備蓄を読み込み、現在のデータを置き換えますか？`)) return;
      setState(imported);
      setToast('バックアップを復元しました');
    } catch {
      setToast('バックアップファイルを読み込めませんでした');
    }
  };
  return <section className="wrap page-section">
    <div className="page-title"><div><span className="kicker">MY STOCKPILE</span><h1>わが家の備蓄</h1><p>不足も期限も、ここでひと目に。</p></div><div className="page-actions"><button className="secondary-button" onClick={exportData}><Download />バックアップ</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload />復元</button><input ref={importRef} hidden type="file" accept="application/json" onChange={importData} /><button className="primary-button" onClick={() => setModal('new')}><Plus />備蓄品を追加</button></div></div>
    <div className="summary-strip"><div><span>備蓄力</span><b>{summary.score}%</b></div><div><span>不足品</span><b>{summary.shortageCount}品</b></div><div><span>期限間近</span><b>{summary.expiringCount}品</b></div><div><span>補充費用</span><b>¥{summary.replenishmentCost.toLocaleString()}</b></div></div>
    <div className="inventory-tools"><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="備蓄品を検索" /></label><div className="filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>すべて</button>{Object.entries(CATEGORY_META).map(([key, value]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{value.label}</button>)}</div></div>
    <div className="inventory-list">
      {rows.map((item) => <article className="inventory-item" key={item.id}>
        {item.imageUrl ? <div className="product-thumb"><img src={item.imageUrl} alt="" /></div> : <div className="category-badge" style={{ '--category': CATEGORY_META[item.category]?.color }}><CategoryIcon category={item.category} /></div>}
        <div className="item-main"><div className="item-title"><span className={`tier tier-${item.tier}`}>TIER {item.tier}</span><h3>{item.name}</h3>{item.brand && <span className="brand-tag">{item.brand}</span>}{item.isExpiring && <span className="expiry-tag">{item.isExpired ? '期限切れ' : `あと${item.daysToExpiry}日`}</span>}</div><div className="stock-progress"><span style={{ width: `${Math.min(item.ratio * 100, 100)}%` }} /><i style={{ left: `${Math.min(item.ratio * 100, 100)}%` }} /></div><div className="item-meta"><span>在庫 <b>{item.quantity}{item.unit}</b> / 目標 {item.target}{item.unit}{item.barcode && <small>・JAN {item.barcode}</small>}</span>{item.shortage > 0 ? <span className="shortage">あと {item.shortage}{item.unit}</span> : <span className="enough"><Check /> 目標達成</span>}</div></div>
        <div className="quick-actions"><button aria-label={`${item.name}を1つ消費`} onClick={() => adjust(item.id, -1)}><Minus /></button><button aria-label={`${item.name}を1つ補充`} onClick={() => adjust(item.id, 1)}><Plus /></button><button aria-label={`${item.name}を編集`} onClick={() => setModal(item)}><Pencil /></button><button aria-label={`${item.name}を削除`} className="danger" onClick={() => remove(item.id)}><Trash2 /></button></div>
      </article>)}
      {!rows.length && <div className="empty-state"><Search /><h3>該当する備蓄品がありません</h3><p>検索条件を変えてみてください。</p></div>}
    </div>
    <article className="card rolling-panel"><div className="section-heading compact"><div><span className="kicker">ROLLING STOCK</span><h2>ローリングストック</h2><p>期限の近いロットから消費し、不足分を補充計画へ自動反映します。</p></div><RefreshCw /></div><div className="rolling-summary"><span><small>循環待ち</small><b>{summary.rotationDueCount}品</b></span><span><small>期限付き在庫</small><b>{summary.rotationQueue.length}品</b></span><span><small>補充候補</small><b>{summary.shortageCount}品</b></span></div>{summary.rotationQueue.length ? <div className="rolling-list">{summary.rotationQueue.slice(0, 6).map((entry) => <div className={`rolling-row ${entry.status}`} key={entry.key}><span className="rolling-order">{entry.status === 'expired' ? '期限切れ' : entry.daysToRotate <= 0 ? '今すぐ循環' : `${entry.daysToRotate}日後`}</span><span><b>{entry.nextLot.name}</b><small>期限 {entry.nextLot.expiry}・対象ロット {entry.nextLot.quantity}{entry.nextLot.unit}・合計 {entry.totalQuantity}{entry.nextLot.unit}</small></span><button type="button" onClick={() => rotateOne(entry)}><RefreshCw />1{entry.nextLot.unit}消費して買い足す</button></div>)}</div> : <div className="empty-small"><Check />期限を登録すると循環予定を自動作成します</div>}</article>
    <div className="operations-grid">
      <article className="card operation-panel"><div className="section-heading compact"><div><span className="kicker">REPLENISHMENT</span><h2>補充計画</h2></div><ShoppingBasket /></div>{summary.replenishmentPlan.length ? summary.replenishmentPlan.map((item) => <button key={item.id} className="plan-row" onClick={() => setModal(item)}><span className={`tier tier-${item.tier}`}>TIER {item.tier}</span><span><b>{item.name}</b><small>{item.shortage}{item.unit}補充・目安 ¥{item.replenishmentCost.toLocaleString()}</small></span><ChevronRight /></button>) : <div className="empty-small"><Check />補充予定はありません</div>}</article>
      <article className="card operation-panel"><div className="section-heading compact"><div><span className="kicker">HISTORY</span><h2>入出庫履歴</h2></div><History /></div>{transactions.length ? transactions.slice(0, 8).map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'rotate' ? '循環' : entry.type === 'consume' ? '消費' : entry.type === 'delete' ? '削除' : entry.type === 'edit' ? '編集' : '入庫'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}{entry.unit}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">操作すると履歴が記録されます</div>}</article>
    </div>
  </section>;
}

function CategoryIcon({ category }) {
  return category === 'water' ? <Droplets /> : category === 'heat' ? <Flame /> : category === 'light' ? <Zap /> : category === 'comfort' ? <Heart /> : category === 'hygiene' ? <Sparkles /> : <ShoppingBasket />;
}

function EmergencyPlan({ contact, setState, setToast }) {
  const [draft, setDraft] = useState(contact);
  useEffect(() => setDraft(contact), [contact]);
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  return <section className="wrap page-section narrow-page"><div className="page-title"><div><span className="kicker">EMERGENCY NOTE</span><h1>もしもの時のメモ</h1><p>通信が不安定でも、この端末から確認できます。</p></div></div>
    <div className="emergency-banner"><ShieldCheck /><div><b>家族で一度、声に出して確認しよう</b><span>集合場所と連絡方法が決まっているだけで、もしもの不安は小さくできます。</span></div></div>
    <form className="card plan-form" onSubmit={(e) => { e.preventDefault(); setState((old) => ({ ...old, contact: draft })); setToast('緊急メモを端末に保存しました'); }}>
      <label><span><Users />メモの名前</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label><span><MapPin />避難・集合場所</span><input value={draft.shelter} onChange={(e) => set('shelter', e.target.value)} placeholder="例：〇〇小学校 体育館" /></label>
      <label><span><Phone />緊急連絡先</span><input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="例：090-0000-0000" inputMode="tel" /></label>
      <label><span><ClipboardList />家族への伝言・連絡ルール</span><textarea value={draft.note} onChange={(e) => set('note', e.target.value)} rows="5" /></label>
      <button className="primary-button" type="submit"><Check />この端末に保存</button>
    </form>
    <div className="offline-note"><Zap /><div><b>初回表示後はオフラインでも確認できます</b><span>アプリ本体と入力済みデータをこの端末に保存します。商品情報の新規照会には通信が必要です。</span></div></div>
  </section>;
}

function useDialogClose(onClose, dialogRef) {
  useEffect(() => {
    const previousFocus = document.activeElement;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getDialog = () => dialogRef.current || document.querySelector('[role="dialog"]');
    const frame = window.requestAnimationFrame(() => getDialog()?.querySelector('[autofocus], button, input, select, textarea, [href]')?.focus());
    const handleKey = (event) => {
      if (event.key === 'Escape') return onClose();
      const dialog = getDialog();
      if (event.key !== 'Tab' || !dialog) return;
      const elements = [...dialog.querySelectorAll(selector)].filter((element) => !element.hidden);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus?.();
    };
  }, [onClose, dialogRef]);
}

function ShareQrPanel({ onClose, setToast }) {
  const dialogRef = useRef(null);
  const [url, setUrl] = useState(() => window.location.origin);
  const [suggestions, setSuggestions] = useState([]);
  const [qrImage, setQrImage] = useState('');
  const [error, setError] = useState('');
  useDialogClose(onClose, dialogRef);

  useEffect(() => {
    let active = true;
    fetch('/api/access-info', { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((info) => {
        if (!active) return;
        setSuggestions(info.urls || []);
        if (info.primary) setUrl(info.primary);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setQrImage('');
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      setError('');
      import('qrcode').then((module) => (module.default || module).toDataURL(parsed.href, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#153e38ff', light: '#fffdf8ff' },
      })).then((image) => active && setQrImage(image)).catch(() => active && setError('QRコードを生成できませんでした。'));
    } catch {
      setError('http:// または https:// で始まるURLを入力してください。');
    }
    return () => { active = false; };
  }, [url]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement('textarea');
      area.value = url;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setToast('アクセスURLをコピーしました');
  };
  const downloadQr = () => {
    if (!qrImage) return;
    const link = document.createElement('a');
    link.href = qrImage;
    link.download = 'sonae-note-access-qr.png';
    link.click();
    setToast('QRコード画像を保存しました');
  };
  const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
  const isLoopback = /^(localhost|127\.0\.0\.1|::1)$/i.test(host);

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="qr-panel" role="dialog" aria-modal="true" aria-labelledby="qr-panel-title">
    <div className="modal-title"><div><span className="kicker">QUICK ACCESS</span><h2 id="qr-panel-title">アクセス用QRコード</h2></div><button type="button" aria-label="QRコードを閉じる" onClick={onClose}><X /></button></div>
    <div className="qr-layout">
      <div className="qr-preview">{qrImage ? <img src={qrImage} alt={`${url}を開くQRコード`} /> : <div className="qr-loading"><QrCode />{error || '生成しています…'}</div>}</div>
      <div className="qr-settings">
        <p>スマートフォンのカメラで読み取ると、このアプリをすぐに開けます。</p>
        <label><span>QRコードにするURL</span><input aria-label="QRコードにするURL" value={url} onChange={(event) => setUrl(event.target.value.trim())} inputMode="url" /></label>
        {suggestions.length > 1 && <div className="access-suggestions"><span>利用可能な候補</span>{suggestions.map((candidate) => <button type="button" className={candidate === url ? 'active' : ''} key={candidate} onClick={() => setUrl(candidate)}>{candidate}</button>)}</div>}
        {isLoopback && <div className="qr-warning"><AlertTriangle />localhostは他の端末から開けません。LANアドレスまたは公開URLを選んでください。</div>}
        {!isLoopback && url.startsWith('http:') && <div className="qr-note">同じWi-Fi内で利用できます。外出先からのアクセスやスマートフォンのカメラ読取機能にはHTTPS公開URLを推奨します。</div>}
        <div className="qr-actions"><button type="button" className="secondary-button" onClick={copyUrl}><Copy />URLをコピー</button><button type="button" className="primary-button" onClick={downloadQr} disabled={!qrImage}><Download />QR画像を保存</button></div>
      </div>
    </div>
  </section></div>;
}

function NotificationPanel({ summary, onClose, onOpenItem }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const notifications = summary.rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue).sort((a, b) => a.tier - b.tier || a.ratio - b.ratio);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="modal-title"><div><span className="kicker">NOTIFICATIONS</span><h2 id="notification-title">備蓄のお知らせ</h2></div><button type="button" aria-label="通知一覧を閉じる" onClick={onClose}><X /></button></div>{notifications.length ? notifications.map((item) => <button className="notification-row" key={item.id} onClick={() => onOpenItem(item)}><span className={`status-dot ${item.isExpiring || item.isCheckDue ? 'amber' : 'red'}`} /><span><b>{item.name}</b><small>{item.isExpired ? '期限切れです' : item.isExpiring ? `期限まで${item.daysToExpiry}日` : item.isCheckDue ? '棚卸し確認日を過ぎています' : `${item.shortage}${item.unit}不足しています`}</small></span><ChevronRight /></button>) : <div className="empty-small"><Check />現在のお知らせはありません</div>}</section></div>;
}

const tips = [
  { id: 'water', icon: Droplets, title: '水は「1人1日3リットル」が目安', text: '飲料水だけでなく、調理にも水を使います。まずは3日分から、余裕があれば7日分へ。' },
  { id: 'toilet', icon: Sparkles, title: '食料より先に、携帯トイレ？', text: '断水すると自宅のトイレが使えないことも。人数×1日5回×日数を目安に備えましょう。' },
  { id: 'rolling', icon: ShoppingBasket, title: 'いつもの食事を少し多めに', text: '食べ慣れたものを使いながら買い足す「ローリングストック」なら、無理なく続きます。' },
  { id: 'light', icon: Lightbulb, title: '寝室には灯りと靴を', text: '停電や割れたガラスに備えて、懐中電灯と底の厚い履き物を手の届く場所へ。' },
];

function Learn({ completed, setState }) {
  return <section className="wrap page-section"><div className="page-title"><div><span className="kicker">SMALL KNOWLEDGE</span><h1>今日からできる、小さな備え</h1><p>知ることも、立派な防災です。</p></div><span className="learn-count">{completed.length} / {tips.length} 読了</span></div>
    <div className="tips-grid">{tips.map(({ id, icon: Icon, title, text }, index) => { const done = completed.includes(id); return <article className={`tip-card ${done ? 'done' : ''}`} key={id}><div className="tip-number">0{index + 1}</div><span className="tip-icon"><Icon /></span><h2>{title}</h2><p>{text}</p><button onClick={() => setState((old) => ({ ...old, completedTips: done ? old.completedTips.filter((x) => x !== id) : [...old.completedTips, id] }))}>{done ? <><Check /> 読了済み</> : <>読んだ <ArrowRight /></>}</button></article>; })}</div>
  </section>;
}

function ItemModal({ item, inventory, onClose, onSave }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const [form, setForm] = useState(item ? { name: item.name, category: item.category, tier: item.tier, unit: item.unit, quantity: item.quantity, target: item.target, price: item.price, expiry: item.expiry, note: item.note || '', barcode: item.barcode || '', brand: item.brand || '', packageSize: item.packageSize || '', volumeMl: item.volumeMl || 0, imageUrl: item.imageUrl || '', source: item.source || '', sourceUrl: item.sourceUrl || '', location: item.location || '', lastChecked: item.lastChecked || '', nextCheck: item.nextCheck || '', rotationEnabled: item.rotationEnabled !== false, rotationLeadDays: item.rotationLeadDays || 30, registrationMode: 'new-lot' } : { ...emptyForm, lastChecked: new Date().toISOString().slice(0, 10), nextCheck: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), registrationMode: 'new-lot' });
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const duplicate = !item && form.barcode ? inventory.find((entry) => entry.barcode === form.barcode) : null;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, tier: Number(form.tier), quantity: Number(form.quantity), target: Number(form.target), price: Number(form.price), volumeMl: Number(form.volumeMl) || 0, rotationLeadDays: Number(form.rotationLeadDays) || 30 }); }}>
    <div className="modal-title"><div><span className="kicker">STOCK ITEM</span><h2 id="item-modal-title">{item ? '備蓄品を編集' : '備蓄品を追加'}</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    <BarcodeScanner initialProduct={form.barcode && form.name ? form : null} localProducts={inventory} onBarcode={(barcode) => set('barcode', barcode)} onProduct={(product) => setForm((old) => ({ ...old, ...product, registrationMode: !item && inventory.some((entry) => entry.barcode === product.barcode) ? 'merge' : old.registrationMode, note: old.note || [product.brand, product.packageSize].filter(Boolean).join(' / ') }))} />
    {duplicate && <fieldset className="duplicate-choice"><legend>登録済みの商品です</legend><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'merge'} onChange={() => set('registrationMode', 'merge')} />既存在庫「{duplicate.name}」へ数量を追加</label><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'new-lot'} onChange={() => set('registrationMode', 'new-lot')} />別の賞味期限ロットとして追加</label></fieldset>}
    <label className="full"><span>品目名</span><input required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例：飲料水 500ml" /></label>
    <div className="form-grid"><label><span>カテゴリ</span><select value={form.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATEGORY_META).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><label><span>重要度</span><select value={form.tier} onChange={(e) => set('tier', e.target.value)}><option value="1">Tier 1・生存必須</option><option value="2">Tier 2・継続生活</option><option value="3">Tier 3・快適性</option></select></label></div>
    <div className="form-grid three"><label><span>在庫数</span><input required min="0" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label><label><span>目標数</span><input required min="0" type="number" value={form.target} onChange={(e) => set('target', e.target.value)} /></label><label><span>単位</span><input required value={form.unit} onChange={(e) => set('unit', e.target.value)} /></label></div>
    <div className="form-grid"><label><span>期限（任意）</span><input type="date" value={form.expiry} onChange={(e) => set('expiry', e.target.value)} /></label><label><span>単価（円）</span><input min="0" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} /></label></div>
    {form.category === 'water' && <label className="full"><span>1単位あたりの水量（ml）</span><input min="0" type="number" value={form.volumeMl} onChange={(e) => set('volumeMl', e.target.value)} /></label>}
    <div className="form-grid"><label><span>保管場所</span><input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="例：玄関収納" /></label><label><span>次回確認日</span><input type="date" value={form.nextCheck} onChange={(e) => set('nextCheck', e.target.value)} /></label></div>
    <fieldset className="rotation-settings"><legend>ローリングストック設定</legend><label className="rotation-toggle"><input type="checkbox" checked={form.rotationEnabled} onChange={(e) => set('rotationEnabled', e.target.checked)} />期限順の消費候補に含める</label><label><span>期限の何日前から消費候補にするか</span><input type="number" min="0" max="365" value={form.rotationLeadDays} onChange={(e) => set('rotationLeadDays', e.target.value)} /></label></fieldset>
    <label className="full"><span>メモ</span><input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="保管場所や使い方など" /></label>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit"><Check />保存する</button></div>
  </form></div>;
}

export default App;
