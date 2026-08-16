import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { getLoadout, loadoutStatus } from './loadouts.js';
import { autoPackInventory, bagSettings } from './packing.js';

export default function PracticalLoadout({ taskId, state, onChange, onBagSettings, onComplete, onClose }) {
  const loadout = state && taskId ? getLoadout(taskId) : null;
  const status = loadoutStatus(state, taskId);
  const completed = Boolean(state.preparedness?.completed?.includes(taskId));
  const [selectedId, setSelectedId] = useState(() => loadout?.items[0]?.id || '');
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

  useEffect(() => setSelectedId(loadout?.items[0]?.id || ''), [taskId, loadout]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const handleKey = (event) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), summary, input:not([disabled]), [href]')].filter((element) => element.getClientRects().length);
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
  const selected = useMemo(() => loadout?.items.find((item) => item.id === selectedId) || loadout?.items[0], [loadout, selectedId]);
  if (!loadout) return null;

  const toggle = (itemId) => {
    const next = new Set(status.packed);
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    onChange([...next]);
    setSelectedId(itemId);
  };
  const reset = () => onChange([]);
  const percent = status.total ? Math.round(status.done / status.total * 100) : 0;
  const suggestedSlots = new Set(packing?.matchedSlotIds || []);
  const missingRequired = loadout.items.filter((item) => item.required && !status.packed.has(item.id) && !suggestedSlots.has(item.id));

  return <div className="loadout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="loadout-modal" role="dialog" aria-modal="true" aria-labelledby="loadout-title" style={{ '--loadout-accent': loadout.accent }}>
      <header className="loadout-head">
        <div><span>{loadout.label}</span><h2 id="loadout-title">{loadout.title}</h2><p>{loadout.subtitle}</p></div>
        <button ref={closeRef} type="button" aria-label="装備ケースを閉じる" onClick={onClose}><X /></button>
      </header>

      <div className="loadout-hud">
        <span><i>REQUIRED</i><b>{status.done}<small> / {status.total}</small></b></span>
        <div><i style={{ width: `${percent}%` }} /><small>{percent}% VERIFIED</small></div>
        <span className={status.ready ? 'ready' : ''}><ShieldCheck /><b>{status.ready ? 'READY' : 'CHECKING'}</b></span>
      </div>

      {settings && <details className="inventory-packer">
        <summary className="packer-head"><div><span>AUTO IDENTIFIED・{packing.profile.stageLabel}</span><h3 id="auto-pack-title">保有備蓄からの提案を見る</h3><p>候補の確認用です。収納済みにはなりません。</p></div><b>{packing.items.length}<small>品目を提案</small></b><ChevronRight /></summary>
        <div className="packer-body" aria-labelledby="auto-pack-title"><p className="packing-policy">{packing.profile.timing}。{packing.profile.policy}。</p>
        {taskId === 'bag-secondary' && <p className="packing-reservation-note">一時避難バッグへ先に割り当てた {primaryReservation.items.reduce((sum, item) => sum + item.quantity, 0)} 単位を除外して判定しています。</p>}
        <div className="bag-capacity-control">
          <div className="capacity-mode" aria-label="バッグ容量の設定方法"><button type="button" className={settings.mode === 'standard' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'standard' })}>標準 {settings.preset.capacityL}L</button><button type="button" className={settings.mode === 'custom' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'custom' })}>自分のバッグ</button></div>
          {settings.mode === 'custom' ? <label><span>実容量</span><input type="number" min="1" max="100" step="0.5" value={settings.customCapacityL} onChange={(event) => onBagSettings({ mode: 'custom', customCapacityL: event.target.value })} /><i>L</i></label> : <p><b>{settings.preset.label}</b><span>{settings.preset.source}</span></p>}
          <div className="capacity-meter"><span><i style={{ width: `${Math.min(100, packing.utilization)}%` }} /></span><p><b>{(packing.usedMl / 1000).toFixed(1)}L</b><small> / 実用域 {(packing.usableCapacityMl / 1000).toFixed(1)}L</small></p></div>
        </div>
        <div className="auto-pack-list">
          {packing.items.length ? packing.items.map((entry) => <article key={entry.id}><span className="pack-item-icon">{entry.category === 'water' ? '💧' : entry.category === 'food' ? '🍚' : entry.category === 'hygiene' ? '🧼' : entry.category === 'light' ? '🔋' : '📦'}</span><div><b>{entry.name}</b><small>{entry.quantity}{entry.unit}・{(entry.totalMl / 1000).toFixed(2)}L</small></div><em className={entry.volumeSource === 'user' ? 'measured' : ''}>{entry.reason}・{entry.volumeLabel}</em></article>) : <p className="auto-pack-empty">容量内に選定できる登録済み備蓄がありません。</p>}
        </div>
        <div className="packing-gap"><b>在庫データから確認できない必需品</b>{missingRequired.length ? <div>{missingRequired.map((item) => <span key={item.id}>{item.symbol} {item.name}</span>)}</div> : <p><Check /> 必需品は在庫提案または確認済みです</p>}</div>
        <footer><p>自動判定は候補です。実物をバッグへ入れ、下の一覧で1点ずつ確認してください。残り <b>{(packing.remainingMl / 1000).toFixed(1)}L</b></p><button type="button" onClick={() => checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><PackageCheck />実物確認へ進む</button></footer></div>
      </details>}

      <div className="loadout-workbench" ref={checklistRef} tabIndex="-1">
        <div className="loadout-case" role="list" aria-label={`${loadout.title}の装備品`}>
          {loadout.items.map((item) => {
            const packed = status.packed.has(item.id);
            return <button type="button" role="listitem" key={item.id} className={`loadout-item ${item.size || ''} ${packed ? 'packed' : ''} ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => toggle(item.id)} aria-pressed={packed}>
              <span className="item-symbol" aria-hidden="true">{item.symbol}</span>
              <span className="item-label"><b>{item.name}</b><small>{item.required ? '必須装備' : '追加装備'}</small></span>
              <span className="item-check">{packed && <Check />}</span>
            </button>;
          })}
        </div>

        <aside className="loadout-inspector" aria-live="polite">
          <span className="inspector-label">ITEM INSPECTION</span>
          <div className="inspector-symbol" aria-hidden="true">{selected?.symbol}</div>
          <h3>{selected?.name}</h3>
          <span className={`inspector-state ${status.packed.has(selected?.id) ? 'packed' : ''}`}>{status.packed.has(selected?.id) ? '✓ 確認済み' : '未確認'}</span>
          <p>{selected?.detail}</p>
          <button type="button" onClick={() => toggle(selected.id)}>{status.packed.has(selected?.id) ? 'ケースから外す' : '確認して収納する'}</button>
        </aside>
      </div>

      <footer className="loadout-actions">
        <button type="button" className="loadout-reset" onClick={reset}><RotateCcw />リセット</button>
        <span className="loadout-verification-note">各品を実際に収納してから確認してください</span>
        <button type="button" className="loadout-complete" disabled={!status.ready || completed} onClick={onComplete}><Check />{completed ? '装備確認済み' : status.ready ? '装備確認を完了' : `あと${status.total - status.done}点を確認`}</button>
      </footer>
    </section>
  </div>;
}
