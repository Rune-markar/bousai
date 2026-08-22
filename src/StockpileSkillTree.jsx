import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BatteryCharging, BookOpen, Check, Cookie, Droplets, HeartHandshake, House,
  LockKeyhole, PackageCheck, Pill, RotateCcw, ShieldCheck, Toilet, Utensils, X,
} from 'lucide-react';
import { FOOD_GRAMS_PER_PERSON_DAY, TOILET_USES_PER_PERSON_DAY, WATER_ML_PER_PERSON_DAY } from './domain.js';
import './stockpileSkillTree.css';

export const STOCKPILE_SKILL_LONG_PRESS_MS = 650;

const STOCKPILE_SKILL_STATE_LABELS = Object.freeze({
  locked: '未達成',
  claimable: '確認できます',
  claimed: '確認済み',
  review: '再確認',
});

const VALID_STATES = new Set(Object.keys(STOCKPILE_SKILL_STATE_LABELS));
const MOVE_CANCEL_DISTANCE = 12;
const TREE_DAYS = Object.freeze([1, 3, 7]);

const formatNumber = (value) => {
  const numeric = Math.max(0, Number(value) || 0);
  return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 10) / 10);
};

const formatWeight = (grams) => {
  if (grams < 1000) return `${formatNumber(grams)}g`;
  const kilograms = grams / 1000;
  return `${Number.isInteger(kilograms) ? kilograms : Math.round(kilograms * 100) / 100}kg`;
};

const resourceDefinitions = Object.freeze({
  water: {
    label: '飲料水',
    Icon: Droplets,
    tone: 'water',
    purpose: '飲む・調理する',
    daily: (people) => `${formatNumber((WATER_ML_PER_PERSON_DAY * people) / 1000)}L / 日`,
    formula: (people) => `3L × ${people}人`,
  },
  food: {
    label: '食料（重量換算）',
    Icon: Utensils,
    tone: 'food',
    purpose: '主食・保存食',
    daily: (people) => `${formatWeight(FOOD_GRAMS_PER_PERSON_DAY * people)} / 日`,
    formula: (people) => `450g × ${people}人`,
  },
  toilet: {
    label: '携帯トイレ',
    Icon: Toilet,
    tone: 'toilet',
    purpose: '便袋＋凝固剤',
    daily: (people) => `${TOILET_USES_PER_PERSON_DAY * people}回 / 日`,
    formula: (people) => `5回 × ${people}人`,
  },
});

const normalizeNodes = (nodes) => {
  if (!Array.isArray(nodes)) return [];
  const seen = new Set();
  return nodes.reduce((result, node) => {
    if (!node || node.id == null || seen.has(String(node.id))) return result;
    const id = String(node.id);
    seen.add(id);
    result.push({
      ...node,
      id,
      title: node.title || '名称未設定',
      state: VALID_STATES.has(node.state || node.status) ? node.state || node.status : 'locked',
      detail: node.detail || node.description || '',
      condition: node.condition || '',
      parents: (Array.isArray(node.parents) ? node.parents : Array.isArray(node.parentIds) ? node.parentIds : []).map(String),
    });
    return result;
  }, []);
};

const targetDays = (node) => Math.max(0, Number(node.progress?.target) || Number.parseInt(String(node.tier || ''), 10) || 0);

