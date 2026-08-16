import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Award, Backpack, BadgeCheck, Bell, BookOpen, Box, CalendarDays,
  Check, ChevronRight, CircleHelp, ClipboardList, Copy, Droplets, Flame, Heart,
  Download, History, Home, Lightbulb, LockKeyhole, MapPin, Minus, PackagePlus, Pencil, Phone,
  Plus, QrCode, Radio, RefreshCw, Route, Search, ShieldCheck, ShoppingBasket, Sparkles, Sun, Trash2, Trophy, Upload, Users, WifiOff, X, Zap,
} from 'lucide-react';
import { CATEGORY_META, consumeByRotation, FOOD_GRAMS_PER_PERSON_DAY, inventorySummary, transactionInsights, uid, WATER_ML_PER_PERSON_DAY } from './domain.js';
import BarcodeScanner from './BarcodeScanner.jsx';
import PowerEcosystem from './PowerEcosystem.jsx';
import PracticalLoadout from './PracticalLoadout.jsx';
import { createTransaction, loadState, normalizeState, STORAGE_KEY } from './state.js';
import { defensePower, preparednessProgress, togglePreparednessTask } from './preparedness.js';
import { completeLoadout, getLoadout, loadoutStatus, updateLoadout } from './loadouts.js';
import { updateBagSettings } from './packing.js';
import { buildCharacterAdvice, CHARACTERS, CONVERSATION_CHOICES, getCharacter, respondToCharacter } from './characters.js';
import { DISASTER_SCENARIOS, generateEmergencyPlan, simulateDisaster } from './emergency.js';

const nav = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'inventory', label: '備蓄', icon: Box },
  { id: 'roadmap', label: '防災力', icon: Route },
  { id: 'plan', label: '緊急メモ', icon: ClipboardList },
  { id: 'learn', label: '知る', icon: BookOpen },
];
const pageIds = new Set([...nav.map(({ id }) => id), 'power']);
const pageFromLocation = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return pageIds.has(id) ? id : 'home';
};

const emptyForm = { name: '', category: 'food', tier: 1, unit: '個', quantity: 1, target: 3, price: 0, expiry: '', note: '', barcode: '', brand: '', packageSize: '', volumeMl: 0, foodWeightG: 0, packingVolumeMl: 0, imageUrl: '', source: '', sourceUrl: '', rotationEnabled: true, rotationLeadDays: 30, replenishmentPriority: 'high', replenishBy: '', purchaseFrom: '' };

function Brand() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span><b>そなえメモ</b><small>暮らしに、ちいさな安心を。</small></span></div>;
}

