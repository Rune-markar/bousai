import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, Minus, Plus, Sun, X, Zap } from 'lucide-react';
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
  const [panel, setPanel] = useState(null);
  const updatePlan = (patch) => onChange(normalizePowerPlan({ ...result.plan, ...patch }));
  const updateDevice = (id, patch) => updatePlan({ devices: { ...result.plan.devices, [id]: { ...result.plan.devices[id], ...patch } } });
  const setQuantity = (row, delta) => updateDevice(row.id, { quantity: Math.min(20, Math.max(0, row.quantity + delta)) });

  return <section className="power-page power-ecosystem" aria-labelledby="power-page-title">
    <div className="page-title power-page-title"><div><span className="kicker">POWER PLANNER</span><h1 id="power-page-title">停電時の電力設計</h1></div><button type="button" className="secondary-button" onClick={onBack}>ホームへ戻る</button></div>
    <div className="power-heading">
      <div><span className="kicker">POWER ECOSYSTEM</span><h2 id="power-ecosystem-title">停電時の電力を、一つの流れで設計</h2><p>使いたい機器を選ぶだけで、必要な蓄電池容量・出力・太陽光パネル・概算費用まで逆算します。</p></div>
      <span className="power-status"><Check />自動計算</span>
    </div>

    <div className="power-settings" aria-label="計算条件">
      <label><span>電気を保ちたい日数</span><select value={result.plan.autonomyDays} onChange={(event) => updatePlan({ autonomyDays: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option value={day} key={day}>{day}日</option>)}</select></label>
      <label><span>1日の有効日照</span><select value={result.plan.sunHours} onChange={(event) => updatePlan({ sunHours: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map((hour) => <option value={hour} key={hour}>{hour}時間</option>)}</select></label>
      <div><span>計算モード</span><div className="power-mode"><button className={result.plan.mode === 'simple' ? 'active' : ''} onClick={() => updatePlan({ mode: 'simple' })}>簡易</button><button className={result.plan.mode === 'detail' ? 'active' : ''} onClick={() => updatePlan({ mode: 'detail' })}>詳細</button></div></div>
    </div>

    <div className="energy-flow" aria-label="負荷から発電までの計算結果">
      <button className="energy-zone load-zone" type="button" onClick={() => setPanel('load')}>
        <span className="zone-index">01 / LOAD</span><span className="zone-symbols" aria-hidden="true">{result.selected.slice(0, 5).map((row) => <i key={row.id}>{row.symbol}<small>{row.quantity}</small></i>)}</span>
        <strong>負荷エリア</strong><b>{energy(result.dailyLoadWh)}<small> / 日</small></b><span>{result.selected.length}種類・同時最大 {result.peakLoadW}W</span><em>機器と台数を選ぶ <ChevronRight /></em>
      </button>
      <ArrowRight className="energy-arrow" aria-hidden="true" />
      <button className="energy-zone battery-zone" type="button" onClick={() => setPanel('battery')}>
        <span className="zone-index">02 / STORAGE</span><span className="zone-main-icon"><Zap /></span><strong>蓄電池エリア</strong><b>{energy(result.requiredBatteryWh)}</b><span>推奨出力 {result.recommendedOutputW}W以上</span><em>損失・会社比較を見る <ChevronRight /></em>
      </button>
      <ArrowRight className="energy-arrow" aria-hidden="true" />
      <button className="energy-zone solar-zone" type="button" onClick={() => setPanel('solar')}>
        <span className="zone-index">03 / GENERATION</span><span className="zone-main-icon"><Sun /></span><strong>太陽光パネル</strong><b>{result.requiredSolarW} W</b><span>{result.plan.sunHours}時間の日照で1日分を回復</span><em>発電条件・会社比較を見る <ChevronRight /></em>
      </button>
    </div>

    <div className="power-result-grid">
      <div><span>機器が実際に使う電力</span><b>{energy(result.dailyLoadWh)}</b><small>台数 × 消費W × 時間</small></div>
      <div><span>変換で失う電力</span><b>{energy(result.conversionLossWh)}</b><small>インバーター効率88%の想定</small></div>
      <div><span>保護・予備容量</span><b>{energy(result.protectedMarginWh)}</b><small>放電保護10%＋予備20%</small></div>
      <div className="power-total"><span>電源＋パネル概算</span><b>{yen(result.totalEstimateYen)}</b><small>負荷機器本体・工事費は含みません</small></div>
    </div>

    <details className="power-explanation"><summary><CircleHelp />損失とは何か、計算の内訳を見る</summary><div><p><b>変換損失</b> 蓄電池の直流を家庭用ACやUSBへ変える際、熱や回路動作として一部が失われます。本計算は効率88%を採用し、機器が必要とする量より多く蓄電池から取り出します。</p><p><b>使用可能容量と予備</b> 電池を空まで使わないため使用可能率90%、天候や機器差に備えて20%を残します。表示容量と実際に取り出せる量が同じとは限りません。</p><p><b>太陽光の損失</b> パネル角度、雲、温度、ケーブル、充電回路を含め有効率75%で計算します。曇天・日陰・冬季は発電量が大きく下がります。</p></div></details>
    <p className="power-caution">医療機器は停止リスクを自己判断せず、メーカー・医療者へ確認してください。冷蔵庫などモーター機器は定格より大きい起動電力も確認します。この結果は購入確定ではなく、見積もり前の容量判断です。</p>

    {panel && <div className="modal-backdrop power-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setPanel(null)}>
      <section className="power-modal" role="dialog" aria-modal="true" aria-labelledby="power-modal-title">
        <div className="power-modal-head"><div><span className="kicker">{panel === 'load' ? 'LOAD BUILDER' : panel === 'battery' ? 'STORAGE GUIDE' : 'SOLAR GUIDE'}</span><h2 id="power-modal-title">{panel === 'load' ? '使う機器と台数を選択' : panel === 'battery' ? '蓄電池の容量・出力・費用' : '太陽光パネルの発電容量・費用'}</h2></div><button aria-label="閉じる" onClick={() => setPanel(null)}><X /></button></div>
        {panel === 'load' && <>
          <div className="mode-toggle"><button className={result.plan.mode === 'simple' ? 'active' : ''} onClick={() => updatePlan({ mode: 'simple' })}>簡易計算<small>台数だけ選ぶ</small></button><button className={result.plan.mode === 'detail' ? 'active' : ''} onClick={() => updatePlan({ mode: 'detail' })}>詳細計算<small>想定・実測Wと時間</small></button></div>
          <div className="device-grid">{result.rows.map((row) => <article className={`device-card ${row.quantity ? 'selected' : ''}`} key={row.id}>
            <div className="device-title"><span aria-hidden="true">{row.symbol}</span><div><b>{row.name}</b><small>{row.note}</small></div></div>
            <div className="device-stepper"><button aria-label={`${row.name}を減らす`} onClick={() => setQuantity(row, -1)} disabled={!row.quantity}><Minus /></button><b>{row.quantity}<small>台</small></b><button aria-label={`${row.name}を増やす`} onClick={() => setQuantity(row, 1)}><Plus /></button></div>
            {result.plan.mode === 'detail' && row.quantity > 0 && <div className="device-detail"><label><span>想定</span><input aria-label={`${row.name}の想定消費電力`} type="number" min="1" max="3000" value={row.expectedWatts} onChange={(event) => updateDevice(row.id, { expectedWatts: Number(event.target.value) })} /><i>W</i></label><label><span>実測</span><input aria-label={`${row.name}の実測消費電力`} type="number" min="0" max="3000" value={row.actualWatts} onChange={(event) => updateDevice(row.id, { actualWatts: Number(event.target.value) })} /><i>W</i></label><label><span>使用</span><input aria-label={`${row.name}の1日使用時間`} type="number" min="0.1" max="24" step="0.5" value={row.hours} onChange={(event) => updateDevice(row.id, { hours: Number(event.target.value) })} /><i>h/日</i></label></div>}
          </article>)}</div>
          <div className="modal-running-total"><span>現在の負荷</span><b>{energy(result.dailyLoadWh)} / 日</b><small>詳細計算では実測Wが0の場合、想定Wを使います。</small></div>
        </>}
        {panel === 'battery' && <GuidePanel result={result} kind="battery" />}
        {panel === 'solar' && <GuidePanel result={result} kind="solar" />}
      </section>
    </div>}
  </section>;
}

function GuidePanel({ result, kind }) {
  const battery = kind === 'battery';
  const benchmarks = battery ? BATTERY_BENCHMARKS : SOLAR_BENCHMARKS;
  return <div className="guide-panel">
    <div className="guide-answer"><span>{battery ? '必要な表示容量' : '必要な定格出力'}</span><b>{battery ? energy(result.requiredBatteryWh) : `${result.requiredSolarW} W`}</b><small>{battery ? `AC出力 ${result.recommendedOutputW}W以上も確認` : `有効日照${result.plan.sunHours}時間・システム効率75%`}</small></div>
    {battery && <div className="unit-price"><span>会社見積もり用の基本単価</span><b>{yen(result.batteryYenPer10Wh)}<small> / 10Wh</small></b><p>Notionの「10W」は出力では容量比較ができないため、10Whあたりに換算しています。現在の推奨容量なら電源本体は約{yen(result.batteryEstimateYen)}です。</p></div>}
    {!battery && <div className="unit-price"><span>会社見積もり用の基本単価</span><b>{yen(result.solarYenPerW)}<small> / W</small></b><p>現在の推奨出力ならパネルは約{yen(result.solarEstimateYen)}です。端数は市販パネルの定格へ切り上げて比較してください。</p></div>}
    <div className="vendor-table"><div className="vendor-head"><b>メーカー公式価格の比較</b><span>確認日 {POWER_PRICE_CHECKED_AT.replaceAll('-', '/')}</span></div>{benchmarks.map((item) => <a href={item.sourceUrl} target="_blank" rel="noreferrer" key={`${item.maker}-${item.model}`}><span><b>{item.maker}</b><small>{item.model}</small></span><strong>{battery ? `${item.capacityWh.toLocaleString()}Wh` : `${item.watts}W`}</strong><em>{yen(item.priceYen)}</em><ChevronRight /></a>)}</div>
    <p className="price-note">価格は税込のメーカー公式掲載値を基準にした概算で、セール・在庫・送料・互換ケーブル・工事費により変わります。出力端子、最大入力、起動電力、電池方式、保証も必ず比較してください。</p>
  </div>;
}
