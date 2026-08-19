import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Award, Backpack, BadgeCheck, Bell, BookOpen, Box, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Copy, Droplets, Flame, Heart,
  Download, History, Home, Lightbulb, MapPin, Minus, PackagePlus, Pencil, Phone,
  Plus, QrCode, Radio, RefreshCw, Route, Search, Settings, ShieldAlert, ShieldCheck, ShoppingBasket, Sparkles, Sun, Trash2, Trophy, Upload, Users, WifiOff, X, Zap,
} from 'lucide-react';
import { CATEGORY_META, consumeByRotation, FIRST_GOAL_CATEGORY_PRIORITY, FOOD_GRAMS_PER_PERSON_DAY, inventorySummary, stockpileBudgetProjection, stockpileUnitNeeds, transactionInsights, uid, WATER_ML_PER_PERSON_DAY } from './domain.js';
import BarcodeScanner from './BarcodeScanner.jsx';
import PowerEcosystem from './PowerEcosystem.jsx';
import PracticalLoadout from './PracticalLoadout.jsx';
import DisasterPreparedness from './DisasterPreparedness.jsx';
import { createTransaction, loadState, normalizeState, STORAGE_KEY } from './state.js';
import { defensePower, essentialPreparednessGates, preparednessProgress, togglePreparednessTask } from './preparedness.js';
import { completeLoadout, getLoadout, loadoutStatus, updateLoadout } from './loadouts.js';
import { autoPackInventory, bagSettings, updateBagSettings } from './packing.js';
import { buildCharacterAdvice, CHARACTERS, CONVERSATION_CHOICES, getCharacter, respondToCharacter } from './characters.js';
import { DISASTER_SCENARIOS, generateEmergencyPlan, simulateDisaster } from './emergency.js';

const nav = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'inventory', label: '備蓄', icon: Box },
  { id: 'bags', label: '避難バッグ', icon: Backpack },
  { id: 'roadmap', label: '防災力', icon: Route },
  { id: 'disasters', label: '災害対策', icon: ShieldAlert },
  { id: 'plan', label: '緊急メモ', icon: ClipboardList },
  { id: 'learn', label: '知る', icon: BookOpen },
];
const pageIds = new Set([...nav.map(({ id }) => id), 'power', 'rolling']);
const pageFromLocation = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return pageIds.has(id) ? id : 'home';
};

const emptyForm = { name: '', category: 'food', tier: 1, unit: '個', quantity: 1, target: 3, price: 0, expiry: '', note: '', barcode: '', brand: '', packageSize: '', volumeMl: 0, foodWeightG: 0, packingVolumeMl: 0, imageUrl: '', source: '', sourceUrl: '', rotationEnabled: true, rotationLeadDays: 30, replenishmentPriority: 'high', replenishBy: '', purchaseFrom: '' };
const essentialGateTaskTargets = { home: 'furniture', risk: 'hazard-map', medicine: 'medicine', light: 'light-fire' };

function Brand() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span><b>そなえメモ</b><small>暮らしに、ちいさな安心を。</small></span></div>;
}