function App() {
  const [state, setState] = useState(loadState);
  const [page, setPageState] = useState(pageFromLocation);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const summary = useMemo(() => inventorySummary(state.inventory, state.household), [state.inventory, state.household]);
  const visitChecked = useRef(false);
  const powerEntryRef = useRef(null);
  const mainRef = useRef(null);
  const previousPageRef = useRef(page);

  const setPage = useCallback((nextPage, { replace = false } = {}) => {
    if (!pageIds.has(nextPage)) return;
    const nextHash = `#/${nextPage}`;
    if (window.location.hash !== nextHash) window.history[replace ? 'replaceState' : 'pushState']({ sonaePage: nextPage }, '', nextHash);
    setPageState(nextPage);
  }, []);

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
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [page]);
  useEffect(() => {
    if (!window.location.hash || !pageIds.has(window.location.hash.replace(/^#\/?/, ''))) setPage('home', { replace: true });
    const syncPage = () => setPageState(pageFromLocation());
    window.addEventListener('popstate', syncPage);
    window.addEventListener('hashchange', syncPage);
    return () => {
      window.removeEventListener('popstate', syncPage);
      window.removeEventListener('hashchange', syncPage);
    };
  }, [setPage]);
  useEffect(() => {
    const className = 'power-document-active';
    const active = page === 'power';
    document.documentElement.classList.toggle(className, active);
    document.body.classList.toggle(className, active);
    return () => {
      document.documentElement.classList.remove(className);
      document.body.classList.remove(className);
    };
  }, [page]);
  useEffect(() => {
    const previousPage = previousPageRef.current;
    previousPageRef.current = page;
    if (previousPage === page) return;
    if (page === 'home' && previousPage === 'power') {
      powerEntryRef.current?.focus();
      return;
    }
    if (page === 'power') return;
    const frame = window.requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page]);
  useEffect(() => {
    if (visitChecked.current) return;
    visitChecked.current = true;
    const last = state.lastVisitAt ? new Date(state.lastVisitAt).getTime() : 0;
    const hours = last ? (Date.now() - last) / 3600000 : 0;
    if (hours >= 12 && summary.notificationCount && 'Notification' in window && Notification.permission === 'granted') {
      const advice = buildCharacterAdvice(state, summary);
      new Notification(`${getCharacter(state.selectedCharacter).name}からのお知らせ`, { body: advice.text, icon: `${import.meta.env.BASE_URL}favicon.svg` });
    }
    setState((old) => ({ ...old, lastVisitAt: new Date().toISOString() }));
  }, []);

  const updateInventory = (inventory, message, transaction = null) => {
    setState((old) => ({ ...old, inventory, transactions: transaction ? [transaction, ...old.transactions].slice(0, 500) : old.transactions }));
    if (message) setToast(message);
  };
  const replenishShortage = (item) => {
    const amount = Math.max(0, Number(item.shortage) || 0);
    if (!amount) return;
    const inventory = state.inventory.map((entry) => entry.id === item.id ? { ...entry, quantity: Number(entry.quantity) + amount, lastChecked: new Date().toISOString().slice(0, 10) } : entry);
    updateInventory(inventory, `${item.name}を${amount}${item.unit}補充しました`, createTransaction('add', item, amount, '不足通知から補充'));
    setNotificationsOpen(false);
  };

  return (
    <div className={`app-shell${page === 'home' ? ' home-active' : ''}${page === 'power' ? ' power-active' : ''}`}>
      <header className="topbar">
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {nav.map(({ id, label, icon: Icon }) => <button aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <div className="header-actions">{!online && <span className="offline-badge"><WifiOff />オフライン</span>}<button className="notification-button share-button" aria-label="アクセス用QRコードを開く" onClick={() => setShareOpen(true)}><QrCode size={20} /></button><button className="notification-button" aria-label={`通知一覧を開く（${summary.notificationCount}件）`} onClick={() => setNotificationsOpen(true)}><Bell size={20} /><span>{summary.notificationCount}</span></button></div>
      </header>

      <main ref={mainRef}>
        {page === 'home' && <Dashboard state={state} summary={summary} setState={setState} setPage={setPage} setModal={setModal} powerEntryRef={powerEntryRef} />}
        {page === 'inventory' && <Inventory state={state} summary={summary} transactions={state.transactions} setModal={setModal} updateInventory={updateInventory} setState={setState} setToast={setToast} />}
        {page === 'roadmap' && <PreparednessRoadmap state={state} summary={summary} setState={setState} setPage={setPage} setToast={setToast} />}
        {page === 'plan' && <EmergencyPlan state={state} summary={summary} setState={setState} setToast={setToast} />}
        {page === 'learn' && <Learn completed={state.completedTips} setState={setState} />}
        {page === 'power' && <PowerEcosystem plan={state.powerPlan} onChange={(powerPlan) => setState((old) => ({ ...old, powerPlan }))} onBack={() => setPage('home')} />}
      </main>

      <footer className="app-footer">
        <small>© {new Date().getFullYear()} そなえメモ</small>
      </footer>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション">
        {nav.map(({ id, label, icon: Icon }) => <button aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={21} /><span>{label}</span></button>)}
      </nav>

      {modal && <ItemModal item={modal === 'new' ? null : modal} inventory={state.inventory} onClose={() => setModal(null)} onSave={(form) => {
        const { registrationMode, ...values } = form;
        let inventory;
        let transaction;
        if (modal === 'new' && registrationMode === 'merge' && values.barcode && state.inventory.some((entry) => entry.barcode === values.barcode)) {
          const existing = state.inventory.find((entry) => entry.barcode === values.barcode);
          inventory = state.inventory.map((entry) => entry.id === existing.id ? { ...entry, quantity: entry.quantity + values.quantity, volumeMl: values.volumeMl || entry.volumeMl || 0, foodWeightG: values.foodWeightG || entry.foodWeightG || 0, packingVolumeMl: values.packingVolumeMl || entry.packingVolumeMl || 0, lastChecked: values.lastChecked || entry.lastChecked } : entry);
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
      {notificationsOpen && <NotificationPanel state={state} summary={summary} setToast={setToast} onClose={() => setNotificationsOpen(false)} onOpenItem={(item) => { setNotificationsOpen(false); setModal(item); }} onReplenish={replenishShortage} />}
      {shareOpen && <ShareQrPanel onClose={() => setShareOpen(false)} setToast={setToast} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={18} />{toast}</div>}
    </div>
  );
}

function Dashboard({ state, summary, setState, setPage, setModal, powerEntryRef }) {
  const defense = useMemo(() => defensePower(state, summary), [state, summary]);
  const shortcuts = [
    { id: 'inventory', label: '備蓄', text: `不足 ${summary.shortageCount}件`, icon: Box },
    { id: 'roadmap', label: '防災力', text: defense.requiredStage.label, icon: Route },
    { id: 'plan', label: '緊急メモ', text: state.contact?.shelter ? '集合場所 登録済み' : '集合場所 未登録', icon: ClipboardList },
    { id: 'learn', label: '防災知識', text: `${state.completedTips.length}件 読了`, icon: BookOpen },
    { id: 'power', label: '電力設計', text: '蓄電池・太陽光', icon: Zap },
  ];
  const setTargetDays = (targetDays) => setState((old) => ({ ...old, preparedness: { ...old.preparedness, targetDays } }));
  const targetGap = Math.max(0, defense.targetDays - summary.survivalDays);
  return <section className="home-dashboard wrap" aria-label="防災ホーム">
    <header className="home-heading">
      <div><span className="kicker">TODAY'S READINESS</span><h1>わが家の防災状況</h1></div>
      <div className="household-control" aria-label="家族人数"><Users /><button aria-label="家族人数を減らす" onClick={() => setState((old) => ({ ...old, household: Math.max(1, old.household - 1) }))}><Minus /></button><b>{state.household}<small>人</small></b><button aria-label="家族人数を増やす" onClick={() => setState((old) => ({ ...old, household: Math.min(12, old.household + 1) }))}><Plus /></button></div>
    </header>

    <div className="target-day-control">
      <span><CalendarDays />目標備蓄日数</span>
      <div>{[3, 7, 14, 30].map((days) => <button className={defense.targetDays === days ? 'active' : ''} key={days} onClick={() => setTargetDays(days)}>{days}<small>日</small></button>)}</div>
      <p>{defense.requiredStage.label}が必要</p>
    </div>

    <div className="home-metrics">
      <article className="survival-card">
        <div className="metric-title"><span><Droplets />水と食料</span><button onClick={() => setPage('inventory')}>備蓄を確認 <ArrowRight /></button></div>
        <div className="survival-main"><div><small>生存可能日数</small><strong>{formatDays(summary.survivalDays)}<em>日</em></strong><p>{targetGap ? `目標まで あと${formatDays(targetGap)}日` : `${defense.targetDays}日目標を達成`}</p></div><ShieldCheck /></div>
        <div className="supply-days">
          <div><span><Droplets />水</span><b>{formatDays(summary.waterDays)}<small>日分</small></b><i><u style={{ width: `${defense.waterCoverage * 100}%` }} /></i></div>
          <div><span><ShoppingBasket />食料</span><b>{formatDays(summary.foodDays)}<small>日分</small></b><i><u style={{ width: `${defense.foodCoverage * 100}%` }} /></i></div>
        </div>
        {summary.foodItemsMissingWeight > 0 && <button className="food-weight-notice" onClick={() => setPage('inventory')}>重量未登録の食料が{summary.foodItemsMissingWeight}件あります <ChevronRight /></button>}
      </article>

      <article className="defense-card">
        <div className="metric-title"><span><BadgeCheck />総合防災力</span><button onClick={() => setPage('roadmap')}>詳細 <ArrowRight /></button></div>
        <div className="defense-score"><div className="compact-score-ring" style={{ '--score': `${defense.score * 3.6}deg` }}><strong>{defense.score}<small>%</small></strong></div><div><span>目標 {defense.targetDays}日基準</span><h2>{defense.requiredStage.label}</h2><p>{defense.fulfilled} / {defense.requirementCount} 要件達成</p></div></div>
        <div className="defense-next"><span>次の要件</span><b>{defense.nextTask?.title || (targetGap ? '水・食料を目標日数まで確保' : 'すべて達成')}</b></div>
      </article>
    </div>

    <nav className="home-shortcuts" aria-label="各ページへのショートカット">
      {shortcuts.map(({ id, label, text, icon: Icon }) => <button ref={id === 'power' ? powerEntryRef : undefined} aria-label={id === 'power' ? '停電時の電力を設計' : undefined} key={id} onClick={() => setPage(id)}><Icon /><span><b>{label}</b><small>{text}</small></span><ChevronRight /></button>)}
      <button className="quick-add" onClick={() => setModal('new')}><PackagePlus /><span><b>備蓄を追加</b><small>すぐに登録</small></span><Plus /></button>
    </nav>
  </section>;
}

function CharacterBubble({ state, summary, setState, setPage }) {
  const character = getCharacter(state.selectedCharacter);
  const advice = buildCharacterAdvice(state, summary);
  const [reply, setReply] = useState('');
  const affinity = state.characterAffinity?.[character.id] || 0;
  const choose = (choiceId) => {
    const result = respondToCharacter(state, choiceId);
    setState(result.state);
    setReply(result.reply);
  };
  return <div className="character-station" aria-label={`${character.name}からの提案`} style={{ '--character': character.color }}>
    <div className="character-select" aria-label="ナビゲーターを選択">{CHARACTERS.map((entry) => <button type="button" aria-label={`${entry.name}を選ぶ`} title={`${entry.name}・${entry.disaster}`} className={entry.id === character.id ? 'active' : ''} key={entry.id} onClick={() => { setReply(''); setState((old) => ({ ...old, selectedCharacter: entry.id })); }}><span>{entry.mark}</span></button>)}</div>
    <div className="character-wrap">
      <div className="speech"><span>{character.name}<small>{character.disaster}担当・絆 {affinity}</small></span><b>{reply || advice.text}</b>{!reply && <button type="button" onClick={() => setPage(advice.page)}>{advice.action}<ArrowRight /></button>}<div className="dialogue-choices">{CONVERSATION_CHOICES.map((choice) => <button type="button" key={choice.id} onClick={() => choose(choice.id)}>{choice.label}</button>)}</div></div>
      <div className="character-portrait"><img src={`${import.meta.env.BASE_URL}${character.image}`} alt={character.imageAlt} /></div>
    </div>
  </div>;
}

function ScoreRing({ score }) {
  const radius = 70; const circumference = 2 * Math.PI * radius;
  return <div className="score-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r={radius} /><circle className="progress" cx="90" cy="90" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - score / 100) }} /></svg><div><b>{score}</b><span>%</span><small>充足率</small></div></div>;
}

const formatDays = (days) => (Math.floor(Math.max(0, Number(days) || 0) * 10) / 10).toFixed(1);
const formatFoodWeight = (grams) => Number(grams) >= 1000 ? `${(Number(grams) / 1000).toFixed(1)}kg` : `${Math.round(Number(grams) || 0)}g`;
const formatWaterVolume = (ml) => `${((Number(ml) || 0) / 1000).toFixed(1)}L`;

function StockpileDaysPanel({ summary, household, targetDays = 3, onAction, actionLabel }) {
  const missingCount = summary.foodItemsMissingWeight + summary.waterItemsMissingVolume;
  const foodTargetGrams = household * FOOD_GRAMS_PER_PERSON_DAY * targetDays;
  const waterTargetMl = household * WATER_ML_PER_PERSON_DAY * targetDays;
  const foodPercent = Math.min(100, summary.foodGrams / foodTargetGrams * 100) || 0;
  const waterPercent = Math.min(100, summary.waterMl / waterTargetMl * 100) || 0;
  const milestones = [...new Set([Math.ceil(targetDays / 3), Math.ceil(targetDays * 2 / 3), targetDays])];
  return <article className="card stockpile-runway">
    <header><div><span className="kicker">HOUSEHOLD RUNWAY</span><h2>食料と水は、あと何日もつ？</h2><p>家族{household}人で、食料は1人1日450g・水は1人1日3Lとして単純換算します。</p></div><span className="runway-household"><Users />{household}人分</span></header>
    <div className="runway-layout">
      <div className="runway-answer"><small>食料と水が両方そろう日数</small><strong>{formatDays(summary.survivalDays)}<em>日</em></strong><span>{targetDays}日目標まで あと{formatDays(Math.max(0, targetDays - summary.survivalDays))}日分</span></div>
      <div className="runway-days" aria-label={`${targetDays}日目標のうち${formatDays(summary.survivalDays)}日分`}>
        {milestones.map((day) => <div className="runway-day" style={{ '--fill': `${Math.min(100, summary.survivalDays / day * 100)}%` }} key={day}><b>{day}日</b><span>{summary.survivalDays >= day ? '確保' : summary.survivalDays > 0 ? '一部' : '未確保'}</span></div>)}
      </div>
      <div className="runway-resources">
        <section><div><span className="resource-icon food"><ShoppingBasket /></span><p><small>食料 合計 {formatFoodWeight(summary.foodGrams)}</small><b>{formatDays(summary.foodDays)}日分</b></p><em>必要 {formatFoodWeight(foodTargetGrams)}</em></div><div className="resource-meter"><i style={{ width: `${foodPercent}%` }} /></div><small>{formatFoodWeight(summary.foodGrams)} ÷（{household}人 × 450g）</small></section>
        <section><div><span className="resource-icon water"><Droplets /></span><p><small>水 合計 {formatWaterVolume(summary.waterMl)}</small><b>{formatDays(summary.waterDays)}日分</b></p><em>必要 {formatWaterVolume(waterTargetMl)}</em></div><div className="resource-meter water"><i style={{ width: `${waterPercent}%` }} /></div><small>{formatWaterVolume(summary.waterMl)} ÷（{household}人 × 3L）</small></section>
      </div>
    </div>
    {missingCount > 0 && <button type="button" className="amount-warning" onClick={onAction}><AlertTriangle /><span><b>内容量が未登録の備蓄が{missingCount}件あります</b><small>未登録分は日数に加算していません。</small></span><span>{actionLabel}<ChevronRight /></span></button>}
  </article>;
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

const pillarLabels = {
  risk: '危険把握', home: '住環境', information: '情報', health: '健康', water: '水', food: '食料',
  sanitation: '衛生', power: '電力', evacuation: '避難', family: '家族', recovery: '復旧', skills: '訓練', community: '共助',
};

function StageIcon({ name }) {
  return name === 'backpack' ? <Backpack /> : name === 'route' ? <Route /> : name === 'calendar' ? <CalendarDays /> : name === 'solar' ? <Sun /> : name === 'community' ? <Users /> : <ShieldCheck />;
}

function PreparednessRoadmap({ state, summary, setState, setPage, setToast }) {
  const progress = useMemo(() => preparednessProgress(state, summary), [state, summary]);
  const [selectedStageId, setSelectedStageId] = useState(() => progress.currentStage.id);
  const [activeLoadout, setActiveLoadout] = useState(null);
  const nextMissionHeadingRef = useRef(null);
  const previousFocusedTaskRef = useRef(progress.nextTask?.id);
  const selectedStage = progress.stages.find((stage) => stage.id === selectedStageId) || progress.currentStage;
  const focusedTask = progress.nextTask;
  const focusedStage = progress.currentStage;
  const weakestLabel = progress.weakest ? pillarLabels[progress.weakest.pillar] : '総合';
  const completedStages = progress.stages.filter((stage) => stage.gateClear).length;
  useEffect(() => {
    const previousTask = previousFocusedTaskRef.current;
    previousFocusedTaskRef.current = progress.nextTask?.id;
    if (previousTask && previousTask !== progress.nextTask?.id) nextMissionHeadingRef.current?.focus();
  }, [progress.nextTask?.id]);

  const toggle = (task) => {
    if (getLoadout(task.id)) {
      const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === task.id));
      if (taskStage?.unlocked || progress.completed.has(task.id)) setActiveLoadout(task.id);
      return;
    }
    if (task.auto) {
      setPage(task.id === 'family-route' ? 'plan' : 'inventory');
      setToast(task.id === 'family-route' ? '緊急メモを整えると自動達成します' : '備蓄を目標まで登録すると自動達成します');
      return;
    }
    const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === task.id));
    if (!taskStage?.unlocked) return;
    const wasDone = progress.completed.has(task.id);
    const beforeGate = taskStage.gateClear;
    const nextState = togglePreparednessTask(state, task.id, summary);
    const after = preparednessProgress(nextState, summary);
    const afterStage = after.stages.find((stage) => stage.id === taskStage.id);
    setState(nextState);
    if (!beforeGate && afterStage?.gateClear) {
      setToast(`${taskStage.title} クリア！ 次の段階が解放されました`);
    } else {
      setToast(wasDone ? '達成を取り消しました' : `+${task.xp} XP　備えが一つ増えました`);
    }
  };

  const finishLoadout = () => {
    const task = progress.stages.flatMap((stage) => stage.tasks).find((entry) => entry.id === activeLoadout);
    const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === activeLoadout));
    if (!task || !taskStage) return;
    const beforeGate = taskStage.gateClear;
    const nextState = completeLoadout(state, activeLoadout);
    const afterStage = preparednessProgress(nextState, summary).stages.find((stage) => stage.id === taskStage.id);
    if (nextState === state) return;
    setState(nextState);
    setActiveLoadout(null);
    setToast(!beforeGate && afterStage?.gateClear ? `${taskStage.title} クリア！ 次の段階が解放されました` : `装備確認完了　+${task.xp} XP`);
  };

  const missionCard = (task, compact = false) => {
    const done = progress.completed.has(task.id);
    const automatic = progress.automatic.has(task.id);
    const loadout = getLoadout(task.id);
    const kitStatus = loadoutStatus(state, task.id);
    const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === task.id));
    return <article className={`mission ${compact ? 'mission-focus' : ''} ${done ? 'done' : ''}`} key={task.id}>
      <button className="mission-check" type="button" disabled={!taskStage?.unlocked && !done} aria-label={loadout ? `${task.title}の装備ケースを開く` : task.auto ? `${task.title}の連動データを確認` : `${task.title}を${done ? '未達成に戻す' : '達成にする'}`} onClick={() => toggle(task)}>{done ? <Check /> : task.auto ? <RefreshCw /> : loadout ? <Backpack /> : null}</button>
      <div className="mission-copy"><div><span className="mission-pillar">{pillarLabels[task.pillar]}</span>{task.gate && <span className="mission-gate">次段階の条件</span>}{automatic && <span className="mission-auto">自動達成</span>}{loadout && <span className="mission-loadout-tag">装備ケース</span>}</div><h3>{task.title}</h3><p>{task.detail}</p><small><Lightbulb /> 次の行動：{task.action}</small>{task.id === 'hazard-map' && !done && <a className="mission-action-link" href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer">国のハザードマップを開く<ArrowRight /></a>}{loadout && <button className="mission-loadout" type="button" onClick={() => toggle(task)} disabled={!taskStage?.unlocked && !done}><span className="mission-loadout-items">{loadout.items.slice(0, 5).map((item) => <i key={item.id} className={kitStatus.packed.has(item.id) ? 'packed' : ''}>{item.symbol}</i>)}</span><b>{loadout.label}</b><em>{kitStatus.done} / {kitStatus.total} 必須品</em><ChevronRight /></button>}</div>
      <span className="mission-xp">+{task.xp} XP</span>
    </article>;
  };

  return <section className="wrap page-section roadmap-page">
    <div className="page-title roadmap-title"><div><span className="kicker">RESILIENCE JOURNEY</span><h1>防災力ロードマップ</h1><p>備蓄だけに偏らず、命・避難・生活・電力・復旧を段階的に多重化します。</p></div><span className="roadmap-level"><Award />LEVEL {progress.level}<b>{progress.title}</b></span></div>

    <section className="roadmap-command" aria-label="現在の防災力">
      <div className="xp-orbit"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="51" /><circle className="xp-progress" cx="60" cy="60" r="51" style={{ strokeDasharray: 320.44, strokeDashoffset: 320.44 * (1 - progress.xp / progress.maxXp) }} /></svg><div><b>{progress.xp}</b><small>/ {progress.maxXp} XP</small></div></div>
      <div className="command-copy"><span className="command-label">CURRENT STAGE</span><h2>STAGE {focusedStage.number}・{focusedStage.title}</h2><p>{focusedStage.subtitle}。一度に考えるのは、次の一項目だけで大丈夫です。</p></div>
      <div className="command-stats"><div><span>総合達成</span><b>{progress.totalDone}<small> / {progress.totalTasks}</small></b></div><div><span>クリア段階</span><b>{completedStages}<small> / 6</small></b></div><div><span>要補強領域</span><b>{weakestLabel}</b></div></div>
    </section>

    <section className="next-mission" aria-labelledby="next-mission-title">
      <div className="next-mission-heading"><div><span className="kicker">NEXT MISSION</span><h2 id="next-mission-title" ref={nextMissionHeadingRef} tabIndex="-1">いまは、これだけ</h2></div><span>{focusedStage.done} / {focusedStage.total}</span></div>
      {focusedTask ? missionCard(focusedTask, true) : <div className="journey-complete"><Trophy /><div><b>全段階を踏破しました</b><span>季節の変わり目に点検と実地訓練を続けましょう。</span></div></div>}
      {focusedStage.tasks.filter((task) => task.id !== focusedTask?.id).length > 0 && <details className="stage-more"><summary>この段階の全項目を見る <span>{focusedStage.total}項目</span></summary><div className="mission-list">{focusedStage.tasks.filter((task) => task.id !== focusedTask?.id).map((task) => missionCard(task))}</div></details>}
    </section>

    <details className="roadmap-overview">
      <summary><span><Route /><b>6段階の全体像を見る</b><small>先の備えや獲得済みの防災章を確認</small></span><ChevronRight /></summary>
      <div className="roadmap-overview-body">
        <div className="stage-flow" role="list" aria-label="防災力の段階">
          {progress.stages.map((stage, index) => <div className="stage-flow-unit" key={stage.id}>
            <button type="button" role="listitem" className={`stage-node ${selectedStage.id === stage.id ? 'selected' : ''} ${stage.gateClear ? 'cleared' : ''} ${!stage.unlocked ? 'locked' : ''}`} onClick={() => setSelectedStageId(stage.id)} aria-current={selectedStage.id === stage.id ? 'step' : undefined}>
              <span className="stage-number">{stage.gateClear ? <Check /> : !stage.unlocked ? <LockKeyhole /> : stage.number}</span>
              <span className="stage-node-icon"><StageIcon name={stage.icon} /></span>
              <span className="stage-node-copy"><small>STAGE {stage.number}</small><b>{stage.title}</b><span>{stage.subtitle}</span></span>
              <span className="stage-node-score">{stage.done}/{stage.total}</span>
            </button>
            {index < progress.stages.length - 1 && <span className={`flow-connector ${stage.gateClear ? 'active' : ''}`} aria-hidden="true"><ChevronRight /></span>}
          </div>)}
        </div>
        <section className={`stage-detail ${!selectedStage.unlocked ? 'is-locked' : ''}`}>
          <div className="stage-detail-head"><div><span className="stage-detail-number">STAGE {selectedStage.number}</span><h2>{selectedStage.title}</h2><p>{selectedStage.subtitle}</p></div><div className="stage-percent"><b>{selectedStage.percent}%</b><span>{selectedStage.gateClear ? '次段階 解放済み' : selectedStage.unlocked ? '進行中' : '未解放'}</span></div></div>
          {!selectedStage.unlocked && <div className="locked-guidance"><LockKeyhole /><div><b>前段階の必須ミッションを先に達成しよう</b><span>全体像の確認はできますが、実行は順番に進めます。</span></div></div>}
          <div className="mission-list">{selectedStage.tasks.map((task) => missionCard(task))}</div>
        </section>
        <section className="achievement-section"><div className="section-heading compact"><div><span className="kicker">ACHIEVEMENTS</span><h2>獲得した防災章</h2></div><Trophy /></div><div className="achievement-row">{progress.stages.map((stage) => <div className={`achievement ${stage.gateClear ? 'earned' : ''}`} key={stage.id}><span><StageIcon name={stage.icon} /></span><b>{stage.title}</b><small>{stage.gateClear ? '獲得済み' : '未獲得'}</small></div>)}</div></section>
      </div>
    </details>
    {activeLoadout && <PracticalLoadout taskId={activeLoadout} state={state} onChange={(packed) => setState((old) => updateLoadout(old, activeLoadout, packed))} onBagSettings={(settings) => setState((old) => updateBagSettings(old, activeLoadout, settings))} onComplete={finishLoadout} onClose={() => setActiveLoadout(null)} />}
  </section>;
}

function Inventory({ state, summary, transactions, setModal, updateInventory, setState, setToast }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [consumeItem, setConsumeItem] = useState(null);
  const importRef = useRef(null);
  const insights = useMemo(() => transactionInsights(transactions), [transactions]);
  const rows = summary.rows.filter((item) => (filter === 'all' || item.category === filter) && item.name.toLowerCase().includes(query.toLowerCase()));
  const rawRows = () => summary.rows.map(({ shortage, ratio, replenishmentCost, daysToExpiry, isExpiring, isExpired, daysToCheck, isCheckDue, priority, ...item }) => item);
  const adjust = (id, delta) => {
    const item = summary.rows.find((entry) => entry.id === id);
    if (delta < 0 && item.quantity <= 0) return;
    const nextQuantity = Math.max(0, Number(item.quantity) + delta);
    const inventory = rawRows().map((entry) => entry.id === id ? { ...entry, quantity: nextQuantity, lastChecked: new Date().toISOString().slice(0, 10) } : entry);
    updateInventory(inventory, delta > 0 ? `${delta}${item.unit}補充しました` : `${Math.abs(delta)}${item.unit}消費しました`, createTransaction(delta > 0 ? 'add' : 'consume', item, delta, delta > 0 ? 'クイック補充' : 'クイック消費'));
  };
  const consume = ({ amount, reason, note }) => {
    const item = summary.rows.find((entry) => entry.id === consumeItem.id);
    const used = Math.min(Number(amount) || 1, Number(item.quantity) || 0);
    if (!used) return setConsumeItem(null);
    const inventory = rawRows().map((entry) => entry.id === item.id ? { ...entry, quantity: Number(entry.quantity) - used, lastChecked: new Date().toISOString().slice(0, 10) } : entry);
    const type = reason === '期限切れ・廃棄' ? 'discard' : 'consume';
    updateInventory(inventory, `${used}${item.unit}を記録しました`, createTransaction(type, item, -used, note, { reason }));
    setConsumeItem(null);
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
    <div className="page-title"><div><span className="kicker">MY STOCKPILE</span><h1>わが家の備蓄</h1><p>不足も期限も、ここでひと目に。</p></div><div className="page-actions"><details className="data-management"><summary><Download />データ管理</summary><div><button className="secondary-button" onClick={exportData}><Download />バックアップ</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload />復元</button></div><input ref={importRef} hidden type="file" accept="application/json" onChange={importData} /></details><button className="primary-button" onClick={() => setModal('new')}><Plus />備蓄品を追加</button></div></div>
    <div className="summary-strip"><div><span>備蓄力</span><b>{summary.score}%</b></div><div><span>不足品</span><b>{summary.shortageCount}品</b></div><div><span>期限間近</span><b>{summary.expiringCount}品</b></div><div><span>補充費用</span><b>¥{summary.replenishmentCost.toLocaleString()}</b></div></div>
    <article className="card inventory-priority"><div className="section-heading compact"><div><span className="kicker">DO THIS FIRST</span><h2>最優先の補充</h2></div><ShoppingBasket /></div>{summary.replenishmentPlan.length ? <>{summary.replenishmentPlan.slice(0, 1).map((item) => <div className="priority-row" key={item.id}><button type="button" className="priority-row-main" onClick={() => setModal(item)}><span className={`priority priority-${item.replenishmentPriority}`}>{item.replenishmentPriority === 'high' ? '高' : item.replenishmentPriority === 'medium' ? '中' : '低'}</span><span><b>{item.name}</b><small>{item.shortage}{item.unit}不足・¥{item.replenishmentCost.toLocaleString()}</small></span><ChevronRight /></button><button type="button" className="priority-refill" onClick={() => adjust(item.id, item.shortage)}><Plus />不足分を補充</button></div>)}{summary.replenishmentPlan.length > 1 && <p className="priority-remaining">ほか{summary.replenishmentPlan.length - 1}品は下の在庫一覧で確認できます</p>}</> : <div className="empty-small"><Check />補充予定はありません</div>}</article>
    <div className="inventory-tools"><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="備蓄品を検索" /></label><div className="filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>すべて</button>{Object.entries(CATEGORY_META).map(([key, value]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{value.label}</button>)}</div></div>
    <div className="inventory-list">
      {rows.map((item) => <article className="inventory-item" key={item.id}>
        {item.imageUrl ? <div className="product-thumb"><img src={item.imageUrl} alt="" /></div> : <div className="category-badge" style={{ '--category': CATEGORY_META[item.category]?.color }}><CategoryIcon category={item.category} /></div>}
        <div className="item-main"><div className="item-title"><span className={`tier tier-${item.tier}`}>TIER {item.tier}</span><h3>{item.name}</h3>{item.brand && <span className="brand-tag">{item.brand}</span>}{item.isExpiring && <span className="expiry-tag">{item.isExpired ? '期限切れ' : `あと${item.daysToExpiry}日`}</span>}{item.category === 'food' && !item.foodWeightG && <span className="amount-missing-tag">重量未登録</span>}{item.category === 'water' && !item.volumeMl && <span className="amount-missing-tag">水量未登録</span>}</div><div className="stock-progress"><span style={{ width: `${Math.min(item.ratio * 100, 100)}%` }} /><i style={{ left: `${Math.min(item.ratio * 100, 100)}%` }} /></div><div className="item-meta"><span>在庫 <b>{item.quantity}{item.unit}</b> / 目標 {item.target}{item.unit}{item.category === 'food' && item.foodWeightG > 0 && <small>・1{item.unit} {formatFoodWeight(item.foodWeightG)}</small>}{item.category === 'water' && item.volumeMl > 0 && <small>・1{item.unit} {formatWaterVolume(item.volumeMl)}</small>}{item.barcode && <small>・JAN {item.barcode}</small>}</span>{item.shortage > 0 ? <span className="shortage">あと {item.shortage}{item.unit}</span> : <span className="enough"><Check /> 目標達成</span>}</div></div>
        <div className="quick-actions"><button aria-label={`${item.name}を消費・廃棄`} onClick={() => setConsumeItem(item)}><Minus /></button><button aria-label={`${item.name}を1つ補充`} onClick={() => adjust(item.id, 1)}><Plus /></button><button aria-label={`${item.name}を編集`} onClick={() => setModal(item)}><Pencil /></button><button aria-label={`${item.name}を削除`} className="danger" onClick={() => remove(item.id)}><Trash2 /></button></div>
      </article>)}
      {!rows.length && <div className="empty-state"><Search /><h3>該当する備蓄品がありません</h3><p>検索条件を変えてみてください。</p></div>}
    </div>
    <details className="inventory-analysis"><summary><span><ShieldCheck /><b>備蓄日数の詳しい計算を見る</b><small>食料と水が何日もつかを確認</small></span><ChevronRight /></summary><div><StockpileDaysPanel summary={summary} household={state.household} targetDays={state.preparedness?.targetDays || 7} onAction={() => setFilter(summary.foodItemsMissingWeight ? 'food' : 'water')} actionLabel="対象を絞り込む" /></div></details>
    <article className="card rolling-panel"><div className="section-heading compact"><div><span className="kicker">ROLLING STOCK</span><h2>ローリングストック</h2><p>期限の近いロットから消費し、不足分を補充計画へ自動反映します。</p></div><RefreshCw /></div><div className="rolling-summary"><span><small>循環待ち</small><b>{summary.rotationDueCount}品</b></span><span><small>期限付き在庫</small><b>{summary.rotationQueue.length}品</b></span><span><small>補充候補</small><b>{summary.shortageCount}品</b></span></div>{summary.rotationQueue.length ? <div className="rolling-list">{summary.rotationQueue.slice(0, 6).map((entry) => <div className={`rolling-row ${entry.status}`} key={entry.key}><span className="rolling-order">{entry.status === 'expired' ? '期限切れ' : entry.daysToRotate <= 0 ? '今すぐ循環' : `${entry.daysToRotate}日後`}</span><span><b>{entry.nextLot.name}</b><small>期限 {entry.nextLot.expiry}・対象ロット {entry.nextLot.quantity}{entry.nextLot.unit}・合計 {entry.totalQuantity}{entry.nextLot.unit}</small></span><button type="button" onClick={() => rotateOne(entry)}><RefreshCw />1{entry.nextLot.unit}消費して買い足す</button></div>)}</div> : <div className="empty-small"><Check />期限を登録すると循環予定を自動作成します</div>}</article>
    <div className="operations-grid single-operation">
      <article className="card operation-panel"><div className="section-heading compact"><div><span className="kicker">HISTORY</span><h2>消費履歴と傾向</h2></div><History /></div><div className="insight-strip"><span>30日消費<b>{insights.consumed30Days}</b></span><span>うち廃棄<b>{insights.discarded30Days}</b></span><span>最多<b>{insights.topConsumed?.name || '—'}</b></span></div>{transactions.length ? transactions.slice(0, 10).map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'rotate' ? '循環' : entry.type === 'consume' ? '消費' : entry.type === 'discard' ? '廃棄' : entry.type === 'delete' ? '削除' : entry.type === 'edit' ? '編集' : '入庫'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}{entry.unit}・{entry.reason || entry.note || ''}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">操作すると履歴が記録されます</div>}</article>
    </div>
    {consumeItem && <ConsumptionModal item={consumeItem} onClose={() => setConsumeItem(null)} onSave={consume} />}
  </section>;
}

function CategoryIcon({ category }) {
  return category === 'water' ? <Droplets /> : category === 'heat' ? <Flame /> : category === 'light' ? <Zap /> : category === 'comfort' ? <Heart /> : category === 'hygiene' ? <Sparkles /> : <ShoppingBasket />;
}

function ConsumptionModal({ item, onClose, onSave }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('日常消費');
  const [note, setNote] = useState('');
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form ref={dialogRef} className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="consumption-title" onSubmit={(event) => { event.preventDefault(); onSave({ amount, reason, note }); }}>
    <div className="modal-title"><div><span className="kicker">CONSUMPTION LOG</span><h2 id="consumption-title">{item.name}を記録</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    <div className="form-grid"><label><span>数量（最大 {item.quantity}{item.unit}）</span><input autoFocus required type="number" min="1" max={item.quantity} value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label><span>理由</span><select value={reason} onChange={(event) => setReason(event.target.value)}><option>日常消費</option><option>ローリングストック</option><option>非常時使用</option><option>期限切れ・廃棄</option><option>その他</option></select></label></div>
    <label className="full"><span>備考</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例：朝食で使用、袋が破損" /></label>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button"><Check />記録して在庫を減らす</button></div>
  </form></div>;
}

function EmergencyPlan({ state, summary, setState, setToast }) {
  const [draft, setDraft] = useState(state.contact);
  const [scenarioId, setScenarioId] = useState('earthquake');
  const [days, setDays] = useState(3);
  const plan = useMemo(() => generateEmergencyPlan(state, summary), [state, summary]);
  const simulation = useMemo(() => simulateDisaster(state, summary, scenarioId, days), [state, summary, scenarioId, days]);
  useEffect(() => setDraft(state.contact), [state.contact]);
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  return <section className="wrap page-section narrow-page"><div className="page-title"><div><span className="kicker">EMERGENCY NOTE</span><h1>もしもの時のメモ</h1><p>通信が不安定でも、この端末から確認できます。</p></div></div>
    <div className="emergency-banner"><ShieldCheck /><div><b>緊急時は、まず下の内容を確認</b><span>編集は後回しにして、集合場所・連絡先・最初の行動を確認してください。</span></div></div>
    <section className="emergency-readout" aria-label="登録済みの緊急連絡情報">
      <article><MapPin /><span>避難・集合場所</span><b>{state.contact.shelter || '未登録'}</b></article>
      <article><Phone /><span>緊急連絡先</span>{state.contact.phone ? <a href={`tel:${state.contact.phone.replace(/[^\d+]/g, '')}`}>{state.contact.phone}</a> : <b className="missing">未登録</b>}</article>
      <article><ClipboardList /><span>家族への伝言・連絡ルール</span><b>{state.contact.note || '未登録'}</b></article>
    </section>
    <section className="generated-plan"><div className="section-heading compact"><div><span className="kicker">AUTO PLAN</span><h2>わが家の72時間行動計画</h2></div><ShieldCheck /></div><div className="plan-columns"><article><h3>発災直後</h3>{plan.immediate.map((item) => <p key={item}><Check />{item}</p>)}</article><article><h3>最初の72時間</h3>{plan.first72Hours.map((item) => <p key={item}><Check />{item}</p>)}</article></div>{plan.gaps.length ? <div className="plan-gaps"><b>先に埋めたい弱点</b>{plan.gaps.map((gap) => <span key={gap}><AlertTriangle />{gap}</span>)}</div> : <div className="stage-clear-message"><Check /><div><b>基礎条件は整っています</b><span>半年ごとに実物を使って見直してください。</span></div></div>}</section>
    <details className="emergency-editor"><summary><span><Pencil /><b>緊急メモを編集する</b><small>集合場所・連絡先・家族ルールを変更</small></span><ChevronRight /></summary><form className="card plan-form" onSubmit={(e) => { e.preventDefault(); setState((old) => ({ ...old, contact: draft })); setToast('緊急メモを端末に保存しました'); }}>
      <label><span><Users />メモの名前</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label><span><MapPin />避難・集合場所</span><input value={draft.shelter} onChange={(e) => set('shelter', e.target.value)} placeholder="例：〇〇小学校 体育館" /></label>
      <label><span><Phone />緊急連絡先</span><input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="例：090-0000-0000" inputMode="tel" /></label>
      <label><span><ClipboardList />家族への伝言・連絡ルール</span><textarea value={draft.note} onChange={(e) => set('note', e.target.value)} rows="5" /></label>
      <button className="primary-button" type="submit"><Check />この端末に保存</button>
    </form></details>
    <section className="simulator"><div className="section-heading compact"><div><span className="kicker">DISASTER SIMULATOR</span><h2>もし今、災害が起きたら</h2></div><Radio /></div><div className="simulator-controls"><label><span>想定</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{DISASTER_SCENARIOS.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label><label><span>継続日数</span><input type="number" min="1" max="14" value={days} onChange={(event) => setDays(event.target.value)} /></label></div><div className={`simulation-result status-${simulation.status}`}><div><span>対応力</span><b>{simulation.score}<small>%</small></b><em>{simulation.status}</em></div><section><h3>{simulation.scenario.name}・{simulation.days}日間</h3><p>{simulation.scenario.opening}</p><strong>{simulation.advice}</strong><div className="gap-chips">{simulation.criticalGaps.map((gap) => <span key={gap.key}>{CATEGORY_META[gap.key]?.label || gap.key} {gap.score}%</span>)}</div></section></div></section>
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
  const [url, setUrl] = useState(() => new URL(import.meta.env.BASE_URL, window.location.origin).href);
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

function NotificationPanel({ state, summary, setToast, onClose, onOpenItem, onReplenish }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const notifications = summary.rows.filter((item) => item.shortage > 0 || item.isExpiring || item.isCheckDue).sort((a, b) => a.tier - b.tier || a.ratio - b.ratio);
  const message = (item) => [
    item.isExpired ? '期限切れ' : item.isExpiring ? `期限まで${item.daysToExpiry}日` : '',
    item.isCheckDue ? '棚卸し確認日を超過' : '',
    item.shortage > 0 ? `${item.shortage}${item.unit}不足` : '',
  ].filter(Boolean).join('・');
  const enableNotifications = async () => {
    if (!('Notification' in window)) return setToast('この端末はシステム通知に対応していません');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const advice = buildCharacterAdvice(state, summary);
      new Notification(`${getCharacter(state.selectedCharacter).name}からのお知らせ`, { body: advice.text, icon: `${import.meta.env.BASE_URL}favicon.svg` });
      setToast('次回からキャラクターがお知らせします');
    } else setToast('通知は許可されませんでした');
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="modal-title"><div><span className="kicker">NOTIFICATIONS</span><h2 id="notification-title">備蓄のお知らせ</h2><small className="notification-count">{notifications.length}品目</small></div><button type="button" aria-label="通知一覧を閉じる" onClick={onClose}><X /></button></div><button type="button" className="notification-enable" onClick={enableNotifications}><Bell />次回起動時のキャラクター通知を許可</button>{notifications.length ? notifications.map((item) => <div className="notification-row" key={item.id}><span className={`status-dot ${item.isExpiring || item.isCheckDue ? 'amber' : 'red'}`} /><button type="button" className="notification-detail" onClick={() => onOpenItem(item)}><span><b>{item.name}</b><small>{message(item)}</small></span><ChevronRight /></button>{item.shortage > 0 && <button type="button" className="notification-refill" onClick={() => onReplenish(item)}><Plus />{item.shortage}{item.unit}補充</button>}</div>) : <div className="empty-small"><Check />現在のお知らせはありません</div>}</section></div>;
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
  const [form, setForm] = useState(item ? { name: item.name, category: item.category, tier: item.tier, unit: item.unit, quantity: item.quantity, target: item.target, price: item.price, expiry: item.expiry, note: item.note || '', barcode: item.barcode || '', brand: item.brand || '', packageSize: item.packageSize || '', volumeMl: item.volumeMl || 0, foodWeightG: item.foodWeightG || 0, packingVolumeMl: item.packingVolumeMl || 0, imageUrl: item.imageUrl || '', source: item.source || '', sourceUrl: item.sourceUrl || '', location: item.location || '', lastChecked: item.lastChecked || '', nextCheck: item.nextCheck || '', rotationEnabled: item.rotationEnabled !== false, rotationLeadDays: item.rotationLeadDays || 30, replenishmentPriority: item.replenishmentPriority || 'medium', replenishBy: item.replenishBy || '', purchaseFrom: item.purchaseFrom || '', registrationMode: 'new-lot' } : { ...emptyForm, lastChecked: new Date().toISOString().slice(0, 10), nextCheck: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), registrationMode: 'new-lot' });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(item));
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const duplicate = !item && form.barcode ? inventory.find((entry) => entry.barcode === form.barcode) : null;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, tier: Number(form.tier), quantity: Number(form.quantity), target: Number(form.target), price: Number(form.price), volumeMl: Number(form.volumeMl) || 0, foodWeightG: Number(form.foodWeightG) || 0, packingVolumeMl: Number(form.packingVolumeMl) || 0, rotationLeadDays: Number(form.rotationLeadDays) || 30 }); }}>
    <div className="modal-title"><div><span className="kicker">STOCK ITEM</span><h2 id="item-modal-title">{item ? '備蓄品を編集' : '備蓄品を追加'}</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    {!item && <button className="optional-section-toggle" type="button" aria-expanded={scannerOpen} onClick={() => setScannerOpen((open) => !open)}><QrCode />バーコードから入力<span>{scannerOpen ? '閉じる' : 'カメラ・画像・番号'}</span><ChevronRight /></button>}
    {scannerOpen && <div className="optional-section"><BarcodeScanner initialProduct={form.barcode && form.name ? form : null} localProducts={inventory} onBarcode={(barcode) => set('barcode', barcode)} onProduct={(product) => setForm((old) => ({ ...old, ...product, registrationMode: !item && inventory.some((entry) => entry.barcode === product.barcode) ? 'merge' : old.registrationMode, note: old.note || [product.brand, product.packageSize].filter(Boolean).join(' / ') }))} />
      {duplicate && <fieldset className="duplicate-choice"><legend>登録済みの商品です</legend><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'merge'} onChange={() => set('registrationMode', 'merge')} />既存在庫「{duplicate.name}」へ数量を追加</label><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'new-lot'} onChange={() => set('registrationMode', 'new-lot')} />別の賞味期限ロットとして追加</label></fieldset>}
    </div>}
    <label className="full"><span>品目名</span><input required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例：飲料水 500ml" /></label>
    <div className="form-grid basic-category-grid"><label><span>カテゴリ</span><select value={form.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATEGORY_META).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><label><span>重要度</span><select value={form.tier} onChange={(e) => set('tier', e.target.value)}><option value="1">Tier 1・生存必須</option><option value="2">Tier 2・継続生活</option><option value="3">Tier 3・快適性</option></select></label></div>
    <div className="form-grid three quick-stock-grid"><label><span>在庫数</span><input required min="0" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label><label><span>目標数</span><input required min="0" type="number" value={form.target} onChange={(e) => set('target', e.target.value)} /></label><label><span>単位</span><input required value={form.unit} onChange={(e) => set('unit', e.target.value)} /></label></div>
    {form.category === 'food' && <label className="full amount-input"><span>1単位あたりの食料重量（g）</span><input min="0" type="number" value={form.foodWeightG} onChange={(e) => set('foodWeightG', e.target.value)} placeholder="例：アルファ米1食なら100" /><small>在庫数と掛け合わせ、1人1日450gとして備蓄日数を計算します。</small></label>}
    {form.category === 'water' && <label className="full amount-input"><span>1単位あたりの水量（ml）</span><input min="0" type="number" value={form.volumeMl} onChange={(e) => set('volumeMl', e.target.value)} placeholder="例：500mlボトルなら500" /><small>在庫数と掛け合わせ、1人1日3Lとして備蓄日数を計算します。</small></label>}
    <button className="optional-section-toggle details-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}><ClipboardList />詳細設定<span>期限・価格・保管場所など</span><ChevronRight /></button>
    {detailsOpen && <div className="optional-section details-section"><div className="form-grid"><label><span>期限（任意）</span><input type="date" value={form.expiry} onChange={(e) => set('expiry', e.target.value)} /></label><label><span>単価（円）</span><input min="0" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} /></label></div>
      <label className="full"><span>1単位あたりの収納容量（ml・任意）</span><input min="0" type="number" value={form.packingVolumeMl} onChange={(e) => set('packingVolumeMl', e.target.value)} placeholder="未入力ならアプリの内部推定値を使用" /><small>外箱を含む実際の大きさを入力すると、バッグへの自動選定が正確になります。</small></label>
      <div className="form-grid"><label><span>保管場所</span><input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="例：玄関収納" /></label><label><span>次回確認日</span><input type="date" value={form.nextCheck} onChange={(e) => set('nextCheck', e.target.value)} /></label></div>
      <fieldset className="replenishment-settings"><legend>補充計画</legend><div className="form-grid three"><label><span>優先度</span><select value={form.replenishmentPriority} onChange={(e) => set('replenishmentPriority', e.target.value)}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label><label><span>補充期限</span><input type="date" value={form.replenishBy} onChange={(e) => set('replenishBy', e.target.value)} /></label><label><span>購入先候補</span><input value={form.purchaseFrom} onChange={(e) => set('purchaseFrom', e.target.value)} placeholder="例：近所のスーパー" /></label></div></fieldset>
      <fieldset className="rotation-settings"><legend>ローリングストック設定</legend><label className="rotation-toggle"><input type="checkbox" checked={form.rotationEnabled} onChange={(e) => set('rotationEnabled', e.target.checked)} />期限順の消費候補に含める</label><label><span>期限の何日前から消費候補にするか</span><input type="number" min="0" max="365" value={form.rotationLeadDays} onChange={(e) => set('rotationLeadDays', e.target.value)} /></label></fieldset>
      <label className="full"><span>メモ</span><input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="保管場所や使い方など" /></label>
    </div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" type="submit"><Check />保存する</button></div>
  </form></div>;
}

export default App;
