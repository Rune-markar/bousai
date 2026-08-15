import { useEffect, useMemo, useState } from 'react';
import { Check, PackageCheck, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { getLoadout, loadoutStatus, requiredLoadoutItemIds } from './loadouts.js';
import { autoPackInventory, bagSettings } from './packing.js';

export default function PracticalLoadout({ taskId, state, onChange, onBagSettings, onComplete, onClose }) {
  const loadout = state && taskId ? getLoadout(taskId) : null;
  const status = loadoutStatus(state, taskId);
  const completed = Boolean(state.preparedness?.completed?.includes(taskId));
  const [selectedId, setSelectedId] = useState(() => loadout?.items[0]?.id || '');
  const settings = bagSettings(state, taskId);
  const packing = useMemo(() => settings ? autoPackInventory(state.inventory, taskId, settings.capacityL, state.household) : null, [settings, state.inventory, state.household, taskId]);

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

      {settings && <section className="inventory-packer" aria-labelledby="auto-pack-title">
        <header className="packer-head"><div><span>AUTO PACK</span><h3 id="auto-pack-title">保有備蓄から自動選定</h3><p>優先度・在庫数・容量を照合し、入る数量を提案します。</p></div><b>{packing.items.length}<small>品目を選定</small></b></header>
        <div className="bag-capacity-control">
          <div className="capacity-mode" aria-label="バッグ容量の設定方法"><button type="button" className={settings.mode === 'standard' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'standard' })}>標準 {settings.preset.capacityL}L</button><button type="button" className={settings.mode === 'custom' ? 'active' : ''} onClick={() => onBagSettings({ ...settings, mode: 'custom' })}>自分のバッグ</button></div>
          {settings.mode === 'custom' ? <label><span>実容量</span><input type="number" min="1" max="100" step="0.5" value={settings.customCapacityL} onChange={(event) => onBagSettings({ mode: 'custom', customCapacityL: event.target.value })} /><i>L</i></label> : <p><b>{settings.preset.label}</b><span>{settings.preset.source}</span></p>}
          <div className="capacity-meter"><span><i style={{ width: `${Math.min(100, packing.utilization)}%` }} /></span><p><b>{(packing.usedMl / 1000).toFixed(1)}L</b><small> / 実用域 {(packing.usableCapacityMl / 1000).toFixed(1)}L</small></p></div>
        </div>
        <div className="auto-pack-list">
          {packing.items.length ? packing.items.map((entry) => <article key={entry.id}><span className="pack-item-icon">{entry.category === 'water' ? '💧' : entry.category === 'food' ? '🍚' : entry.category === 'hygiene' ? '🧼' : entry.category === 'light' ? '🔋' : '📦'}</span><div><b>{entry.name}</b><small>{entry.quantity}{entry.unit}・{(entry.totalMl / 1000).toFixed(2)}L</small></div><em className={entry.volumeSource === 'user' ? 'measured' : ''}>{entry.volumeLabel}</em></article>) : <p className="auto-pack-empty">容量内に選定できる登録済み備蓄がありません。</p>}
        </div>
        <footer><p>形状差と未登録の必需品に備え、バッグ容量の85%までを使用します。残り <b>{(packing.remainingMl / 1000).toFixed(1)}L</b></p><button type="button" disabled={!packing.matchedSlotIds.length} onClick={() => onChange([...new Set([...status.packed, ...packing.matchedSlotIds])])}><PackageCheck />該当品をケースへ反映</button></footer>
      </section>}

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
