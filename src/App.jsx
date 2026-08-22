import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Award, Backpack, Bell, BookOpen, Box, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleHelp, ClipboardList, Copy, Droplets, Flame, Heart,
  Download, History, Home, Lightbulb, MapPin, Minus, PackagePlus, Pencil, Phone,
  Plus, QrCode, Radio, RefreshCw, Route, Search, Settings, ShieldAlert, ShieldCheck, ShoppingBasket, Sparkles, Sun, Trash2, Trophy, Upload, Users, WifiOff, X, Zap,
} from 'lucide-react';
import { CATEGORY_META, consumeByRotation, FIRST_GOAL_CATEGORY_PRIORITY, FOOD_GRAMS_PER_PERSON_DAY, inventorySummary, isValidLocalDate, localDateKey, MAX_STOCKPILE_TARGET_DAYS, normalizeStockpileTargetDays, portableToiletItemKind, redistributeProductTargets, stockpileBudgetProjection, stockpileUnitNeeds, transactionInsights, uid, WATER_ML_PER_PERSON_DAY } from './domain.js';
import BarcodeScanner from './BarcodeScanner.jsx';
import PowerEcosystem from './PowerEcosystem.jsx';
import PracticalLoadout from './PracticalLoadout.jsx';
import DisasterPreparedness from './DisasterPreparedness.jsx';
import StockpileSkillTree from './StockpileSkillTree.jsx';
import { createTransaction, loadState, normalizeInventoryItem, parseStateData, RECOVERY_KEY_PREFIX, STORAGE_KEY } from './state.js';
import { defensePower, essentialPreparednessGates, preparednessProgress, togglePreparednessTask } from './preparedness.js';
import { addBagPurchaseItem, completeLoadout, getLoadout, loadoutStatus, updateBagPurchaseItem, updateLoadout } from './loadouts.js';
import { autoPackInventory, bagSettings, updateBagSettings } from './packing.js';
import { buildCharacterAdvice, CHARACTERS, CONVERSATION_CHOICES, getCharacter, respondToCharacter } from './characters.js';
import { DISASTER_SCENARIOS, generateEmergencyPlan, simulateDisaster } from './emergency.js';
import { STOCKPILE_GUIDELINE_SOURCES } from './stockpileGuideline.js';
import { buildStockpileSkillTree, claimStockpileSkill } from './stockpileSkills.js';
import { APP_ENVIRONMENT } from './appEnvironment.js';

