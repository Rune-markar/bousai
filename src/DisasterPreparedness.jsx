import { useMemo, useState } from 'react';
import { Check, ChevronRight, CloudRain, Flame, House, Mountain, ShieldCheck, Snowflake, Waves } from 'lucide-react';
import { DISASTER_PREPAREDNESS, disasterCompletion, toggleDisasterTask } from './disasterPreparedness.js';

const icons = { house: House, rain: CloudRain, waves: Waves, flame: Flame, mountain: Mountain, snow: Snowflake };

export default function DisasterPreparedness({ state, setState, setToast }) {
  const [selectedId, setSelectedId] = useState('earthquake');
  const selected = DISASTER_PREPAREDNESS.find((item) => item.id === selectedId) || DISASTER_PREPAREDNESS[0];
  const checks = state.preparedness?.disasterChecks || {};
  const progress = useMemo(() => disasterCompletion(checks, selected), [checks, selected]);
  const toggle = (taskId) => {
    const nextChecks = toggleDisasterTask(checks, selected.id, taskId);
    const nextProgress = disasterCompletion(nextChecks, selected);
    setState((old) => ({ ...old, preparedness: { ...old.preparedness, disasterChecks: nextChecks, updatedAt: new Date().toISOString() } }));
    setToast(nextProgress.done === nextProgress.total ? `${selected.name}への事前対策が完了しました` : '確認状況を保存しました');
  };
  const SelectedIcon = icons[selected.icon];

  return <section className="wrap page-section disaster-page">
    <div className="page-title disaster-page-title"><div><span className="kicker">DISASTER ACTIONS</span><h1>災害ごとの個別対策</h1><p>災害の種類を選び、わが家でできている対策を一つずつ確認します。</p></div><div className="disaster-total"><ShieldCheck /><span><b>{DISASTER_PREPAREDNESS.reduce((sum, disaster) => sum + disasterCompletion(checks, disaster).done, 0)}</b><small>全{DISASTER_PREPAREDNESS.reduce((sum, disaster) => sum + disaster.tasks.length, 0)}項目 完了</small></span></div></div>

    <nav className="disaster-selector" aria-label="災害の種類">
      {DISASTER_PREPAREDNESS.map((disaster) => {
        const Icon = icons[disaster.icon];
        const itemProgress = disasterCompletion(checks, disaster);
        return <button type="button" className={`${disaster.theme}${selected.id === disaster.id ? ' active' : ''}`} aria-current={selected.id === disaster.id ? 'true' : undefined} onClick={() => setSelectedId(disaster.id)} key={disaster.id}><span><Icon /></span><b>{disaster.name}</b><small>{itemProgress.done} / {itemProgress.total}</small><i><u style={{ width: `${itemProgress.percent}%` }} /></i></button>;
      })}
    </nav>

    <div className={`disaster-detail ${selected.theme}`}>
      <header><span className="disaster-detail-icon"><SelectedIcon /></span><div><span className="kicker">{selected.name.toUpperCase()}</span><h2>{selected.name}への備え</h2><p>{selected.summary}</p></div><div className="disaster-progress"><b>{progress.percent}<small>%</small></b><span>{progress.done} / {progress.total} 完了</span></div></header>
      <div className="disaster-detail-grid">
        <section className="disaster-checklist" aria-labelledby="disaster-checklist-title"><div className="disaster-section-heading"><div><span>BEFORE</span><h3 id="disaster-checklist-title">起きる前に確認すること</h3></div><b>{progress.done === progress.total ? '準備完了' : `残り${progress.total - progress.done}項目`}</b></div>{selected.tasks.map((task) => {
          const done = progress.completed.has(task.id);
          return <button type="button" className={done ? 'done' : ''} aria-pressed={done} onClick={() => toggle(task.id)} key={task.id}><span className="disaster-checkbox">{done && <Check />}</span><span><b>{task.title}</b><small>{task.detail}</small></span></button>;
        })}</section>
        <aside className="disaster-immediate"><div><span>WHEN IT HAPPENS</span><h3>発生したときの初動</h3></div><ol>{selected.immediate.map((action, index) => <li key={action}><span>{index + 1}</span><p>{action}</p></li>)}</ol><p className="disaster-caution"><ShieldCheck />自分と家族の命を守る行動を最優先にしてください。状況に応じて自治体・気象庁・消防などの最新情報を確認します。</p></aside>
      </div>
    </div>
    <p className="disaster-next-hint">ほかの災害も選んで確認できます <ChevronRight /></p>
  </section>;
}
