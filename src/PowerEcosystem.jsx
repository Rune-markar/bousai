import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CircleHelp, Minus, Plus, X } from 'lucide-react';
import {
  BATTERY_BENCHMARKS,
  calculatePowerSystem,
  normalizePowerPlan,
  POWER_PRICE_CHECKED_AT,
  SOLAR_BENCHMARKS,
} from './power.js';

const yen = (value) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const energy = (value) => value >= 1000 ? `${(value / 1000).toFixed(2)} kWh` : `${value.toLocaleString('ja-JP')} Wh`;
const tabs = [
  { id: 'devices', label: '機器' },
  { id: 'battery', label: '蓄電池' },
  { id: 'solar', label: '太陽光' },
];

export default function PowerEcosystem({ plan, onChange, onBack, activeTab: controlledActiveTab, onActiveTabChange }) {
  const result = useMemo(() => calculatePowerSystem(plan), [plan]);
  const [localActiveTab, setLocalActiveTab] = useState('devices');
  const activeTab = controlledActiveTab ?? localActiveTab;
  const setActiveTab = (nextTab) => {
    if (controlledActiveTab === undefined) setLocalActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
  };
  const [help, setHelp] = useState(null);
  const headingRef = useRef(null);
  const helpTriggerRef = useRef(null);
  const tabRefs = useRef({});
  const updatePlan = (patch) => onChange(normalizePowerPlan({ ...result.plan, ...patch }));
  const updateDevice = (id, patch) => updatePlan({ devices: { ...result.plan.devices, [id]: { ...result.plan.devices[id], ...patch } } });
  const setQuantity = (row, delta) => updateDevice(row.id, { quantity: Math.min(20, Math.max(0, row.quantity + delta)) });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!help) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeHelp();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [help]);

  const openHelp = (id, event, deviceId = null) => {
    helpTriggerRef.current = event.currentTarget;
    setHelp({ id, deviceId });
  };
  const closeHelp = () => {
    setHelp(null);
    queueMicrotask(() => helpTriggerRef.current?.focus());
  };
  const handleTabKeyDown = (event, id) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === id);
    let nextIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextId = tabs[nextIndex].id;
    setActiveTab(nextId);
    tabRefs.current[nextId]?.focus();
  };

  return <section className="power-page power-ecosystem" aria-labelledby="power-page-title">
    <div className="page-title power-page-title"><div><span className="kicker">POWER PLANNER</span><h1 id="power-page-title" ref={headingRef} tabIndex="-1">停電時の電力設計</h1></div><button type="button" className="secondary-button" onClick={onBack}>ホームへ戻る</button></div>

    <div className="power-settings" aria-label="計算条件">
      <label><span>電気を保ちたい日数</span><select value={result.plan.autonomyDays} onChange={(event) => updatePlan({ autonomyDays: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option value={day} key={day}>{day}日</option>)}</select></label>
      <label><span>1日の有効日照</span><select value={result.plan.sunHours} onChange={(event) => updatePlan({ sunHours: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour}時間</option>)}</select></label>
      <div><span>計算モード</span><div className="power-mode"><button type="button" className={result.plan.mode === 'simple' ? 'active' : ''} aria-pressed={result.plan.mode === 'simple'} onClick={() => updatePlan({ mode: 'simple' })}>簡易</button><button type="button" className={result.plan.mode === 'detail' ? 'active' : ''} aria-pressed={result.plan.mode === 'detail'} onClick={() => updatePlan({ mode: 'detail' })}>詳細</button></div></div>
    </div>

    <div className="power-tabs" role="tablist" aria-label="電力設計の項目">
      {tabs.map((tab) => <button ref={(node) => { tabRefs.current[tab.id] = node; }} key={tab.id} id={`power-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`power-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)}>{tab.label}</button>)}
    </div>

    <div className="power-tab-viewport">
      <section id="power-panel-devices" role="tabpanel" aria-labelledby="power-tab-devices" aria-label="機器" hidden={activeTab !== 'devices'}>
        <div className="power-device-summary" aria-label="選択中の機器の集計"><span>{result.selected.length}種類</span><b>{energy(result.dailyLoadWh)} / 日</b><span>同時最大 {result.peakLoadW} W</span></div>
        <div className="power-device-rail">
          {result.rows.map((row) => <article className={`device-card ${row.quantity ? 'selected' : ''}`} key={row.id}>
            <div className="device-title"><span aria-hidden="true">{row.symbol}</span><div><b>{row.name}</b><small>{row.note}</small></div><HelpButton label={`${row.name}の詳細`} helpId="device-detail" onClick={(event) => openHelp('device-detail', event, row.id)} /></div>
            <div className="device-stepper"><button type="button" aria-label={`${row.name}を減らす`} onClick={() => setQuantity(row, -1)} disabled={!row.quantity}><Minus /></button><b>{row.quantity}<small>台</small></b><button type="button" aria-label={`${row.name}を増やす`} onClick={() => setQuantity(row, 1)}><Plus /></button></div>
          </article>)}
        </div>
        {result.selected.length === 0 && <p className="power-empty">使いたい機器を追加すると必要量を計算します。</p>}
        <p className="power-caution">医療機器は停止リスクを自己判断せず、メーカー・医療者へ確認してください。冷蔵庫などモーター機器は定格より大きい起動電力も確認します。この結果は購入確定ではなく、見積もり前の容量判断です。</p>
      </section>

      <section id="power-panel-battery" role="tabpanel" aria-labelledby="power-tab-battery" aria-label="蓄電池" hidden={activeTab !== 'battery'}>
        <div className="power-summary-cards">
          <div className="guide-answer"><span>必要な表示容量 <HelpButton label="蓄電池容量の補足" helpId="battery-capacity" onClick={(event) => openHelp('battery-capacity', event)} /></span><b>{energy(result.requiredBatteryWh)}</b><small>{result.plan.autonomyDays}日分・損失と予備を含む</small></div>
          <div className="power-summary-card"><span>推奨AC出力 <HelpButton label="蓄電池出力の補足" helpId="battery-output" onClick={(event) => openHelp('battery-output', event)} /></span><b>{result.recommendedOutputW} W以上</b><small>同時使用と起動電力を別途確認</small></div>
          <div className="power-summary-card"><span>蓄電池概算 <HelpButton label="蓄電池価格の補足" helpId="battery-price" onClick={(event) => openHelp('battery-price', event)} /></span><b>{yen(result.batteryEstimateYen)}</b><small>公式価格ベンチマークから概算</small></div>
        </div>
      </section>

      <section id="power-panel-solar" role="tabpanel" aria-labelledby="power-tab-solar" aria-label="太陽光" hidden={activeTab !== 'solar'}>
        <div className="power-summary-cards">
          <div className="guide-answer"><span>必要な定格出力 <HelpButton label="太陽光発電条件の補足" helpId="solar-generation" onClick={(event) => openHelp('solar-generation', event)} /></span><b>{result.requiredSolarW} W</b><small>有効日照{result.plan.sunHours}時間・システム効率75%</small></div>
          <div className="power-summary-card"><span>太陽光パネル概算 <HelpButton label="太陽光価格の補足" helpId="solar-price" onClick={(event) => openHelp('solar-price', event)} /></span><b>{yen(result.solarEstimateYen)}</b><small>市販パネルの定格へ切り上げて比較</small></div>
        </div>
      </section>
    </div>

    <div className="power-results-dock" aria-label="電力設計の計算結果">
      <div><span>必要な蓄電池容量</span><b>{energy(result.requiredBatteryWh)}</b></div>
      <div><span>必要な太陽光パネル出力</span><b>{result.requiredSolarW} W</b></div>
      <div><span>電源とパネルの概算費用</span><b>{yen(result.totalEstimateYen)}</b></div>
    </div>

    {help && <HelpSheet help={help} result={result} updateDevice={updateDevice} onClose={closeHelp} />}
  </section>;
}