const buildPresentation = (nodes) => {
  const resources = Object.entries(resourceDefinitions).map(([category, definition]) => {
    const categoryNodes = nodes
      .filter((node) => node.kind === 'resource' && node.category === category)
      .sort((left, right) => targetDays(left) - targetDays(right));
    const current = categoryNodes.reduce((maximum, node) => Math.max(maximum, Number(node.progress?.current) || 0), 0);
    return { category, definition, nodes: categoryNodes, current };
  }).filter((resource) => resource.nodes.length);

  const milestoneByDays = new Map(nodes
    .filter((node) => node.kind === 'milestone')
    .map((node) => [targetDays(node), node]));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const branchNodes = nodes.filter((node) => (
    node.kind === 'diversity' && node.id !== 'diversity-personal'
  ) || (node.kind === 'milestone' && targetDays(node) >= 30));
  const branchDay = (node) => node.parents.reduce((maximum, parentId) => (
    Math.max(maximum, targetDays(nodeMap.get(parentId) || {}))
  ), 0);
  const stages = TREE_DAYS.map((days) => ({
    days,
    milestone: milestoneByDays.get(days) || null,
    resources: resources.map((resource) => ({
      ...resource,
      node: resource.nodes.find((node) => targetDays(node) === days) || null,
    })).filter((resource) => resource.node),
    reachedCount: resources.filter((resource) => resource.current >= days).length,
    resourceCount: resources.length,
  })).filter((stage) => stage.resources.length || stage.milestone);

  const safetyNodes = nodes.filter((node) => node.kind === 'safety');
  const personalNodes = nodes.filter((node) => node.id === 'diversity-personal');
  const expansionNodes = branchNodes
    .map((node) => ({ node, unlockDays: branchDay(node) }))
    .sort((left, right) => left.unlockDays - right.unlockDays);
  const organizedIds = new Set([
    ...resources.flatMap((resource) => resource.nodes.map((node) => node.id)),
    ...stages.map((stage) => stage.milestone?.id).filter(Boolean),
    ...safetyNodes.map((node) => node.id),
    ...personalNodes.map((node) => node.id),
    ...branchNodes.map((node) => node.id),
  ]);

  return {
    resources,
    stages,
    focusGroups: [
      {
        id: 'common',
        eyebrow: '共通',
        title: '安全を先に確認',
        description: '日数を待たない',
        entries: safetyNodes.map((node) => ({ node, unlockDays: 0 })),
      },
      {
        id: 'personal',
        eyebrow: '家族ごと',
        title: '個別用品を整える',
        description: '薬・乳幼児・ペット',
        entries: personalNodes.map((node) => ({ node, unlockDays: 0 })),
      },
      {
        id: 'expansion',
        eyebrow: '達成後に広げる',
        title: '暮らしを充実',
        description: '電源・食・休息',
        entries: expansionNodes,
      },
    ].filter((group) => group.entries.length),
    otherNodes: nodes.filter((node) => !organizedIds.has(node.id)),
  };
};

const stageMeta = (days) => {
  if (days === 1) return {
    eyebrow: '着手点',
    gate: '3項目をそろえて1日分の基礎を確認',
  };
  if (days === 3) return {
    eyebrow: '最低目安',
    gate: '3日分達成で、電源・食の幅を解放',
  };
  return {
    eyebrow: '推奨目安',
    gate: '7日分達成で、長期化・休息の備えを解放',
  };
};

const iconForNode = (node) => {
  if (node.category && resourceDefinitions[node.category]) return resourceDefinitions[node.category].Icon;
  if (node.id === 'diversity-power') return BatteryCharging;
  if (node.id === 'diversity-food') return Cookie;
  if (node.id === 'diversity-calm') return BookOpen;
  if (node.id === 'diversity-personal') return Pill;
  if (node.kind === 'safety') return ShieldCheck;
  if (node.kind === 'milestone') return House;
  if (node.kind === 'diversity') return HeartHandshake;
  return PackageCheck;
};

const iconDetailForNode = (node) => {
  if (node.id === 'diversity-power') return '医療電源・通信・灯り';
  if (node.id === 'diversity-food') return '味・栄養・食欲';
  if (node.id === 'diversity-calm') return '子ども・休息・余暇';
  if (node.id === 'diversity-personal') return '薬・乳幼児・ペット';
  if (node.kind === 'safety') return '住まい・避難・連絡・薬';
  if (node.kind === 'milestone' && targetDays(node) >= 30) return '長期化は量より質';
  return '数量・内容量・期限';
};

const displayTitleForNode = (node) => node.kind === 'milestone' && targetDays(node) >= 30
  ? '長期化に備える'
  : node.title;

function SkillIdentity({ node, detail = null }) {
  const Icon = iconForNode(node);
  return <span className="stockpile-skill-identity" aria-hidden="true">
    <span className="stockpile-skill-identity-icon"><Icon /></span>
    {detail && <small>{detail}</small>}
  </span>;
}

