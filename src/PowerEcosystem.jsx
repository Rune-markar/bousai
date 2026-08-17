import { useEffect, useMemo, useRef, useState } from 'react';
import { BatteryCharging, ChevronRight, CircleHelp, Minus, PlugZap, Plus, Sun, X, Zap } from 'lucide-react';
import {
  BATTERY_BENCHMARKS,
  calculatePowerSystem,
  normalizePowerPlan,
  POWER_PRICE_CHECKED_AT,
  SOLAR_BENCHMARKS,
} from './power.js';

const yen = (value) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const energy = (value) => value >= 1000 ? `${(value / 1000).toFixed(2)} kWh` : `${value.toLocaleString('ja-JP')} Wh`;

export default function PowerEcosystem({ plan, onChange, onBack }) {
  const result = useMemo(() => calculatePowerSystem(plan), [plan]);
  const [help, setHelp] = useState(null);
  const headingRef = useRef(null);
  const helpTriggerRef = useRef(null);
  const deviceDetailRefs = useRef({});
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
    if (id === 'device-detail' && help?.id === 'load-devices') {
      setHelp({ id, deviceId, returnTo: 'load-devices' });
      return;
    }
    helpTriggerRef.current = event.currentTarget;
    setHelp({ id, deviceId });
  };
  const closeHelp = () => {
    if (help?.returnTo === 'load-devices') {
      setHelp({ id: 'load-devices', focusDeviceId: help.deviceId });
      return;
    }
    setHelp(null);
    queueMicrotask(() => helpTriggerRef.current?.focus());
  };

  return <section className="power-page power-ecosystem" aria-labelledby="power-page-title">
    <div className="page-title power-page-title"><div><span className="kicker">POWER PLANNER</span><h1 id="power-page-title" ref={headingRef} tabIndex="-1">停電時の電力設計</h1></div><button type="button" className="secondary-button" onClick={onBack}>ホームへ戻る</button></div>

    <div className="power-settings" aria-label="計算条件">
      <div><span className="power-setting-label">電気を保ちたい日数 <HelpButton label="電気備蓄1週間の目安" helpId="power-recovery" onClick={(event) => openHelp('power-recovery', event)} /></span><select aria-label="電気を保ちたい日数" value={result.plan.autonomyDays} onChange={(event) => updatePlan({ autonomyDays: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option value={day} key={day}>{day}日</option>)}</select></div>
      <label><span>1日の有効日照</span><select value={result.plan.sunHours} onChange={(event) => updatePlan({ sunHours: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour}時間</option>)}</select></label>
      <div><span>計算モード</span><div className="power-mode"><button type="button" className={result.plan.mode === 'simple' ? 'active' : ''} aria-pressed={result.plan.mode === 'simple'} onClick={() => updatePlan({ mode: 'simple' })}>簡易</button><button type="button" className={result.plan.mode === 'detail' ? 'active' : ''} aria-pressed={result.plan.mode === 'detail'} onClick={() => updatePlan({ mode: 'detail' })}>詳細</button></div></div>
    </div>

    <div className="power-flow-viewport">
      <section className="power-flow-stage" aria-label="太陽光から蓄電池を経由して負荷へ流れる電力">
        <div className="power-flow-line" aria-hidden="true">
          <svg viewBox="0 0 1000 210" preserveAspectRatio="none">
            <path className="power-wire-base" d="M177 105 H500 H823" />
            <path className="power-wire-pulse pulse-one" d="M177 105 H500" />
            <path className="power-wire-pulse pulse-two" d="M500 105 H823" />
          </svg>
          <span className="power-flow-direction"><Zap />発電した電気を充電して使う</span>
        </div>

        <article className="power-flow-node power-solar-node">
          <div className="power-node-visual"><span><Sun /></span><div><small>つくる</small><h2>太陽光パネル</h2></div></div>
          <div className="power-node-value"><span>必要な定格出力 <HelpButton label="太陽光発電条件の補足" helpId="solar-generation" onClick={(event) => openHelp('solar-generation', event)} /></span><b>{result.requiredSolarW} W</b><small>日照{result.plan.sunHours}時間・効率75%</small></div>
          <button className="power-node-link" type="button" aria-label="太陽光価格の補足" onClick={(event) => openHelp('solar-price', event)}>価格の目安を見る <ChevronRight /></button>
        </article>

        <article className="power-flow-node power-battery-node">
          <div className="power-node-visual"><span><BatteryCharging /></span><div><small>ためる</small><h2>蓄電池</h2></div></div>
          <div className="power-node-value"><span>必要な表示容量 <HelpButton label="蓄電池容量の補足" helpId="battery-capacity" onClick={(event) => openHelp('battery-capacity', event)} /></span><b>{energy(result.requiredBatteryWh)}</b><small>{result.plan.autonomyDays}日分・損失と予備を含む</small></div>
          <div className="power-node-actions"><button type="button" aria-label="蓄電池出力の補足" onClick={(event) => openHelp('battery-output', event)}>出力の確認</button><button type="button" aria-label="蓄電池価格の補足" onClick={(event) => openHelp('battery-price', event)}>価格の目安</button></div>
        </article>

        <article className="power-flow-node power-load-node">
          <button type="button" className="power-load-button" aria-label={`負荷を調整、現在${result.selected.length}種類`} onClick={(event) => openHelp('load-devices', event)}>
            <span className="power-load-icon"><PlugZap /></span><span><small>つかう</small><strong>負荷</strong><em>{result.selected.length}種類</em></span><ChevronRight />
          </button>
          <div className="power-node-value"><span>1日の使用電力量</span><b>{energy(result.dailyLoadWh)}</b><small>同時最大 {result.peakLoadW} W</small></div>
        </article>
      </section>

      <section className="power-breakdown" aria-label="電力計算の内訳">
        <div><span>1日負荷</span><b>{energy(result.dailyLoadWh)}</b></div>
        <div><span>同時最大</span><b>{result.peakLoadW} W</b></div>
        <div className="power-loss"><span>変換損失</span><b>{energy(result.conversionLossWh)} / 日</b></div>
        <div><span>蓄電池入力</span><b>{energy(result.batteryInputWhPerDay)} / 日</b></div>
        <div><span>予備・使用可能域</span><b>{energy(result.protectedMarginWh)}</b></div>
        <div className="power-capacity"><span>必要蓄電池容量</span><b>{energy(result.requiredBatteryWh)}</b></div>
        <div className="power-solar-total"><span>必要太陽光出力</span><b>{result.requiredSolarW} W</b></div>
      </section>

      <p className="power-caution">医療機器は停止リスクを自己判断せず、メーカー・医療者へ確認してください。冷蔵庫などモーター機器は定格より大きい起動電力も確認します。この結果は購入確定ではなく、見積もり前の容量判断です。</p>
    </div>

    <div className="power-results-dock" aria-label="電力設計の計算結果">
      <div><span>必要な蓄電池容量</span><b>{energy(result.requiredBatteryWh)}</b></div>
      <div><span>必要な太陽光パネル出力</span><b>{result.requiredSolarW} W</b></div>
      <div><span>電源とパネルの概算費用</span><b>{yen(result.totalEstimateYen)}</b></div>
    </div>

    {help && <HelpSheet help={help} result={result} updateDevice={updateDevice} setQuantity={setQuantity} onClose={closeHelp} openHelp={openHelp} deviceDetailRefs={deviceDetailRefs} />}
  </section>;
}

