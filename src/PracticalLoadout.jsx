import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ListChecks, PackageCheck, RotateCcw, ShieldCheck, ShoppingCart, Sparkles, Warehouse, X } from 'lucide-react';
import { itemStats } from './domain.js';
import { getLoadout, loadoutStatus } from './loadouts.js';
import { autoPackInventory, bagSettings, BAG_VOLUME_EXAMPLES } from './packing.js';

const itemSymbol = (category) => category === 'water' ? '💧' : category === 'food' ? '🍚' : category === 'hygiene' ? '🧼' : category === 'light' ? '🔋' : '📦';
const autoModeLabels = { inventory: '備蓄から自動選定', ideal: '理想構成', custom: '自分で選ぶ' };

export default function PracticalLoadout({ taskId, state, onChange, onBagSettings, onAddPurchase, onComplete, onClose, today }) {
  const loadout = state && taskId ? getLoadout(taskId) : null;
  const status = loadoutStatus(state, taskId);
  const completed = status.ready && Boolean(state.preparedness?.completed?.includes(taskId));
  const [selectedId, setSelectedId] = useState('');
  const [mobilePanel, setMobilePanel] = useState('suggestion');
  const [modePickerOpen, setModePickerOpen] = useState(() => !bagSettings(state, taskId)?.autoMode);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const settings = bagSettings(state, taskId);
  const autoMode = settings?.autoMode || '';
  const customIdealIds = settings?.customIdealIds || [];
  const primarySettings = bagSettings(state, 'bag-primary');
  const primaryReservation = useMemo(() => taskId === 'bag-secondary' && primarySettings?.autoMode === 'inventory'
    ? autoPackInventory(state.inventory, 'bag-primary', primarySettings.capacityL, state.household, { today })
    : null, [primarySettings, state.inventory, state.household, taskId, today]);
  const packing = useMemo(() => settings?.autoMode
    ? autoPackInventory(state.inventory, taskId, settings.capacityL, state.household, {
      reservedItems: primaryReservation?.items || [],
      today,
    })
    : null, [settings, state.inventory, state.household, taskId, primaryReservation, today]);
  const inventoryCoverage = useMemo(() => settings?.autoMode && settings.autoMode !== 'inventory'
    ? autoPackInventory(state.inventory, taskId, 100, state.household, {
      reservedItems: primaryReservation?.items || [],
      today,
    })
    : packing, [settings, state.inventory, state.household, taskId, primaryReservation, packing, today]);

  useEffect(() => {
    setSelectedId('');
    setMobilePanel('suggestion');
    setModePickerOpen(!bagSettings(state, taskId)?.autoMode);
  }, [taskId]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const isolatedSiblings = [];
    let branch = dialogRef.current;
    while (branch?.parentElement && branch !== document.body) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (sibling === branch) continue;
        isolatedSiblings.push({ element: sibling, inert: sibling.inert, hadInert: sibling.hasAttribute('inert'), hadAriaHidden: sibling.hasAttribute('aria-hidden'), ariaHidden: sibling.getAttribute('aria-hidden') });
        sibling.inert = true;
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = parent;
    }
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKey = (event) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [href]')].filter((element) => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      const focusOutside = !dialogRef.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusOutside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || focusOutside)) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      for (const record of isolatedSiblings.reverse()) {
        record.element.inert = record.inert;
        if (record.hadInert) record.element.setAttribute('inert', '');
        else record.element.removeAttribute('inert');
        if (record.hadAriaHidden) record.element.setAttribute('aria-hidden', record.ariaHidden);
        else record.element.removeAttribute('aria-hidden');
      }
      previousFocus?.focus?.();
    };
  }, []);

  const selected = useMemo(() => loadout?.items.find((item) => item.id === selectedId), [loadout, selectedId]);
  if (!loadout) return null;
  const toggle = (itemId) => {
    const next = new Set(status.packed);
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    onChange([...next]);
    setSelectedId(itemId);
  };
  const chooseMode = (autoMode) => {
    onBagSettings({ ...settings, autoMode });
    setModePickerOpen(false);
  };
  const toggleCustomIdeal = (itemId) => {
    const ids = new Set(customIdealIds);
    ids.has(itemId) ? ids.delete(itemId) : ids.add(itemId);
    onBagSettings({ ...settings, autoMode: 'custom', customIdealIds: [...ids] });
  };
  const percent = status.total ? Math.round(status.done / status.total * 100) : 0;
  const suggestedSlots = new Set(packing?.matchedSlotIds || []);
  const coveredInventorySlots = new Set(inventoryCoverage?.matchedSlotIds || []);
  const desiredIdealItems = autoMode === 'ideal'
    ? loadout.items
    : autoMode === 'custom'
      ? loadout.items.filter((item) => customIdealIds.includes(item.id))
      : [];
  const purchaseKeys = new Set((state.preparedness?.bagPurchasePlan || []).map((entry) => `${entry.taskId}:${entry.itemId}`));
  const isIdealAvailable = (item) => coveredInventorySlots.has(item.id) || status.packed.has(item.id);
  const missingRequired = autoMode === 'inventory'
    ? loadout.items.filter((item) => item.required && !status.packed.has(item.id) && !suggestedSlots.has(item.id))
    : [];
  const proposedById = new Map((packing?.items || []).map((item) => [item.id, item]));
  const owned = (state.inventory || []).filter((item) => Number(item.quantity) > 0 && item.category !== 'heat');
  const modeLabel = autoModeLabels[autoMode] || '未設定';

  return <div className="loadout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className={`loadout-modal${settings ? ' bag-loadout-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="loadout-title" style={{ '--loadout-accent': loadout.accent }}>
      <header className="loadout-head"><div><span>{loadout.label}</span><h2 id="loadout-title">{loadout.title}</h2><p>自動モードを選び、同じ画面で実際に収納した物をチェックします。</p></div><button ref={closeRef} type="button" aria-label="装備ケースを閉じる" onClick={onClose}><X /></button></header>
      <div className="loadout-hud"><span><i>REQUIRED</i><b>{status.done}<small> / {status.total}</small></b></span><div><i style={{ width: `${percent}%` }} /><small>{percent}% VERIFIED</small></div><span className={status.ready ? 'ready' : ''}><ShieldCheck /><b>{status.ready ? 'READY' : 'CHECKING'}</b></span></div>

      {settings && <section className="bag-auto-mode" aria-labelledby="bag-auto-mode-title">
        <button type="button" className="bag-auto-mode-toggle" aria-expanded={modePickerOpen} aria-controls="bag-auto-mode-options" onClick={() => setModePickerOpen((open) => !open)}><Sparkles /><span><small id="bag-auto-mode-title">自動モード</small><b>{modeLabel}</b></span><ChevronDown /></button>
        {modePickerOpen && <div id="bag-auto-mode-options" className="bag-auto-mode-options" role="radiogroup" aria-label="自動モードを選択">
          <button type="button" role="radio" aria-checked={autoMode === 'inventory'} className={autoMode === 'inventory' ? 'active' : ''} onClick={() => chooseMode('inventory')}><Warehouse /><span><b>備蓄から自動選定</b><small>期限・重要度・容量から、今ある物だけを配置</small></span></button>
          <button type="button" role="radio" aria-checked={autoMode === 'ideal'} className={autoMode === 'ideal' ? 'active' : ''} onClick={() => chooseMode('ideal')}><ListChecks /><span><b>理想構成</b><small>推奨する全項目を並べ、不足品を確認</small></span></button>
          <button type="button" role="radio" aria-checked={autoMode === 'custom'} className={autoMode === 'custom' ? 'active' : ''} onClick={() => chooseMode('custom')}><Check /><span><b>自分で選ぶ</b><small>推奨項目から、わが家に必要な物だけを選択</small></span></button>
        </div>}
      </section>}

      {settings && <div className="bag-planning-tabs" role="tablist" aria-label="バッグ準備の表示">
        <button type="button" role="tab" aria-label="自動モードの提案" aria-selected={mobilePanel === 'suggestion'} aria-controls="bag-suggestion-panel" className={mobilePanel === 'suggestion' ? 'active' : ''} onClick={() => setMobilePanel('suggestion')}><span>1</span>自動モード</button>
        <button type="button" role="tab" aria-label={`現物確認 ${status.done}/${status.total}`} aria-selected={mobilePanel === 'checklist'} aria-controls="bag-checklist-panel" className={mobilePanel === 'checklist' ? 'active' : ''} onClick={() => setMobilePanel('checklist')}><span>2</span>現物確認 <em>{status.done}/{status.total}</em></button>
      </div>}
      <div className={settings ? `bag-planning-layout panel-${mobilePanel}` : ''}>
        {settings && <section id="bag-suggestion-panel" className="inventory-packer" aria-labelledby="auto-pack-title">
          {!autoMode ? <div className="bag-auto-mode-empty"><Sparkles /><h3 id="auto-pack-title">自動モードを設定してください</h3><p>方式を選ぶまで、バッグの中身は自動で配列しません。</p><button type="button" onClick={() => setModePickerOpen(true)}>3つの方式から選ぶ</button></div> : autoMode === 'inventory' ? <>
            <header className="packer-head"><div><span>AUTO IDENTIFIED・{packing.profile.stageLabel}</span><h3 id="auto-pack-title">保有備蓄から自動選定</h3><p>期限・重要度・容量から、先に入れる物を提案します。</p></div><b>{packing.items.length}<small>品目を選定</small></b></header>
            <p className="packing-policy">{packing.profile.timing}。{packing.profile.policy}。</p>
            {taskId === 'bag-secondary' && primaryReservation && <p className="packing-reservation-note">一時避難バッグへ先に割り当てた {primaryReservation.items.reduce((sum, item) => sum + item.quantity, 0)} 単位を除外して判定しています。</p>}
            <div className="bag-capacity-control">
              <div className="capacity-mode" role="group" aria-label="バッグ容量の設定方法"><button type="button" aria-pressed={settings.mode === 'standard'} className={settings.mode === 'standard' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'standard' })}>標準 {settings.preset.capacityL}L</button><button type="button" aria-pressed={settings.mode === 'custom'} className={settings.mode === 'custom' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'custom' })}>自分のバッグ</button></div>
              {settings.mode === 'custom' ? <label><span>実容量</span><input type="number" min="1" max="100" step="0.5" value={settings.customCapacityL} onChange={(event) => onBagSettings({ ...settings, mode: 'custom', customCapacityL: event.target.value })} /><i>L</i></label> : <p><b>{settings.preset.label}</b><span>{settings.preset.source}</span></p>}
              <div className="capacity-meter"><span><i style={{ width: `${Math.min(100, packing.utilization)}%` }} /></span><p><b>{(packing.usedMl / 1000).toFixed(1)}L</b><small> / 実用域 {(packing.usableCapacityMl / 1000).toFixed(1)}L・{packing.utilization}%</small></p></div>
            </div>
            <div className="packing-result-stack">
              <section className="auto-pack-result"><h4>バッグへ入れる物</h4><div className="auto-pack-list">{packing.items.length ? packing.items.map((entry) => <article key={entry.id}><span className="pack-item-icon">{itemSymbol(entry.category)}</span><div><b>{entry.name}</b><small>{entry.quantity}{entry.unit}・{(entry.totalMl / 1000).toFixed(2)}L</small></div><em className={entry.volumeSource === 'user' ? 'measured' : ''}>{entry.reason}・{entry.volumeLabel}</em></article>) : <p className="auto-pack-empty">容量内に選定できる登録済み備蓄がありません。</p>}</div></section>
              <details className="packing-reference"><summary>現状の備蓄品と容量目安を確認 <span>{owned.length}品</span></summary><div className="packing-reference-body"><section><h4>現状の備蓄品</h4><p>期限切れ・登録内容の確認待ちは、自動選定から除外します。</p><div className="owned-stock-list">{owned.length ? owned.map((item) => { const proposed = proposedById.get(item.id); const stats = itemStats(item, today); const excludedLabel = stats.isExpired ? '期限切れ・選定外' : stats.needsVerification ? '確認待ち・選定外' : ''; return <article key={item.id}><span>{itemSymbol(item.category)}</span><div><b>{item.name}</b><small>在庫 {item.quantity}{item.unit}</small></div>{excludedLabel ? <i>{excludedLabel}</i> : proposed ? <em>バッグへ {proposed.quantity}{proposed.unit}</em> : <i>在庫のみ</i>}</article>; }) : <p>登録済みの備蓄品がありません。</p>}</div></section><div className="volume-examples" aria-label="容量の比較例">{BAG_VOLUME_EXAMPLES.map((item) => <span key={item.label}>{item.symbol}<b>{item.label}</b><small>約{item.volumeMl}ml</small></span>)}</div></div></details>
            </div>
            <div className="packing-gap"><b>在庫データから確認できない必需品</b>{missingRequired.length ? <div>{missingRequired.map((item) => <span key={item.id}>{item.symbol} {item.name}</span>)}</div> : <p><Check /> 必需品は在庫提案または確認済みです</p>}</div>
          </> : <>
            <header className="packer-head"><div><span>{autoMode === 'ideal' ? 'IDEAL BALANCE' : 'MY IDEAL BALANCE'}</span><h3 id="auto-pack-title">{autoMode === 'ideal' ? '理想的な持出品の構成' : 'わが家で選ぶ理想構成'}</h3><p>{autoMode === 'ideal' ? '推奨項目をすべて並べ、現状の備蓄と不足を分けます。' : '必要な項目をタップして、わが家の理想構成を作ります。'}</p></div><b>{desiredIdealItems.length}<small>品目を選択</small></b></header>
            {autoMode === 'custom' && <div className="custom-ideal-picker" role="group" aria-label="理想構成に含める物">{loadout.items.map((item) => { const active = customIdealIds.includes(item.id); return <button type="button" key={item.id} aria-pressed={active} className={active ? 'active' : ''} onClick={() => toggleCustomIdeal(item.id)}><span aria-hidden="true">{item.symbol}</span><b>{item.name}</b><small>{active ? '選択中' : 'タップして選択'}</small></button>; })}</div>}
            {desiredIdealItems.length ? <div className="ideal-balance-list">{desiredIdealItems.map((item) => { const available = isIdealAvailable(item); const added = purchaseKeys.has(`${taskId}:${item.id}`); return <article key={item.id} className={available ? 'available' : 'missing'}><span aria-hidden="true">{item.symbol}</span><span><b>{item.name}</b><small>{available ? '備蓄または実物確認済み' : item.detail}</small></span>{available ? <em><Check />確認済み</em> : <button type="button" disabled={added} onClick={() => onAddPurchase?.(item.id)}><ShoppingCart />{added ? '備蓄計画に追加済み' : '備蓄計画に追加'}</button>}</article>; })}</div> : <div className="bag-auto-mode-empty compact"><ListChecks /><h3>まだ項目を選んでいません</h3><p>上の候補をタップして、必要な物を選んでください。</p></div>}
            <p className="ideal-balance-note">「確認済み」は登録備蓄との名称・分類照合または現物確認の結果です。実際の容量、季節、薬、家族固有の必要品は最終確認してください。</p>
          </>}
        </section>}

        <section id="bag-checklist-panel" className="ideal-loadout-panel" tabIndex="-1">
          <header><div><span>PHYSICAL CHECK</span><h3>実際に入れた物を確認</h3></div>{loadout.referenceBudget && <div className="loadout-budget"><small>参考予算（アプリ内概算）</small><b>{loadout.referenceBudget.range}</b><span>{loadout.referenceBudget.note}</span></div>}</header>
          <div className="loadout-workbench">
            <div className="loadout-case" role="group" aria-label={`${loadout.title}の装備品`}>{loadout.items.map((item) => { const packed = status.packed.has(item.id); return <button type="button" key={item.id} className={`loadout-item ${packed ? 'packed' : ''} ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(selected?.id === item.id ? '' : item.id)} aria-label={`${item.name}の詳細を表示`} aria-expanded={selected?.id === item.id}><span className="item-symbol" aria-hidden="true">{item.symbol}</span><span className="item-check">{packed && <Check />}</span><span className="item-label"><b>{item.name}</b><small>{packed ? '収納確認済み' : item.required ? '必須・未確認' : '参考・未確認'}</small></span></button>; })}</div>
            {selected ? <aside className="loadout-inspector" aria-live="polite"><span className="inspector-label">TAP INSPECTION</span><div className="inspector-symbol" aria-hidden="true">{selected.symbol}</div><h3>{selected.name}</h3><span className={`inspector-state ${status.packed.has(selected.id) ? 'packed' : ''}`}>{status.packed.has(selected.id) ? '✓ 確認済み' : selected.required ? '必須・未確認' : '参考・未確認'}</span><p>{selected.detail}</p>{selected.referenceVolume && <small className="item-volume-reference">容量目安 {selected.referenceVolume}</small>}<button type="button" onClick={() => toggle(selected.id)}>{status.packed.has(selected.id) ? 'バッグから外す' : '実物を確認して収納'}</button></aside> : <aside className="loadout-inspector empty-inspector"><PackageCheck /><h3>アイコンをタップ</h3><p>品名・役割・容量目安をここに表示します。収納確認は詳細を開いて行います。</p></aside>}
          </div>
          {loadout.referenceBudget && <p className="loadout-source-note">構成根拠：<a href="https://www.bousai.go.jp/kyoiku/hokenkyousai/check.html" target="_blank" rel="noreferrer">内閣府 防災の手引き</a>・<a href="https://www.jrc.or.jp/chapter/hokkaido/apeal/2020/0930_002645.html" target="_blank" rel="noreferrer">日本赤十字社 持出品の重さ</a>。価格は販売価格の変動があるため公式平均ではありません。</p>}
        </section>
      </div>

      <footer className="loadout-actions"><button type="button" className="loadout-reset" onClick={() => onChange([])}><RotateCcw />リセット</button><span className="loadout-verification-note">自動提案だけでは完了しません。実物を収納して確認してください</span><button type="button" className="loadout-complete" disabled={!status.ready || completed} onClick={onComplete}><Check />{completed ? '装備確認済み' : status.ready ? '装備確認を完了' : `あと${status.total - status.done}点を確認`}</button></footer>
    </section>
  </div>;
}