function App() {
  const [state, setState] = useState(loadState);
  const [page, setPageState] = useState(pageFromLocation);
  const [pageTarget, setPageTarget] = useState(() => window.history.state?.sonaeTarget || null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const summary = useMemo(() => inventorySummary(state.inventory, state.household), [state.inventory, state.household]);
  const visitChecked = useRef(false);
  const powerEntryRef = useRef(null);
  const mainRef = useRef(null);
  const previousPageRef = useRef(page);

  const setPage = useCallback((nextPage, { replace = false, target = null } = {}) => {
    if (!pageIds.has(nextPage)) return;
    const nextHash = `#/${nextPage}`;
    if (window.location.hash !== nextHash) window.history[replace ? 'replaceState' : 'pushState']({ sonaePage: nextPage, sonaeTarget: target }, '', nextHash);
    else window.history.replaceState({ ...window.history.state, sonaePage: nextPage, sonaeTarget: target }, '', nextHash);
    setPageTarget(target);
    setPageState(nextPage);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      setToast('端末に保存できませんでした。空き容量やブラウザ設定を確認してください');
    }
  }, [state]);
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
    const syncPage = () => {
      setPageState(pageFromLocation());
      setPageTarget(window.history.state?.sonaeTarget || null);
    };
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
    if (previousPage === page && !pageTarget) return;
    if (page === 'home' && previousPage === 'power') {
      powerEntryRef.current?.focus();
      return;
    }
    if (page === 'power') return;
    if (page === 'roadmap' && pageTarget) return;
    const frame = window.requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, pageTarget]);
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

  const onboardingActive = !state.onboarding?.completed;
  const backgroundA11y = onboardingActive ? { 'aria-hidden': true, inert: true } : {};

  return (
    <div className={`app-shell${page === 'home' ? ' home-active' : ''}${page === 'power' ? ' power-active' : ''}`}>
      <header className="topbar" {...backgroundA11y}>
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {nav.map(({ id, label, icon: Icon }) => <button aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <div className="header-actions">{!online && <span className="offline-badge"><WifiOff />オフライン</span>}<button className="notification-button" aria-label="オプションを開く" onClick={() => setOptionsOpen(true)}><Settings size={20} /></button><button className="notification-button share-button" aria-label="アクセス用QRコードを開く" onClick={() => setShareOpen(true)}><QrCode size={20} /></button><button className="notification-button" aria-label={`通知一覧を開く（${summary.notificationCount}件）`} onClick={() => setNotificationsOpen(true)}><Bell size={20} /><span>{summary.notificationCount}</span></button></div>
      </header>

      <main ref={mainRef} {...backgroundA11y}>
        {page === 'home' && <Dashboard state={state} summary={summary} setState={setState} setPage={setPage} setModal={setModal} powerEntryRef={powerEntryRef} />}
        {page === 'inventory' && <Inventory state={state} summary={summary} transactions={state.transactions} setModal={setModal} updateInventory={updateInventory} setState={setState} setToast={setToast} setPage={setPage} />}
        {page === 'bags' && <EvacuationBags state={state} setState={setState} setToast={setToast} setPage={setPage} />}
        {page === 'rolling' && <RollingStock state={state} summary={summary} transactions={state.transactions} updateInventory={updateInventory} onBack={() => setPage('inventory')} />}
        {page === 'roadmap' && <PreparednessRoadmap state={state} summary={summary} setState={setState} setPage={setPage} setToast={setToast} targetTaskId={pageTarget} />}
        {page === 'disasters' && <DisasterPreparedness state={state} setState={setState} setToast={setToast} />}
        {page === 'plan' && <EmergencyPlan state={state} summary={summary} setState={setState} setToast={setToast} />}
        {page === 'learn' && <Learn completed={state.completedTips} setState={setState} />}
        {page === 'power' && <PowerEcosystem plan={state.powerPlan} onChange={(powerPlan) => setState((old) => ({ ...old, powerPlan }))} onBack={() => setPage('home')} />}
      </main>

      <footer className="app-footer" {...backgroundA11y}>
        <small>© {new Date().getFullYear()} そなえメモ</small>
      </footer>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション" {...backgroundA11y}>
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
      {notificationsOpen && <NotificationPanel state={state} summary={summary} setToast={setToast} onClose={() => setNotificationsOpen(false)} onOpenItem={(item) => { setNotificationsOpen(false); setModal(item); }} onOpenRolling={() => { setNotificationsOpen(false); setPage('rolling'); }} onReplenish={replenishShortage} />}
      {shareOpen && <ShareQrPanel onClose={() => setShareOpen(false)} setToast={setToast} />}
      {optionsOpen && <OptionsPanel state={state} setState={setState} onClose={() => setOptionsOpen(false)} setToast={setToast} />}
      {!state.onboarding?.completed && <SetupWizard state={state} setState={setState} />}
      {toast && <div className="toast" role="status" aria-live="polite"><Check size={18} />{toast}</div>}
    </div>
  );
}

function SetupWizard({ state, setState }) {
  const [step, setStep] = useState(1);
  const [household, setHousehold] = useState(state.household || 1);
  const [targetDays, setTargetDays] = useState(state.preparedness?.targetDays || 7);
  const [contact, setContact] = useState(state.contact);
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => [...(dialogRef.current?.querySelectorAll(selector) || [])].filter((element) => !element.hidden);
    const handleKey = (event) => {
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const elements = focusable();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1);
      const focusOutside = !dialogRef.current.contains(document.activeElement);
      if (elements.length === 1) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (document.activeElement === first || focusOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusOutside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    (dialogRef.current?.querySelector('[autofocus]:not([disabled])') || focusable()[0])?.focus();
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [step]);
  const finish = (saveContact) => setState((old) => ({
    ...old,
    household: Math.min(12, Math.max(1, Number(household) || 1)),
    contact: saveContact ? { ...old.contact, ...contact } : old.contact,
    preparedness: { ...old.preparedness, targetDays: Math.min(180, Math.max(1, Number(targetDays) || 7)) },
    onboarding: { completed: true, completedAt: new Date().toISOString() },
  }));
  return <div className="setup-backdrop">
    <section ref={dialogRef} className="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <Brand />
      <ol className="setup-progress" aria-label={`初期設定 3ステップ中${step}ステップ目`}>
        {[{ label: '家族人数', icon: Users }, { label: '備蓄目標', icon: CalendarDays }, { label: '連絡先', icon: MapPin }].map(({ label, icon: Icon }, index) => { const number = index + 1; return <li className={number < step ? 'done' : number === step ? 'current' : ''} aria-current={number === step ? 'step' : undefined} key={label}><span>{number < step ? <Check /> : <Icon />}</span><b>{label}</b><small>{number} / 3</small></li>; })}
      </ol>
      <span className="kicker">FIRST SETUP ・ {step} / 3</span>
      {step === 1 && <div className="setup-step">
        <h1 id="setup-title">何人分の備えをしますか？</h1>
        <p>必要な水・食料・携帯トイレの量を、この人数で計算します。</p>
        <div className="setup-stepper" aria-label="家族人数"><button autoFocus type="button" aria-label="家族人数を1人減らす" disabled={household <= 1} onClick={() => setHousehold((value) => Math.max(1, value - 1))}><Minus /></button><b>{household}<small>人</small></b><button type="button" aria-label="家族人数を1人増やす" disabled={household >= 12} onClick={() => setHousehold((value) => Math.min(12, value + 1))}><Plus /></button></div>
        <button className="primary-button setup-next" type="button" onClick={() => setStep(2)}>次へ<ArrowRight /></button>
      </div>}
      {step === 2 && <div className="setup-step">
        <h1 id="setup-title">何日分の備蓄を目指しますか？</h1>
        <p>水・食品などは最低3日、できれば1週間が目安です。地域や家族の事情に合わせ、後から変更できます。</p>
        <div className="setup-day-options">{[3, 7, 14, 30].map((day) => <button autoFocus={day === 3} type="button" className={Number(targetDays) === day ? 'active' : ''} aria-pressed={Number(targetDays) === day} key={day} onClick={() => setTargetDays(day)}><b>{day}</b><small>日分</small>{day === 7 && <em>おすすめ</em>}</button>)}</div>
        <label className="setup-custom-days"><span>その他の日数</span><input type="number" inputMode="numeric" min="1" max="180" value={targetDays} onChange={(event) => setTargetDays(event.target.value)} /><small>日分</small></label>
        <div className="setup-actions"><button className="secondary-button" type="button" onClick={() => setStep(1)}>戻る</button><button className="primary-button" type="button" onClick={() => setStep(3)}>次へ<ArrowRight /></button></div>
      </div>}
      {step === 3 && <div className="setup-step">
        <h1 id="setup-title">集合場所と連絡先</h1>
        <p>通信が使えないときにも、この端末で確認できます。未定の場合は後で設定できます。</p>
        <div className="setup-contact-fields"><label><span><MapPin />避難・集合場所</span><input autoFocus value={contact.shelter} onChange={(event) => setContact((old) => ({ ...old, shelter: event.target.value }))} placeholder="例：〇〇小学校 体育館" /></label><label><span><Phone />緊急連絡先</span><input inputMode="tel" value={contact.phone} onChange={(event) => setContact((old) => ({ ...old, phone: event.target.value }))} placeholder="例：090-0000-0000" /></label></div>
        <div className="setup-actions setup-finish-actions"><button className="secondary-button" type="button" onClick={() => finish(false)}>あとで設定</button><button className="primary-button" type="button" onClick={() => finish(true)}><Check />初期設定を完了</button></div>
        <button className="setup-back-link" type="button" onClick={() => setStep(2)}>目標備蓄日数に戻る</button>
      </div>}
    </section>
  </div>;
}

function OptionsPanel({ state, setState, onClose, setToast }) {
  const dialogRef = useRef(null);
  const [household, setHousehold] = useState(state.household);
  useDialogClose(onClose, dialogRef);
  const save = () => {
    setState((old) => ({ ...old, household: Math.min(12, Math.max(1, Number(household) || 1)) }));
    setToast('家族人数を更新しました');
    onClose();
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal compact-modal options-panel" role="dialog" aria-modal="true" aria-labelledby="options-title"><div className="modal-title"><div><span className="kicker">OPTIONS</span><h2 id="options-title">オプション</h2></div><button type="button" aria-label="オプションを閉じる" onClick={onClose}><X /></button></div><div className="option-household"><div><Users /><span><b>家族人数</b><small>備蓄日数の計算に使用します</small></span></div><div className="setup-stepper"><button autoFocus type="button" aria-label="家族人数を1人減らす" disabled={household <= 1} onClick={() => setHousehold((value) => Math.max(1, value - 1))}><Minus /></button><b>{household}<small>人</small></b><button type="button" aria-label="家族人数を1人増やす" disabled={household >= 12} onClick={() => setHousehold((value) => Math.min(12, value + 1))}><Plus /></button></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="button" className="primary-button" onClick={save}><Check />保存する</button></div></section></div>;
}

function Dashboard({ state, summary, setState, setPage, setModal, powerEntryRef }) {
  const [targetOpen, setTargetOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const defense = useMemo(() => defensePower(state, summary), [state, summary]);
  const essentialGates = useMemo(() => essentialPreparednessGates(state, summary), [state, summary]);
  const unitNeeds = useMemo(() => stockpileUnitNeeds(state.inventory, state.household, defense.targetDays), [state.inventory, state.household, defense.targetDays]);
  const foodNeeds = useMemo(() => stockpileUnitNeeds(state.inventory, state.household, 3), [state.inventory, state.household]);
  const hygieneNeeds = useMemo(() => stockpileUnitNeeds(state.inventory, state.household, 7), [state.inventory, state.household]);
  const waterNeed = unitNeeds.find((item) => item.key === 'water');
  const foodNeed = foodNeeds.find((item) => item.key === 'food');
  const toiletNeed = hygieneNeeds.find((item) => item.key === 'toilet');
  const gasNeed = unitNeeds.find((item) => item.key === 'gas');
  const stoveNeed = unitNeeds.find((item) => item.key === 'stove');
  const nextEssentialGate = essentialGates.gates.find((gate) => !gate.complete) || essentialGates.gates[0];
  const setTargetDays = (targetDays) => setState((old) => ({ ...old, preparedness: { ...old.preparedness, targetDays: Math.min(180, Math.max(1, Number(targetDays) || 1)) } }));
  const stockpileDays = Number.isFinite(summary.householdStockpileDays) ? summary.householdStockpileDays : summary.survivalDays;
  const targetGap = Math.max(0, defense.targetDays - stockpileDays);
  return <section className={`home-dashboard wrap${detailsOpen ? ' details-expanded' : ''}`} aria-label="防災ホーム">
    <header className="home-heading">
      <div><span className="kicker">TODAY'S READINESS</span><h1>わが家の防災状況</h1></div>
      <div className="home-heading-actions"><button type="button" className="home-target-summary" aria-label={`備蓄日数の目標 ${defense.targetDays}日。変更する`} onClick={() => setTargetOpen(true)}><CalendarDays /><span><small>備蓄目標</small><b>{defense.targetDays}日</b></span><ChevronRight /></button><div className="household-summary" aria-label={`家族${state.household}人`}><Users /><b>{state.household}<small>人</small></b></div></div>
    </header>

    <details className={`priority-goals ${essentialGates.complete ? 'complete' : ''}`}>
      <summary><span className="priority-summary-copy"><span className="kicker">ESSENTIAL SAFETY GATES</span><b id="priority-goals-title">命と衛生の必須確認</b><small>{essentialGates.complete ? '必須条件は確認済み。定期的に見直せます' : `次は「${nextEssentialGate.label}」を確認`}</small></span><span className="priority-goals-count">{essentialGates.completeCount}<small> / {essentialGates.gates.length}</small></span><span className="disclosure-label">すべて見る<ChevronDown /></span></summary>
      <div className="priority-goal-grid" role="region" aria-labelledby="priority-goals-title">{essentialGates.gates.map((gate) => {
        const Icon = gate.key === 'home' ? ShieldCheck : gate.key === 'risk' ? MapPin : gate.key === 'contact' ? Phone : gate.key === 'medicine' ? Heart : gate.key === 'water' ? Droplets : gate.key === 'toilet' ? Sparkles : Lightbulb;
        return <button type="button" className={gate.complete ? 'complete' : ''} key={gate.key} aria-label={`${gate.label}を確認する`} onClick={() => setPage(gate.page, { target: gate.page === 'roadmap' ? essentialGateTaskTargets[gate.key] : null })}><span className={`priority-goal-icon ${gate.key}`}><Icon /></span><span><small>{gate.label}</small><b>{gate.detail}</b><em>{gate.statusLabel}</em></span><strong>{gate.complete ? <Check /> : <ArrowRight />}{gate.complete ? '確認済み' : '確認する'}</strong></button>;
      })}</div>
      <p>{essentialGates.complete ? '必須条件を確認済みです。季節・家族構成・期限の変化に合わせて再点検してください。' : '平均点より先に、未確認の必須条件を一つずつ確認してください。'}</p>
    </details>

    <div className="home-metrics">
      <article className="survival-card">
        <div className="metric-title"><span><Droplets />食料・水の備蓄</span><span className="metric-title-actions"><button type="button" onClick={() => setCalculationOpen(true)}><CircleHelp />計算方法</button><button onClick={() => setPage('inventory')}>備蓄を確認 <ArrowRight /></button></span></div>
        <div className="survival-main"><div><small>生活継続の目安</small><strong>{formatDays(stockpileDays)}<em>日分</em></strong><p>{targetGap ? `目標まで あと${formatDays(targetGap)}日分` : `${defense.targetDays}日目標を達成`}</p></div><ShieldCheck /></div>
        <button type="button" className="stockpile-detail-toggle" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}><span><ClipboardList /><b>内訳と不足を確認</b><small>水・食料・トイレ・熱源・電源</small></span><ChevronDown /></button>
        {detailsOpen && <div className="home-stockpile-details"><div className="supply-days">
          <div><span><Droplets />水<small>1人1日3L</small></span><b>{formatDays(summary.waterDays)}<small>日分</small></b><em className={waterNeed.shortage ? 'resource-shortage' : 'resource-ready'}>{waterNeed.shortage ? `2Lボトル あと${waterNeed.shortage}本` : '目標量を確保'}</em><i><u style={{ width: `${defense.waterCoverage * 100}%` }} /></i></div>
          <div><span><ShoppingBasket />食料<small>1人1日3食（重量日数は簡易換算）</small></span><b>{formatDays(summary.foodDays)}<small>日分</small></b><em className={foodNeed.shortage ? 'resource-shortage' : 'resource-ready'}>{foodNeed.shortage ? `あと${foodNeed.shortage}食` : '目標量を確保'}</em><i><u style={{ width: `${defense.foodCoverage * 100}%` }} /></i></div>
        </div><div className="home-stockpile-inline"><button type="button" aria-label="携帯トイレ7日分の目安" onClick={() => setBenchmarkOpen(true)}><Sparkles /><span><small>携帯トイレ</small><b>{formatDays(summary.toiletDays)}日分</b><em className={toiletNeed.shortage ? 'resource-shortage' : 'resource-ready'}>{toiletNeed.shortage ? `7日目標まであと${toiletNeed.shortage}回分` : '7日分を確保'}</em></span><CircleHelp /></button><div className="heat-stock-summary"><Flame /><span><small>調理用熱源</small><b>ボンベ {gasNeed.current}</b><em className={gasNeed.shortage || stoveNeed.shortage ? 'resource-shortage' : 'resource-ready'}>{gasNeed.shortage ? `あと${gasNeed.shortage}本` : 'ボンベ確保'}{stoveNeed.shortage ? '・コンロあと1台' : ''}</em></span></div><button type="button" onClick={() => setPage('power')}><Zap /><span><small>非常用電源</small><b>{state.powerPlan?.autonomyDays || 3}日条件で試算</b></span><ChevronRight /></button><p>主要備蓄の参考日数は水・食料・携帯トイレのうち最短の日数です。</p></div></div>}
        <div className="home-stockpile-actions"><button type="button" onClick={() => setBudgetOpen(true)}><CalendarDays />備蓄計画を立てる</button></div>
        {summary.foodItemsMissingWeight > 0 && <button className="food-weight-notice" onClick={() => setPage('inventory')}>重量未登録の食料が{summary.foodItemsMissingWeight}件あります <ChevronRight /></button>}
      </article>

      <article className="defense-card">
        <div className="metric-title"><span><BadgeCheck />備えの進捗（参考）</span><button onClick={() => setPage('roadmap')}>詳細 <ArrowRight /></button></div>
        <div className="defense-score"><div className="compact-score-ring" style={{ '--score': `${defense.score * 3.6}deg` }}><strong>{defense.score}<small>%</small></strong></div><div><span>目標 {defense.targetDays}日基準</span><h2>{defense.requiredStage.label}</h2><p>{defense.fulfilled} / {defense.requirementCount} 要件達成</p></div></div>
        <div className="defense-next"><span>次の要件</span><b>{defense.nextTask?.title || (targetGap ? '水・食料を目標日数まで確保' : '登録項目を確認済み')}</b></div>
      </article>
    </div>

    <nav className="home-shortcuts" aria-label="ホームのクイック操作">
      <button className="quick-bag" aria-label="避難バッグを自動で準備" onClick={() => setPage('bags')}><Backpack /><span><b>避難バッグ</b><small>在庫から自動選定</small></span><ChevronRight /></button>
      <button ref={powerEntryRef} aria-label="停電時の電力を設計" onClick={() => setPage('power')}><Zap /><span><b>電力設計</b><small>蓄電池・太陽光</small></span><ChevronRight /></button>
      <button className="quick-add" onClick={() => setModal('new')}><PackagePlus /><span><b>備蓄を追加</b><small>すぐに登録</small></span><Plus /></button>
    </nav>
    {targetOpen && <TargetDaysDialog value={defense.targetDays} onClose={() => setTargetOpen(false)} onSave={(value) => { setTargetDays(value); setTargetOpen(false); }} />}
    {budgetOpen && <BudgetPlannerDialog state={state} summary={summary} setState={setState} onClose={() => setBudgetOpen(false)} />}
    {calculationOpen && <StockpileCalculationDialog summary={summary} items={state.inventory} household={state.household} targetDays={defense.targetDays} onClose={() => setCalculationOpen(false)} onAction={() => { setCalculationOpen(false); setPage('inventory'); }} />}
    {benchmarkOpen && <PreparednessBenchmarkDialog kind="hygiene" onClose={() => setBenchmarkOpen(false)} />}
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

function TargetDaysDialog({ value, onClose, onSave }) {
  const dialogRef = useRef(null);
  const [days, setDays] = useState(Number(value) || 1);
  const [editing, setEditing] = useState(false);
  useDialogClose(onClose, dialogRef);
  const normalizeDays = (next) => Math.min(180, Math.max(1, Number(next) || 1));
  const adjust = (delta) => setDays((current) => normalizeDays(Number(current) + delta));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form ref={dialogRef} className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="target-days-title" onSubmit={(event) => { event.preventDefault(); onSave(normalizeDays(days)); }}><div className="modal-title"><div><span className="kicker">STOCKPILE GOAL</span><h2 id="target-days-title">目標備蓄日数を変更</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div><p className="stepper-help">水・食品などは最低3日、できれば1週間が目安です。地域と家族の事情に合わせて設定します（1〜180日）。</p><div className="target-day-stepper" aria-label="目標備蓄日数"><button autoFocus type="button" aria-label="目標備蓄日数を1日減らす" disabled={Number(days) <= 1} onClick={() => adjust(-1)}><ChevronRight /></button>{editing ? <label className="target-day-input"><input autoFocus type="number" inputMode="numeric" min="1" max="180" value={days} onChange={(event) => setDays(event.target.value)} onBlur={() => { setDays(normalizeDays(days)); setEditing(false); }} aria-label="目標備蓄日数を直接入力" /><small>日</small></label> : <button type="button" className="target-day-value" aria-label={`目標備蓄日数 ${days}日。タップして直接入力`} onClick={() => setEditing(true)}><b>{days}</b><small>日</small></button>}<button type="button" aria-label="目標備蓄日数を1日増やす" disabled={Number(days) >= 180} onClick={() => adjust(1)}><ChevronRight /></button></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button"><Check />設定する</button></div></form></div>;
}

function ScoreRing({ score }) {
  const radius = 70; const circumference = 2 * Math.PI * radius;
  return <div className="score-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r={radius} /><circle className="progress" cx="90" cy="90" r={radius} style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - score / 100) }} /></svg><div><b>{score}</b><span>%</span><small>充足率</small></div></div>;
}

const formatDays = (days) => (Math.floor(Math.max(0, Number(days) || 0) * 10) / 10).toFixed(1);
const formatFoodWeight = (grams) => Number(grams) >= 1000 ? `${(Number(grams) / 1000).toFixed(1)}kg` : `${Math.round(Number(grams) || 0)}g`;
const formatWaterVolume = (ml) => `${((Number(ml) || 0) / 1000).toFixed(1)}L`;

const stockpileEvidence = {
  water: { label: '政府広報（飲料1L・調理2L）', url: 'https://www.gov-online.go.jp/video/cao/dl/public_html/gov/pdf/katsuji/tenjidaikatsuji202103.pdf' },
  food: { label: '政府広報（1日3食）', url: 'https://www.gov-online.go.jp/tokusyu/bousai/preparation.html' },
  hygiene: { label: '経済産業省（35回分／週）', url: 'https://www.meti.go.jp/policy/mono_info_service/mono/jyutaku/toirebichiku.html' },
  heat: { label: '政府広報（約6本／週）', url: 'https://www.gov-online.go.jp/article/202103/entry-10236.html' },
  light: { label: '内閣府掲載資料（1人1個）', url: 'https://www.bousai.go.jp/kyoiku/chikubousai/chikubo/chikubo/pdf/11_002.pdf' },
};

const itemCategoryGuidance = {
  water: { title: '水の備蓄基準', primary: '1人1日 合計3L（飲料1L＋調理2L）', detail: '湯せん、食品・食器の洗浄、トイレなどの生活用水は3Lに含まれないため、別に確保します。', evidence: stockpileEvidence.water },
  food: { title: '食料の備蓄基準', primary: '1人1日 3食', detail: '最低3日分、できれば1週間分を目標にします。重量は食品で異なるため、450gは公的必要量ではなくアプリの日数比較用換算です。', evidence: stockpileEvidence.food },
  hygiene: { title: '衛生用品の備蓄基準', primary: '携帯トイレ：1人1週間 35回分', detail: '1日5回として計算します。密閉袋、トイレットペーパー、ウェットティッシュも一緒に備えます。', evidence: stockpileEvidence.hygiene },
  heat: { title: '熱源の備蓄基準', primary: 'カセットボンベ：1人1週間 約6本', detail: '政府広報の家庭備蓄例です。実際の燃焼時間は火力、気温、器具、調理内容で変わるため、調理回数へは換算しません。', evidence: stockpileEvidence.heat },
  light: { title: '灯り・電源の確認基準', primary: '懐中電灯：できれば1人1個', detail: '使用機器に合う予備電池と、情報収集用のラジオ・モバイルバッテリーも確認します。', evidence: stockpileEvidence.light },
  comfort: { title: '快適用品の考え方', primary: '普段使う量＋家族分', detail: '乳幼児、高齢者、女性、持病、季節など、家族固有の必要量を優先して入力します。' },
};

function StockpileDaysPanel({ summary, items = [], household, targetDays = 3, onAction, actionLabel }) {
  const missingCount = summary.foodItemsMissingWeight + summary.waterItemsMissingVolume;
  const unitNeeds = useMemo(() => stockpileUnitNeeds(items, household, targetDays), [items, household, targetDays]);
  const needByKey = Object.fromEntries(unitNeeds.map((item) => [item.key, item]));
  const foodTargetGrams = household * FOOD_GRAMS_PER_PERSON_DAY * targetDays;
  const waterTargetMl = household * WATER_ML_PER_PERSON_DAY * targetDays;
  const foodPercent = Math.min(100, summary.foodGrams / foodTargetGrams * 100) || 0;
  const waterPercent = Math.min(100, summary.waterMl / waterTargetMl * 100) || 0;
  const milestones = [...new Set([Math.ceil(targetDays / 3), Math.ceil(targetDays * 2 / 3), targetDays])];
  return <article className="card stockpile-runway">
    <header><div><span className="kicker">STOCKPILE REFERENCE</span><h2>主要備蓄は何日分ある？</h2><p>水は公的目安の1人1日3L。食料は重量による参考換算で、栄養・個別必要量を保証しません。</p></div><span className="runway-household"><Users />{household}人分</span></header>
    <div className="runway-layout">
      <div className="runway-answer"><small>食料と水が両方そろう日数</small><strong>{formatDays(summary.survivalDays)}<em>日</em></strong><span>{targetDays}日目標まで あと{formatDays(Math.max(0, targetDays - summary.survivalDays))}日分</span></div>
      <div className="runway-days" aria-label={`${targetDays}日目標のうち${formatDays(summary.survivalDays)}日分`}>
        {milestones.map((day) => <div className="runway-day" style={{ '--fill': `${Math.min(100, summary.survivalDays / day * 100)}%` }} key={day}><b>{day}日</b><span>{summary.survivalDays >= day ? '確保' : summary.survivalDays > 0 ? '一部' : '未確保'}</span></div>)}
      </div>
      <div className="runway-resources">
        <section><div><span className="resource-icon food"><ShoppingBasket /></span><p><small>食料 合計 {formatFoodWeight(summary.foodGrams)}</small><b>{formatDays(summary.foodDays)}日分</b></p><em className={needByKey.food.shortage ? 'resource-shortage' : 'resource-ready'}>{needByKey.food.shortage ? `あと${needByKey.food.shortage}食` : '目標量を確保'}</em></div><div className="resource-meter"><i style={{ width: `${foodPercent}%` }} /></div><small>目標 {formatFoodWeight(foodTargetGrams)}・1食150gの簡易換算</small></section>
        <section><div><span className="resource-icon water"><Droplets /></span><p><small>水 合計 {formatWaterVolume(summary.waterMl)}</small><b>{formatDays(summary.waterDays)}日分</b></p><em className={needByKey.water.shortage ? 'resource-shortage' : 'resource-ready'}>{needByKey.water.shortage ? `2Lボトル あと${needByKey.water.shortage}本` : '目標量を確保'}</em></div><div className="resource-meter water"><i style={{ width: `${waterPercent}%` }} /></div><small>目標 {formatWaterVolume(waterTargetMl)}・{household}人 × 1日3L</small></section>
      </div>
    </div>
    <div className="runway-supporting-needs" aria-label="生活を支える備蓄">
      {unitNeeds.filter((item) => ['toilet', 'gas', 'stove'].includes(item.key)).map((item) => <div key={item.key}><span className={`resource-icon ${item.key}`}><CategoryIcon category={item.key === 'toilet' ? 'hygiene' : 'heat'} /></span><p><small>{item.label}</small><b>{item.current}</b></p><em className={item.shortage ? 'resource-shortage' : 'resource-ready'}>{item.shortage ? `あと${item.shortage}${item.unit}` : '目標量を確保'}</em></div>)}
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

const evacuationBagStages = [
  { id: 'bag-primary', step: '01', label: '一時避難', title: 'まず持ち出すバッグ', timing: '危険が迫ったら、すぐに持つ', description: '自宅から最寄りの安全な避難場所まで、即座に逃げるためのバッグです。命・移動・服薬を優先し、すぐ背負える軽さに絞ります。' },
  { id: 'bag-secondary', step: '02', label: '二次避難', title: '避難生活を続けるバッグ', timing: '危険が落ち着き、安全を確認できた後', description: '安全を確認して自宅へ戻れる場合に追加で持ち出し、避難所などで数日過ごすためのバッグです。衛生・情報・生活用品を補います。' },
];

function EvacuationBags({ state, setState, setToast, setPage }) {
  const [activeLoadout, setActiveLoadout] = useState(null);
  const primarySettings = bagSettings(state, 'bag-primary');
  const secondarySettings = bagSettings(state, 'bag-secondary');
  const primaryPacking = useMemo(() => autoPackInventory(state.inventory, 'bag-primary', primarySettings.capacityL, state.household), [state.inventory, state.household, primarySettings.capacityL]);
  const secondaryPacking = useMemo(() => autoPackInventory(state.inventory, 'bag-secondary', secondarySettings.capacityL, state.household, { reservedItems: primaryPacking.items }), [state.inventory, state.household, secondarySettings.capacityL, primaryPacking]);
  const packingById = { 'bag-primary': primaryPacking, 'bag-secondary': secondaryPacking };

  const finishLoadout = () => {
    const nextState = completeLoadout(state, activeLoadout);
    if (nextState === state) return;
    setState(nextState);
    setActiveLoadout(null);
    setToast('バッグの実物確認を完了しました');
  };

  return <section className="wrap page-section evacuation-bags-page">
    <div className="page-title bag-page-title"><div><span className="kicker">EVACUATION BAG PLANNER</span><h1>避難バッグを自動で準備</h1><p>登録済みの備蓄・家族人数・バッグ容量から、持出品の参考案を作ります。</p></div><button type="button" className="secondary-button" onClick={() => setPage('inventory')}><Box />備蓄を確認・追加</button></div>

    <details className="bag-purpose-guide">
      <summary><span><span className="kicker">PURPOSE FIRST</span><b id="bag-purpose-title">2つのバッグの使い分け</b><small>一時避難はすぐ逃げる軽さ、二次避難は安全確認後の生活用品</small></span><span className="disclosure-label">詳しく見る<ChevronDown /></span></summary>
      <div className="bag-purpose-content" role="region" aria-labelledby="bag-purpose-title"><div className="bag-purpose-steps">
        <article className="primary-purpose"><span>01</span><div><small>一時避難（一次持ち出し）</small><h3>危険から即座に逃げる</h3><p>災害が発生した、または危険が迫ったとき、自宅から最寄りの安全な避難場所まで移動するために持ちます。</p><b>目安：迷わず背負って、すぐ出発できる量</b></div></article>
        <article className="secondary-purpose"><span>02</span><div><small>二次避難（二次持ち出し）</small><h3>避難先で数日を過ごす</h3><p>緊急性が落ち着き、自宅と移動経路の安全を確認できた場合に追加で持ち出し、避難所などで生活するために使います。</p><b>目安：水・食料・衛生品など数日分の生活用品</b></div></article>
      </div>
      <p className="bag-return-warning"><AlertTriangle /><span><b>荷物を取りに危険な場所へ戻らない</b>自宅や経路の安全を確認できない場合は帰宅せず、一時避難バッグで避難を続けてください。</span></p>
      </div>
    </details>

    <aside className="bag-auto-note" aria-label="自動選定の仕組み"><Sparkles /><div><b>在庫を更新すると、バッグの中身も自動で再計算</b><span>一時避難を先に確保し、二次避難には残りの在庫を割り当てます。期限が近く、重要度の高い備蓄を優先します。</span></div></aside>

    <div className="evacuation-stage-flow" aria-label="避難段階を選択">
      {evacuationBagStages.map((stage, index) => {
        const packing = packingById[stage.id];
        const settings = stage.id === 'bag-primary' ? primarySettings : secondarySettings;
        const totalUnits = packing.items.reduce((sum, item) => sum + item.quantity, 0);
        return <article className={`evacuation-stage-card ${stage.id === 'bag-primary' ? 'primary-stage' : 'secondary-stage'}`} key={stage.id}>
          <header><span className="bag-stage-number">{stage.step}</span><div><small>{stage.label}</small><h2>{stage.title}</h2><p>{stage.timing}</p></div><Backpack /></header>
          <p className="bag-stage-description">{stage.description}</p>
          <div className="bag-plan-summary"><span><small>バッグ容量</small><b>{settings.capacityL}L</b></span><span><small>自動選定</small><b>{packing.items.length}<em>品目</em></b></span><span><small>収納単位</small><b>{totalUnits}<em>点</em></b></span><span><small>使用容量</small><b>{(packing.usedMl / 1000).toFixed(1)}<em>L</em></b></span></div>
          <div className="bag-preview-list">{packing.items.length ? packing.items.slice(0, 4).map((item) => <span key={item.id}><b>{item.name}</b><small>{item.quantity}{item.unit}</small></span>) : <p><AlertTriangle />選定できる備蓄がありません</p>}{packing.items.length > 4 && <em>ほか {packing.items.length - 4}品目</em>}</div>
          {stage.id === 'bag-secondary' && <p className="bag-reserved-summary">一時避難バッグの {primaryPacking.items.reduce((sum, item) => sum + item.quantity, 0)}点は重複させず確保済み</p>}
          <button type="button" className="bag-open-planner" onClick={() => setActiveLoadout(stage.id)}><Sparkles /><span><b>自動選定結果を開く</b><small>容量変更・不足品・実物確認</small></span><ChevronRight /></button>
        </article>;
      })}
    </div>

    <p className="bag-safety-note"><ShieldCheck />自動選定は収納計画です。実際にバッグへ入れた後、画面内の「理想構成」で現物を一つずつ確認してください。</p>
    {activeLoadout && <PracticalLoadout taskId={activeLoadout} state={state} onChange={(packed) => setState((old) => updateLoadout(old, activeLoadout, packed))} onBagSettings={(settings) => setState((old) => updateBagSettings(old, activeLoadout, settings))} onComplete={finishLoadout} onClose={() => setActiveLoadout(null)} />}
  </section>;
}

const pillarLabels = {
  risk: '危険把握', home: '住環境', information: '情報', health: '健康', water: '水', food: '食料',
  sanitation: '衛生', power: '電力', evacuation: '避難', family: '家族', recovery: '復旧', skills: '訓練', community: '共助',
};

function StageIcon({ name }) {
  return name === 'backpack' ? <Backpack /> : name === 'route' ? <Route /> : name === 'calendar' ? <CalendarDays /> : name === 'solar' ? <Sun /> : name === 'community' ? <Users /> : <ShieldCheck />;
}

function PreparednessRoadmap({ state, summary, setState, setPage, setToast, targetTaskId }) {
  const progress = useMemo(() => preparednessProgress(state, summary), [state, summary]);
  const [selectedStageId, setSelectedStageId] = useState(() => progress.currentStage.id);
  const [activeLoadout, setActiveLoadout] = useState(null);
  const nextMissionHeadingRef = useRef(null);
  const targetMissionRef = useRef(null);
  const previousFocusedTaskRef = useRef(progress.nextTask?.id);
  const selectedStage = progress.stages.find((stage) => stage.id === selectedStageId) || progress.currentStage;
  const targetedStage = progress.stages.find((stage) => stage.tasks.some((task) => task.id === targetTaskId));
  const targetedTask = targetedStage?.tasks.find((task) => task.id === targetTaskId);
  const focusedTask = targetedTask || progress.nextTask;
  const focusedStage = targetedStage || progress.currentStage;
  const weakestLabel = progress.weakest ? pillarLabels[progress.weakest.pillar] : '総合';
  const completedStages = progress.stages.filter((stage) => stage.gateClear).length;
  useEffect(() => {
    const previousTask = previousFocusedTaskRef.current;
    previousFocusedTaskRef.current = progress.nextTask?.id;
    if (previousTask && previousTask !== progress.nextTask?.id) nextMissionHeadingRef.current?.focus();
  }, [progress.nextTask?.id]);
  useEffect(() => {
    if (!targetedTask) return undefined;
    const frame = window.requestAnimationFrame(() => targetMissionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [targetedTask?.id]);

  const toggle = (task) => {
    if (getLoadout(task.id)) {
      const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === task.id));
      setActiveLoadout(task.id);
      return;
    }
    if (task.auto) {
      setPage(task.id === 'family-route' ? 'plan' : 'inventory');
      setToast(task.id === 'family-route' ? '緊急メモを整えると自動達成します' : '備蓄を目標まで登録すると自動達成します');
      return;
    }
    const taskStage = progress.stages.find((stage) => stage.tasks.some((entry) => entry.id === task.id));
    const wasDone = progress.completed.has(task.id);
    const beforeGate = taskStage.gateClear;
    const nextState = togglePreparednessTask(state, task.id, summary);
    const after = preparednessProgress(nextState, summary);
    const afterStage = after.stages.find((stage) => stage.id === taskStage.id);
    setState(nextState);
    if (!beforeGate && afterStage?.gateClear) {
      setToast(`${taskStage.title} クリア！`);
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
    setToast(!beforeGate && afterStage?.gateClear ? `${taskStage.title} クリア！` : `装備確認完了　+${task.xp} XP`);
  };

  const missionCard = (task, compact = false, targeted = false) => {
    const done = progress.completed.has(task.id);
    const automatic = progress.automatic.has(task.id);
    const loadout = getLoadout(task.id);
    const kitStatus = loadoutStatus(state, task.id);
    return <article className={`mission ${compact ? 'mission-focus' : ''} ${done ? 'done' : ''}`} key={task.id}>
      <button className="mission-check" type="button" aria-label={loadout ? `${task.title}の装備ケースを開く` : task.auto ? `${task.title}の連動データを確認` : `${task.title}を${done ? '未達成に戻す' : '達成にする'}`} onClick={() => toggle(task)}>{done ? <Check /> : task.auto ? <RefreshCw /> : loadout ? <Backpack /> : null}</button>
      <div className="mission-copy"><div><span className="mission-pillar">{pillarLabels[task.pillar]}</span>{task.gate && <span className="mission-gate">段階達成の条件</span>}{automatic && <span className="mission-auto">自動達成</span>}{loadout && <span className="mission-loadout-tag">装備ケース</span>}</div><h3 ref={targeted ? targetMissionRef : undefined} tabIndex={targeted ? -1 : undefined}>{task.title}</h3><p>{task.detail}</p><small><Lightbulb /> 次の行動：{task.action}</small>{task.id === 'hazard-map' && !done && <a className="mission-action-link" href="https://disaportal.gsi.go.jp/" target="_blank" rel="noreferrer">国のハザードマップを開く<ArrowRight /></a>}{loadout && <button className="mission-loadout" type="button" onClick={() => toggle(task)}><span className="mission-loadout-items">{loadout.items.slice(0, 5).map((item) => <i key={item.id} className={kitStatus.packed.has(item.id) ? 'packed' : ''}>{item.symbol}</i>)}</span><b>{loadout.label}</b><em>{kitStatus.done} / {kitStatus.total} 必須品</em><ChevronRight /></button>}</div>
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
      {focusedTask ? missionCard(focusedTask, true, Boolean(targetedTask)) : <div className="journey-complete"><Trophy /><div><b>全段階を踏破しました</b><span>季節の変わり目に点検と実地訓練を続けましょう。</span></div></div>}
      {focusedStage.tasks.filter((task) => task.id !== focusedTask?.id).length > 0 && <details className="stage-more"><summary>この段階の全項目を見る <span>{focusedStage.total}項目</span></summary><div className="mission-list">{focusedStage.tasks.filter((task) => task.id !== focusedTask?.id).map((task) => missionCard(task))}</div></details>}
    </section>

    <details className="roadmap-overview">
      <summary className="roadmap-overview-head"><span><Route /><b id="roadmap-overview-title">6段階の防災マップ</b><small>現在地と、この先に必要な備えを確認</small></span><em>{completedStages} / 6 段階達成</em><span className="disclosure-label">全体を見る<ChevronDown /></span></summary>
      <div className="roadmap-overview-body">
        <div className="stage-flow" role="list" aria-label="防災力の段階">
          {progress.stages.map((stage, index) => <div className="stage-flow-unit" key={stage.id}>
            <button type="button" role="listitem" className={`stage-node ${selectedStage.id === stage.id ? 'selected' : ''} ${stage.gateClear ? 'cleared' : ''}`} onClick={() => setSelectedStageId(stage.id)} aria-current={selectedStage.id === stage.id ? 'step' : undefined}>
              <span className="stage-number">{stage.gateClear ? <Check /> : stage.number}</span>
              <span className="stage-node-icon"><StageIcon name={stage.icon} /></span>
              <span className="stage-node-copy"><small>STAGE {stage.number}</small><b>{stage.title}</b><span>{stage.subtitle}</span></span>
              <span className="stage-node-score">{stage.done}/{stage.total}</span>
            </button>
            {index < progress.stages.length - 1 && <span className={`flow-connector ${stage.gateClear ? 'active' : ''}`} aria-hidden="true"><ChevronRight /></span>}
          </div>)}
        </div>
        <section className="stage-detail">
          <div className="stage-detail-head"><div><span className="stage-detail-number">STAGE {selectedStage.number}</span><h2>{selectedStage.title}</h2><p>{selectedStage.subtitle}</p></div><div className="stage-percent"><b>{selectedStage.percent}%</b><span>{selectedStage.gateClear ? '段階達成' : 'いつでも実行可能'}</span></div></div>
          <div className="mission-list">{selectedStage.tasks.map((task) => missionCard(task))}</div>
        </section>
        <section className="achievement-section"><div className="section-heading compact"><div><span className="kicker">ACHIEVEMENTS</span><h2>獲得した防災章</h2></div><Trophy /></div><div className="achievement-row">{progress.stages.map((stage) => <div className={`achievement ${stage.gateClear ? 'earned' : ''}`} key={stage.id}><span><StageIcon name={stage.icon} /></span><b>{stage.title}</b><small>{stage.gateClear ? '獲得済み' : '未獲得'}</small></div>)}</div></section>
      </div>
    </details>
    {activeLoadout && <PracticalLoadout taskId={activeLoadout} state={state} onChange={(packed) => setState((old) => updateLoadout(old, activeLoadout, packed))} onBagSettings={(settings) => setState((old) => updateBagSettings(old, activeLoadout, settings))} onComplete={finishLoadout} onClose={() => setActiveLoadout(null)} />}
  </section>;
}

function Inventory({ state, summary, transactions, setModal, updateInventory, setState, setToast, setPage }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [consumeItem, setConsumeItem] = useState(null);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const importRef = useRef(null);
  const insights = useMemo(() => transactionInsights(transactions), [transactions]);
  const budgetProjection = useMemo(() => stockpileBudgetProjection(state.inventory, state.household, state.preparedness?.targetDays || 7, state.preparedness?.annualBudget || 0), [state.inventory, state.household, state.preparedness?.targetDays, state.preparedness?.annualBudget]);
  const rows = summary.rows.filter((item) => (filter === 'all' || item.category === filter) && item.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3) || a.tier - b.tier || a.ratio - b.ratio);
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
  return <section className="wrap page-section inventory-page">
    <div className="page-title"><h1>わが家の備蓄</h1><div className="page-actions"><button className="secondary-button" onClick={() => setPage('rolling')}><RefreshCw />ローリングストック計画</button><details className="data-management"><summary><Download />データ管理</summary><div><button className="secondary-button" onClick={exportData}><Download />バックアップ</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload />復元</button></div><input ref={importRef} hidden type="file" accept="application/json" onChange={importData} /></details><button className="primary-button" onClick={() => setModal('new')}><Plus />備蓄品を追加</button></div></div>
    <div className="summary-strip inventory-summary-strip"><div><span>主要備蓄の参考日数</span><b>{formatDays(summary.householdStockpileDays ?? summary.survivalDays)}日</b></div><div><span>{state.preparedness?.targetDays || 7}日目標まで</span><b>{budgetProjection.costComplete ? `約¥${budgetProjection.totalCost.toLocaleString()}` : '単価確認中'}</b></div><div><span>年間予算</span><b>{budgetProjection.annualBudget ? `¥${budgetProjection.annualBudget.toLocaleString()}` : '未設定'}</b></div><div className="inventory-summary-actions"><button type="button" aria-label="主要備蓄の参考日数と実物不足を開く" onClick={() => setCalculationOpen(true)}><CircleHelp />日数と不足</button><button type="button" aria-label="年間購入計画を開く" onClick={() => setBudgetOpen(true)}><CalendarDays />購入計画</button></div></div>
    <div className="inventory-tools"><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="備蓄品を検索" /></label><div className="filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>すべて</button>{Object.entries(CATEGORY_META).map(([key, value]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{value.label}</button>)}</div></div>
    <div className="inventory-list">
      {rows.map((item) => <article className="inventory-item" key={item.id}>
        {item.imageUrl ? <div className="product-thumb"><img src={item.imageUrl} alt="" /></div> : <div className="category-badge" style={{ '--category': CATEGORY_META[item.category]?.color }}><CategoryIcon category={item.category} /></div>}
        <div className="item-main"><div className="item-title"><span className={`tier tier-${item.tier}`}>TIER {item.tier}</span><h3>{item.name}</h3>{item.brand && <span className="brand-tag">{item.brand}</span>}{item.isExpiring && <span className="expiry-tag">{item.isExpired ? '期限切れ' : `あと${item.daysToExpiry}日`}</span>}{item.category === 'food' && !item.foodWeightG && <span className="amount-missing-tag">重量未登録</span>}{item.category === 'water' && !item.volumeMl && <span className="amount-missing-tag">水量未登録</span>}</div><div className="stock-progress"><span style={{ width: `${Math.min(item.ratio * 100, 100)}%` }} /><i style={{ left: `${Math.min(item.ratio * 100, 100)}%` }} /></div><div className="item-meta"><span>在庫 <b>{item.quantity}{item.unit}</b> / 目標 {item.target}{item.unit}{item.category === 'food' && item.foodWeightG > 0 && <small>・1{item.unit} {formatFoodWeight(item.foodWeightG)}</small>}{item.category === 'water' && item.volumeMl > 0 && <small>・1{item.unit} {formatWaterVolume(item.volumeMl)}</small>}{item.barcode && <small>・JAN {item.barcode}</small>}</span>{item.shortage > 0 ? <span className="shortage">あと {item.shortage}{item.unit}</span> : <span className="enough"><Check /> 目標達成</span>}</div></div>
        <div className="quick-actions"><button aria-label={`${item.name}を消費・廃棄`} onClick={() => setConsumeItem(item)}><Minus /></button><button aria-label={`${item.name}を1つ補充`} onClick={() => adjust(item.id, 1)}><Plus /></button><button aria-label={`${item.name}を編集`} onClick={() => setModal(item)}><Pencil /></button><button aria-label={`${item.name}を削除`} className="danger" onClick={() => remove(item.id)}><Trash2 /></button></div>
      </article>)}
      {!rows.length && <div className="empty-state"><Search /><h3>該当する備蓄品がありません</h3><p>検索条件を変えてみてください。</p></div>}
    </div>
    <details className="card inventory-history-panel">
      <summary><span><History /><b>消費履歴と傾向</b><small>必要なときに開く</small></span><ChevronRight /></summary>
      <div className="operation-panel"><div className="insight-strip"><span>30日消費<b>{insights.consumed30Days}</b></span><span>うち廃棄<b>{insights.discarded30Days}</b></span><span>最多<b>{insights.topConsumed?.name || '—'}</b></span></div>{transactions.length ? transactions.slice(0, 10).map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'rotate' ? '期限順消費' : entry.type === 'consume' ? '消費' : entry.type === 'discard' ? '廃棄' : entry.type === 'delete' ? '削除' : entry.type === 'edit' ? '編集' : '入庫'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}{entry.unit}・{entry.reason || entry.note || ''}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">操作すると履歴が記録されます</div>}</div>
    </details>
    {consumeItem && <ConsumptionModal item={consumeItem} onClose={() => setConsumeItem(null)} onSave={consume} />}
    {calculationOpen && <StockpileCalculationDialog summary={summary} items={state.inventory} household={state.household} targetDays={state.preparedness?.targetDays || 7} onClose={() => setCalculationOpen(false)} onAction={() => { setFilter(summary.foodItemsMissingWeight ? 'food' : 'water'); setCalculationOpen(false); }} />}
    {budgetOpen && <BudgetPlannerDialog state={state} summary={summary} setState={setState} onClose={() => setBudgetOpen(false)} />}
  </section>;
}

function RollingStock({ state, summary, transactions, updateInventory, onBack }) {
  const rawRows = () => state.inventory;
  const rotateOne = (entry) => {
    const result = consumeByRotation(rawRows(), entry.key, 1);
    const consumed = result.consumed[0];
    if (!consumed) return;
    const expired = entry.status === 'expired';
    updateInventory(
      result.inventory,
      expired ? `${consumed.item.name}を期限切れ・廃棄として記録しました` : `${consumed.item.name}を消費として記録しました`,
      createTransaction(
        expired ? 'discard' : 'rotate',
        consumed.item,
        -1,
        expired ? `${consumed.item.expiry}の期限切れロットを廃棄` : `${consumed.item.expiry}の期限が近いロットから消費`,
        { source: 'rolling-stock', reason: expired ? '期限切れ・廃棄' : 'ローリングストック' },
      ),
    );
  };
  const setReminder = (entry, value) => {
    const inventory = rawRows().map((row) => row.id === entry.nextLot.id ? { ...row, rotationReminderDate: value } : row);
    updateInventory(inventory, value ? `再通知日を${value}に設定しました` : '再通知日を解除しました');
  };
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(); limit.setDate(limit.getDate() + 30);
  const maxReminder = limit.toISOString().slice(0, 10);
  const rollingHistory = transactions.filter((entry) => entry.type === 'rotate' || (entry.type === 'discard' && entry.source === 'rolling-stock')).slice(0, 8);
  const upcomingCount = summary.rotationQueue.filter((entry) => entry.status === 'upcoming').length;
  return <section className="wrap page-section rolling-page"><div className="page-title"><div><span className="kicker">CONSUMPTION PLAN</span><h1>ローリングストック消費計画</h1><p>期限が近い物を、期限が来る前に使う順番として整理します。</p></div><button className="secondary-button" onClick={onBack}><ArrowRight className="back-arrow" />備蓄へ戻る</button></div><aside className="rolling-guide"><b>この画面で行うこと</b><span><CalendarDays />期限順に消費予定を確認する</span><span><Bell />必要な日に再通知を設定する</span><span><RefreshCw />実際に使った時だけ消費として記録する</span></aside><div className="rolling-summary"><span><small>消費時期が到来</small><b>{summary.rotationDueCount}品</b></span><span><small>30日以内に予定</small><b>{upcomingCount}品</b></span><span><small>計画中</small><b>{summary.rotationQueue.length}品</b></span></div>{summary.rotationQueue.length ? <div className="rolling-list card">{summary.rotationQueue.map((entry) => { const reminderMax = entry.nextLot.expiry >= today && entry.nextLot.expiry < maxReminder ? entry.nextLot.expiry : maxReminder; const expired = entry.status === 'expired'; return <article className={`rolling-row rolling-row-full ${entry.status}`} key={entry.key}><span className="rolling-order">{expired ? '期限切れ' : entry.daysToRotate <= 0 ? '消費時期です' : `${entry.daysToRotate}日後に消費`}</span><span><b>{entry.nextLot.name}</b><small>消費期限 {entry.nextLot.expiry}（期限日は変更できません）</small><label className="rolling-reminder"><span>{expired ? '廃棄記録前の確認日' : '消費予定の再通知日'}</span><input type="date" min={today} max={reminderMax} value={entry.nextLot.rotationReminderDate || ''} onChange={(event) => setReminder(entry, event.target.value)} /></label></span><div className="rolling-actions"><button type="button" onClick={() => rotateOne(entry)}>{expired ? <Trash2 /> : <RefreshCw />}1{entry.nextLot.unit}を{expired ? '廃棄' : '消費'}として記録</button></div></article>; })}</div> : <div className="empty-state"><Check /><h3>期限付きの備蓄はありません</h3><p>備蓄品に期限を登録すると、ここへ期限順に表示します。</p></div>}<article className="card operation-panel rolling-history"><div className="section-heading compact"><div><span className="kicker">HISTORY</span><h2>消費履歴</h2></div><History /></div>{rollingHistory.length ? rollingHistory.map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'discard' ? '期限切れ・廃棄' : '期限順消費'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta}{entry.unit}・{entry.reason || ''}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">消費を記録すると履歴が残ります</div>}</article></section>;
}

function StockpileCalculationDialog({ summary, items, household, targetDays, onClose, onAction }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  return <div className="modal-backdrop calculation-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal calculation-dialog" role="dialog" aria-modal="true" aria-labelledby="calculation-title"><div className="modal-title"><div><span className="kicker">STOCKPILE REFERENCE</span><h2 id="calculation-title">主要備蓄の参考日数と不足</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div><StockpileDaysPanel summary={summary} items={items} household={household} targetDays={targetDays} onAction={onAction} actionLabel="対象を絞り込む" /></section></div>;
}

function BudgetPlannerDialog({ state, summary, setState, onClose }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const [budget, setBudget] = useState(state.preparedness?.annualBudget || 0);
  const projection = useMemo(() => stockpileBudgetProjection(state.inventory, state.household, state.preparedness?.targetDays || 7, budget), [state.inventory, state.household, state.preparedness?.targetDays, budget]);
  const duration = !projection.costComplete ? '不足商品の単価登録後に表示します' : projection.months === null ? '年間予算を入力すると表示します' : projection.months === 0 ? '目標日数を達成済み' : projection.months < 12 ? `約${projection.months}か月` : `約${(projection.months / 12).toFixed(1)}年`;
  const save = () => {
    setState((old) => ({ ...old, preparedness: { ...old.preparedness, annualBudget: budget } }));
    onClose();
  };
  return <div className="modal-backdrop budget-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-title"><div className="modal-title"><div><span className="kicker">ANNUAL PURCHASE PLAN</span><h2 id="budget-title">年間予算で購入順を決める</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div><label className="annual-budget-input"><span>毎年の備蓄予算（円）<small>この金額の範囲で、優先度の高い物から割り当てます。</small></span><input autoFocus type="number" min="0" max="10000000" step="1000" value={budget} onChange={(event) => setBudget(Math.min(10000000, Math.max(0, Number(event.target.value) || 0)))} /></label><div className="budget-result"><span>備蓄目標<strong>{projection.targetDays}日分</strong></span><span>目標までの概算<strong>{projection.costComplete ? `¥${projection.totalCost.toLocaleString()}` : '単価登録が必要'}</strong></span><span>今年の購入予定<strong>¥{projection.plannedThisYear.toLocaleString()}</strong></span><span>到達目安<strong>{duration}</strong></span></div><section className="annual-purchase-plan" aria-labelledby="purchase-order-title"><header><div><span className="kicker">WHAT TO BUY FIRST</span><h3 id="purchase-order-title">今年、何から買うか</h3></div>{budget > 0 && <span>残り予算 ¥{projection.remainingAnnualBudget.toLocaleString()}</span>}</header>{projection.annualPlan.length ? <ol>{projection.annualPlan.map((item) => <li className={!item.hasPrice ? 'needs-price' : item.plannedQuantity === 0 ? 'deferred' : ''} key={item.key}><span className="purchase-order">{item.order}</span><span><small>{item.label}・現在 {formatDays(item.currentDays)}日分</small><b>{item.recommendation?.name || `${item.label}の商品`}</b><em>{item.recommendation ? `目標まで ${item.recommendation.quantity}${item.recommendation.unit}・単価 ¥${item.recommendation.unitPrice.toLocaleString()}` : '商品に内容量と単価を登録してください'}</em></span><strong>{budget === 0 ? '予算入力後に割当' : item.plannedQuantity > 0 ? <><small>今年買う</small>{item.plannedQuantity}{item.recommendation.unit}<em>¥{item.plannedCost.toLocaleString()}</em></> : item.hasPrice ? '翌年以降' : '単価未登録'}</strong></li>)}</ol> : <div className="empty-small"><Check />目標日数分を確保済みです</div>}</section><p className="dialog-note">主要備蓄の参考日数が短い分野を先にし、同じ場合は水・食料・携帯トイレの順で提案します。価格は登録済み商品の単価による概算です。</p><div className="modal-actions"><button type="button" className="primary-button" onClick={save}><Check />この年間予算で保存</button></div></section></div>;
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
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const plan = useMemo(() => generateEmergencyPlan(state, summary), [state, summary]);
  const simulation = useMemo(() => simulateDisaster(state, summary, scenarioId, days), [state, summary, scenarioId, days]);
  useEffect(() => setDraft(state.contact), [state.contact]);
  const set = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  return <section className="wrap page-section narrow-page"><div className="page-title"><div><span className="kicker">EMERGENCY NOTE</span><h1>もしもの時のメモ</h1><p>通信が不安定でも、この端末から確認できます。</p></div></div>
    <div className="emergency-banner"><ShieldCheck /><div><b>緊急時は安全確保と公的情報が最優先</b><span>このアプリは警報を配信しません。現在地の状況と自治体の指示を優先してください。</span></div></div>
    <section className="emergency-action-flow" aria-label="緊急時に確認する順序">
      <article><span>1</span><div><small>今いる場所</small><b>身の安全を確保</b><p>{simulation.scenario.opening}</p></div></article>
      <article><span>2</span><div><small>最新情報</small><b>公的情報を確認</b><p><a href="https://www.jma.go.jp/bosai/" target="_blank" rel="noreferrer">気象庁 防災情報</a><a href="https://www.bousai.go.jp/" target="_blank" rel="noreferrer">内閣府 防災情報</a></p></div></article>
      <article><span>3</span><div><small>避難判断</small><b>危険なら安全な場所へ</b><p>自宅・経路の安全を確認できない場合は、荷物を取りに戻りません。避難先候補：{state.contact.shelter || '未登録'}</p></div></article>
      <article><span>4</span><div><small>安全確保後</small><b>家族へ連絡</b><p>{state.contact.phone || state.contact.note || '連絡先・連絡ルールが未登録です'}</p></div></article>
    </section>
    <section className="emergency-readout" aria-label="登録済みの緊急連絡情報">
      <article><MapPin /><span>避難・集合場所</span><b>{state.contact.shelter || '未登録'}</b></article>
      <article><Phone /><span>緊急連絡先</span>{state.contact.phone ? <a href={`tel:${state.contact.phone.replace(/[^\d+]/g, '')}`}>{state.contact.phone}</a> : <b className="missing">未登録</b>}</article>
      <article><ClipboardList /><span>家族への伝言・連絡ルール</span><b>{state.contact.note || '未登録'}</b></article>
    </section>
    <details className="generated-plan compact-disclosure"><summary><span><span className="kicker">OFFLINE PLAN</span><b>備蓄と連絡の72時間計画</b><small>{plan.gaps.length ? `先に埋めたい弱点 ${plan.gaps.length}件` : '登録上の基礎条件を確認済み'}</small></span><span className="disclosure-label">計画を見る<ChevronDown /></span></summary><div className="generated-plan-content"><div className="section-heading compact"><div><h2>端末に保存された行動計画</h2></div><div className="benchmark-heading-actions"><button type="button" className="benchmark-help-button" aria-label="72時間と家庭備蓄の説明" onClick={() => setBenchmarkOpen(true)}><CircleHelp /></button><ShieldCheck /></div></div><div className="plan-columns"><article><h3>発災直後</h3>{plan.immediate.map((item) => <p key={item}><Check />{item}</p>)}</article><article><h3>最初の72時間</h3>{plan.first72Hours.map((item) => <p key={item}><Check />{item}</p>)}</article></div>{plan.gaps.length ? <div className="plan-gaps"><b>先に埋めたい弱点</b>{plan.gaps.map((gap) => <span key={gap}><AlertTriangle />{gap}</span>)}</div> : <div className="stage-clear-message"><Check /><div><b>登録上の基礎条件を確認済み</b><span>実物と地域の最新情報を定期的に見直してください。</span></div></div>}</div></details>
    <details className="emergency-editor"><summary><span><Pencil /><b>緊急メモを編集する</b><small>集合場所・連絡先・家族ルールを変更</small></span><ChevronRight /></summary><form className="card plan-form" onSubmit={(e) => { e.preventDefault(); setState((old) => ({ ...old, contact: draft })); setToast('緊急メモを端末に保存しました'); }}>
      <label><span><Users />メモの名前</span><input value={draft.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label><span><MapPin />避難・集合場所</span><input value={draft.shelter} onChange={(e) => set('shelter', e.target.value)} placeholder="例：〇〇小学校 体育館" /></label>
      <label><span><Phone />緊急連絡先</span><input value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="例：090-0000-0000" inputMode="tel" /></label>
      <label><span><ClipboardList />家族への伝言・連絡ルール</span><textarea value={draft.note} onChange={(e) => set('note', e.target.value)} rows="5" /></label>
      <button className="primary-button" type="submit"><Check />この端末に保存</button>
    </form></details>
    <details className="simulator compact-disclosure"><summary><span><span className="kicker">STOCKPILE REFERENCE</span><b>災害別の登録備蓄を確認</b><small>{simulation.scenario.name}・{simulation.days}日間は参考充足度 {simulation.score}%</small></span><span className="disclosure-label">条件を変える<ChevronDown /></span></summary><div className="simulator-content"><p className="simulation-disclaimer">地域リスク・建物安全・警報は評価していません。安全可否ではなく、登録済み備蓄の不足を探す参考表示です。</p><div className="simulator-controls"><label><span>想定</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{DISASTER_SCENARIOS.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label><label><span>継続日数</span><input type="number" min="1" max="14" value={days} onChange={(event) => setDays(event.target.value)} /></label></div><div className={`simulation-result status-${simulation.statusKey}`}><div><span>登録備蓄の参考充足度</span><b>{simulation.score}<small>%</small></b><em>{simulation.status}</em></div><section><h3>{simulation.scenario.name}・{simulation.days}日間</h3><p>{simulation.scenario.opening}</p><strong>{simulation.advice}</strong><div className="gap-chips">{simulation.criticalGaps.map((gap) => <span key={gap.key}>{CATEGORY_META[gap.key]?.label || gap.key} {gap.score}%</span>)}</div></section></div></div></details>
    <div className="offline-note"><Zap /><div><b>初回表示後はオフラインでも確認できます</b><span>アプリ本体と入力済みデータをこの端末に保存します。商品情報の新規照会には通信が必要です。</span></div></div>
    {benchmarkOpen && <PreparednessBenchmarkDialog kind="rescue" onClose={() => setBenchmarkOpen(false)} />}
  </section>;
}

const preparednessBenchmarks = {
  rescue: {
    kicker: 'GOLDEN 72 HOURS',
    title: '命をつなぐ72時間',
    target: '目標：72時間以上',
    description: '72時間は人命救助活動で重視される時間の目安です。家庭備蓄は別の基準として、水・食品などを最低3日、できれば1週間分用意します。',
    note: '備蓄量は安全な在宅避難を保証しません。建物や周囲が危険な場合は、公的情報に従って安全を確保してください。',
  },
  hygiene: {
    kicker: 'TOILET STOCKPILE',
    title: '携帯トイレはまず1週間分',
    target: '目標：1人35回分／週',
    description: '1人1日5回として、まず1週間分を用意します。便袋・凝固剤・処理袋を一組として数え、手指衛生用品は別に確認します。',
    note: '地域の孤立可能性や家族事情に応じて追加してください。携帯トイレの回数と、衛生用品全体の量は分けて管理します。',
  },
};

function PreparednessBenchmarkDialog({ kind, onClose }) {
  const dialogRef = useRef(null);
  const benchmark = preparednessBenchmarks[kind];
  useDialogClose(onClose, dialogRef);
  return <div className="modal-backdrop benchmark-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal compact-modal benchmark-dialog" role="dialog" aria-modal="true" aria-labelledby={`benchmark-${kind}-title`}><div className="modal-title"><div><span className="kicker">{benchmark.kicker}</span><h2 id={`benchmark-${kind}-title`}>{benchmark.title}</h2></div><button type="button" aria-label="目安の説明を閉じる" onClick={onClose}><X /></button></div><strong>{benchmark.target}</strong><p>{benchmark.description}</p><small>{benchmark.note}</small></section></div>;
}

function useDialogClose(onClose, dialogRef) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getDialog = () => dialogRef.current || document.querySelector('[role="dialog"]');
    const frame = window.requestAnimationFrame(() => {
      const dialog = getDialog();
      (dialog?.querySelector('[autofocus]:not([disabled])') || dialog?.querySelector(selector))?.focus();
    });
    const handleKey = (event) => {
      if (event.key === 'Escape') return onCloseRef.current();
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
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus?.();
    };
  }, [dialogRef]);
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

function NotificationPanel({ state, summary, setToast, onClose, onOpenItem, onOpenRolling, onReplenish }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const expiry = summary.rows.filter((item) => item.isExpiring || item.isRotationReminderDue).sort((a, b) => (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999));
  const shortages = summary.rows.filter((item) => item.shortage > 0).sort((a, b) => (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3) || a.tier - b.tier || a.ratio - b.ratio);
  const checks = summary.rows.filter((item) => item.isCheckDue).sort((a, b) => a.daysToCheck - b.daysToCheck);
  const notifications = new Set([...expiry, ...shortages, ...checks].map((item) => item.id));
  const enableNotifications = async () => {
    if (!('Notification' in window)) return setToast('この端末はシステム通知に対応していません');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const advice = buildCharacterAdvice(state, summary);
      new Notification(`${getCharacter(state.selectedCharacter).name}からのお知らせ`, { body: advice.text, icon: `${import.meta.env.BASE_URL}favicon.svg` });
      setToast('次回からキャラクターがお知らせします');
    } else setToast('通知は許可されませんでした');
  };
  const group = (title, description, rows, kind) => rows.length ? <section className="notification-group"><header><div><b>{title}</b><small>{description}</small></div><span>{rows.length}</span></header>{rows.map((item) => <div className="notification-row" key={`${kind}-${item.id}`}><span className={`status-dot ${kind === 'shortage' ? 'red' : 'amber'}`} /><button type="button" className="notification-detail" onClick={() => kind === 'expiry' ? onOpenRolling() : onOpenItem(item)}><span><b>{item.name}</b><small>{kind === 'expiry' ? item.isExpired ? '期限切れです' : item.isRotationReminderDue ? `設定した再通知日です・期限まで${item.daysToExpiry}日` : `期限まで${item.daysToExpiry}日` : kind === 'shortage' ? `${item.shortage}${item.unit}不足しています` : `確認日を${Math.abs(item.daysToCheck)}日超過しています`}</small></span><ChevronRight /></button>{kind === 'shortage' && <button type="button" className="notification-refill" onClick={() => onReplenish(item)}><Plus />{item.shortage}{item.unit}補充</button>}</div>)}</section> : null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="modal-title"><div><span className="kicker">NOTIFICATIONS</span><h2 id="notification-title">今、対応すること</h2><small className="notification-count">重複をまとめて{notifications.size}品目</small></div><button type="button" aria-label="通知一覧を閉じる" onClick={onClose}><X /></button></div><div className="notification-overview"><span>期限対応<b>{expiry.length}</b></span><span>補充<b>{shortages.length}</b></span><span>点検<b>{checks.length}</b></span></div><button type="button" className="notification-enable" onClick={enableNotifications}><Bell />端末の通知を有効にする</button>{notifications.size ? <>{group('期限対応', '1か月以内の期限と再通知日', expiry, 'expiry')}{group('補充', '目標数に足りない備蓄', shortages, 'shortage')}{group('点検', '保管場所で状態を確認', checks, 'check')}</> : <div className="empty-small"><Check />今すぐ対応するお知らせはありません</div>}</section></div>;
}

const knowledgeSections = [
  { id: 'prepare', title: '事前に整える', description: '平常時に、家族と住まいの弱点を減らす。', tips: [
    { id: 'water', icon: Droplets, title: '水は1人1日3リットル', text: '飲料と調理に使う量です。最低3日、できれば1週間を目安に、家族人数で計算します。' },
    { id: 'toilet', icon: Sparkles, title: '携帯トイレは1日5回分', text: '断水時に便器へ水を流すと、配管破損時は逆流するおそれがあります。袋・凝固剤・手指衛生を一組で備えます。' },
    { id: 'rolling', icon: ShoppingBasket, title: '食べ慣れた物を循環', text: '普段の食品を少し多く持ち、古い物から使って買い足します。加熱不要の食品も混ぜます。' },
    { id: 'light', icon: Lightbulb, title: '寝室に灯り・靴・笛', text: '停電と割れたガラスを想定し、手を伸ばせる場所へまとめます。家具の転倒経路には置きません。' },
    { id: 'power-plan', icon: Zap, title: '止められない機器から電力を計算', text: 'スマートフォン、照明、医療機器などを先に選び、W数×時間×台数で1日の必要量を見積もります。' },
  ]},
  { id: 'hazards', title: '災害が起きたら', description: '災害の種類で、最初の安全行動を切り替える。', tips: [
    { id: 'earthquake-action', icon: ShieldCheck, title: '地震：まず頭を守る', text: '揺れている間は無理に移動せず、落下物から頭を守ります。揺れが収まってから出口・火元・靴を確認します。' },
    { id: 'fire-action', icon: Flame, title: '火災：煙を避けて早く離れる', text: '小さな火でも危険を感じたら避難を優先します。煙の下を低く移動し、戻りません。' },
    { id: 'flood-action', icon: Droplets, title: '大雨・洪水：暗くなる前に判断', text: '警戒レベルと自治体情報を確認し、浸水が始まる前に移動します。冠水路や地下へ近づきません。' },
    { id: 'blackout-action', icon: WifiOff, title: '停電：情報と電池を温存', text: 'ブレーカーや周囲の状況を確認し、通信・照明・医療用途から給電します。発電機は屋内で使いません。' },
  ]},
  { id: 'shared', title: '被災時に共通すること', description: '情報・連絡・衛生を、家族で同じ手順にする。', tips: [
    { id: 'official-info', icon: Radio, title: '情報源を二つ以上持つ', text: '自治体、防災行政無線、ラジオなど発信元が分かる情報を照合します。未確認情報は転送しません。' },
    { id: 'family-contact', icon: Phone, title: '連絡できない前提で決める', text: '集合場所、遠方の連絡先、171の使い方を紙にも残します。移動先を短い文で共有します。' },
    { id: 'shelter-health', icon: Heart, title: '水分・トイレ・持病を我慢しない', text: 'トイレを避けるために水分を控えると体調悪化につながります。薬、お薬手帳、衛生用品を手元に置きます。' },
  ]},
];

function Learn({ completed, setState }) {
  const total = knowledgeSections.reduce((sum, section) => sum + section.tips.length, 0);
  return <section className="wrap page-section knowledge-page"><div className="page-title"><div><span className="kicker">PRACTICAL KNOWLEDGE</span><h1>備える前・災害時・被災後</h1><p>状況ごとに、迷わず確認できる知識へ整理しました。</p></div><span className="learn-count">{completed.length} / {total} 読了</span></div>
    <aside className="knowledge-sources"><b>公的な最新情報も確認</b><a href="https://www.bousai.go.jp/" target="_blank" rel="noreferrer">内閣府 防災情報</a><a href="https://www.bousai.metro.tokyo.lg.jp/1028747/" target="_blank" rel="noreferrer">東京都防災アプリ</a><a href="https://www.tfd.metro.tokyo.lg.jp/inf/youtube.html" target="_blank" rel="noreferrer">東京消防庁 防災動画</a></aside>
    <div className="knowledge-sections">{knowledgeSections.map((section) => { const sectionDone = section.tips.filter((tip) => completed.includes(tip.id)).length; return <details className="knowledge-section" key={section.id}><summary><span><span className="kicker">{section.id.toUpperCase()}</span><b>{section.title}</b><small>{section.description}</small></span><em>{sectionDone} / {section.tips.length} 読了</em><span className="disclosure-label">開く<ChevronDown /></span></summary><div className="tips-grid">{section.tips.map(({ id, icon: Icon, title, text }, index) => { const done = completed.includes(id); return <article className={`tip-card ${done ? 'done' : ''}`} key={id}><div className="tip-number">{String(index + 1).padStart(2, '0')}</div><span className="tip-icon"><Icon /></span><h3>{title}</h3><p>{text}</p><button onClick={() => setState((old) => ({ ...old, completedTips: done ? old.completedTips.filter((x) => x !== id) : [...old.completedTips, id] }))}>{done ? <><Check /> 読了済み</> : <>読んだ <ArrowRight /></>}</button></article>; })}</div></details>; })}</div>
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
  const categoryGuidance = itemCategoryGuidance[form.category];
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, tier: Number(form.tier), quantity: Number(form.quantity), target: Number(form.target), price: Number(form.price), volumeMl: Number(form.volumeMl) || 0, foodWeightG: Number(form.foodWeightG) || 0, packingVolumeMl: Number(form.packingVolumeMl) || 0, rotationLeadDays: Number(form.rotationLeadDays) || 30 }); }}>
    <div className="modal-title"><div><span className="kicker">STOCK ITEM</span><h2 id="item-modal-title">{item ? '備蓄品を編集' : '備蓄品を追加'}</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    {!item && <button className="optional-section-toggle" type="button" aria-expanded={scannerOpen} onClick={() => setScannerOpen((open) => !open)}><QrCode />バーコードから入力<span>{scannerOpen ? '閉じる' : 'カメラ・画像・番号'}</span><ChevronRight /></button>}
    {scannerOpen && <div className="optional-section"><BarcodeScanner initialProduct={form.barcode && form.name ? form : null} localProducts={inventory} onBarcode={(barcode) => set('barcode', barcode)} onProduct={(product) => setForm((old) => ({ ...old, ...product, registrationMode: !item && inventory.some((entry) => entry.barcode === product.barcode) ? 'merge' : old.registrationMode, note: old.note || [product.brand, product.packageSize].filter(Boolean).join(' / ') }))} />
      {duplicate && <fieldset className="duplicate-choice"><legend>登録済みの商品です</legend><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'merge'} onChange={() => set('registrationMode', 'merge')} />既存在庫「{duplicate.name}」へ数量を追加</label><label><input type="radio" name="registrationMode" checked={form.registrationMode === 'new-lot'} onChange={() => set('registrationMode', 'new-lot')} />別の賞味期限ロットとして追加</label></fieldset>}
    </div>}
    <label className="full"><span>品目名</span><input required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例：飲料水 500ml" /></label>
    <div className="form-grid basic-category-grid"><label><span>カテゴリ</span><select value={form.category} onChange={(e) => set('category', e.target.value)}>{Object.entries(CATEGORY_META).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><label><span>重要度</span><select value={form.tier} onChange={(e) => set('tier', e.target.value)}><option value="1">Tier 1・生存必須</option><option value="2">Tier 2・継続生活</option><option value="3">Tier 3・快適性</option></select></label></div>
    <aside className={`item-benchmark item-benchmark-${form.category}`} aria-live="polite"><CategoryIcon category={form.category} /><div><small>{categoryGuidance.title}</small><b>{categoryGuidance.primary}</b><p>{categoryGuidance.detail}</p>{categoryGuidance.evidence && <a href={categoryGuidance.evidence.url} target="_blank" rel="noreferrer">根拠：{categoryGuidance.evidence.label}</a>}</div></aside>
    <div className="form-grid three quick-stock-grid"><label><span>在庫数</span><input required min="0" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label><label><span>目標数</span><input required min="0" type="number" value={form.target} onChange={(e) => set('target', e.target.value)} /></label><label><span>単位</span><input required value={form.unit} onChange={(e) => set('unit', e.target.value)} /></label></div>
    {form.category === 'food' && <label className="full amount-input"><span>1単位あたりの食料重量（g）</span><input min="0" type="number" value={form.foodWeightG} onChange={(e) => set('foodWeightG', e.target.value)} placeholder="例：アルファ米1食なら100" /><small>在庫数と掛け、1食150g×1日3食で日数を簡易比較します。450gは公的な必要重量ではありません。</small></label>}
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
