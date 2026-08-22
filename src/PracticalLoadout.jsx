import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { getLoadout, loadoutStatus } from './loadouts.js';
import { autoPackInventory, bagSettings, BAG_VOLUME_EXAMPLES } from './packing.js';

const itemSymbol = (category) => category === 'water' ? '💧' : category === 'food' ? '🍚' : category === 'hygiene' ? '🧼' : category === 'light' ? '🔋' : '📦';

export default function PracticalLoadout({ taskId, state, onChange, onBagSettings, onComplete, onClose }) {
  const loadout = state && taskId ? getLoadout(taskId) : null;
  const status = loadoutStatus(state, taskId);
  const completed = Boolean(state.preparedness?.completed?.includes(taskId));
  const [selectedId, setSelectedId] = useState('');
  const [mobilePanel, setMobilePanel] = useState('suggestion');
  const checklistRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const settings = bagSettings(state, taskId);
  const primarySettings = bagSettings(state, 'bag-primary');
  const primaryReservation = useMemo(() => taskId === 'bag-secondary' && primarySettings
    ? autoPackInventory(state.inventory, 'bag-primary', primarySettings.capacityL, state.household)
    : null, [primarySettings, state.inventory, state.household, taskId]);
  const packing = useMemo(() => settings ? autoPackInventory(state.inventory, taskId, settings.capacityL, state.household, {
    reservedItems: primaryReservation?.items || [],
  }) : null, [settings, state.inventory, state.household, taskId, primaryReservation]);

  useEffect(() => {
    setSelectedId('');
    setMobilePanel('suggestion');
  }, [taskId]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKey = (event) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), [href]')].filter((element) => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
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
  const percent = status.total ? Math.round(status.done / status.total * 100) : 0;
  const suggestedSlots = new Set(packing?.matchedSlotIds || []);
  const missingRequired = loadout.items.filter((item) => item.required && !status.packed.has(item.id) && !suggestedSlots.has(item.id));
  const proposedById = new Map((packing?.items || []).map((item) => [item.id, item]));
  const owned = (state.inventory || []).filter((item) => Number(item.quantity) > 0 && item.category !== 'heat');

  return <div className="loadout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="loadout-modal" role="dialog" aria-modal="true" aria-labelledby="loadout-title" style={{ '--loadout-accent': loadout.accent }}>
      <header className="loadout-head"><div><span>{loadout.label}</span><h2 id="loadout-title">{loadout.title}</h2><p>自動選定を確認し、同じ画面で実際に収納した物をチェックします。</p></div><button ref={closeRef} type="button" aria-label="装備ケースを閉じる" onClick={onClose}><X /></button></header>
      <div className="loadout-hud"><span><i>REQUIRED</i><b>{status.done}<small> / {status.total}</small></b></span><div><i style={{ width: `${percent}%` }} /><small>{percent}% VERIFIED</small></div><span className={status.ready ? 'ready' : ''}><ShieldCheck /><b>{status.ready ? 'READY' : 'CHECKING'}</b></span></div>

      {settings && <div className="bag-planning-tabs" role="tablist" aria-label="バッグ準備の表示">
        <button type="button" role="tab" aria-label="自動選定" aria-selected={mobilePanel === 'suggestion'} aria-controls="bag-suggestion-panel" className={mobilePanel === 'suggestion' ? 'active' : ''} onClick={() => setMobilePanel('suggestion')}><span>1</span>自動選定</button>
        <button type="button" role="tab" aria-label={`現物確認 ${status.done}/${status.total}`} aria-selected={mobilePanel === 'checklist'} aria-controls="bag-checklist-panel" className={mobilePanel === 'checklist' ? 'active' : ''} onClick={() => setMobilePanel('checklist')}><span>2</span>現物確認 <em>{status.done}/{status.total}</em></button>
      </div>}
      <div className={settings ? `bag-planning-layout panel-${mobilePanel}` : ''}>
        {settings && <section id="bag-suggestion-panel" className="inventory-packer" aria-labelledby="auto-pack-title">
          <header className="packer-head"><div><span>AUTO IDENTIFIED・{packing.profile.stageLabel}</span><h3 id="auto-pack-title">1. 保有備蓄から自動選定</h3><p>期限・重要度・容量から、先に入れる物を提案します。</p></div><b>{packing.items.length}<small>品目を選定</small></b></header>
          <p className="packing-policy">{packing.profile.timing}。{packing.profile.policy}。</p>
          {taskId === 'bag-secondary' && <p className="packing-reservation-note">一時避難バッグへ先に割り当てた {primaryReservation.items.reduce((sum, item) => sum + item.quantity, 0)} 単位を除外して判定しています。</p>}
          <div className="bag-capacity-control">
            <div className="capacity-mode" aria-label="バッグ容量の設定方法"><button type="button" className={settings.mode === 'standard' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'standard' })}>標準 {settings.preset.capacityL}L</button><button type="button" className={settings.mode === 'custom' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'custom' })}>自分のバッグ</button></div>
            {settings.mode === 'custom' ? <label><span>実容量</span><input type="number" min="1" max="100" step="0.5" value={settings.customCapacityL} onChange={(event) => onBagSettings({ mode: 'custom', customCapacityL: event.target.value })} /><i>L</i></label> : <p><b>{settings.preset.label}</b><span>{settings.preset.source}</span></p>}
            <div className="capacity-meter"><span><i style={{ width: `${Math.min(100, packing.utilization)}%` }} /></span><p><b>{(packing.usedMl / 1000).toFixed(1)}L</b><small> / 実用域 {(packing.usableCapacityMl / 1000).toFixed(1)}L・{packing.utilization}%</small></p></div>
          </div>
          <div className="packing-result-stack">
            <section className="auto-pack-result"><h4>バッグへ入れる物</h4><div className="auto-pack-list">{packing.items.length ? packing.items.map((entry) => <article key={entry.id}><span className="pack-item-icon">{itemSymbol(entry.category)}</span><div><b>{entry.name}</b><small>{entry.quantity}{entry.unit}・{(entry.totalMl / 1000).toFixed(2)}L</small></div><em className={entry.volumeSource === 'user' ? 'measured' : ''}>{entry.reason}・{entry.volumeLabel}</em></article>) : <p className="auto-pack-empty">容量内に選定できる登録済み備蓄がありません。</p>}</div></section>
            <details className="packing-reference"><summary>現状の備蓄品と容量目安を確認 <span>{owned.length}品</span></summary><div className="packing-reference-body"><section><h4>現状の備蓄品</h4><div className="owned-stock-list">{owned.length ? owned.map((item) => { const proposed = proposedById.get(item.id); return <article key={item.id}><span>{itemSymbol(item.category)}</span><div><b>{item.name}</b><small>在庫 {item.quantity}{item.unit}</small></div>{proposed ? <em>バッグへ {proposed.quantity}{proposed.unit}</em> : <i>在庫のみ</i>}</article>; }) : <p>登録済みの備蓄品がありません。</p>}</div></section><div className="volume-examples" aria-label="容量の比較例">{BAG_VOLUME_EXAMPLES.map((item) => <span key={item.label}>{item.symbol}<b>{item.label}</b><small>約{item.volumeMl}ml</small></span>)}</div></div></details>
          </div>
          <div className="packing-gap"><b>在庫データから確認できない必需品</b>{missingRequired.length ? <div>{missingRequired.map((item) => <span key={item.id}>{item.symbol} {item.name}</span>)}</div> : <p><Check /> 必需品は在庫提案または確認済みです</p>}</div>
        </section>}

        <section id="bag-checklist-panel" className="ideal-loadout-panel" ref={checklistRef} tabIndex="-1">
          <header><div><span>PHYSICAL CHECK</span><h3>2. 実際に入れた物を確認</h3></div>{loadout.referenceBudget && <div className="loadout-budget"><small>参考予算（アプリ内概算）</small><b>{loadout.referenceBudget.range}</b><span>{loadout.referenceBudget.note}</span></div>}</header>
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
