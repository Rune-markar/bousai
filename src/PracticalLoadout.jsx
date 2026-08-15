import { useEffect, useMemo, useState } from 'react';
import { Check, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { getLoadout, loadoutStatus, requiredLoadoutItemIds } from './loadouts.js';

export default function PracticalLoadout({ taskId, state, onChange, onComplete, onClose }) {
  const loadout = state && taskId ? getLoadout(taskId) : null;
  const status = loadoutStatus(state, taskId);
  const completed = Boolean(state.preparedness?.completed?.includes(taskId));
  const [selectedId, setSelectedId] = useState(() => loadout?.items[0]?.id || '');

  useEffect(() => setSelectedId(loadout?.items[0]?.id || ''), [taskId, loadout]);
  const selected = useMemo(() => loadout?.items.find((item) => item.id === selectedId) || loadout?.items[0], [loadout, selectedId]);
  if (!loadout) return null;

  const toggle = (itemId) => {
    const next = new Set(status.packed);
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    onChange([...next]);
    setSelectedId(itemId);
  };
  const packRequired = () => onChange(requiredLoadoutItemIds(loadout));
  const reset = () => onChange([]);
  const percent = status.total ? Math.round(status.done / status.total * 100) : 0;

  return <div className="loadout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="loadout-modal" role="dialog" aria-modal="true" aria-labelledby="loadout-title" style={{ '--loadout-accent': loadout.accent }}>
      <header className="loadout-head">
        <div><span>{loadout.label}</span><h2 id="loadout-title">{loadout.title}</h2><p>{loadout.subtitle}</p></div>
        <button type="button" aria-label="装備ケースを閉じる" onClick={onClose}><X /></button>
      </header>

      <div className="loadout-hud">
        <span><i>REQUIRED</i><b>{status.done}<small> / {status.total}</small></b></span>
        <div><i style={{ width: `${percent}%` }} /><small>{percent}% VERIFIED</small></div>
        <span className={status.ready ? 'ready' : ''}><ShieldCheck /><b>{status.ready ? 'READY' : 'CHECKING'}</b></span>
      </div>

      <div className="loadout-workbench">
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
        <button type="button" className="loadout-auto" onClick={packRequired}><PackageCheck />必須品を一括確認</button>
        <button type="button" className="loadout-complete" disabled={!status.ready || completed} onClick={onComplete}><Check />{completed ? '装備確認済み' : status.ready ? '装備確認を完了' : `あと${status.total - status.done}点を確認`}</button>
      </footer>
    </section>
  </div>;
}