const focusableElements = (root) => Array.from(root?.querySelectorAll(
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
) || []).filter((element) => element.getAttribute('aria-hidden') !== 'true');

export default function StockpileSkillTree({
  nodes = [],
  household = 1,
  onClaim = () => {},
  onClose = () => {},
  title = '備蓄スキルツリー',
  description = '水・食料・携帯トイレの枝を、1日・3日・7日の順に下へ育てます。',
  initialSelectedId = null,
  longPressMs = STOCKPILE_SKILL_LONG_PRESS_MS,
}) {
  const instanceId = useId().replaceAll(':', '');
  const titleId = `stockpile-skill-title-${instanceId}`;
  const descriptionId = `stockpile-skill-description-${instanceId}`;
  const instructionId = `stockpile-skill-instruction-${instanceId}`;
  const panelId = `stockpile-skill-detail-${instanceId}`;
  const conditionId = `stockpile-skill-condition-${instanceId}`;
  const normalizedNodes = useMemo(() => normalizeNodes(nodes), [nodes]);
  const nodeMap = useMemo(() => new Map(normalizedNodes.map((node) => [node.id, node])), [normalizedNodes]);
  const presentation = useMemo(() => buildPresentation(normalizedNodes), [normalizedNodes]);
  const people = Math.max(1, Number.parseInt(household, 10) || 1);
  const [selectedId, setSelectedId] = useState(() => initialSelectedId == null ? null : String(initialSelectedId));
  const [pressingId, setPressingId] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const pressRef = useRef(null);
  const suppressClickRef = useRef(null);
  const selectedTriggerRef = useRef(null);
  const claimRef = useRef(onClaim);
  const closeHandlerRef = useRef(onClose);
  const selectedNode = selectedId ? nodeMap.get(selectedId) || null : null;
  const selectedResource = selectedNode?.kind === 'resource' ? resourceDefinitions[selectedNode.category] : null;
  const numericLongPressMs = Number(longPressMs);
  const holdDuration = Number.isFinite(numericLongPressMs) && numericLongPressMs > 0
    ? numericLongPressMs
    : STOCKPILE_SKILL_LONG_PRESS_MS;

  useEffect(() => { claimRef.current = onClaim; }, [onClaim]);
  useEffect(() => { closeHandlerRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (selectedId && !nodeMap.has(selectedId)) setSelectedId(null);
  }, [nodeMap, selectedId]);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusClose = () => closeRef.current?.focus();
    const frame = typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(focusClose)
      : window.setTimeout(focusClose, 0);

    return () => {
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);

  useEffect(() => () => {
    if (pressRef.current?.timer) window.clearTimeout(pressRef.current.timer);
  }, []);

  const clearPress = (event) => {
    const active = pressRef.current;
    if (!active) return;
    window.clearTimeout(active.timer);
    pressRef.current = null;
    setPressingId(null);
    const target = event?.currentTarget;
    if (target?.hasPointerCapture?.(active.pointerId)) {
      try { target.releasePointerCapture(active.pointerId); } catch { /* Pointer capture may already be gone. */ }
    }
  };

  const beginPress = (event, node) => {
    suppressClickRef.current = null;
    if (!node || node.state !== 'claimable' || event.button !== 0 || event.isPrimary === false) return;
    clearPress();
    const pointerId = event.pointerId;
    const trigger = event.currentTarget;
    try { event.currentTarget.setPointerCapture?.(pointerId); } catch { /* Older browsers still get cancel/up events. */ }
    setPressingId(node.id);
    const timer = window.setTimeout(() => {
      if (pressRef.current?.nodeId !== node.id) return;
      pressRef.current = null;
      suppressClickRef.current = node.id;
      setPressingId(null);
      selectedTriggerRef.current = trigger;
      setSelectedId(node.id);
      claimRef.current(node.id);
    }, holdDuration);
    pressRef.current = {
      nodeId: node.id,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
    };
  };

  const movePress = (event) => {
    const active = pressRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
    if (distance > MOVE_CANCEL_DISTANCE) clearPress(event);
  };

  const selectNode = (event, node) => {
    if (!node) return;
    if (suppressClickRef.current === node.id && event.detail !== 0) {
      suppressClickRef.current = null;
      event.preventDefault();
      return;
    }
    suppressClickRef.current = null;
    selectedTriggerRef.current = event.currentTarget;
    setSelectedId((current) => current === node.id ? null : node.id);
  };

  const closeDetail = () => {
    setSelectedId(null);
    window.requestAnimationFrame(() => selectedTriggerRef.current?.focus());
  };

  const interactionProps = (node) => ({
    onClick: (event) => selectNode(event, node),
    onPointerDown: (event) => beginPress(event, node),
    onPointerMove: movePress,
    onPointerUp: clearPress,
    onPointerCancel: clearPress,
    onLostPointerCapture: clearPress,
    onPointerLeave: clearPress,
    onContextMenu: (event) => node?.state === 'claimable' && event.preventDefault(),
  });

  const handleDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHandlerRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(dialogRef.current);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (focusable.length === 1) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className="stockpile-skill-tree-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeHandlerRef.current()}>
    <section
      ref={dialogRef}
      className="stockpile-skill-tree-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId} ${instructionId}`}
      onKeyDown={handleDialogKeyDown}
    >
      <header className="stockpile-skill-tree-header">
        <div>
          <span>HOUSEHOLD STOCKPILE MAP</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <button ref={closeRef} type="button" aria-label="備蓄スキルツリーを閉じる" onClick={() => closeHandlerRef.current()}><X aria-hidden="true" /></button>
      </header>

      <div className="stockpile-skill-tree-main">
        <section className="stockpile-skill-tree-map" aria-label="わが家の備蓄レベル樹形図">
          <div className="stockpile-skill-tree-guide">
            <p id={instructionId}>カードをタップして条件を確認。達成可能なカードは約{Math.round(holdDuration / 100) / 10}秒の長押しでも確定できます。</p>
            <ul aria-label="カードの状態">
              <li data-state="claimable">確認可</li>
              <li data-state="claimed">確認済</li>
              <li data-state="review">再確認</li>
            </ul>
          </div>

          <div className="stockpile-skill-tree-content" data-no-horizontal-scroll="true">
            {presentation.focusGroups.length ? <section className="stockpile-skill-focus" aria-labelledby={`stockpile-focus-${instanceId}`}>
              <header><div><span>備えの枝</span><h3 id={`stockpile-focus-${instanceId}`}>共通・個別・充実を分ける</h3></div><p>安全と家族固有品は日数を待たず、暮らしの備えは達成ラインから広げます。</p></header>
              <div className="stockpile-skill-focus-grid">
                {presentation.focusGroups.map((group) => <section className="stockpile-skill-focus-group" data-group={group.id} aria-label={`${group.eyebrow}：${group.title}`} key={group.id}>
                  <header><span>{group.eyebrow}</span><b>{group.title}</b><small>{group.description}</small></header>
                  <ul>{group.entries.map(({ node, unlockDays }) => {
                    const selected = selectedId === node.id;
                    return <li key={node.id} data-state={node.state} className={`${pressingId === node.id ? 'is-pressing' : ''} ${selected ? 'is-selected' : ''}`}>
                      <button
                        type="button"
                        className="stockpile-skill-node stockpile-skill-focus-node"
                        data-state={node.state}
                        aria-label={`${displayTitleForNode(node)}、${STOCKPILE_SKILL_STATE_LABELS[node.state]}`}
                        aria-pressed={selected}
                        aria-controls={panelId}
                        aria-describedby={node.state === 'claimable' ? instructionId : undefined}
                        style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                        {...interactionProps(node)}
                      ><SkillIdentity node={node} /><span><b>{displayTitleForNode(node)}</b><small>{unlockDays ? `${unlockDays}日分から解放・${iconDetailForNode(node)}` : iconDetailForNode(node)}</small></span><em>{STOCKPILE_SKILL_STATE_LABELS[node.state]}</em></button>
                    </li>;
                  })}</ul>
                </section>)}
              </div>
            </section> : null}

            {presentation.stages.length ? <section className="stockpile-skill-flow" aria-labelledby={`stockpile-flow-${instanceId}`}>
              <header className="stockpile-skill-flow-heading">
                <div><span>カテゴリを縦に育てる</span><h3 id={`stockpile-flow-${instanceId}`}>3つの列を達成ラインまでそろえる</h3></div>
                <p>{people}人家族の期限切れ・確認待ちを除いた在庫で計算</p>
              </header>
              <div className="stockpile-skill-column-headings" role="group" aria-label="備蓄カテゴリ">
                {presentation.resources.map(({ category, definition }) => {
                  const ResourceIcon = definition.Icon;
                  return <div className="stockpile-skill-column-heading" data-category={category} key={category}>
                    <span className={`stockpile-skill-resource-icon is-${definition.tone}`} aria-hidden="true"><ResourceIcon /></span>
                    <span><b>{definition.label}</b><small>{definition.daily(people)}</small><i>{definition.formula(people)}</i></span>
                  </div>;
                })}
              </div>
              <ol className="stockpile-skill-vertical-tree" aria-label="備蓄を1日から7日へ増やす縦型樹形図">
                {presentation.stages.map((stage) => {
                  const meta = stageMeta(stage.days);
                  return <li className="stockpile-skill-stage" data-days={stage.days} key={stage.days}>
                  <span className="stockpile-skill-stage-lanes" aria-hidden="true"><i /><i /><i /></span>
                  <ul className="stockpile-skill-branch-row" role="group" aria-label={`${stage.days}日分の水・食料・携帯トイレ`}>
                    {stage.resources.map(({ category, definition, current, node }) => {
                      const selected = selectedId === node.id;
                      const ResourceIcon = definition.Icon;
                      return <li key={node.id} data-category={category} data-state={node.state} className={`${pressingId === node.id ? 'is-pressing' : ''} ${selected ? 'is-selected' : ''}`}>
                        <button
                          type="button"
                          className="stockpile-skill-node stockpile-skill-resource-node"
                          data-state={node.state}
                          aria-label={`${definition.label}${stage.days}日分、現在${formatNumber(current)}日分、${STOCKPILE_SKILL_STATE_LABELS[node.state]}`}
                          aria-pressed={selected}
                          aria-controls={panelId}
                          aria-describedby={node.state === 'claimable' ? instructionId : undefined}
                          style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                          {...interactionProps(node)}
                        ><span className={`stockpile-skill-resource-icon is-${definition.tone}`} aria-hidden="true"><ResourceIcon /></span><span><b>{stage.days}日分</b><small>現在 {formatNumber(current)}日分</small><i>{definition.label}</i></span><em>{STOCKPILE_SKILL_STATE_LABELS[node.state]}</em></button>
                      </li>;
                    })}
                  </ul>
                  <div className="stockpile-skill-stage-rail" aria-label={`${stage.days}日分の達成ライン`}><span><small>{meta.eyebrow}</small><b>{stage.days}日分</b><em>{stage.reachedCount} / {stage.resourceCount}</em></span></div>
                  {stage.milestone && <button
                    type="button"
                    className={`stockpile-skill-node stockpile-skill-milestone ${pressingId === stage.milestone.id ? 'is-pressing' : ''} ${selectedId === stage.milestone.id ? 'is-selected' : ''}`}
                    data-state={stage.milestone.state}
                    aria-label={`${displayTitleForNode(stage.milestone)}、${stage.reachedCount}/${stage.resourceCount}項目到達、${STOCKPILE_SKILL_STATE_LABELS[stage.milestone.state]}`}
                    aria-pressed={selectedId === stage.milestone.id}
                    aria-controls={panelId}
                    aria-describedby={stage.milestone.state === 'claimable' ? instructionId : undefined}
                    style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                    {...interactionProps(stage.milestone)}
                  >{stage.milestone.state === 'locked' ? <LockKeyhole aria-hidden="true" /> : <House aria-hidden="true" />}<span><small>{meta.gate}</small><b>{displayTitleForNode(stage.milestone)}</b></span><em>{STOCKPILE_SKILL_STATE_LABELS[stage.milestone.state]}</em></button>}
                </li>;
                })}
              </ol>
            </section> : null}

            {presentation.otherNodes.length ? <section className="stockpile-skill-other"><h3>そのほかの備え</h3><ul>{presentation.otherNodes.map((node) => <li key={node.id}><button type="button" className="stockpile-skill-node" data-state={node.state} aria-label={`${displayTitleForNode(node)}、${STOCKPILE_SKILL_STATE_LABELS[node.state]}`} {...interactionProps(node)}><SkillIdentity node={node} /><span><b>{displayTitleForNode(node)}</b></span><em>{STOCKPILE_SKILL_STATE_LABELS[node.state]}</em></button></li>)}</ul></section> : null}

            {!normalizedNodes.length && <div className="stockpile-skill-tree-empty"><PackageCheck aria-hidden="true" /><p>表示できる備蓄スキルはまだありません。</p></div>}
          </div>
        </section>

        <aside id={panelId} className={`stockpile-skill-tree-detail ${selectedNode ? 'has-selection' : 'is-empty'}`} aria-live="polite" aria-atomic="true">
          {selectedNode ? <>
            <div className="stockpile-skill-tree-detail-scroll">
              <div className="stockpile-skill-tree-detail-heading">
                <SkillIdentity node={selectedNode} detail={selectedResource?.purpose || iconDetailForNode(selectedNode)} />
                <div>
                  <span className="stockpile-skill-tree-state" data-state={selectedNode.state}>{STOCKPILE_SKILL_STATE_LABELS[selectedNode.state]}</span>
                  <h3>{selectedResource?.label || displayTitleForNode(selectedNode)}</h3>
                </div>
                <button type="button" aria-label="カードの詳細を閉じる" onClick={closeDetail}><X aria-hidden="true" /></button>
              </div>
              {selectedNode.detail && <p className="stockpile-skill-tree-detail-copy">{selectedNode.detail}</p>}
              <div className="stockpile-skill-tree-condition">
                <span>現在の到達と確認条件</span>
                <p id={conditionId}>{selectedNode.condition || '条件はまだ設定されていません。'}</p>
              </div>
              {selectedNode.source?.url && <a className="stockpile-skill-tree-source" href={selectedNode.source.url} target="_blank" rel="noreferrer">根拠を確認：{selectedNode.source.label}<span aria-hidden="true">↗</span></a>}
              {selectedNode.state === 'claimable' && <p className="stockpile-skill-tree-claim-note"><Check aria-hidden="true" />条件を確認したら、下のボタンまたはカードの長押しで確定できます。</p>}
              {selectedNode.state === 'claimed' && <p className="stockpile-skill-tree-claimed-note"><Check aria-hidden="true" />この項目は確認済みです。</p>}
              {selectedNode.state === 'locked' && <p className="stockpile-skill-tree-locked-note"><LockKeyhole aria-hidden="true" />表示されたラインまたは登録条件を満たすと確認できます。安全や家族固有の備えは先に進めてください。</p>}
              {selectedNode.state === 'review' && <p className="stockpile-skill-tree-review-note"><RotateCcw aria-hidden="true" />過去に確認済みですが、現在の条件を満たしているか再確認してください。</p>}
            </div>
            <button
              className="stockpile-skill-tree-claim-button"
              type="button"
              disabled={selectedNode.state !== 'claimable'}
              aria-describedby={conditionId}
              onClick={() => claimRef.current(selectedNode.id)}
            ><Check aria-hidden="true" />達成を確定</button>
          </> : <>
            <span className="stockpile-skill-tree-empty-symbol" aria-hidden="true"><HeartHandshake /></span>
            <h3>カードを選択</h3>
            <p>枝のカードを選ぶと、現在量と達成条件をここに表示します。</p>
          </>}
        </aside>
      </div>
    </section>
  </div>;
}