function HelpButton({ label, helpId, onClick }) {
  return <button className="power-help-button" type="button" aria-label={label} data-help-id={helpId} onClick={onClick}><CircleHelp aria-hidden="true" /></button>;
}

function HelpSheet({ help, result, updateDevice, onClose }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const row = help.id === 'device-detail' ? result.rows.find((item) => item.id === help.deviceId) : null;
  const titles = {
    'battery-capacity': '必要容量の考え方',
    'battery-output': '必要出力と安全確認',
    'battery-price': '蓄電池の価格比較',
    'solar-generation': '太陽光の発電条件',
    'solar-price': '太陽光パネルの価格比較',
    'device-detail': row ? `${row.name}の使用条件` : '機器の使用条件',
  };

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const trapFocus = (event) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (focusable.length === 1) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="modal-backdrop power-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="power-modal power-help-sheet" role="dialog" aria-modal="true" aria-labelledby="power-help-title" data-help-id={help.id} onKeyDown={trapFocus}>
      <div className="power-modal-head"><h2 id="power-help-title">{titles[help.id]}</h2><button ref={closeRef} type="button" aria-label="補足を閉じる" onClick={onClose}><X /></button></div>
      {help.id === 'battery-capacity' && <div className="power-help-copy"><p><b>変換損失</b> 蓄電池の直流を家庭用ACやUSBへ変える際、熱や回路動作として一部が失われます。本計算はインバーター効率88%を採用しています。</p><p><b>使用可能容量と予備</b> 電池を空まで使わないため使用可能率90%、天候や機器差に備えて20%を残します。表示容量と実際に取り出せる量が同じとは限りません。</p></div>}
      {help.id === 'battery-output' && <div className="power-help-copy"><p>同時最大負荷に25%を加えた {result.recommendedOutputW}W以上を目安にします。冷蔵庫などモーター機器は定格より大きい起動電力も確認してください。</p><p>医療機器は停止リスクを自己判断せず、メーカー・医療者へ確認してください。この結果は購入確定ではなく、見積もり前の容量判断です。</p></div>}
      {help.id === 'battery-price' && <PriceHelp result={result} kind="battery" />}
      {help.id === 'solar-generation' && <div className="power-help-copy"><p>パネル角度、雲、温度、ケーブル、充電回路を含め、システム効率75%で計算します。曇天・日陰・冬季は発電量が大きく下がります。</p><p>現在は有効日照{result.plan.sunHours}時間で、1日分の消費を回復する想定です。設置場所で実際の入力Whを確認してください。</p></div>}
      {help.id === 'solar-price' && <PriceHelp result={result} kind="solar" />}
      {help.id === 'device-detail' && row && <DeviceDetail row={row} detailMode={result.plan.mode === 'detail'} updateDevice={updateDevice} />}
    </section>
  </div>;
}