const nav = [
  { id: 'home', label: 'ホーム', icon: Home },
  { id: 'inventory', label: '備蓄', icon: Box },
  { id: 'disasters', label: '災害対策', icon: ShieldAlert },
  { id: 'plan', label: '緊急メモ', icon: ClipboardList },
  { id: 'learn', label: '知る', icon: BookOpen },
];
const pageIds = new Set([...nav.map(({ id }) => id), 'bags', 'roadmap', 'power', 'rolling', 'stockpile-skills', 'inventory-category']);
const inventoryCategoryRoute = () => {
  const match = window.location.hash.replace(/^#\/?/, '').match(/^inventory-category\/([^/]+)$/);
  if (!match) return null;
  let category;
  try {
    category = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return Object.hasOwn(CATEGORY_META, category) ? category : null;
};
const pageFromLocation = () => {
  const id = window.location.hash.replace(/^#\/?/, '');
  if (inventoryCategoryRoute()) return 'inventory-category';
  return pageIds.has(id) ? id : 'home';
};
const pageTargetFromLocation = () => inventoryCategoryRoute() || window.history.state?.sonaeTarget || null;
const readStoredStateRaw = () => {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return undefined;
  }
};

const emptyForm = { name: '', category: 'food', waterPurpose: '', tier: 1, unit: '個', quantity: 1, target: 3, price: 0, expiry: '', expiryMode: 'unknown', note: '', barcode: '', brand: '', packageSize: '', volumeMl: 0, foodWeightG: 0, packingVolumeMl: 0, imageUrl: '', source: '', sourceUrl: '', rotationEnabled: true, rotationLeadDays: 30, replenishmentPriority: 'high', replenishBy: '', purchaseFrom: '' };
const essentialGateTaskTargets = { home: 'furniture', risk: 'hazard-map', medicine: 'medicine', food: 'food-fit', light: 'light-fire' };
const sharedProductFieldKeys = [
  'name', 'category', 'waterPurpose', 'tier', 'unit', 'brand', 'packageSize',
  'volumeMl', 'foodWeightG', 'packingVolumeMl', 'imageUrl', 'source', 'sourceUrl', 'barcode',
];
const sharedProductFields = (item) => Object.fromEntries(sharedProductFieldKeys
  .filter((key) => item[key] !== undefined)
  .map((key) => [key, item[key]]));

const inventoryReviewMessage = (item) => item.verificationReason === 'legacy-sample'
  ? ['この数量は旧版の初期サンプルです', '手元の実物と数量・期限を照合してください。一致しない場合は編集または削除します。']
  : item.verificationReason === 'invalid-expiry'
    ? ['期限データを確認してください', `保存されていた期限「${item.expiry || '空欄'}」は有効な日付ではありません。編集して正しい期限へ直します。`]
    : item.verificationReason === 'unknown-category'
      ? ['分類を確認してください', '読み込んだ分類を判定できません。編集画面で正しい分類を選ぶまで安全計算から除外します。']
      : item.verificationReason === 'ambiguous-water'
        ? ['水の用途を確認してください', '飲料・調理用か生活用水かを編集画面で選ぶまで、3Lの日数計算から除外します。']
        : item.verificationReason === 'missing-expiry'
          ? ['期限または交換日を確認してください', item.category === 'food' ? '期限日を入力するか、実物に期限表示がない食品であることを編集画面で確認するまで、安全計算から除外します。' : '飲料・調理用水は期限または自分で決めた交換日を入力するまで、3Lの日数計算から除外します。']
          : item.verificationReason === 'product-conflict'
            ? ['同じバーコードの登録内容が一致しません', '品名・分類・内容量を実物と照合して編集してください。同じ商品の期限ロットへ共通の内容を反映します。']
        : ['登録内容を確認してください', '実物と登録内容を照合するまで安全計算から除外します。'];

const inventoryReviewFieldsAreValid = (item) => Boolean(CATEGORY_META[item.category])
  && (!item.expiry || isValidLocalDate(item.expiry))
  && (item.category !== 'water' || ['drinking-cooking', 'utility'].includes(item.waterPurpose))
  && (item.category !== 'food' || isValidLocalDate(item.expiry) || item.expiryMode === 'no-date-confirmed')
  && (item.category !== 'water' || item.waterPurpose !== 'drinking-cooking' || isValidLocalDate(item.expiry));
const canResolveInventoryReview = (item) => item.verificationReason !== 'product-conflict' && inventoryReviewFieldsAreValid(item);
const EDIT_RESOLVABLE_REVIEW_REASONS = new Set(['invalid-expiry', 'unknown-category', 'ambiguous-water', 'missing-expiry', 'product-conflict']);
const resolveInventoryReviewAfterEdit = (item) => {
  if (!EDIT_RESOLVABLE_REVIEW_REASONS.has(item.verificationReason) || !inventoryReviewFieldsAreValid(item)) return item;
  const { verificationStatus, verificationReason, ...resolved } = item;
  return resolved;
};

function Brand() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={22} /></span><span className="brand-copy"><span className="brand-name"><b>そなえメモ</b><em className={`environment-badge environment-${APP_ENVIRONMENT.id}`} title={`${APP_ENVIRONMENT.description}です。ほかの環境の保存データとは分離されています。`}>{APP_ENVIRONMENT.label}</em></span><small>暮らしに、ちいさな安心を。</small></span></div>;
}

function App() {
  const [state, setState] = useState(loadState);
  const [page, setPageState] = useState(pageFromLocation);
  const [pageTarget, setPageTarget] = useState(pageTargetFromLocation);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [recoveryDownloaded, setRecoveryDownloaded] = useState(false);
  const [storageWriteError, setStorageWriteError] = useState(false);
  const [storageSyncConflict, setStorageSyncConflict] = useState(false);
  const [storageSyncDeleted, setStorageSyncDeleted] = useState(false);
  const [conflictDownloaded, setConflictDownloaded] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [currentDay, setCurrentDay] = useState(() => localDateKey());
  const [activeModalElement, setActiveModalElement] = useState(null);
  const [stateViewRevision, setStateViewRevision] = useState(0);
  const [initialStoredRaw] = useState(readStoredStateRaw);
  const lastPersistedRawRef = useRef(initialStoredRaw);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const summary = useMemo(() => inventorySummary(state.inventory, state.household, currentDay), [state.inventory, state.household, currentDay]);
  const visitChecked = useRef(false);
  const powerEntryRef = useRef(null);
  const stockpileSkillEntryRef = useRef(null);
  const recoveryAlertRef = useRef(null);
  const mainRef = useRef(null);
  const previousPageRef = useRef(page);
  const wasOnboardingActiveRef = useRef(!state.onboarding?.completed);
  const wasRecoveryBlockedRef = useRef(Boolean(state.storageRecovery?.blocked));

  const discardLocalDrafts = useCallback(() => {
    setModal(null);
    setNotificationsOpen(false);
    setShareOpen(false);
    setOptionsOpen(false);
    setStateViewRevision((revision) => revision + 1);
  }, []);

  const setPage = useCallback((nextPage, { replace = false, target = null } = {}) => {
    if (!pageIds.has(nextPage)) return;
    const categoryTarget = nextPage === 'inventory-category' && Object.hasOwn(CATEGORY_META, target) ? target : null;
    if (nextPage === 'inventory-category' && !categoryTarget) return;
    const nextHash = categoryTarget ? `#/inventory-category/${encodeURIComponent(categoryTarget)}` : `#/${nextPage}`;
    if (window.location.hash !== nextHash) window.history[replace ? 'replaceState' : 'pushState']({ sonaePage: nextPage, sonaeTarget: target }, '', nextHash);
    else window.history.replaceState({ ...window.history.state, sonaePage: nextPage, sonaeTarget: target }, '', nextHash);
    setPageTarget(target);
    setPageState(nextPage);
  }, []);

  useEffect(() => {
    if (state.storageRecovery?.blocked || storageSyncConflict) return;
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw !== lastPersistedRawRef.current) {
        setConflictDownloaded(false);
        setStorageSyncDeleted(currentRaw === null);
        setStorageSyncConflict(true);
        return;
      }
      const nextRaw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, nextRaw);
      lastPersistedRawRef.current = nextRaw;
      setStorageWriteError(false);
    } catch {
      setStorageWriteError(true);
    }
  }, [state, storageSyncConflict]);
  useEffect(() => {
    const handleStoredStateChange = (event) => {
      // localStorage.clear() emits a storage event with key === null. Treat it
      // as a conflicting deletion so this tab does not silently lose data.
      if ((event.key !== STORAGE_KEY && event.key !== null) || event.newValue === lastPersistedRawRef.current) return;
      setConflictDownloaded(false);
      setStorageSyncDeleted(event.newValue === null);
      setStorageSyncConflict(true);
    };
    window.addEventListener('storage', handleStoredStateChange);
    return () => window.removeEventListener('storage', handleStoredStateChange);
  }, []);
  useEffect(() => {
    if (storageSyncConflict) setConflictDownloaded(false);
  }, [state, storageSyncConflict]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    let midnightTimer;
    const scheduleMidnightRefresh = () => {
      window.clearTimeout(midnightTimer);
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 0, 50);
      midnightTimer = window.setTimeout(() => {
        setCurrentDay(localDateKey());
        scheduleMidnightRefresh();
      }, Math.max(1000, next.getTime() - now.getTime()));
    };
    const refreshDay = () => {
      setCurrentDay(localDateKey());
      scheduleMidnightRefresh();
    };
    const refreshVisibleDay = () => { if (document.visibilityState === 'visible') refreshDay(); };
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshVisibleDay);
    scheduleMidnightRefresh();
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshVisibleDay);
    };
  }, []);
  useEffect(() => {
    const updateModalLayer = () => setActiveModalElement(document.querySelector('[aria-modal="true"]'));
    const observer = new MutationObserver(updateModalLayer);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    updateModalLayer();
    return () => observer.disconnect();
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
  }, [page, pageTarget]);
  useEffect(() => {
    const locationId = window.location.hash.replace(/^#\/?/, '');
    if (!window.location.hash || (!pageIds.has(locationId) && !inventoryCategoryRoute())) setPage('home', { replace: true });
    const syncPage = () => {
      setPageState(pageFromLocation());
      setPageTarget(pageTargetFromLocation());
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
    if (page === 'inventory' && previousPage === 'stockpile-skills') {
      const frame = window.requestAnimationFrame(() => stockpileSkillEntryRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    if (page === 'power') return;
    if (page === 'stockpile-skills') return;
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
    setModal({ newLotFrom: item, suggestedQuantity: amount });
    setNotificationsOpen(false);
  };
  const downloadProtectedState = () => {
    let raw = '';
    try {
      const backupKey = state.storageRecovery?.backupKey;
      raw = (backupKey ? localStorage.getItem(backupKey) : '') || localStorage.getItem(STORAGE_KEY);
    } catch {
      return setToast('保護データを取得できませんでした');
    }
    if (!raw) return setToast('保護データを取得できませんでした');
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${APP_ENVIRONMENT.backupFilenamePrefix}-protected-${localDateKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setRecoveryDownloaded(true);
  };
  const downloadUnsavedState = (forConflict = false) => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${APP_ENVIRONMENT.backupFilenamePrefix}-unsaved-${localDateKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      if (forConflict) setConflictDownloaded(true);
    } catch {
      setToast('現在データをファイル保存できませんでした');
    }
  };
  const retryStateSave = () => {
    try {
      const currentRaw = localStorage.getItem(STORAGE_KEY);
      if (currentRaw !== lastPersistedRawRef.current) {
        setConflictDownloaded(false);
        setStorageSyncDeleted(currentRaw === null);
        setStorageSyncConflict(true);
        return;
      }
      const nextRaw = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, nextRaw);
      lastPersistedRawRef.current = nextRaw;
      setStorageWriteError(false);
      setToast('現在のデータを端末へ保存しました');
    } catch {
      setStorageWriteError(true);
    }
  };
  const loadLatestStoredState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const currentRaw = JSON.stringify(state);
        localStorage.setItem(STORAGE_KEY, currentRaw);
        if (localStorage.getItem(STORAGE_KEY) !== currentRaw) throw new Error('restore-failed');
        lastPersistedRawRef.current = currentRaw;
        setStorageSyncConflict(false);
        setStorageSyncDeleted(false);
        setStorageWriteError(false);
        setConflictDownloaded(false);
        setToast('このタブのデータを端末へ戻しました');
        return;
      }
      const latest = parseStateData(raw);
      lastPersistedRawRef.current = raw;
      setStorageSyncConflict(false);
      setStorageSyncDeleted(false);
      setStorageWriteError(false);
      setConflictDownloaded(false);
      discardLocalDrafts();
      setState(latest);
      setToast('別タブの最新データを読み込みました');
    } catch {
      setToast('別タブのデータを安全に読み込めませんでした');
    }
  };

  const recoveryBlocked = Boolean(state.storageRecovery?.blocked);
  const onboardingActive = !state.onboarding?.completed;
  useEffect(() => {
    const wasBlocked = wasRecoveryBlockedRef.current;
    wasRecoveryBlockedRef.current = recoveryBlocked;
    const frame = window.requestAnimationFrame(() => {
      if (recoveryBlocked) recoveryAlertRef.current?.querySelector('button:not([disabled])')?.focus();
      else if (wasBlocked) {
        const heading = mainRef.current?.querySelector('h1');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recoveryBlocked]);
  useEffect(() => {
    const wasActive = wasOnboardingActiveRef.current;
    wasOnboardingActiveRef.current = onboardingActive;
    if (!wasActive || onboardingActive) return;
    const frame = window.requestAnimationFrame(() => {
      const heading = mainRef.current?.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onboardingActive]);
  const backgroundA11y = onboardingActive || recoveryBlocked ? { 'aria-hidden': true, inert: true } : {};
  const chromeA11y = onboardingActive || recoveryBlocked || page === 'stockpile-skills' ? { 'aria-hidden': true, inert: true } : {};
  const navigationPage = ['stockpile-skills', 'inventory-category', 'rolling'].includes(page)
    ? 'inventory'
    : ['bags', 'roadmap', 'power'].includes(page)
      ? 'home'
      : page;
  const persistenceAlert = !recoveryBlocked && (storageSyncConflict ? <section className="storage-persistence-alert storage-sync-conflict" role="alert">
    <AlertTriangle />
    <span><b>{storageSyncDeleted ? '別のタブで保存データが削除されました' : '別のタブで保存データが変更されました'}</b><small>{storageSyncDeleted ? 'このタブのデータは保持しています。先にファイル保存してから、この内容を端末へ戻してください。' : 'このタブからは上書きしていません。先に現在データをファイル保存してから、別タブの最新データを読み込んでください。'}</small></span>
    <div><button type="button" className="secondary-button" onClick={() => downloadUnsavedState(true)}><Download />このタブを保存</button><button type="button" className="primary-button" disabled={!conflictDownloaded} title={!conflictDownloaded ? '先にこのタブのデータをファイル保存してください' : undefined} onClick={loadLatestStoredState}><RefreshCw />{storageSyncDeleted ? 'このタブを端末へ戻す' : '最新データを読み込む'}</button></div>
  </section> : storageWriteError ? <section className="storage-persistence-alert" role="alert">
    <AlertTriangle />
    <span><b>変更をこの端末へ保存できていません</b><small>このタブを閉じる前にファイルへ保存するか、空き容量・ブラウザの保存設定を確認して再試行してください。</small></span>
    <div><button type="button" className="secondary-button" onClick={() => downloadUnsavedState(false)}><Download />現在データを保存</button><button type="button" className="primary-button" onClick={retryStateSave}><RefreshCw />保存を再試行</button></div>
  </section> : null);

  return (
    <div className={`app-shell environment-${APP_ENVIRONMENT.id}${page === 'home' ? ' home-active' : ''}${page === 'inventory' ? ' inventory-dashboard-active' : ''}${page === 'power' ? ' power-active' : ''}`}>
      {state.storageRecovery?.blocked && <section ref={recoveryAlertRef} className="storage-recovery-alert" role="alert">
        <AlertTriangle />
        <span><b>保存データを安全に読み込めませんでした</b><small>{state.storageRecovery.reason === 'read-error' ? '端末の保存領域を読み取れません。元データへ書き込まず停止しています。再読み込みしても続く場合は、ブラウザの保存設定を確認してください。' : <>{state.storageRecovery.reason === 'future-schema' ? 'このアプリより新しい形式です。' : 'データ形式が壊れている可能性があります。'}元データは上書きしていません。{state.storageRecovery.backupStored ? '別の保存キーにも複製しましたが、この画面を離れる前に保護データをファイル保存してください。' : '別キーへの複製はできなかったため、空の状態で続ける前に保護データをファイル保存してください。'}</>}</small></span>
        <div>{state.storageRecovery.reason === 'read-error' ? <button type="button" className="primary-button" onClick={() => window.location.reload()}><RefreshCw />再読み込み</button> : <><button type="button" className="secondary-button" onClick={downloadProtectedState}><Download />保護データを保存</button><button type="button" className="primary-button" disabled={!recoveryDownloaded} title={!recoveryDownloaded ? '先に保護データをファイル保存してください' : undefined} onClick={() => setState((old) => { const { storageRecovery, ...next } = old; return next; })}>空の状態で続ける</button></>}</div>
      </section>}
      {persistenceAlert && (activeModalElement ? createPortal(persistenceAlert, activeModalElement) : persistenceAlert)}
      <header className="topbar" {...chromeA11y}>
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          {nav.map(({ id, label, icon: Icon }) => <button aria-current={navigationPage === id ? 'page' : undefined} className={navigationPage === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <div className="header-actions">{!online && <span className="offline-badge"><WifiOff />オフライン</span>}<button className="notification-button" aria-label="オプションを開く" onClick={() => setOptionsOpen(true)}><Settings size={20} /></button><button className="notification-button share-button" aria-label="アクセス用QRコードを開く" onClick={() => setShareOpen(true)}><QrCode size={20} /></button><button className="notification-button" aria-label={`通知一覧を開く（${summary.notificationCount}件）`} onClick={() => setNotificationsOpen(true)}><Bell size={20} /><span>{summary.notificationCount}</span></button></div>
      </header>

      <main key={`main-${stateViewRevision}`} ref={mainRef} {...backgroundA11y}>
        {page === 'home' && <Dashboard state={state} summary={summary} setState={setState} setPage={setPage} powerEntryRef={powerEntryRef} />}
        {page === 'inventory' && <Inventory state={state} summary={summary} transactions={state.transactions} setModal={setModal} updateInventory={updateInventory} setState={setState} setToast={setToast} setPage={setPage} skillEntryRef={stockpileSkillEntryRef} today={currentDay} onStateReplaced={discardLocalDrafts} latestStateRef={latestStateRef} />}
        {page === 'inventory-category' && <Inventory categoryKey={pageTarget} state={state} summary={summary} transactions={state.transactions} setModal={setModal} updateInventory={updateInventory} setState={setState} setToast={setToast} setPage={setPage} skillEntryRef={stockpileSkillEntryRef} today={currentDay} onStateReplaced={discardLocalDrafts} latestStateRef={latestStateRef} />}
        {page === 'stockpile-skills' && !onboardingActive && <StockpileSkillsPage state={state} setState={setState} setToast={setToast} onClose={() => setPage('inventory', { replace: true })} today={currentDay} />}
        {page === 'bags' && <EvacuationBags state={state} setState={setState} setToast={setToast} setPage={setPage} today={currentDay} />}
        {page === 'rolling' && <RollingStock state={state} summary={summary} transactions={state.transactions} updateInventory={updateInventory} onBack={() => setPage('inventory')} today={currentDay} />}
        {page === 'roadmap' && <PreparednessRoadmap state={state} summary={summary} setState={setState} setPage={setPage} setToast={setToast} targetTaskId={pageTarget} today={currentDay} />}
        {page === 'disasters' && <DisasterPreparedness state={state} setState={setState} setToast={setToast} />}
        {page === 'plan' && <EmergencyPlan state={state} summary={summary} setState={setState} setToast={setToast} />}
        {page === 'learn' && <Learn completed={state.completedTips} setState={setState} />}
        {page === 'power' && <PowerEcosystem plan={state.powerPlan} onChange={(powerPlan) => setState((old) => ({ ...old, powerPlan }))} onBack={() => setPage('home')} />}
      </main>

      <footer className="app-footer" {...chromeA11y}>
        <small>© {new Date().getFullYear()} そなえメモ · {APP_ENVIRONMENT.label}環境</small>
      </footer>

      <nav className="mobile-nav" aria-label="モバイルナビゲーション" {...chromeA11y}>
        {nav.map(({ id, label, icon: Icon }) => <button aria-current={navigationPage === id ? 'page' : undefined} className={navigationPage === id ? 'active' : ''} key={id} onClick={() => setPage(id)}><Icon size={21} /><span>{label}</span></button>)}
      </nav>

      {['inventory', 'inventory-category'].includes(page) && !onboardingActive && <button
        type="button"
        className="stockpile-add-fab"
        aria-label={page === 'inventory-category' ? `${CATEGORY_META[pageTarget]?.label || ''}の備蓄品を追加` : '備蓄品を追加'}
        onClick={() => setModal(page === 'inventory-category' ? { newItemCategory: pageTarget } : 'new')}
      ><Plus aria-hidden="true" /><span>備蓄品を追加</span></button>}

      {modal && <ItemModal item={modal === 'new' || modal?.newItemCategory || modal?.newLotFrom ? null : modal} initialItem={modal?.newLotFrom || null} initialCategory={modal?.newItemCategory || ''} suggestedQuantity={modal?.suggestedQuantity} inventory={state.inventory} onClose={() => setModal(null)} onSave={(form) => {
        const { registrationMode, ...values } = form;
        let inventory;
        let transaction;
        const creatingNewLot = modal === 'new' || Boolean(modal?.newItemCategory) || Boolean(modal?.newLotFrom);
        if (creatingNewLot) {
          const sourceLot = modal?.newLotFrom || null;
          const sameBarcode = sourceLot && String(values.barcode || '') === String(sourceLot.barcode || '');
          const productId = sourceLot && sameBarcode
            ? sourceLot.productId
            : values.barcode ? `gtin:${values.barcode}` : `manual:${uid()}`;
          const created = normalizeInventoryItem({ ...values, id: uid(), productId }, state.inventory.length);
          const productExists = state.inventory.some((entry) => entry.productId === productId);
          const canonicalFields = sharedProductFields(created);
          const addedInventory = [
            ...state.inventory.map((entry, index) => entry.productId === productId
              ? normalizeInventoryItem({ ...entry, ...canonicalFields }, index)
              : entry),
            created,
          ];
          const existingProductTarget = state.inventory.filter((entry) => entry.productId === productId)
            .reduce((sum, entry) => sum + Math.max(0, Number(entry.target) || 0), 0);
          inventory = productExists
            ? redistributeProductTargets(addedInventory, productId, Math.max(existingProductTarget, created.target), currentDay)
            : addedInventory;
          transaction = createTransaction('add', created, created.quantity, modal?.newLotFrom ? '新しい期限ロットとして補充' : values.barcode ? 'バーコードから登録' : '手入力で登録');
        } else {
          const edited = normalizeInventoryItem(resolveInventoryReviewAfterEdit({ ...modal, ...values }), state.inventory.findIndex((entry) => entry.id === modal.id));
          const canonicalFields = sharedProductFields(edited);
          const updatedLots = state.inventory.map((entry, index) => {
            if (entry.id === modal.id) return edited;
            if (entry.productId !== edited.productId) return entry;
            // Product-defining corrections apply to every expiry lot sharing
            // the same identity. Quantity, expiry, price, and location remain
            // specific to each physical lot.
            return normalizeInventoryItem(resolveInventoryReviewAfterEdit({ ...entry, ...canonicalFields }), index);
          });
          inventory = redistributeProductTargets(
            updatedLots,
            edited.productId,
            edited.target,
            currentDay,
          );
          transaction = createTransaction('edit', { ...modal, ...values }, values.quantity - modal.quantity, '備蓄情報を編集');
        }
        updateInventory(inventory, creatingNewLot ? '新しい期限ロットを追加しました' : '変更を保存しました', transaction);
        setModal(null);
      }} />}
      {notificationsOpen && <NotificationPanel state={state} summary={summary} setToast={setToast} onClose={() => setNotificationsOpen(false)} onOpenInventory={() => { setNotificationsOpen(false); setPage('inventory'); }} onOpenItem={(item) => { setNotificationsOpen(false); setModal(item); }} onOpenRolling={() => { setNotificationsOpen(false); setPage('rolling'); }} onReplenish={replenishShortage} />}
      {shareOpen && <ShareQrPanel onClose={() => setShareOpen(false)} setToast={setToast} />}
      {optionsOpen && <OptionsPanel state={state} setState={setState} onClose={() => setOptionsOpen(false)} setToast={setToast} />}
      {!state.onboarding?.completed && <SetupWizard key={`setup-${stateViewRevision}`} state={state} setState={setState} />}
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
    preparedness: { ...old.preparedness, targetDays: normalizeStockpileTargetDays(targetDays, 7) },
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
        <label className="setup-custom-days"><span>その他の日数</span><input type="number" inputMode="numeric" min="1" max={MAX_STOCKPILE_TARGET_DAYS} value={targetDays} onChange={(event) => setTargetDays(event.target.value)} /><small>日分</small></label>
        <p className="setup-day-policy">30日を超えて量を増やす前に、電源・調理手段・個別事情・快適性など備えの種類を広げます。</p>
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
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal compact-modal options-panel" role="dialog" aria-modal="true" aria-labelledby="options-title"><div className="modal-title"><div><span className="kicker">OPTIONS</span><h2 id="options-title">オプション</h2></div><button type="button" aria-label="オプションを閉じる" onClick={onClose}><X /></button></div><div className="option-household"><div><Users /><span><b>家族人数</b><small>備蓄日数の計算に使用します</small></span></div><div className="setup-stepper"><button data-dialog-autofocus type="button" aria-label="家族人数を1人減らす" disabled={household <= 1} onClick={() => setHousehold((value) => Math.max(1, value - 1))}><Minus /></button><b>{household}<small>人</small></b><button type="button" aria-label="家族人数を1人増やす" disabled={household >= 12} onClick={() => setHousehold((value) => Math.min(12, value + 1))}><Plus /></button></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="button" className="primary-button" onClick={save}><Check />保存する</button></div></section></div>;
}

function SceneHouseGraphic() {
  return <svg className="scene-illustration scene-house-graphic" viewBox="0 0 180 150" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="house-roof-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d7835b" /><stop offset="1" stopColor="#9f5237" /></linearGradient>
      <linearGradient id="house-wall-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fae9c7" /><stop offset="1" stopColor="#dfbf88" /></linearGradient>
      <linearGradient id="house-window-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6fbff" /><stop offset="1" stopColor="#8fc8d0" /></linearGradient>
    </defs>
    <ellipse className="scene-shadow" cx="90" cy="138" rx="70" ry="8" />
    <path className="house-garden" d="M17 132c8-13 20-14 29 0m88 0c8-14 20-14 29 0" />
    <rect className="house-chimney" x="119" y="25" width="18" height="38" rx="3" />
    <path className="house-roof" d="M15 67 87 12l78 55-13 19-65-46-59 46Z" />
    <path className="house-roof-highlight" d="M29 66 87 22l62 44" />
    <path className="house-wall" d="M34 68h108v68H34z" />
    <path className="house-wall-shade" d="M88 68h54v68H88Z" />
    <path className="house-eave" d="M28 84 87 40l65 44" />
    <path className="house-siding" d="M36 79h104M36 114h104" />
    <rect className="house-door" x="77" y="91" width="28" height="45" rx="4" />
    <path className="house-door-panel" d="M83 98h16v11H83z" />
    <circle className="house-handle" cx="98" cy="114" r="2.5" />
    <g className="house-window"><rect x="47" y="84" width="22" height="22" rx="4" /><path d="M58 84v22M47 95h22m3-7 9-4" /></g>
    <g className="house-window"><rect x="114" y="84" width="18" height="22" rx="4" /><path d="M123 84v22M114 95h18m3-7 7-3" /></g>
    <path className="house-window-glint" d="m51 89 6-3m61 3 5-2" />
    <path className="house-step" d="M69 136h44l8 7H61Z" />
    <path className="house-step-highlight" d="M69 136h44" />
  </svg>;
}

function SceneTravelerGraphic() {
  return <svg className="scene-illustration scene-traveler-graphic" viewBox="0 0 150 180" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="traveler-jacket-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b8675" /><stop offset="1" stopColor="#1e564b" /></linearGradient>
      <linearGradient id="traveler-bag-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0ae51" /><stop offset="1" stopColor="#c56b26" /></linearGradient>
    </defs>
    <ellipse className="scene-shadow" cx="76" cy="167" rx="43" ry="7" />
    <path className="traveler-motion" d="M109 75h17m-12 15h19m-22 15h13" />
    <circle className="traveler-head" cx="77" cy="34" r="18" />
    <path className="traveler-hair" d="M61 34c0-14 7-23 19-23 12 0 19 9 19 22-7-5-11-12-13-17-5 8-13 14-25 18Z" />
    <path className="traveler-body" d="M61 54c7-5 26-5 33 0l8 60H53Z" />
    <path className="traveler-jacket-shade" d="M78 51c8 0 13 1 16 4l8 59H78Z" />
    <path className="traveler-jacket-seam" d="M78 55v57" />
    <path className="traveler-leg" d="m64 109-8 47M91 109l9 47" />
    <path className="traveler-shoe" d="M47 159h15l2 8H45c-4 0-4-6 2-8Zm47 0h13l7 6c1 2-1 3-4 3H97Z" />
    <path className="traveler-arm" d="m58 65-19 40M96 65l18 39" />
    <g className="traveler-backpack">
      <path className="backpack-strap" d="M58 62c-9 3-12 13-12 28M94 62c9 3 12 13 12 28" />
      <path className="backpack-body" d="M91 56c11 3 17 12 17 24v37c0 8-6 14-14 14H78V66c0-7 6-12 13-10Z" />
      <path className="backpack-flap" d="M81 65c7-7 19-7 25 2l2 14H79Z" />
      <path className="backpack-pocket" d="M84 97h24v22H84c-4 0-7-3-7-7v-8c0-4 3-7 7-7Z" />
      <path className="backpack-buckle" d="M89 94h9v8h-9Z" />
      <path className="backpack-glint" d="m92 66 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
    </g>
  </svg>;
}

function SceneShelterGraphic() {
  return <svg className="scene-illustration scene-shelter-graphic" viewBox="0 0 180 150" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="shelter-roof-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#467c6f" /><stop offset="1" stopColor="#234f46" /></linearGradient>
      <linearGradient id="shelter-wall-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f7f2e3" /><stop offset="1" stopColor="#d6ceb7" /></linearGradient>
    </defs>
    <ellipse className="scene-shadow" cx="90" cy="138" rx="70" ry="8" />
    <path className="shelter-tree" d="M18 130V91m-13 20 13-28 13 28Z" />
    <path className="shelter-roof" d="M18 67 88 21l75 46-12 19-63-39-58 39Z" />
    <path className="shelter-roof-highlight" d="M31 67 88 31l61 37" />
    <path className="shelter-wall" d="M34 68h112v68H34z" />
    <path className="shelter-wall-shade" d="M91 68h55v68H91Z" />
    <path className="shelter-foundation" d="M29 136h122l7 8H22Z" />
    <rect className="shelter-door" x="75" y="91" width="30" height="45" rx="4" />
    <path className="shelter-door-line" d="M90 92v44" />
    <path className="shelter-canopy" d="M68 85h44l7 9H61Z" />
    <circle className="shelter-door-handle" cx="86" cy="114" r="1.8" /><circle className="shelter-door-handle" cx="94" cy="114" r="1.8" />
    <g className="shelter-window"><rect x="47" y="85" width="18" height="19" rx="3" /><path d="M56 85v19M47 94.5h18" /></g>
    <g className="shelter-window"><rect x="116" y="85" width="18" height="19" rx="3" /><path d="M125 85v19M116 94.5h18" /></g>
    <path className="shelter-sign" d="M72 57h35v23H72z" />
    <g className="shelter-mark"><circle cx="82" cy="64" r="2.5" /><path d="M82 68v7m0-4 6 2m-6 2-5 3m5-3 5 4M91 68h10m-4-4 4 4-4 4" /></g>
    <path className="shelter-flagpole" d="M143 23v43" />
    <path className="shelter-flag" d="M144 25h23l-6 9 6 9h-23Z" />
    <path className="shelter-ramp" d="M99 136h49l10 8H91Z" />
  </svg>;
}

function Dashboard({ state, summary, setState, setPage, powerEntryRef }) {
  const [targetOpen, setTargetOpen] = useState(false);
  const [shelterOpen, setShelterOpen] = useState(false);
  const defense = useMemo(() => defensePower(state, summary), [state, summary]);
  const essentialGates = useMemo(() => essentialPreparednessGates(state, summary), [state, summary]);
  const nextEssentialGate = essentialGates.gates.find((gate) => !gate.complete) || essentialGates.gates[0];
  const setTargetDays = (targetDays) => setState((old) => { const { requestedHorizonDays, ...preparedness } = old.preparedness || {}; return { ...old, preparedness: { ...preparedness, targetDays: normalizeStockpileTargetDays(targetDays, 7) } }; });
  const stockpileDays = Number.isFinite(summary.householdStockpileDays) ? summary.householdStockpileDays : summary.survivalDays;
  const targetGap = Math.max(0, defense.targetDays - stockpileDays);
  const targetStatus = targetGap ? `目標まであと${formatDays(targetGap)}日分` : `${defense.targetDays}日目標を達成`;
  const unmeasuredStock = [summary.waterItemsMissingVolume ? '内容量未登録の水' : '', summary.foodItemsMissingWeight ? '重量未登録の食料' : ''].filter(Boolean);
  const foodGate = essentialGates.gates.find((gate) => gate.key === 'food');
  const hasExcludedCoreStock = summary.rows.some((item) => (item.needsVerification || item.isExpired) && (
    item.category === 'food'
    || (item.category === 'water' && item.waterPurpose !== 'utility')
    || Boolean(portableToiletItemKind(item))
  ));
  const calculationCaveats = [
    hasExcludedCoreStock ? '主要備蓄の期限切れ・確認待ちは日数から除外' : '',
    unmeasuredStock.length ? `${unmeasuredStock.join('・')}は日数に含みません` : '',
    foodGate?.statusLabel === '構成を実物確認' ? '食料の構成・家族適合は未確認です' : '',
  ].filter(Boolean);
  const calculationCaveat = calculationCaveats.join('。');
  const stockpileDescription = `生活継続の目安 ${formatDays(stockpileDays)}日分。${targetStatus}。水・食料・携帯トイレのうち最短${calculationCaveat ? `。${calculationCaveat}` : ''}`;
  const shelterName = String(state.contact?.shelter || '').trim();
  return <section className="home-dashboard wrap" aria-label="防災ホーム">
    <header className="home-heading">
      <div><span className="kicker">TODAY'S READINESS</span><h1>わが家の防災状況</h1></div>
      <div className="home-heading-actions"><button type="button" className="home-target-summary" aria-label={`備蓄日数の目標 ${defense.targetDays}日。変更する`} onClick={() => setTargetOpen(true)}><CalendarDays /><span><small>備蓄目標</small><b>{defense.targetDays}日</b></span><ChevronRight /></button><div className="household-summary" aria-label={`家族${state.household}人`}><Users /><b>{state.household}<small>人</small></b></div></div>
    </header>
    {Number(state.preparedness?.requestedHorizonDays) > MAX_STOCKPILE_TARGET_DAYS && <aside className="target-migration-note"><CalendarDays /><span><b>以前の{state.preparedness.requestedHorizonDays}日目標を、量の上限30日へ移行しました</b><small>30日以降は電源・代替手段・個別事情・快適性をスキルツリーで広げます。目標を確認するとこの案内は閉じます。</small></span><button type="button" onClick={() => setTargetOpen(true)}>目標を確認</button></aside>}

    <section className="readiness-scene" aria-labelledby="readiness-scene-title">
      <header>
        <div><span className="kicker">SHELTER ← HOME</span><h2 id="readiness-scene-title">自宅から避難先までの備え</h2></div>
        <p>確認したい絵を選んでください</p>
      </header>
      <div className="readiness-route">
        <span className="visually-hidden" id="home-stockpile-description">{stockpileDescription}</span>
        <button type="button" className="scene-stop scene-home" aria-label="自宅の備蓄情報を開く" aria-describedby="home-stockpile-description" onClick={() => setPage('inventory')}>
          <span className="home-stockpile-bubble"><small>生活継続の目安</small><strong>{formatDays(stockpileDays)}<em>日分</em></strong><span>{targetGap ? `目標まで あと${formatDays(targetGap)}日分` : `${defense.targetDays}日目標を達成`}</span><i>水・食料・携帯トイレのうち最短</i>{calculationCaveat && <u>{calculationCaveat}</u>}</span>
          <SceneHouseGraphic />
          <span className="scene-label"><b>わが家</b><small>備蓄を見る</small></span>
        </button>
        <span className="scene-route-line route-home-to-bag" aria-hidden="true"><ArrowLeft /><i /><i /></span>
        <button type="button" className="scene-stop scene-traveler" aria-label="避難バッグを自動で準備" onClick={() => setPage('bags')}>
          <span className="bag-emphasis">BAG</span>
          <SceneTravelerGraphic />
          <span className="scene-label"><b>持ち出す備え</b><small>バッグを見る</small></span>
        </button>
        <span className="scene-route-line route-bag-to-shelter" aria-hidden="true"><ArrowLeft /><i /><i /></span>
        <button type="button" className="scene-stop scene-shelter" aria-label={shelterName ? `避難先の情報を開く。登録先 ${shelterName}` : '避難先の情報を開く。未登録'} onClick={() => setShelterOpen(true)}>
          <SceneShelterGraphic />
          <span className="scene-label"><b>{shelterName || '避難先候補'}</b><small>{shelterName ? '登録情報を見る' : '候補を登録する'}</small></span>
        </button>
      </div>
      <p className="scene-safety-note"><ShieldAlert />危険時は備蓄より身の安全と、自治体などの公的情報を優先してください。</p>
    </section>

    <details className={`priority-goals ${essentialGates.complete ? 'complete' : ''}`}>
      <summary><span className="priority-summary-copy"><span className="kicker">ESSENTIAL SAFETY GATES</span><b id="priority-goals-title">命と衛生の必須確認</b><small>{essentialGates.complete ? '必須条件は確認済み。定期的に見直せます' : `次は「${nextEssentialGate.label}」を確認`}</small></span><span className="priority-goals-count">{essentialGates.completeCount}<small> / {essentialGates.gates.length}</small></span><span className="disclosure-label">すべて見る<ChevronDown /></span></summary>
      <div className="priority-goal-grid" role="region" aria-labelledby="priority-goals-title">{essentialGates.gates.map((gate) => {
        const Icon = gate.key === 'home' ? ShieldCheck : gate.key === 'risk' ? MapPin : gate.key === 'contact' ? Phone : gate.key === 'medicine' ? Heart : gate.key === 'water' ? Droplets : gate.key === 'food' ? ShoppingBasket : gate.key === 'toilet' ? Sparkles : Lightbulb;
        return <button type="button" className={gate.complete ? 'complete' : ''} key={gate.key} aria-label={`${gate.label}を確認する`} onClick={() => setPage(gate.page, { target: gate.page === 'roadmap' ? essentialGateTaskTargets[gate.key] : null })}><span className={`priority-goal-icon ${gate.key}`}><Icon /></span><span><small>{gate.label}</small><b>{gate.detail}</b><em>{gate.statusLabel}</em></span><strong>{gate.complete ? <Check /> : <ArrowRight />}{gate.complete ? '確認済み' : '確認する'}</strong></button>;
      })}</div>
      <p>{essentialGates.complete ? '必須条件を確認済みです。季節・家族構成・期限の変化に合わせて再点検してください。' : '平均点より先に、未確認の必須条件を一つずつ確認してください。'}</p>
    </details>

    <div className="home-support-row">
      <button type="button" className="home-progress-card" aria-label={`備えの進捗 ${defense.score}% の詳細を開く`} onClick={() => setPage('roadmap')}>
        <span className="home-progress-ring" style={{ '--score': `${defense.score * 3.6}deg` }}><b>{defense.score}<small>%</small></b></span>
        <span><small>備えの進捗（参考）</small><b>{defense.requiredStage.label}</b><em>次：{defense.nextTask?.title || (targetGap ? '水・食料を目標日数まで確保' : '登録項目を再確認')}</em></span><ArrowRight />
      </button>
      <nav className="home-utility-actions" aria-label="ホームのクイック操作">
        <button ref={powerEntryRef} aria-label="停電時の電力を設計" onClick={() => setPage('power')}><Zap /><span><b>電力設計</b><small>蓄電池・太陽光</small></span><ChevronRight /></button>
      </nav>
    </div>
    {targetOpen && <TargetDaysDialog value={defense.targetDays} onClose={() => setTargetOpen(false)} onSave={(value) => { setTargetDays(value); setTargetOpen(false); }} />}
    {shelterOpen && <ShelterInfoDialog contact={state.contact} onClose={() => setShelterOpen(false)} onOpenPlan={() => { setShelterOpen(false); setPage('plan'); }} />}
  </section>;
}

function ShelterInfoDialog({ contact, onClose, onOpenPlan }) {
  const dialogRef = useRef(null);
  const shelterName = String(contact?.shelter || '').trim();
  useDialogClose(onClose, dialogRef);
  return <div className="modal-backdrop shelter-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal compact-modal shelter-dialog" role="dialog" aria-modal="true" aria-labelledby="shelter-dialog-title">
    <div className="modal-title"><div><span className="kicker">EVACUATION PLACE</span><h2 id="shelter-dialog-title">避難先候補の情報</h2></div><button type="button" aria-label="避難先情報を閉じる" onClick={onClose}><X /></button></div>
    <div className={`shelter-dialog-readout${shelterName ? '' : ' missing'}`}><span><MapPin /></span><div><small>登録している避難・集合場所</small><strong>{shelterName || 'まだ登録されていません'}</strong></div></div>
    <p><ShieldAlert />災害の種類や開設状況によって適切な避難先は変わります。この登録だけで判断せず、自治体などの最新情報を確認してください。</p>
    {contact?.phone && <div className="shelter-contact"><Phone /><span><small>緊急連絡先</small><b>{contact.phone}</b></span></div>}
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>閉じる</button><button type="button" className="primary-button" onClick={onOpenPlan}><ClipboardList />緊急メモで確認・編集</button></div>
  </section></div>;
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
  const normalizeDays = (next) => normalizeStockpileTargetDays(next, value || 7);
  const adjust = (delta) => setDays((current) => normalizeDays(Number(current) + delta));
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form ref={dialogRef} className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="target-days-title" onSubmit={(event) => { event.preventDefault(); onSave(normalizeDays(days)); }}><div className="modal-title"><div><span className="kicker">STOCKPILE GOAL</span><h2 id="target-days-title">目標備蓄日数を変更</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div><p className="stepper-help">水・食品などは最低3日、できれば1週間が目安です。量の目標は1〜30日とし、それ以上は電源・代替手段・快適性へ備えを広げます。</p><div className="target-day-stepper" aria-label="目標備蓄日数"><button data-dialog-autofocus type="button" aria-label="目標備蓄日数を1日減らす" disabled={Number(days) <= 1} onClick={() => adjust(-1)}><ChevronRight /></button>{editing ? <label className="target-day-input"><input autoFocus type="number" inputMode="numeric" min="1" max={MAX_STOCKPILE_TARGET_DAYS} value={days} onChange={(event) => setDays(event.target.value)} onBlur={() => { setDays(normalizeDays(days)); setEditing(false); }} aria-label="目標備蓄日数を直接入力" /><small>日</small></label> : <button type="button" className="target-day-value" aria-label={`目標備蓄日数 ${days}日。タップして直接入力`} onClick={() => setEditing(true)}><b>{days}</b><small>日</small></button>}<button type="button" aria-label="目標備蓄日数を1日増やす" disabled={Number(days) >= MAX_STOCKPILE_TARGET_DAYS} onClick={() => adjust(1)}><ChevronRight /></button></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button"><Check />設定する</button></div></form></div>;
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

function StockpileDaysPanel({ summary, items = [], household, targetDays = 3, onAction, actionLabel, today }) {
  const missingCount = summary.foodItemsMissingWeight + summary.waterItemsMissingVolume;
  const unitNeeds = useMemo(() => stockpileUnitNeeds(items, household, targetDays, today), [items, household, targetDays, today]);
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
        <section><div><span className="resource-icon water"><Droplets /></span><p><small>飲料・調理用 {formatWaterVolume(summary.waterMl)}</small><b>{formatDays(summary.waterDays)}日分</b></p><em className={needByKey.water.shortage ? 'resource-shortage' : 'resource-ready'}>{needByKey.water.shortage ? `2Lボトル あと${needByKey.water.shortage}本` : '目標量を確保'}</em></div><div className="resource-meter water"><i style={{ width: `${waterPercent}%` }} /></div><small>目標 {formatWaterVolume(waterTargetMl)}・{household}人 × 1日3L{summary.utilityWaterMl > 0 ? `・生活用水 ${formatWaterVolume(summary.utilityWaterMl)}は別枠` : '・生活用水は別枠'}</small></section>
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

function EvacuationBags({ state, setState, setToast, setPage, today }) {
  const [activeLoadout, setActiveLoadout] = useState(null);
  const primarySettings = bagSettings(state, 'bag-primary');
  const secondarySettings = bagSettings(state, 'bag-secondary');
  const primaryPacking = useMemo(() => primarySettings.autoMode
    ? autoPackInventory(state.inventory, 'bag-primary', primarySettings.capacityL, state.household, { today })
    : null, [state.inventory, state.household, primarySettings, today]);
  const secondaryPacking = useMemo(() => secondarySettings.autoMode
    ? autoPackInventory(state.inventory, 'bag-secondary', secondarySettings.capacityL, state.household, {
      reservedItems: primarySettings.autoMode === 'inventory' ? primaryPacking?.items || [] : [],
      today,
    })
    : null, [state.inventory, state.household, secondarySettings, primarySettings.autoMode, primaryPacking, today]);
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

    <p className="bag-return-warning"><AlertTriangle /><span><b>荷物を取りに危険な場所へ戻らない</b>自宅や経路の安全を確認できない場合は帰宅せず、一時避難バッグで避難を続けてください。</span></p>
    <details className="bag-purpose-guide">
      <summary><span><span className="kicker">PURPOSE FIRST</span><b id="bag-purpose-title">2つのバッグの使い分け</b><small>一時避難はすぐ逃げる軽さ、二次避難は安全確認後の生活用品</small></span><span className="disclosure-label">詳しく見る<ChevronDown /></span></summary>
      <div className="bag-purpose-content" role="region" aria-labelledby="bag-purpose-title"><div className="bag-purpose-steps">
        <article className="primary-purpose"><span>01</span><div><small>一時避難（一次持ち出し）</small><h3>危険から即座に逃げる</h3><p>災害が発生した、または危険が迫ったとき、自宅から最寄りの安全な避難場所まで移動するために持ちます。</p><b>目安：迷わず背負って、すぐ出発できる量</b></div></article>
        <article className="secondary-purpose"><span>02</span><div><small>二次避難（二次持ち出し）</small><h3>避難先で数日を過ごす</h3><p>緊急性が落ち着き、自宅と移動経路の安全を確認できた場合に追加で持ち出し、避難所などで生活するために使います。</p><b>目安：水・食料・衛生品など数日分の生活用品</b></div></article>
      </div>
      </div>
    </details>

    <aside className="bag-auto-note" aria-label="自動選定の仕組み"><Sparkles /><div><b>自動モードを設定したバッグだけ、中身を配列</b><span>備蓄からの自動選定、理想構成、自分で選ぶ構成の3方式から選べます。未設定のまま勝手に配列しません。</span></div></aside>

    <div className="evacuation-stage-flow" aria-label="避難段階を選択">
      {evacuationBagStages.map((stage, index) => {
        const packing = packingById[stage.id];
        const settings = stage.id === 'bag-primary' ? primarySettings : secondarySettings;
        const loadout = getLoadout(stage.id);
        const plannedItems = settings.autoMode === 'inventory'
          ? packing?.items || []
          : settings.autoMode === 'ideal'
            ? loadout.items
            : settings.autoMode === 'custom'
              ? loadout.items.filter((item) => settings.customIdealIds.includes(item.id))
              : [];
        const totalUnits = settings.autoMode === 'inventory'
          ? plannedItems.reduce((sum, item) => sum + item.quantity, 0)
          : plannedItems.length;
        const modeLabel = settings.autoMode === 'inventory' ? '備蓄から選定' : settings.autoMode === 'ideal' ? '理想構成' : settings.autoMode === 'custom' ? '自分で選択' : '未設定';
        return <article className={`evacuation-stage-card ${stage.id === 'bag-primary' ? 'primary-stage' : 'secondary-stage'}`} key={stage.id}>
          <header><span className="bag-stage-number">{stage.step}</span><div><small>{stage.label}</small><h2>{stage.title}</h2><p>{stage.timing}</p></div><Backpack /></header>
          <p className="bag-stage-description">{stage.description}</p>
          {settings.autoMode ? <><div className="bag-plan-summary"><span><small>バッグ容量</small><b>{settings.capacityL}L</b></span><span><small>自動モード</small><b className="bag-mode-summary">{modeLabel}</b></span><span><small>構成品</small><b>{plannedItems.length}<em>品目</em></b></span><span><small>{settings.autoMode === 'inventory' ? '収納単位' : '選択数'}</small><b>{totalUnits}<em>点</em></b></span></div>
          <div className="bag-preview-list">{plannedItems.length ? plannedItems.slice(0, 4).map((item) => <span key={item.id}><b>{item.name}</b><small>{settings.autoMode === 'inventory' ? `${item.quantity}${item.unit}` : '構成に含む'}</small></span>) : <p><AlertTriangle />構成に含める物がありません</p>}{plannedItems.length > 4 && <em>ほか {plannedItems.length - 4}品目</em>}</div></> : <div className="bag-mode-unset"><Sparkles /><span><b>自動モードは未設定です</b><small>方式を選ぶまで中身は配列しません</small></span></div>}
          {stage.id === 'bag-secondary' && settings.autoMode === 'inventory' && primarySettings.autoMode === 'inventory' && <p className="bag-reserved-summary">一時避難バッグの {(primaryPacking?.items || []).reduce((sum, item) => sum + item.quantity, 0)}点は重複させず確保済み</p>}
          <button type="button" className="bag-open-planner" onClick={() => setActiveLoadout(stage.id)}><Sparkles /><span><b>{settings.autoMode ? '自動モードを確認・変更' : '自動モードを設定'}</b><small>3方式・不足品・実物確認</small></span><ChevronRight /></button>
        </article>;
      })}
    </div>

    <p className="bag-safety-note"><ShieldCheck />自動選定は収納計画です。実際にバッグへ入れた後、画面内の「現物確認」で一つずつ確認してください。</p>
    {activeLoadout && <PracticalLoadout taskId={activeLoadout} state={state} onChange={(packed) => setState((old) => updateLoadout(old, activeLoadout, packed))} onBagSettings={(settings) => setState((old) => updateBagSettings(old, activeLoadout, settings))} onAddPurchase={(itemId) => { setState((old) => addBagPurchaseItem(old, activeLoadout, itemId)); setToast('不足品を防災予算計画へ追加しました'); }} onComplete={finishLoadout} onClose={() => setActiveLoadout(null)} today={today} />}
  </section>;
}

const pillarLabels = {
  risk: '危険把握', home: '住環境', information: '情報', health: '健康', water: '水', food: '食料',
  sanitation: '衛生', power: '電力', evacuation: '避難', family: '家族', recovery: '復旧', skills: '訓練', community: '共助',
};

function StageIcon({ name }) {
  return name === 'backpack' ? <Backpack /> : name === 'route' ? <Route /> : name === 'calendar' ? <CalendarDays /> : name === 'solar' ? <Sun /> : name === 'community' ? <Users /> : <ShieldCheck />;
}

function PreparednessRoadmap({ state, summary, setState, setPage, setToast, targetTaskId, today }) {
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
          {progress.stages.map((stage, index) => <div className="stage-flow-unit" role="listitem" key={stage.id}>
            <button type="button" className={`stage-node ${selectedStage.id === stage.id ? 'selected' : ''} ${stage.gateClear ? 'cleared' : ''}`} onClick={() => setSelectedStageId(stage.id)} aria-pressed={selectedStage.id === stage.id} aria-current={selectedStage.id === stage.id ? 'step' : undefined}>
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
    {activeLoadout && <PracticalLoadout taskId={activeLoadout} state={state} onChange={(packed) => setState((old) => updateLoadout(old, activeLoadout, packed))} onBagSettings={(settings) => setState((old) => updateBagSettings(old, activeLoadout, settings))} onComplete={finishLoadout} onClose={() => setActiveLoadout(null)} today={today} />}
  </section>;
}

const stockpileSkillDetails = {
  'safety-foundation': '備蓄日数とは別に、住まい・避難先・連絡・常用薬を確認します。未確認項目はホームの必須確認に残り、スキルの開放を待つ必要はありません。',
  'diversity-power': '医療機器など止められない用途を最優先にし、必要な家庭だけ蓄電池・太陽光・発電機などを組み合わせます。登録だけで容量や安全運用は保証されません。燃料式発電機は屋内・車内・テント内では絶対に使わず、屋外でも出入口や窓から離れた風通しのよい場所で、排気方向と取扱説明書を確認します。',
  'diversity-food': '同じ主食を増やすだけでなく、チョコレート・菓子・調味料など、食欲と平常感を支える期限を確認済みの食品を加えます。',
  'diversity-calm': 'トランプ・本・子どもの遊びなど、電気を使わず普段に近い時間を作れる物を家族構成に合わせて選ぶ任意項目です。',
  'diversity-personal': '常用薬、乳幼児用品、アレルギー対応品、ペット用品など、代替しにくい物は備蓄日数より先に確認します。登録後も必要量・期限・使い方を別に点検します。',
};

const stockpileSkillSource = (node) => {
  if (node.id === 'home-3' || node.id === 'home-7') return STOCKPILE_GUIDELINE_SOURCES.cabinet;
  if (node.id === 'diversity-power') return STOCKPILE_GUIDELINE_SOURCES.generator;
  if (node.id === 'diversity-food' || node.category === 'food') return STOCKPILE_GUIDELINE_SOURCES.food;
  return null;
};

const formatSkillProgress = (node, model) => {
  const currentValue = Number(node.progress?.current) || 0;
  const current = Number.isInteger(currentValue) ? currentValue : Math.round(currentValue * 10) / 10;
  const target = Number(node.progress?.target) || 0;
  if (node.kind === 'safety') {
    const missing = model.safety.gates.filter((gate) => !gate.complete).map((gate) => gate.label);
    return missing.length
      ? `ホームの必須確認で ${current} / ${target}項目を確認。未確認：${missing.join('、')}`
      : `ホームの必須確認で ${target}項目を確認済み。実物と最新情報を定期的に見直す`;
  }
  if (node.kind === 'diversity') {
    const stage = node.id === 'diversity-personal'
      ? '備蓄日数を待たず'
      : node.id === 'diversity-food'
        ? '食料の重量換算3日分と並行して'
        : node.id === 'diversity-power'
          ? '主要備蓄の参考量3日分と並行して'
          : '主要備蓄の参考量7日分を維持しながら';
    return `${stage}、期限切れ・登録内容の確認待ちを除いた対象品を登録する（現在 ${current} / ${target}登録）`;
  }
  const basis = target === 1
    ? '1日はアプリ上の着手点'
    : target === 3
      ? '3日は公的な最低目安'
      : target === 7
        ? '7日は公的な推奨目安'
        : target === 30
          ? '30日は国の一律基準ではなく、量から質へ切り替えるアプリ上の判断点'
          : '';
  const foodCaveat = node.category === 'food' || node.kind === 'milestone'
    ? '。食料は登録重量による参考換算で、栄養・アレルギー・調理可否は別に確認'
    : '';
  return `期限切れ・登録内容の確認待ちを除いたデータで ${current}日分 / 条件 ${target}日分${basis ? `。${basis}` : ''}${foodCaveat}`;
};

function StockpileSkillsPage({ state, setState, setToast, onClose, today }) {
  const model = useMemo(() => buildStockpileSkillTree(state, { today }), [state, today]);
  const nodes = useMemo(() => model.nodes.map((node) => ({
    ...node,
    parents: node.parentIds,
    detail: stockpileSkillDetails[node.id] || node.description,
    condition: formatSkillProgress(node, model),
    source: stockpileSkillSource(node),
  })), [model]);

  const handleClaim = (nodeId) => {
    const next = claimStockpileSkill(state, nodeId, { today });
    if (next === state) {
      setToast('条件が変わったため、現在の備蓄をもう一度確認してください');
      return;
    }
    setState(next);
    setToast('登録データ上の達成を確認しました');
  };

  return <StockpileSkillTree
    nodes={nodes}
    household={state.household}
    onClaim={handleClaim}
    onClose={onClose}
    description="水・食料・携帯トイレを1日・3日・7日の順に下へ育て、家庭固有の備えは量と分けて確認します。"
  />;
}

function Inventory({ categoryKey = null, state, summary, transactions, setModal, updateInventory, setState, setToast, setPage, skillEntryRef, today, onStateReplaced, latestStateRef }) {
  const [query, setQuery] = useState('');
  const [consumeItem, setConsumeItem] = useState(null);
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [meaningCategory, setMeaningCategory] = useState(null);
  const [importArmed, setImportArmed] = useState(false);
  const importSnapshotRef = useRef('');
  const importRef = useRef(null);
  const insights = useMemo(() => transactionInsights(transactions), [transactions]);
  const budgetProjection = useMemo(() => stockpileBudgetProjection(state.inventory, state.household, state.preparedness?.targetDays || 7, state.preparedness?.annualBudget || 0, today), [state.inventory, state.household, state.preparedness?.targetDays, state.preparedness?.annualBudget, today]);
  const budgetDuration = !budgetProjection.costComplete
    ? '単価の確認待ち'
    : budgetProjection.months === null
      ? '予算を設定して算出'
      : budgetProjection.months === 0
        ? '目標日数を達成済み'
        : budgetProjection.months < 12
          ? `約${budgetProjection.months}か月で到達`
          : `約${(budgetProjection.months / 12).toFixed(1)}年で到達`;
  const bagPurchaseCount = state.preparedness?.bagPurchasePlan?.length || 0;
  const nextRotation = summary.rotationQueue[0];
  const stockpileSkills = useMemo(() => buildStockpileSkillTree(state, { today }), [state, today]);
  useEffect(() => {
    if (importArmed && importSnapshotRef.current !== JSON.stringify(state)) {
      importSnapshotRef.current = '';
      setImportArmed(false);
    }
  }, [state, importArmed]);
  const countVisibleSkillCards = (status) => new Set(stockpileSkills.nodes
    .filter((node) => node.status === status && node.tier !== '1-day')
    .map((node) => node.kind === 'resource' ? `resource-${node.category}` : node.id)).size;
  const skillClaimableCount = countVisibleSkillCards('claimable');
  const skillReviewCount = countVisibleSkillCards('review');
  const currentConsumeItem = consumeItem ? summary.rows.find((entry) => entry.id === consumeItem.id) || null : null;
  const skillLauncherLabel = skillClaimableCount || skillReviewCount
    ? `備蓄スキルツリーを開く。${[
      skillClaimableCount ? `達成確認可能 ${skillClaimableCount}件` : '',
      skillReviewCount ? `再確認が必要 ${skillReviewCount}件` : '',
    ].filter(Boolean).join('、')}`
    : '備蓄スキルツリーを開く。新しい達成確認はありません';
  const inventoryDefense = useMemo(() => defensePower(state, summary), [state, summary]);
  const dayGoalCoverage = {
    water: inventoryDefense.waterCoverage,
    food: inventoryDefense.foodCoverage,
    hygiene: inventoryDefense.toiletCoverage,
  };
  const categories = Object.entries(CATEGORY_META).map(([key, meta]) => {
    const categoryRows = summary.rows.filter((item) => item.category === key);
    if (Object.hasOwn(dayGoalCoverage, key)) {
      const score = dayGoalCoverage[key] >= 1 ? 100 : Math.min(99, Math.round(dayGoalCoverage[key] * 100));
      const progressBasis = key === 'hygiene' ? `${inventoryDefense.targetDays}日目標（携帯トイレ）` : `${inventoryDefense.targetDays}日目標`;
      return { key, ...meta, itemCount: categoryRows.length, targetConfigured: true, score, progressBasis };
    }
    const targetRows = categoryRows.filter((item) => Number(item.target) > 0);
    const tierWeight = (tier) => ({ 1: 3, 2: 2, 3: 1 }[tier] || 1);
    const totalWeight = targetRows.reduce((sum, item) => sum + tierWeight(item.tier), 0);
    const scoreRatio = totalWeight ? targetRows.reduce((sum, item) => {
      const coverage = Math.min(1, Math.max(0, Number(item.usableQuantity) || 0) / Number(item.target));
      return sum + coverage * tierWeight(item.tier);
    }, 0) / totalWeight : 0;
    const score = scoreRatio >= 1 ? 100 : Math.min(99, Math.round(scoreRatio * 100));
    return { key, ...meta, itemCount: categoryRows.length, targetConfigured: targetRows.length > 0, score, progressBasis: '登録目標' };
  });
  const selectedCategory = categories.find((category) => category.key === categoryKey) || null;
  const rows = summary.rows.filter((item) => (!selectedCategory || item.category === selectedCategory.key) && item.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3) || a.tier - b.tier || a.ratio - b.ratio);
  const rawRows = () => summary.rows.map(({ usableQuantity, needsVerification, shortage, ratio, replenishmentCost, daysToExpiry, isExpiring, isExpired, daysToCheck, isCheckDue, daysToRotationReminder, isRotationReminderDue, priority, ...item }) => item);
  const consume = ({ amount, reason, note }) => {
    const item = summary.rows.find((entry) => entry.id === consumeItem.id);
    const used = Math.min(Number(amount) || 1, Number(item.quantity) || 0);
    if (!used) return setConsumeItem(null);
    const productTarget = rawRows().filter((entry) => entry.productId === item.productId).reduce((sum, entry) => sum + Math.max(0, Number(entry.target) || 0), 0);
    const reduced = rawRows().map((entry) => entry.id === item.id ? { ...entry, quantity: Number(entry.quantity) - used, lastChecked: today } : entry);
    const inventory = item.productId ? redistributeProductTargets(reduced, item.productId, productTarget, today) : reduced;
    const type = reason === '期限切れ・廃棄' ? 'discard' : 'consume';
    updateInventory(inventory, `${used}${item.unit}を記録しました`, createTransaction(type, item, -used, note, { reason }));
    setConsumeItem(null);
  };
  const remove = (id) => {
    const item = summary.rows.find((entry) => entry.id === id);
    if (!window.confirm('この期限ロットを削除しますか？履歴には削除記録が残ります。')) return;
    const productTarget = rawRows().filter((entry) => entry.productId === item.productId).reduce((sum, entry) => sum + Math.max(0, Number(entry.target) || 0), 0);
    const remaining = rawRows().filter((entry) => entry.id !== id);
    const inventory = remaining.some((entry) => entry.productId === item.productId)
      ? redistributeProductTargets(remaining, item.productId, productTarget, today)
      : remaining;
    updateInventory(inventory, '備蓄品を削除しました', createTransaction('delete', item, -item.quantity, '期限ロットを削除'));
  };
  const confirmInventoryReview = (item) => {
    const inventory = rawRows().map((entry) => {
      if (entry.id !== item.id) return entry;
      const { verificationStatus, verificationReason, ...verified } = entry;
      return { ...verified, lastChecked: today };
    });
    updateInventory(inventory, `${item.name}を実物確認済みにしました`, createTransaction('verify', item, 0, '登録内容を実物と照合'));
  };
  const exportData = () => {
    try {
      const currentSnapshot = JSON.stringify(state);
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${APP_ENVIRONMENT.backupFilenamePrefix}-backup-${localDateKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      importSnapshotRef.current = currentSnapshot;
      setImportArmed(true);
      setToast('現在データを保存しました。復元を選べます');
    } catch {
      importSnapshotRef.current = '';
      setImportArmed(false);
      setToast('現在データをファイル保存できませんでした');
    }
  };
  const importData = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!importArmed || importSnapshotRef.current !== JSON.stringify(state)) {
      importSnapshotRef.current = '';
      setImportArmed(false);
      setToast('現在データが変わったため、もう一度ファイル保存してから復元してください');
      return;
    }
    try {
      const imported = parseStateData(await file.text());
      const liveSnapshot = JSON.stringify(latestStateRef.current);
      if (!importSnapshotRef.current || importSnapshotRef.current !== liveSnapshot) {
        importSnapshotRef.current = '';
        setImportArmed(false);
        setToast('現在データが変わったため、もう一度ファイル保存してから復元してください');
        return;
      }
      if (!window.confirm(`${imported.inventory.length}件の備蓄を読み込み、現在のデータを置き換えますか？`)) return;
      const confirmedSnapshot = JSON.stringify(latestStateRef.current);
      if (!importSnapshotRef.current || importSnapshotRef.current !== confirmedSnapshot) {
        importSnapshotRef.current = '';
        setImportArmed(false);
        setToast('現在データが変わったため、もう一度ファイル保存してから復元してください');
        return;
      }
      try {
        // The visible in-memory state may be newer than localStorage after a
        // quota or permission failure. Back up exactly what will be replaced.
        const currentRaw = confirmedSnapshot;
        const backupKey = `${RECOVERY_KEY_PREFIX}-before-import-${Date.now()}`;
        localStorage.setItem(backupKey, currentRaw);
        if (localStorage.getItem(backupKey) !== currentRaw) throw new Error('backup-failed');
      } catch {
        setToast('現在のデータを保護できなかったため、復元を中止しました');
        return;
      }
      setState(imported);
      onStateReplaced?.();
      importSnapshotRef.current = '';
      setImportArmed(false);
      setToast('バックアップを復元しました');
    } catch (error) {
      setToast(error?.message === 'future-schema' ? 'このアプリより新しい形式のため復元できません' : 'バックアップファイルを読み込めませんでした');
    }
  };
  const rotationPreview = summary.rotationQueue.slice(0, 3);
  const upcomingRotationCount = summary.rotationQueue.filter((entry) => entry.status === 'upcoming').length;
  const rotationStatus = (entry) => entry.status === 'expired'
    ? '期限切れ・廃棄を確認'
    : entry.status === 'due'
      ? '消費時期です'
      : entry.status === 'upcoming'
        ? `${entry.daysToRotate}日後に消費開始`
        : `${entry.daysToRotate}日後に消費開始`;

  if (!selectedCategory) return <section className="wrap page-section inventory-page inventory-dashboard-page">
    <div className="page-title"><div><span className="kicker">STOCKPILE DASHBOARD</span><h1>わが家の備蓄</h1><p>備蓄全体の状態と、次に対応する品目をここで確認します。</p></div><div className="page-actions"><details className="data-management"><summary><Download />データ管理</summary><div><button className="secondary-button" onClick={exportData}><Download />現在データを保存</button><button className="secondary-button" disabled={!importArmed} title={!importArmed ? '誤復元に備え、先に現在データをファイル保存してください' : undefined} onClick={() => importRef.current?.click()}><Upload />復元</button></div><input ref={importRef} hidden type="file" accept="application/json" onChange={importData} /></details></div></div>
    <div className="summary-strip inventory-summary-strip"><div><span>主要備蓄の参考日数</span><b>{formatDays(summary.householdStockpileDays ?? summary.survivalDays)}日</b></div><div><span>{state.preparedness?.targetDays || 7}日目標まで</span><b>{budgetProjection.costComplete ? `約¥${budgetProjection.totalCost.toLocaleString()}` : '単価確認中'}</b></div><div><span>年間予算</span><b>{budgetProjection.annualBudget ? `¥${budgetProjection.annualBudget.toLocaleString()}` : '未設定'}</b></div><div className="inventory-summary-actions"><button type="button" aria-label="主要備蓄の参考日数と実物不足を開く" onClick={() => setCalculationOpen(true)}><CircleHelp />日数と不足</button></div></div>
    <div className="inventory-dashboard-workspace">
      <div className="inventory-dashboard-planning">
        <section className="card stockpile-next-actions" aria-labelledby="stockpile-next-actions-title">
          <header><div><span className="stockpile-next-actions-icon"><RefreshCw /></span><div><span className="kicker">NEXT ROTATION</span><h2 id="stockpile-next-actions-title">次に使う・確認する備蓄</h2><p>期限と消費開始日が近い順です。品目名を確認してから計画ページへ進めます。</p></div></div><span className={summary.rotationDueCount ? 'stockpile-action-count urgent' : 'stockpile-action-count'}>{summary.rotationDueCount ? `今すぐ ${summary.rotationDueCount}品` : upcomingRotationCount ? `30日以内 ${upcomingRotationCount}品` : '今すぐの対応なし'}</span></header>
          {rotationPreview.length ? <div className="stockpile-next-list">{rotationPreview.map((entry) => <button type="button" key={entry.key} className={entry.status} aria-label={`${entry.nextLot.name}。${rotationStatus(entry)}。ローリングストック計画を開く`} onClick={() => setPage('rolling')}><span className="stockpile-next-status">{rotationStatus(entry)}</span><span><b>{entry.nextLot.name}</b><small>期限 {entry.nextLot.expiry}・在庫 {entry.totalQuantity}{entry.nextLot.unit}</small></span><ChevronRight /></button>)}</div> : <div className="stockpile-next-empty"><Check /><span><b>期限付きの消費予定はありません</b><small>備蓄品に期限を登録すると、次の対応がここに表示されます。</small></span></div>}
        </section>
        <section className="stockpile-plan-hub" aria-labelledby="stockpile-plan-title">
          <header><div><span className="kicker">STOCKPILE PLANS</span><h2 id="stockpile-plan-title">使う計画と、買う計画</h2></div><p>在庫を循環させながら、必要な備蓄を予算内で揃えます。</p></header>
          <div className="stockpile-plan-grid">
            <button type="button" className="stockpile-plan-card rotation-plan-card" aria-label="ローリングストック計画を開く" onClick={() => setPage('rolling')}>
              <span className="stockpile-plan-icon"><RefreshCw /></span>
              <span><small>使う計画</small><b>ローリングストック</b><em>{summary.rotationDueCount ? `いま消費時期の備蓄 ${summary.rotationDueCount}品` : nextRotation ? `次は ${nextRotation.nextLot.name}` : '期限を登録すると消費順を提案'}</em></span>
              <strong>{summary.rotationQueue.length}<small>品を計画中</small></strong><ChevronRight />
            </button>
            <button type="button" className="stockpile-plan-card budget-plan-card" aria-label="防災予算計画を開く" onClick={() => setBudgetOpen(true)}>
              <span className="stockpile-plan-icon"><CalendarDays /></span>
              <span><small>買う計画</small><b>防災予算計画</b><em>{bagPurchaseCount ? `${budgetDuration}・バッグ候補 ${bagPurchaseCount}点` : budgetDuration}</em></span>
              <strong>{budgetProjection.annualBudget ? `¥${budgetProjection.annualBudget.toLocaleString()}` : '未設定'}<small>年間予算</small></strong><ChevronRight />
            </button>
          </div>
        </section>
      </div>
      <section className="inventory-category-picker" aria-labelledby="inventory-category-title">
        <header><div><span className="kicker">STOCKPILE CATEGORIES</span><h2 id="inventory-category-title">分類から備蓄を選ぶ</h2><p>各分類を開くと、その分類の品目一覧・数量変更・編集を行えます。</p></div></header>
        <div className="inventory-category-grid" role="group" aria-label="備蓄カテゴリ">
          <span className="visually-hidden" id="category-long-press-instruction">選ぶと分類別の詳細ページへ移動します。長押しすると分類の意味と備蓄目安を表示します。キーボードではIキーでも開けます。</span>
          {categories.map((category) => <InventoryCategoryButton
            category={category}
            key={category.key}
            progressLabel={category.targetConfigured ? `${category.score}%` : '目標未設定'}
            onExplain={() => setMeaningCategory(category)}
            onSelect={() => setPage('inventory-category', { target: category.key })}
          />)}
        </div>
      </section>
    </div>
    <button
      ref={skillEntryRef}
      type="button"
      className={`stockpile-skill-launcher ${skillClaimableCount ? 'has-claimable' : ''} ${skillReviewCount ? 'has-review' : ''}`.trim()}
      aria-label={skillLauncherLabel}
      onClick={() => setPage('stockpile-skills')}
    >
      <Route aria-hidden="true" />
      {(skillClaimableCount > 0 || skillReviewCount > 0) && <span className="stockpile-skill-launcher-alert" aria-hidden="true">!</span>}
    </button>
    {calculationOpen && <StockpileCalculationDialog summary={summary} items={state.inventory} household={state.household} targetDays={state.preparedness?.targetDays || 7} onClose={() => setCalculationOpen(false)} onAction={() => { setPage('inventory-category', { target: summary.foodItemsMissingWeight ? 'food' : 'water' }); setCalculationOpen(false); }} today={today} />}
    {budgetOpen && <BudgetPlannerDialog state={state} summary={summary} setState={setState} onClose={() => setBudgetOpen(false)} today={today} />}
    {meaningCategory && <StockpileMeaningDialog category={meaningCategory} onClose={() => setMeaningCategory(null)} />}
  </section>;

  return <section className="wrap page-section inventory-page inventory-category-page">
    <div className="page-title inventory-category-title"><div><span className="kicker">CATEGORY DETAIL</span><h1>{selectedCategory.label}の備蓄</h1><p>{selectedCategory.itemCount}品目を登録中。数量・期限・内容量を品目ごとに管理します。</p></div><div className="page-actions"><button type="button" className="secondary-button" onClick={() => setPage('inventory')}><ArrowLeft />備蓄ダッシュボードへ</button></div></div>
    <aside className="inventory-category-guidance"><span className="guidance-category-icon" style={{ '--category': selectedCategory.color }}><CategoryIcon category={selectedCategory.key} /></span><div><small>{selectedCategory.progressBasis}の達成度 {selectedCategory.targetConfigured ? `${selectedCategory.score}%` : '目標未設定'}</small><b>{itemCategoryGuidance[selectedCategory.key].title}</b><p>{itemCategoryGuidance[selectedCategory.key].primary}</p></div>{selectedCategory.key === 'hygiene' && <button type="button" aria-label="携帯トイレ7日分の目安" onClick={() => setBenchmarkOpen(true)}><CircleHelp />目安を確認</button>}</aside>
    <div className="inventory-tools"><label className="search"><Search /><input aria-label="備蓄品を検索" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`${selectedCategory.label}から検索`} /></label></div>
    <div className="inventory-list" aria-label={`${selectedCategory.label}の備蓄品目`}>
      {rows.map((item) => <article className={`inventory-item ${item.needsVerification ? 'needs-verification' : ''}`.trim()} key={item.id}>
        {item.imageUrl ? <div className="product-thumb"><img src={item.imageUrl} alt="" /></div> : <div className="category-badge" style={{ '--category': CATEGORY_META[item.category]?.color }}><CategoryIcon category={item.category} /></div>}
        <div className="item-main">
          <div className="item-title"><span className={`tier tier-${item.tier}`}>TIER {item.tier}</span><h3>{item.name}</h3>{item.brand && <span className="brand-tag">{item.brand}</span>}{item.needsVerification && <span className="verification-tag">実物確認待ち</span>}{item.isExpiring && <span className="expiry-tag">{item.isExpired ? '期限切れ' : `あと${item.daysToExpiry}日`}</span>}{item.category === 'food' && !item.foodWeightG && <span className="amount-missing-tag">重量未登録</span>}{item.category === 'water' && !item.volumeMl && <span className="amount-missing-tag">水量未登録</span>}{item.category === 'water' && item.waterPurpose === 'utility' && <span className="utility-water-tag">生活用水・3L換算外</span>}</div>
          <div className="stock-progress"><span style={{ width: `${Math.min(item.ratio * 100, 100)}%` }} /><i style={{ left: `${Math.min(item.ratio * 100, 100)}%` }} /></div>
          <div className="item-meta"><span>在庫 <b>{item.quantity}{item.unit}</b> / 目標 {item.target}{item.unit}{item.needsVerification && <small>・実物確認まで達成度に含めません</small>}{item.isExpired && <small>・期限切れ分は達成度に含めません</small>}{item.category === 'food' && item.foodWeightG > 0 && <small>・1{item.unit} {formatFoodWeight(item.foodWeightG)}</small>}{item.category === 'water' && item.volumeMl > 0 && <small>・1{item.unit} {formatWaterVolume(item.volumeMl)}</small>}{item.barcode && <small>・JAN {item.barcode}</small>}</span>{Number(item.target) <= 0 ? <span className="shortage">目標未設定</span> : item.shortage > 0 ? <span className="shortage">あと {item.shortage}{item.unit}</span> : <span className="enough"><Check /> 目標達成</span>}</div>
          {item.needsVerification && <aside className="legacy-verification-note"><AlertTriangle /><span><b>{inventoryReviewMessage(item)[0]}</b><small>{inventoryReviewMessage(item)[1]}</small></span>{canResolveInventoryReview(item) && <button type="button" onClick={() => confirmInventoryReview(item)} aria-label={`${item.name}の登録内容を実物と確認して在庫に反映`}><Check />登録内容を実物確認</button>}</aside>}
        </div>
        <div className="quick-actions"><button disabled={item.needsVerification} title={item.needsVerification ? '実物確認後に記録できます' : undefined} aria-label={`${item.name}を消費・廃棄`} onClick={() => setConsumeItem(item)}><Minus /></button><button aria-label={`${item.name}を新しい期限ロットとして補充`} onClick={() => setModal({ newLotFrom: item, suggestedQuantity: 1 })}><Plus /></button><button aria-label={`${item.name}を編集`} onClick={() => setModal(item)}><Pencil /></button><button aria-label={`${item.name}を削除`} className="danger" onClick={() => remove(item.id)}><Trash2 /></button></div>
      </article>)}
      {!rows.length && <div className="empty-state">{state.inventory.length ? <Search /> : <PackagePlus />}<h3>{state.inventory.length ? '該当する備蓄品がありません' : '実物を確認して備蓄を登録'}</h3><p>{state.inventory.length ? '検索条件を変えてみてください。' : 'このアプリは未確認のサンプル在庫を加算しません。右下の追加ボタンから、手元にある品を登録してください。'}</p></div>}
    </div>
    <details className="card inventory-history-panel">
      <summary><span><History /><b>消費履歴と傾向</b><small>必要なときに開く</small></span><ChevronRight /></summary>
      <div className="operation-panel"><div className="insight-strip"><span>30日消費<b>{insights.consumed30Days}</b></span><span>うち廃棄<b>{insights.discarded30Days}</b></span><span>最多<b>{insights.topConsumed?.name || '—'}</b></span></div>{transactions.length ? transactions.slice(0, 10).map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'rotate' ? '期限順消費' : entry.type === 'consume' ? '消費' : entry.type === 'discard' ? '廃棄' : entry.type === 'delete' ? '削除' : entry.type === 'edit' ? '編集' : '入庫'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}{entry.unit}・{entry.reason || entry.note || ''}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">操作すると履歴が記録されます</div>}</div>
    </details>
    {currentConsumeItem && <ConsumptionModal item={currentConsumeItem} onClose={() => setConsumeItem(null)} onSave={consume} />}
    {benchmarkOpen && <PreparednessBenchmarkDialog kind="hygiene" onClose={() => setBenchmarkOpen(false)} />}
  </section>;
}

const CATEGORY_LONG_PRESS_MS = 600;

function InventoryCategoryButton({ category, progressLabel, onExplain, onSelect }) {
  const timerRef = useRef(null);
  const longPressedRef = useRef(false);
  const pointerStartRef = useRef(null);
  const isPriority = ['water', 'food', 'hygiene'].includes(category.key);
  const clearLongPress = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pointerStartRef.current = null;
  };
  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);
  const startLongPress = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    clearLongPress();
    longPressedRef.current = false;
    pointerStartRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onExplain();
    }, CATEGORY_LONG_PRESS_MS);
  };
  const trackPointer = (event) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) clearLongPress();
  };
  const select = (event) => {
    if (longPressedRef.current) {
      event.preventDefault();
      longPressedRef.current = false;
      return;
    }
    onSelect();
  };
  const openFromKeyboard = (event) => {
    if (event.key.toLowerCase() !== 'i' && event.key !== 'F1') return;
    event.preventDefault();
    clearLongPress();
    onExplain();
  };
  const label = category.targetConfigured ? `${category.label}の備蓄を表示。${category.progressBasis}の達成度 ${category.score}%` : `${category.label}の備蓄を表示。目標未設定`;
  return <button
    type="button"
    className={isPriority ? `priority-category priority-${category.key}` : ''}
    data-category={category.key}
    data-priority={isPriority ? 'true' : undefined}
    aria-label={label}
    aria-describedby="category-long-press-instruction"
    aria-keyshortcuts="I F1"
    onClick={select}
    onContextMenu={(event) => { event.preventDefault(); clearLongPress(); onExplain(); }}
    onKeyDown={openFromKeyboard}
    onPointerDown={startLongPress}
    onPointerMove={trackPointer}
    onPointerUp={clearLongPress}
    onPointerCancel={clearLongPress}
    onPointerLeave={clearLongPress}
  >
    {isPriority && <em className="priority-category-mark">重点</em>}
    <LiquidCategoryIcon category={category.key} score={category.score} configured={category.targetConfigured} />
    <span><b>{category.label}</b><small>{category.itemCount}品目</small></span>
    <strong>{progressLabel}</strong>
    <em className="category-meaning-hint"><CircleHelp />長押しで意味</em>
  </button>;
}

function StockpileMeaningDialog({ category, onClose }) {
  const dialogRef = useRef(null);
  const guidance = itemCategoryGuidance[category.key];
  useDialogClose(onClose, dialogRef);
  return <div className="modal-backdrop category-meaning-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className={`modal compact-modal category-meaning-dialog meaning-${category.key}`} role="dialog" aria-modal="true" aria-labelledby="category-meaning-title">
      <div className="modal-title"><div><span className="kicker">WHY THIS MATTERS</span><h2 id="category-meaning-title">{category.label}の意味</h2></div><button type="button" aria-label="備蓄の意味を閉じる" onClick={onClose}><X /></button></div>
      <div className="category-meaning-hero" style={{ '--category': category.color }}><span><CategoryIcon category={category.key} /></span><div><small>{guidance.title}</small><strong>{guidance.primary}</strong></div></div>
      {category.key === 'water' && <div className="water-meaning-split" aria-label="1人1日3リットルと生活用水の区別">
        <div><span>3L / 人・日</span><b>飲料＋調理用</b><small>命と食事に使う備蓄水</small></div>
        <i aria-hidden="true">＋</i>
        <div><span>別枠</span><b>生活用水</b><small>トイレ・洗濯・食品や食器の洗浄など</small></div>
      </div>}
      <p>{guidance.detail}</p>
      {guidance.evidence && <a className="category-meaning-source" href={guidance.evidence.url} target="_blank" rel="noreferrer">根拠を確認：{guidance.evidence.label}<ArrowRight /></a>}
      <small className="category-meaning-note">通常のタップではこの分類の詳細ページへ移動します。登録した内容量・数量・期限を基に達成度を計算します。</small>
      <div className="modal-actions"><button type="button" className="primary-button" onClick={onClose}><Check />確認しました</button></div>
    </section>
  </div>;
}

function RollingStock({ state, summary, transactions, updateInventory, onBack, today }) {
  const rawRows = () => state.inventory;
  const rotateOne = (entry) => {
    const expired = entry.status === 'expired';
    const result = expired
      ? {
          inventory: rawRows().map((item) => item.id === entry.nextLot.id ? { ...item, quantity: Math.max(0, Number(item.quantity) - 1), lastChecked: localDateKey() } : item),
          consumed: [{ item: entry.nextLot, quantity: 1 }],
        }
      : consumeByRotation(rawRows(), entry.key, 1, today);
    const consumed = result.consumed[0];
    if (!consumed) return;
    const productId = consumed.item.productId;
    const productTarget = productId ? rawRows().filter((item) => item.productId === productId).reduce((sum, item) => sum + Math.max(0, Number(item.target) || 0), 0) : 0;
    const inventory = productId ? redistributeProductTargets(result.inventory, productId, productTarget, today) : result.inventory;
    updateInventory(
      inventory,
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
  const limit = new Date(`${today}T12:00:00`); limit.setDate(limit.getDate() + 30);
  const maxReminder = localDateKey(limit);
  const rollingHistory = transactions.filter((entry) => entry.type === 'rotate' || (entry.type === 'discard' && entry.source === 'rolling-stock')).slice(0, 8);
  const upcomingCount = summary.rotationQueue.filter((entry) => entry.status === 'upcoming').length;
  return <section className="wrap page-section rolling-page"><div className="page-title"><div><span className="kicker">CONSUMPTION PLAN</span><h1>ローリングストック消費計画</h1><p>期限が近い物を、期限が来る前に使う順番として整理します。</p></div><button className="secondary-button" onClick={onBack}><ArrowRight className="back-arrow" />備蓄へ戻る</button></div><aside className="rolling-guide"><b>この画面で行うこと</b><span><CalendarDays />期限順に消費予定を確認する</span><span><Bell />必要な日に再通知を設定する</span><span><RefreshCw />実際に使った時だけ消費として記録する</span></aside><div className="rolling-summary"><span><small>消費時期が到来</small><b>{summary.rotationDueCount}品</b></span><span><small>30日以内に予定</small><b>{upcomingCount}品</b></span><span><small>計画中</small><b>{summary.rotationQueue.length}品</b></span></div>{summary.rotationQueue.length ? <div className="rolling-list card">{summary.rotationQueue.map((entry) => { const reminderMax = entry.nextLot.expiry >= today && entry.nextLot.expiry < maxReminder ? entry.nextLot.expiry : maxReminder; const expired = entry.status === 'expired'; return <article className={`rolling-row rolling-row-full ${entry.status}`} key={entry.key}><span className="rolling-order">{expired ? '期限切れ' : entry.daysToRotate <= 0 ? '消費時期です' : `${entry.daysToRotate}日後に消費`}</span><span><b>{entry.nextLot.name}</b><small>消費期限 {entry.nextLot.expiry}（期限日は変更できません）</small><label className="rolling-reminder"><span>{expired ? '廃棄記録前の確認日' : '消費予定の再通知日'}</span><input type="date" min={today} max={reminderMax} value={entry.nextLot.rotationReminderDate || ''} onChange={(event) => setReminder(entry, event.target.value)} /></label></span><div className="rolling-actions"><button type="button" onClick={() => rotateOne(entry)}>{expired ? <Trash2 /> : <RefreshCw />}1{entry.nextLot.unit}を{expired ? '廃棄' : '消費'}として記録</button></div></article>; })}</div> : <div className="empty-state"><Check /><h3>期限付きの備蓄はありません</h3><p>備蓄品に期限を登録すると、ここへ期限順に表示します。</p></div>}<article className="card operation-panel rolling-history"><div className="section-heading compact"><div><span className="kicker">HISTORY</span><h2>消費履歴</h2></div><History /></div>{rollingHistory.length ? rollingHistory.map((entry) => <div className="history-row" key={entry.id}><span className={`history-type ${entry.type}`}>{entry.type === 'discard' ? '期限切れ・廃棄' : '期限順消費'}</span><span><b>{entry.name}</b><small>{entry.quantityDelta}{entry.unit}・{entry.reason || ''}・{new Date(entry.at).toLocaleString('ja-JP')}</small></span></div>) : <div className="empty-small">消費を記録すると履歴が残ります</div>}</article></section>;
}

function StockpileCalculationDialog({ summary, items, household, targetDays, onClose, onAction, today }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  return <div className="modal-backdrop calculation-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal calculation-dialog" role="dialog" aria-modal="true" aria-labelledby="calculation-title"><div className="modal-title"><div><span className="kicker">STOCKPILE REFERENCE</span><h2 id="calculation-title">主要備蓄の参考日数と不足</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div><StockpileDaysPanel summary={summary} items={items} household={household} targetDays={targetDays} onAction={onAction} actionLabel="対象を絞り込む" today={today} /></section></div>;
}

function BudgetForecastChart({ projection, budget, duration }) {
  const chart = { width: 480, height: 205, left: 58, right: 20, top: 30, bottom: 38 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const completionMonths = projection.months || 0;
  const horizonMonths = Math.max(12, completionMonths ? Math.ceil(completionMonths / 12) * 12 : 12);
  const totalCost = Math.max(0, projection.totalCost);
  const fundedAt = (month) => totalCost === 0 ? 0 : Math.min(totalCost, budget / 12 * month);
  const pointAt = (month) => ({
    x: chart.left + month / horizonMonths * plotWidth,
    y: chart.top + plotHeight - (totalCost ? fundedAt(month) / totalCost * plotHeight : plotHeight),
  });
  const samples = Array.from({ length: 25 }, (_, index) => horizonMonths * index / 24).map(pointAt);
  const linePath = samples.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${chart.left + plotWidth} ${chart.top + plotHeight} L${chart.left} ${chart.top + plotHeight} Z`;
  const ticks = [0, horizonMonths / 2, horizonMonths];
  const timeLabel = (months) => months === 0 ? '現在' : months < 12 ? `${Math.round(months)}か月` : Number.isInteger(months / 12) ? `${months / 12}年` : `${(months / 12).toFixed(1)}年`;
  const yearFunding = Math.min(totalCost, budget);
  const ariaLabel = !projection.costComplete
    ? '備蓄予算の見通し。単価未登録の商品があるため、必要額と到達時期は未確定です。'
    : totalCost === 0
      ? `備蓄予算の見通し。${projection.targetDays}日分の目標を達成済みです。`
      : `備蓄予算の見通し。必要額${totalCost.toLocaleString()}円、年間予算${budget.toLocaleString()}円、1年後の予算投入${Math.round(yearFunding).toLocaleString()}円、到達目安${duration}。`;
  return <section className="budget-forecast" aria-labelledby="budget-forecast-title">
    <header><div><span className="kicker">LIVE BUDGET FORECAST</span><h3 id="budget-forecast-title">予算を変えると、到達時期がすぐ変わります</h3></div><strong>{duration}</strong></header>
    <div className="budget-chart-wrap">
      <svg className="budget-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={ariaLabel}>
        <defs><linearGradient id="budget-area-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4b84f" stopOpacity=".55" /><stop offset="1" stopColor="#e4b84f" stopOpacity=".08" /></linearGradient></defs>
        <line className="budget-grid-line goal" x1={chart.left} x2={chart.left + plotWidth} y1={chart.top} y2={chart.top} />
        <line className="budget-grid-line" x1={chart.left} x2={chart.left + plotWidth} y1={chart.top + plotHeight / 2} y2={chart.top + plotHeight / 2} />
        <line className="budget-grid-line axis" x1={chart.left} x2={chart.left + plotWidth} y1={chart.top + plotHeight} y2={chart.top + plotHeight} />
        {ticks.map((month) => { const x = chart.left + month / horizonMonths * plotWidth; return <g className="budget-axis-tick" key={month}><line x1={x} x2={x} y1={chart.top + plotHeight} y2={chart.top + plotHeight + 5} /><text x={x} y={chart.height - 9}>{timeLabel(month)}</text></g>; })}
        <text className="budget-y-label goal" x={chart.left - 8} y={chart.top + 4}>{projection.costComplete ? `¥${totalCost.toLocaleString()}` : '未確定'}</text>
        <text className="budget-y-label" x={chart.left - 8} y={chart.top + plotHeight + 4}>¥0</text>
        {projection.costComplete && totalCost > 0 && <><path className="budget-area" d={areaPath} /><path className="budget-line" d={linePath} />{completionMonths > 0 && <g className="budget-completion-point"><circle cx={pointAt(completionMonths).x} cy={pointAt(completionMonths).y} r="6" /><text x={Math.min(pointAt(completionMonths).x, chart.left + plotWidth - 4)} y={pointAt(completionMonths).y - 11}>目標到達</text></g>}</>}
      </svg>
      {!projection.costComplete && <p className="budget-chart-empty"><AlertTriangle />不足商品の内容量・単価を登録するとグラフを表示できます</p>}
      {projection.costComplete && totalCost === 0 && <p className="budget-chart-empty complete"><Check />設定した備蓄日数を達成済みです</p>}
      {projection.costComplete && totalCost > 0 && budget === 0 && <p className="budget-chart-empty"><CalendarDays />年間予算を入力すると到達時期を描画します</p>}
    </div>
    <div className="budget-year-outcomes" aria-label="1年後の主要備蓄見込み">
      {projection.resources.map((resource) => {
        const plan = projection.annualPlan.find((item) => item.key === resource.key);
        const quantityRatio = plan?.recommendation?.quantity ? plan.plannedQuantity / plan.recommendation.quantity : 0;
        const projectedDays = Math.min(projection.targetDays, resource.currentDays + Math.max(0, projection.targetDays - resource.currentDays) * quantityRatio);
        const status = resource.currentDays >= projection.targetDays ? '目標達成済み' : !resource.hasPrice ? '単価登録待ち' : budget === 0 ? '予算入力待ち' : `${formatDays(projectedDays)}日分へ`;
        return <span key={resource.key}><small>1年後・{resource.label}</small><b>{formatDays(resource.currentDays)}日分 <ArrowRight /> {status}</b></span>;
      })}
    </div>
  </section>;
}

function BudgetPlannerDialog({ state, summary, setState, onClose, today }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const [budget, setBudget] = useState(state.preparedness?.annualBudget || 0);
  const projection = useMemo(() => stockpileBudgetProjection(state.inventory, state.household, state.preparedness?.targetDays || 7, budget, today), [state.inventory, state.household, state.preparedness?.targetDays, budget, today]);
  const bagPurchaseItems = useMemo(() => (state.preparedness?.bagPurchasePlan || []).map((entry) => {
    const loadout = getLoadout(entry.taskId);
    const item = loadout?.items.find((candidate) => candidate.id === entry.itemId);
    return item ? { ...entry, item, loadout } : null;
  }).filter(Boolean), [state.preparedness?.bagPurchasePlan]);
  const bagPurchaseKnownCost = bagPurchaseItems.reduce((sum, entry) => sum + Math.max(0, Number(entry.price) || 0), 0);
  const duration = !projection.costComplete ? '不足商品の単価登録後に表示します' : projection.months === null ? '年間予算を入力すると表示します' : projection.months === 0 ? '目標日数を達成済み' : projection.months < 12 ? `約${projection.months}か月` : `約${(projection.months / 12).toFixed(1)}年`;
  const save = () => {
    setState((old) => ({ ...old, preparedness: { ...old.preparedness, annualBudget: budget } }));
    onClose();
  };
  const formatComponents = (components = []) => components.map((component) => `${component.name} ${component.quantity}${component.unit}`).join('＋');
  return <div className="modal-backdrop budget-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="modal budget-dialog" role="dialog" aria-modal="true" aria-labelledby="budget-title">
    <div className="modal-title"><div><span className="kicker">ANNUAL PURCHASE PLAN</span><h2 id="budget-title">予算で、いつ何を揃えるか</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    <div className="budget-planner-top"><label className="annual-budget-input"><span>毎年の備蓄予算（円）<small>入力と同時に、グラフと1年後の見込みを更新します。</small></span><input data-dialog-autofocus type="number" min="0" max="10000000" step="1000" value={budget} onChange={(event) => setBudget(Math.min(10000000, Math.max(0, Number(event.target.value) || 0)))} /></label><BudgetForecastChart projection={projection} budget={budget} duration={duration} /></div>
    <div className="budget-result"><span>備蓄目標<strong>{projection.targetDays}日分</strong></span><span>目標までの概算<strong>{projection.costComplete ? `¥${projection.totalCost.toLocaleString()}` : '単価登録が必要'}</strong></span><span>今年の購入予定<strong>¥{projection.plannedThisYear.toLocaleString()}</strong></span><span>到達目安<strong>{duration}</strong></span></div>
    <section className="annual-purchase-plan" aria-labelledby="purchase-order-title"><header><div><span className="kicker">WHAT TO BUY FIRST</span><h3 id="purchase-order-title">今年、何から買うか</h3></div>{budget > 0 && <span>残り予算 ¥{projection.remainingAnnualBudget.toLocaleString()}</span>}</header>{projection.annualPlan.length ? <ol>{projection.annualPlan.map((item) => {
      const recommendation = item.recommendation;
      const requiredText = recommendation?.components?.length
        ? `目標まで ${formatComponents(recommendation.components)}・概算 ¥${recommendation.estimatedCost.toLocaleString()}`
        : recommendation ? `目標まで ${recommendation.quantity}${recommendation.unit}・単価 ¥${recommendation.unitPrice.toLocaleString()}` : '商品に内容量と単価を登録してください';
      const plannedText = item.plannedComponents?.length ? formatComponents(item.plannedComponents) : `${item.plannedQuantity}${recommendation?.unit || ''}`;
      return <li className={!item.hasPrice ? 'needs-price' : item.plannedQuantity === 0 ? 'deferred' : ''} key={item.key}><span className="purchase-order">{item.order}</span><span><small>{item.label}・現在 {formatDays(item.currentDays)}日分</small><b>{recommendation?.name || `${item.label}の商品`}</b><em>{requiredText}</em></span><strong>{budget === 0 ? '予算入力後に割当' : item.plannedQuantity > 0 ? <><small>今年買う</small><span>{plannedText}</span><em>¥{item.plannedCost.toLocaleString()}</em></> : item.hasPrice ? '翌年以降' : '単価未登録'}</strong></li>;
    })}</ol> : <div className="empty-small"><Check />目標日数分を確保済みです</div>}</section>
    <section className="bag-purchase-plan" aria-labelledby="bag-purchase-plan-title"><header><div><span className="kicker">EVACUATION BAG CANDIDATES</span><h3 id="bag-purchase-plan-title">避難バッグから追加した購入候補</h3></div><strong>{bagPurchaseItems.length}点{bagPurchaseKnownCost > 0 ? `・¥${bagPurchaseKnownCost.toLocaleString()}` : ''}</strong></header>{bagPurchaseItems.length ? <ul>{bagPurchaseItems.map((entry) => <li key={`${entry.taskId}:${entry.itemId}`}><span aria-hidden="true">{entry.item.symbol}</span><span><small>{entry.loadout.title}</small><b>{entry.item.name}</b></span><label><span>想定単価</span><input aria-label={`${entry.item.name}の想定単価`} type="number" min="0" max="1000000" step="100" value={entry.price || 0} onChange={(event) => setState((old) => updateBagPurchaseItem(old, entry.taskId, entry.itemId, { price: event.target.value }))} /><i>円</i></label><button type="button" aria-label={`${entry.item.name}を購入候補から外す`} onClick={() => setState((old) => updateBagPurchaseItem(old, entry.taskId, entry.itemId, { remove: true }))}><X /></button></li>)}</ul> : <div className="empty-small"><ShoppingBasket />理想構成の不足品をタップすると、ここへ追加されます</div>}</section>
    <p className="dialog-note">主要備蓄の参考日数が短い分野を先にし、同じ場合は水・食料・携帯トイレの順で提案します。避難バッグの購入候補は主要備蓄とは分けて表示し、想定単価を入力できます。グラフは主要備蓄の登録済み内容量・単価による概算です。</p><div className="modal-actions"><button type="button" className="primary-button" onClick={save}><Check />この年間予算で保存</button></div>
  </section></div>;
}

function CategoryIcon({ category }) {
  return category === 'water' ? <Droplets /> : category === 'heat' ? <Flame /> : category === 'light' ? <Zap /> : category === 'comfort' ? <Heart /> : category === 'hygiene' ? <Sparkles /> : <ShoppingBasket />;
}

const LIQUID_CATEGORY_GLYPHS = {
  water: { shape: 'M32 5C25 17 14 29 14 40a18 18 0 0 0 36 0C50 29 39 17 32 5Z', details: ['M24 42c2 5 6 7 11 7'] },
  food: { shape: 'M13 16h38l5 40H8l5-40Z', details: ['M17 25h30', 'M26 11h12l4 5H22l4-5Z', 'M27 37c3-5 7-5 10 0-3 5-7 5-10 0Z'] },
  heat: { shape: 'M35 5c2 10-5 14-3 23 3-5 8-8 11-12 7 8 11 16 8 25-3 10-12 17-22 17S10 51 11 40c1-10 8-18 17-27 0 7 2 11 7 14 2-7 3-14 0-22Z', details: ['M33 35c6 7 5 15-1 19-6-3-8-9-5-15 1 4 3 5 6 6 1-4 1-7 0-10Z'] },
  hygiene: { shape: 'M22 9h20v9h4a6 6 0 0 1 6 6v32H12V24a6 6 0 0 1 6-6h4V9Z', details: ['M22 18h20', 'M32 29v17', 'M23.5 37.5h17'] },
  light: { shape: 'M32 5a20 20 0 0 0-12 36c3 2 4 5 4 8h16c0-3 1-6 4-8A20 20 0 0 0 32 5Z', details: ['M24 49h16', 'M26 55h12', 'M32 17v6', 'M19 24l5 3', 'M45 24l-5 3'] },
  comfort: { shape: 'M32 56 10 35C-2 23 5 8 18 8c7 0 12 4 14 9 2-5 7-9 14-9 13 0 20 15 8 27L32 56Z', details: ['M19 19c4-3 8-2 10 1'] },
};

function LiquidCategoryIcon({ category, score, configured }) {
  const fillLevel = configured ? Math.min(100, Math.max(0, Number(score) || 0)) : 0;
  const glyph = LIQUID_CATEGORY_GLYPHS[category] || LIQUID_CATEGORY_GLYPHS.food;
  const fillHeight = Number((fillLevel * 0.53).toFixed(1));
  const fillY = Number((58 - fillHeight).toFixed(1));
  const clipId = `liquid-category-${category}`;
  return <span className={`liquid-category-icon${fillLevel === 0 ? ' empty' : ''}`} data-liquid-fill style={{ '--fill-level': `${fillLevel}%`, '--category': CATEGORY_META[category]?.color }} aria-hidden="true">
    <svg viewBox="0 0 64 64" focusable="false">
      <defs><clipPath id={clipId}><path d={glyph.shape} /></clipPath></defs>
      <path className="liquid-glyph-base" d={glyph.shape} />
      <g clipPath={`url(#${clipId})`}>
        <rect className="liquid-glyph-fill" x="4" y={fillY} width="56" height={fillHeight} />
        {fillLevel > 0 && <ellipse className="liquid-glyph-wave" cx="32" cy={fillY} rx="29" ry="2.5" />}
      </g>
      <path className="liquid-glyph-outline" d={glyph.shape} />
      {glyph.details.map((detail) => <path className="liquid-glyph-detail" d={detail} key={detail} />)}
    </svg>
  </span>;
}

function ConsumptionModal({ item, onClose, onSave }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const [amount, setAmount] = useState(1);
  const expired = Boolean(item.isExpired);
  const [reason, setReason] = useState(expired ? '期限切れ・廃棄' : '日常消費');
  const [note, setNote] = useState('');
  useEffect(() => { if (expired) setReason('期限切れ・廃棄'); }, [expired]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form ref={dialogRef} className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="consumption-title" onSubmit={(event) => { event.preventDefault(); onSave({ amount, reason: expired ? '期限切れ・廃棄' : reason, note }); }}>
    <div className="modal-title"><div><span className="kicker">CONSUMPTION LOG</span><h2 id="consumption-title">{item.name}を記録</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    {expired && <p className="expired-consumption-note"><AlertTriangle />期限切れロットは食べた記録にせず、廃棄として在庫と履歴を更新します。</p>}
    <div className="form-grid"><label><span>数量（最大 {item.quantity}{item.unit}）</span><input data-dialog-autofocus required type="number" min="1" max={item.quantity} value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label><span>理由</span><select disabled={expired} value={reason} onChange={(event) => setReason(event.target.value)}>{!expired && <><option>日常消費</option><option>ローリングストック</option><option>非常時使用</option><option>その他</option></>}<option>期限切れ・廃棄</option></select></label></div>
    <label className="full"><span>備考</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例：朝食で使用、袋が破損" /></label>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button"><Check />{expired ? '廃棄として記録する' : '記録して在庫を減らす'}</button></div>
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
    <details className="simulator compact-disclosure"><summary><span><span className="kicker">STOCKPILE REFERENCE</span><b>災害別の登録備蓄を確認</b><small>{simulation.scenario.name}・{simulation.days}日間は参考充足度 {simulation.score}%</small></span><span className="disclosure-label">条件を変える<ChevronDown /></span></summary><div className="simulator-content"><p className="simulation-disclaimer">地域リスク・建物安全・警報は評価していません。安全可否ではなく、登録済み備蓄の不足を探す参考表示です。</p><div className="simulator-controls"><label><span>想定</span><select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>{DISASTER_SCENARIOS.map((scenario) => <option value={scenario.id} key={scenario.id}>{scenario.name}</option>)}</select></label><label><span>継続日数</span><input type="number" min="1" max="14" value={days} onChange={(event) => setDays(event.target.value)} /></label></div><div className={`simulation-result status-${simulation.statusKey}`}><div><span>登録備蓄の参考充足度</span><b>{simulation.score}<small>%</small></b><em>{simulation.status}</em></div><section><h3>{simulation.scenario.name}・{simulation.days}日間</h3><p>{simulation.scenario.opening}</p><strong>{simulation.advice}</strong><div className="gap-chips">{simulation.criticalGaps.map((gap) => <span key={gap.key}>{CATEGORY_META[gap.key]?.label || gap.key} {gap.reason === 'duration-unmeasured' ? '期間未測定' : `${gap.score}%`}</span>)}</div></section></div></div></details>
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
    const dialog = getDialog();
    const isolatedSiblings = [];
    let branch = dialog;
    while (branch?.parentElement && branch !== document.body) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling === branch) continue;
        isolatedSiblings.push({
          element: sibling,
          inert: sibling.inert,
          hadInert: sibling.hasAttribute('inert'),
          hadAriaHidden: sibling.hasAttribute('aria-hidden'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        });
        sibling.inert = true;
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = parent;
    }
    const frame = window.requestAnimationFrame(() => {
      (dialog?.querySelector('[data-dialog-autofocus]:not([disabled])') || dialog?.querySelector('[autofocus]:not([disabled])') || dialog?.querySelector(selector))?.focus();
    });
    const handleKey = (event) => {
      if (event.key === 'Escape') return onCloseRef.current();
      const dialog = getDialog();
      if (event.key !== 'Tab' || !dialog) return;
      const elements = [...dialog.querySelectorAll(selector)].filter((element) => !element.hidden);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements.at(-1);
      const focusOutside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusOutside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || focusOutside)) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
      for (const record of isolatedSiblings.reverse()) {
        record.element.inert = record.inert;
        if (record.hadInert) record.element.setAttribute('inert', '');
        else record.element.removeAttribute('inert');
        if (record.hadAriaHidden) record.element.setAttribute('aria-hidden', record.ariaHidden);
        else record.element.removeAttribute('aria-hidden');
      }
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
    if (!APP_ENVIRONMENT.appApiEnabled) return undefined;
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

function NotificationPanel({ state, summary, setToast, onClose, onOpenInventory, onOpenItem, onOpenRolling, onReplenish }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const expiry = summary.rows.filter((item) => item.isExpiring || item.isRotationReminderDue).sort((a, b) => (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999));
  const reviews = summary.rows.filter((item) => item.needsVerification).sort((a, b) => (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3) || a.tier - b.tier);
  const shortages = summary.rows.filter((item) => item.shortage > 0 && !item.needsVerification).sort((a, b) => (FIRST_GOAL_CATEGORY_PRIORITY[a.category] ?? 3) - (FIRST_GOAL_CATEGORY_PRIORITY[b.category] ?? 3) || a.tier - b.tier || a.ratio - b.ratio);
  const criticalShortages = shortages.filter((item) => ['water', 'food', 'hygiene'].includes(item.category));
  const otherShortages = shortages.filter((item) => !criticalShortages.includes(item));
  const checks = summary.rows.filter((item) => item.isCheckDue).sort((a, b) => a.daysToCheck - b.daysToCheck);
  const essentialGaps = summary.essentialNotificationGaps || [];
  const reviewBlockedGapKeys = new Set(essentialGaps.filter((gap) => gap.blockedByReview).map((gap) => gap.key));
  const reviewMatchesGap = (item, key) => key === 'water'
    ? item.category === 'water' && item.waterPurpose !== 'utility'
    : key === 'food'
      ? item.category === 'food'
      : key === 'toilet' && Boolean(portableToiletItemKind(item));
  const criticalReviews = reviews.filter((item) => [...reviewBlockedGapKeys].some((key) => reviewMatchesGap(item, key)));
  const otherReviews = reviews.filter((item) => !criticalReviews.includes(item));
  const actionableEssentialGaps = essentialGaps.filter((gap) => !gap.blockedByReview);
  const notifications = new Set([...reviews, ...expiry, ...shortages, ...checks].map((item) => `item:${item.id}`));
  actionableEssentialGaps.forEach((gap) => notifications.add(`essential:${gap.key}`));
  const enableNotifications = async () => {
    if (!('Notification' in window)) return setToast('この端末はシステム通知に対応していません');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const advice = buildCharacterAdvice(state, summary);
      new Notification(`${getCharacter(state.selectedCharacter).name}からのお知らせ`, { body: advice.text, icon: `${import.meta.env.BASE_URL}favicon.svg` });
      setToast('次回からキャラクターがお知らせします');
    } else setToast('通知は許可されませんでした');
  };
  const essentialGroup = actionableEssentialGaps.length ? <section className="notification-group essential-notification-group"><header><div><h3>主要備蓄の補充</h3><small>まず水・食料・携帯トイレを3日分まで</small></div><span>{actionableEssentialGaps.length}</span></header>{actionableEssentialGaps.map((gap) => <div className="notification-row" key={`essential-${gap.key}`}><span className="status-dot red" /><button type="button" className="notification-detail" onClick={onOpenInventory}><span><b>{gap.label}</b><small>3日分まであと{gap.shortage}{gap.unit}（{gap.reference}換算）</small></span><ChevronRight /></button></div>)}</section> : null;
  const group = (title, description, rows, kind) => rows.length ? <section className="notification-group"><header><div><h3>{title}</h3><small>{description}</small></div><span>{rows.length}</span></header>{rows.map((item) => <div className="notification-row" key={`${kind}-${item.id}`}><span className={`status-dot ${kind === 'shortage' ? 'red' : 'amber'}`} /><button type="button" className="notification-detail" onClick={() => kind === 'expiry' ? (item.rotationEnabled === false && !item.isExpired ? onOpenItem(item) : onOpenRolling()) : onOpenItem(item)}><span><b>{item.name}</b><small>{kind === 'review' ? inventoryReviewMessage(item)[0] : kind === 'expiry' ? item.isExpired ? '期限切れです' : item.isRotationReminderDue ? `設定した再通知日です・期限まで${item.daysToExpiry}日` : `期限まで${item.daysToExpiry}日` : kind === 'shortage' ? `${item.shortage}${item.unit}不足しています` : `確認日を${Math.abs(item.daysToCheck)}日超過しています`}</small></span><ChevronRight /></button>{kind === 'shortage' && <button type="button" className="notification-refill" onClick={() => onReplenish(item)}><Plus />{item.shortage}{item.unit}補充</button>}</div>)}</section> : null;
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title"><div className="modal-title"><div><span className="kicker">NOTIFICATIONS</span><h2 id="notification-title">今、対応すること</h2><small className="notification-count">対応 {notifications.size}件</small></div><button type="button" aria-label="通知一覧を閉じる" onClick={onClose}><X /></button></div><div className="notification-overview"><span>命をつなぐ備蓄<b>{essentialGaps.length}</b></span><span>期限対応<b>{expiry.length + reviews.filter((item) => item.verificationReason === 'missing-expiry').length}</b></span><span>登録確認・目標・点検<b>{reviews.length + shortages.length + checks.length}</b></span></div><button type="button" className="notification-enable" onClick={enableNotifications}><Bell />端末の通知を有効にする</button>{notifications.size ? <>{group('主要備蓄を先に確認', '確認後に不足量を再計算します', criticalReviews, 'review')}{essentialGroup}{group('登録内容の確認', '期限・分類・用途を実物と照合', otherReviews, 'review')}{group('期限対応', '1か月以内の期限と再通知日', expiry, 'expiry')}{group('登録目標の補充', '品目ごとに設定した目標との差', [...criticalShortages, ...otherShortages], 'shortage')}{group('点検', '保管場所で状態を確認', checks, 'check')}</> : <div className="empty-small"><Check />今すぐ対応するお知らせはありません</div>}</section></div>;
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

function inventoryItemForm(source = null, { newLot = false, suggestedQuantity, productTarget, initialCategory = '' } = {}) {
  const checkedToday = localDateKey();
  const nextCheck = localDateKey(new Date(Date.now() + 30 * 86400000));
  if (!source) return { ...emptyForm, category: Object.hasOwn(CATEGORY_META, initialCategory) ? initialCategory : emptyForm.category, lastChecked: checkedToday, nextCheck, registrationMode: 'new-lot' };
  const proposedQuantity = Number(suggestedQuantity);
  return {
    ...emptyForm,
    name: source.name,
    category: source.category === 'unclassified' ? '' : source.category,
    tier: source.tier,
    unit: source.unit,
    quantity: newLot && Number.isFinite(proposedQuantity) ? Math.max(0, proposedQuantity) : source.quantity,
    target: Number.isFinite(Number(productTarget)) ? Math.max(0, Number(productTarget)) : source.target,
    price: source.price,
    expiry: newLot ? '' : source.expiry,
    expiryMode: newLot ? 'unknown' : source.expiry ? 'dated' : source.expiryMode === 'no-date-confirmed' ? 'no-date-confirmed' : 'unknown',
    note: source.note || '',
    barcode: source.barcode || '',
    brand: source.brand || '',
    packageSize: source.packageSize || '',
    volumeMl: source.volumeMl || 0,
    waterPurpose: ['utility', 'drinking-cooking'].includes(source.waterPurpose) ? source.waterPurpose : '',
    foodWeightG: source.foodWeightG || 0,
    packingVolumeMl: source.packingVolumeMl || 0,
    imageUrl: source.imageUrl || '',
    source: source.source || '',
    sourceUrl: source.sourceUrl || '',
    location: source.location || '',
    lastChecked: newLot ? checkedToday : source.lastChecked || '',
    nextCheck: newLot ? nextCheck : source.nextCheck || '',
    rotationEnabled: source.rotationEnabled !== false,
    rotationLeadDays: source.rotationLeadDays ?? 30,
    replenishmentPriority: source.replenishmentPriority || 'medium',
    replenishBy: source.replenishBy || '',
    purchaseFrom: source.purchaseFrom || '',
    registrationMode: 'new-lot',
  };
}

function ItemModal({ item, initialItem, initialCategory, suggestedQuantity, inventory, onClose, onSave }) {
  const dialogRef = useRef(null);
  useDialogClose(onClose, dialogRef);
  const sourceProduct = item || initialItem;
  const initialProductTarget = sourceProduct
    ? inventory.filter((entry) => entry.productId === sourceProduct.productId).reduce((sum, entry) => sum + Math.max(0, Number(entry.target) || 0), 0)
    : undefined;
  const [form, setForm] = useState(() => inventoryItemForm(item || initialItem, { newLot: Boolean(initialItem), suggestedQuantity, productTarget: initialProductTarget, initialCategory }));
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(item || initialItem));
  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  const categoryGuidance = itemCategoryGuidance[form.category] || { title: '分類の確認が必要', primary: '正しい分類を選んでください', detail: '分類が確定するまで、防災日数・達成度・購入計画には加算しません。' };
  const safeNumber = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0; };
  const rotationLeadDays = Number(form.rotationLeadDays);
  const targetForScannedProduct = (scannedProductId) => {
    const matchingLots = scannedProductId ? inventory.filter((entry) => entry.productId === scannedProductId) : [];
    return matchingLots.length
      ? matchingLots.reduce((sum, entry) => sum + Math.max(0, Number(entry.target) || 0), 0)
      : initialItem?.productId === scannedProductId ? initialProductTarget : emptyForm.target;
  };
  const identityResetValues = (barcode, target) => ({
    name: '', category: '', waterPurpose: '', unit: emptyForm.unit, tier: emptyForm.tier,
    quantity: emptyForm.quantity, target, price: emptyForm.price, expiry: '', expiryMode: 'unknown', note: '', barcode,
    brand: '', packageSize: '', volumeMl: 0, foodWeightG: 0, packingVolumeMl: 0,
    imageUrl: '', source: '', sourceUrl: '', location: '', lastChecked: localDateKey(),
    nextCheck: localDateKey(new Date(Date.now() + 30 * 86400000)),
    rotationEnabled: emptyForm.rotationEnabled, rotationLeadDays: emptyForm.rotationLeadDays,
    rotationReminderDate: '', replenishmentPriority: emptyForm.replenishmentPriority, replenishBy: '', purchaseFrom: '',
    registrationMode: 'new-lot',
  });
  const applyScannedBarcode = (barcode) => {
    const cleaned = String(barcode || '').replace(/\D/g, '');
    const scannedProductId = cleaned ? `gtin:${cleaned}` : '';
    setForm((old) => {
      const identityChanged = Boolean(cleaned && cleaned !== String(old.barcode || ''));
      return {
        ...old,
        ...(identityChanged ? identityResetValues(cleaned, targetForScannedProduct(scannedProductId)) : {}),
        barcode: cleaned,
        ...(cleaned ? { target: targetForScannedProduct(scannedProductId) } : {}),
      };
    });
  };
  const applyScannedProduct = (product) => {
    const cleaned = String(product.barcode || '').replace(/\D/g, '');
    const scannedProductId = cleaned ? `gtin:${cleaned}` : '';
    const productValues = Object.fromEntries([
      'name', 'category', 'unit', 'tier', 'price', 'brand', 'packageSize', 'volumeMl',
      'foodWeightG', 'packingVolumeMl', 'imageUrl', 'source', 'sourceUrl', 'location',
      'rotationEnabled', 'rotationLeadDays', 'replenishmentPriority', 'replenishBy', 'purchaseFrom',
    ].filter((key) => product[key] !== undefined).map((key) => [key, product[key]]));
    setForm((old) => {
      const identityChanged = Boolean(cleaned && cleaned !== String(old.barcode || ''));
      const target = targetForScannedProduct(scannedProductId);
      const base = identityChanged ? { ...old, ...identityResetValues(cleaned, target) } : old;
      return {
        ...base,
        ...productValues,
        barcode: cleaned,
        target,
        waterPurpose: product.category === 'water' && ['drinking-cooking', 'utility'].includes(product.waterPurpose) ? product.waterPurpose : '',
        registrationMode: 'new-lot',
        note: base.note || [product.brand, product.packageSize].filter(Boolean).join(' / '),
      };
    });
  };
  const needsExpiryConfirmation = form.category === 'food'
    || (form.category === 'water' && form.waterPurpose === 'drinking-cooking');
  const foodWithoutPrintedDate = form.category === 'food' && form.expiryMode === 'no-date-confirmed';
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="item-modal-title" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, tier: Math.min(3, Math.max(1, Math.round(safeNumber(form.tier)) || 1)), quantity: safeNumber(form.quantity), target: safeNumber(form.target), price: safeNumber(form.price), volumeMl: safeNumber(form.volumeMl), foodWeightG: safeNumber(form.foodWeightG), packingVolumeMl: safeNumber(form.packingVolumeMl), rotationLeadDays: Number.isFinite(rotationLeadDays) ? Math.min(365, Math.max(0, rotationLeadDays)) : 30 }); }}>
    <div className="modal-title"><div><span className="kicker">STOCK ITEM</span><h2 id="item-modal-title">{item ? '備蓄品を編集' : initialItem ? '新しい期限ロットを追加' : '備蓄品を追加'}</h2></div><button type="button" aria-label="閉じる" onClick={onClose}><X /></button></div>
    {initialItem && <p className="item-lot-note"><AlertTriangle />期限切れ日や購入時期が異なる品を混ぜず、新しく入手した分として登録します。期限を確認してください。</p>}
    {!item && <button className="optional-section-toggle" type="button" aria-expanded={scannerOpen} onClick={() => setScannerOpen((open) => !open)}><QrCode />バーコードから入力<span>{scannerOpen ? '閉じる' : 'カメラ・画像・番号'}</span><ChevronRight /></button>}
    {scannerOpen && <div className="optional-section"><BarcodeScanner initialProduct={form.barcode && form.name ? form : null} localProducts={inventory} onBarcode={applyScannedBarcode} onProduct={applyScannedProduct} />
    </div>}
    <label className="full"><span>品目名</span><input required data-dialog-autofocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="例：飲料水 500ml" /></label>
    <div className="form-grid basic-category-grid"><label><span>カテゴリ</span><select required value={form.category} onChange={(e) => setForm((old) => { const category = e.target.value; return { ...old, category, waterPurpose: category === 'water' && old.category !== 'water' ? '' : old.waterPurpose, expiryMode: old.expiry ? 'dated' : category === 'food' && old.expiryMode === 'no-date-confirmed' ? 'no-date-confirmed' : 'unknown' }; })}><option value="" disabled>分類を選んでください</option>{Object.entries(CATEGORY_META).map(([key, value]) => <option value={key} key={key}>{value.label}</option>)}</select></label><label><span>重要度</span><select value={form.tier} onChange={(e) => set('tier', e.target.value)}><option value="1">Tier 1・生存必須</option><option value="2">Tier 2・継続生活</option><option value="3">Tier 3・快適性</option></select></label></div>
    <aside className={`item-benchmark item-benchmark-${form.category}`} aria-live="polite"><CategoryIcon category={form.category} /><div><small>{categoryGuidance.title}</small><b>{categoryGuidance.primary}</b><p>{categoryGuidance.detail}</p>{categoryGuidance.evidence && <a href={categoryGuidance.evidence.url} target="_blank" rel="noreferrer">根拠：{categoryGuidance.evidence.label}</a>}</div></aside>
    <div className="form-grid three quick-stock-grid"><label><span>在庫数</span><input required min="0" type="number" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label><label><span>目標数</span><input required min="0" type="number" value={form.target} onChange={(e) => set('target', e.target.value)} /></label><label><span>単位</span><input required value={form.unit} onChange={(e) => set('unit', e.target.value)} /></label></div>
    {form.category === 'food' && <label className="full amount-input"><span>1単位あたりの食料重量（g）</span><input min="0" type="number" value={form.foodWeightG} onChange={(e) => set('foodWeightG', e.target.value)} placeholder="例：アルファ米1食なら100" /><small>在庫数と掛け、1食150g×1日3食で日数を簡易比較します。450gは公的な必要重量ではありません。</small></label>}
    {form.category === 'water' && <div className="form-grid water-purpose-fields"><label><span>水の用途</span><select required value={form.waterPurpose} onChange={(e) => setForm((old) => ({ ...old, waterPurpose: e.target.value, expiryMode: old.expiry ? 'dated' : 'unknown' }))}><option value="" disabled>用途を選んでください</option><option value="drinking-cooking">飲料・調理用（3L換算）</option><option value="utility">生活用水（別枠）</option></select></label><label className="amount-input"><span>1単位あたりの水量（ml）</span><input min="0" type="number" value={form.volumeMl} onChange={(e) => set('volumeMl', e.target.value)} placeholder="例：500mlボトルなら500" /><small>{form.waterPurpose === 'utility' ? 'トイレ・洗濯などの生活用水として別枠表示し、飲料・調理用3Lの日数には加算しません。' : form.waterPurpose === 'drinking-cooking' ? '在庫数と掛け合わせ、飲料・調理用として1人1日3Lの日数を計算します。' : '用途を確認するまで3Lの日数計算には加算しません。'}</small></label></div>}
    {needsExpiryConfirmation && <fieldset className="essential-expiry-confirmation"><legend>{form.category === 'food' ? '食品の期限確認' : '飲料・調理用水の期限確認'}</legend><label><span>{form.category === 'food' ? '期限日' : '期限または交換日'}</span><input required={!foodWithoutPrintedDate} disabled={foodWithoutPrintedDate} type="date" value={foodWithoutPrintedDate ? '' : form.expiry} onChange={(e) => setForm((old) => ({ ...old, expiry: e.target.value, expiryMode: e.target.value ? 'dated' : 'unknown' }))} /></label>{form.category === 'food' && <label className="expiry-no-date-confirmation"><input type="checkbox" checked={foodWithoutPrintedDate} onChange={(e) => setForm((old) => ({ ...old, expiry: e.target.checked ? '' : old.expiry, expiryMode: e.target.checked ? 'no-date-confirmed' : old.expiry ? 'dated' : 'unknown' }))} /><span>実物に期限表示がない食品であることを確認</span></label>}<small>{form.category === 'food' ? '期限表示がある食品は日付を入力します。表示がない食品だけ、実物確認を選択してください。' : '賞味期限、使用期限、または自分で決めた交換日を入力するまで備蓄日数に加算しません。'}</small></fieldset>}
    <button className="optional-section-toggle details-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)}><ClipboardList />詳細設定<span>期限・価格・保管場所など</span><ChevronRight /></button>
    {detailsOpen && <div className="optional-section details-section"><div className="form-grid">{!needsExpiryConfirmation && <label><span>期限{initialItem?.isExpired ? '（確認必須）' : '（任意）'}</span><input required={Boolean(initialItem?.isExpired)} type="date" value={form.expiry} onChange={(e) => setForm((old) => ({ ...old, expiry: e.target.value, expiryMode: e.target.value ? 'dated' : 'unknown' }))} /></label>}<label><span>単価（円）</span><input min="0" type="number" value={form.price} onChange={(e) => set('price', e.target.value)} /></label></div>
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