function HelpButton({ label, helpId, onClick, buttonRef }) {
  return <button ref={buttonRef} className="power-help-button" type="button" aria-label={label} data-help-id={helpId} onClick={onClick}><CircleHelp aria-hidden="true" /></button>;
}

function HelpSheet({ help, result, updateDevice, setQuantity, onClose, openHelp, deviceDetailRefs }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const row = help.id === 'device-detail' ? result.rows.find((item) => item.id === help.deviceId) : null;
  const titles = {
    'load-devices': '使用する機器を調整',
    'battery-capacity': '必要容量の考え方',
    'battery-output': '必要出力と安全確認',
    'battery-price': '蓄電池の価格比較',
    'solar-generation': '太陽光の発電条件',
    'solar-price': '太陽光パネルの価格比較',
    'power-recovery': '電気は1週間を目安に',
    'device-detail': row ? `${row.name}の使用条件` : '機器の使用条件',
  };
  const isLoad = help.id === 'load-devices';

  useEffect(() => {
    if (help.id === 'load-devices' && help.focusDeviceId) {
      deviceDetailRefs.current[help.focusDeviceId]?.focus();
    } else {
      closeRef.current?.focus();
    }
  }, [deviceDetailRefs, help.focusDeviceId, help.id]);

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
    <section ref={dialogRef} className={`power-modal power-help-sheet ${isLoad ? 'power-load-sheet' : ''}`} role="dialog" aria-modal="true" aria-labelledby="power-help-title" data-help-id={help.id} onKeyDown={trapFocus}>
      <div className="power-modal-head"><div>{isLoad && <span className="kicker">LOAD SETTINGS</span>}<h2 id="power-help-title">{titles[help.id]}</h2></div><button ref={closeRef} type="button" aria-label={isLoad ? '負荷の調整を閉じる' : '補足を閉じる'} onClick={onClose}><X /></button></div>
      {isLoad && <LoadEditor result={result} setQuantity={setQuantity} openHelp={openHelp} deviceDetailRefs={deviceDetailRefs} />}
      {help.id === 'power-recovery' && <div className="power-help-copy benchmark-help-copy"><strong>目標：7日分</strong><p>災害時の電気の復旧は、およそ1週間かかる場合があります。照明・通信・情報収集など、最低限必要な電気関係の備えは7日分を目標にしましょう。</p><small>被害の規模や地域、設備の状況によって復旧期間は変わります。</small></div>}
      {help.id === 'battery-capacity' && <div className="power-help-copy"><p><b>変換損失</b> 蓄電池の直流を家庭用ACやUSBへ変える際、熱や回路動作として一部が失われます。本計算はインバーター効率88%を採用しています。</p><p><b>使用可能容量と予備</b> 電池を空まで使わないため使用可能率90%、天候や機器差に備えて20%を残します。表示容量と実際に取り出せる量が同じとは限りません。</p></div>}
      {help.id === 'battery-output' && <div className="power-help-copy"><p>同時最大負荷に25%を加えた {result.recommendedOutputW}W以上を目安にします。冷蔵庫などモーター機器は定格より大きい起動電力も確認してください。</p><p>医療機器は停止リスクを自己判断せず、メーカー・医療者へ確認してください。この結果は購入確定ではなく、見積もり前の容量判断です。</p></div>}
      {help.id === 'battery-price' && <PriceHelp result={result} kind="battery" />}
      {help.id === 'solar-generation' && <div className="power-help-copy"><p>パネル角度、雲、温度、ケーブル、充電回路を含め、システム効率75%で計算します。曇天・日陰・冬季は発電量が大きく下がります。</p><p>現在は有効日照{result.plan.sunHours}時間で、1日分の消費を回復する想定です。設置場所で実際の入力Whを確認してください。</p></div>}
      {help.id === 'solar-price' && <PriceHelp result={result} kind="solar" />}
      {help.id === 'device-detail' && row && <DeviceDetail row={row} detailMode={result.plan.mode === 'detail'} updateDevice={updateDevice} />}
    </section>
  </div>;
}

function LoadEditor({ result, setQuantity, openHelp, deviceDetailRefs }) {
  return <>
    <div className="power-load-summary"><span>{result.selected.length}種類を選択</span><b>{energy(result.dailyLoadWh)} / 日</b><small>同時最大 {result.peakLoadW} W</small></div>
    <div className="device-grid power-load-grid">
      {result.rows.map((row) => <article className={`device-card ${row.quantity ? 'selected' : ''}`} key={row.id}>
        <div className="device-title"><span aria-hidden="true">{row.symbol}</span><div><b>{row.name}</b><small>{row.note}</small></div><HelpButton buttonRef={(node) => { deviceDetailRefs.current[row.id] = node; }} label={`${row.name}の詳細`} helpId="device-detail" onClick={(event) => openHelp('device-detail', event, row.id)} /></div>
        <div className="device-stepper"><button type="button" aria-label={`${row.name}を減らす`} onClick={() => setQuantity(row, -1)} disabled={!row.quantity}><Minus /></button><b>{row.quantity}<small>台</small></b><button type="button" aria-label={`${row.name}を増やす`} onClick={() => setQuantity(row, 1)}><Plus /></button></div>
      </article>)}
    </div>
  </>;
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