function DeviceDetail({ row, detailMode, updateDevice }) {
  return <div className="power-help-copy">
    <p>{row.note}</p>
    {detailMode ? <div className="device-detail"><label><span>想定</span><input aria-label={`${row.name}の想定消費電力`} type="number" min="1" max="3000" value={row.expectedWatts} onChange={(event) => updateDevice(row.id, { expectedWatts: Number(event.target.value) })} /><i>W</i></label><label><span>実測</span><input aria-label={`${row.name}の実測消費電力`} type="number" min="0" max="3000" value={row.actualWatts} onChange={(event) => updateDevice(row.id, { actualWatts: Number(event.target.value) })} /><i>W</i></label><label><span>使用</span><input aria-label={`${row.name}の1日使用時間`} type="number" min="0.1" max="24" step="0.5" value={row.hours} onChange={(event) => updateDevice(row.id, { hours: Number(event.target.value) })} /><i>h/日</i></label></div> : <p>詳細計算へ切り替えると、想定W・実測W・1日の使用時間を編集できます。</p>}
    <p>実測Wが0の場合は想定Wを使います。医療機器はメーカー・医療者の指示を、モーター機器は起動電力の実機仕様を優先してください。</p>
  </div>;
}

function PriceHelp({ result, kind }) {
  const battery = kind === 'battery';
  const benchmarks = battery ? BATTERY_BENCHMARKS : SOLAR_BENCHMARKS;
  return <div className="guide-panel">
    <div className="unit-price"><span>会社見積もり用の基本単価</span><b>{battery ? yen(result.batteryYenPer10Wh) : yen(result.solarYenPerW)}<small>{battery ? ' / 10Wh' : ' / W'}</small></b><p>{battery ? `Notionの「10W」は出力では容量比較ができないため、10Whあたりに換算しています。現在の推奨容量なら電源本体は約${yen(result.batteryEstimateYen)}です。` : `現在の推奨出力ならパネルは約${yen(result.solarEstimateYen)}です。端数は市販パネルの定格へ切り上げて比較してください。`}</p></div>
    <div className="vendor-table"><div className="vendor-head"><b>メーカー公式価格の比較</b><span>確認日 {POWER_PRICE_CHECKED_AT.replaceAll('-', '/')}</span></div>{benchmarks.map((item) => <a href={item.sourceUrl} target="_blank" rel="noreferrer" key={`${item.maker}-${item.model}`}><span><b>{item.maker}</b><small>{item.model}</small></span><strong>{battery ? `${item.capacityWh.toLocaleString()}Wh` : `${item.watts}W`}</strong><em>{yen(item.priceYen)}</em><ChevronRight /></a>)}</div>
    <p className="price-note">価格は税込のメーカー公式掲載値を基準にした概算で、セール・在庫・送料・互換ケーブル・工事費により変わります。出力端子、最大入力、起動電力、電池方式、保証も必ず比較してください。</p>
  </div>;
}
