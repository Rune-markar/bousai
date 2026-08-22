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
const VISIBLE_LINE_DAYS = Object.freeze([3, 7]);

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

const pickResourceNode = (nodes) => {
  const visible = nodes
    .filter((node) => VISIBLE_LINE_DAYS.includes(targetDays(node)))
    .sort((left, right) => targetDays(left) - targetDays(right));
  if (!visible.length) return nodes[0] || null;
  return [...visible].reverse().find((node) => node.state === 'review')
    || [...visible].reverse().find((node) => node.state === 'claimable')
    || [...visible].reverse().find((node) => node.state === 'claimed')
    || visible[0];
};

const buildPresentation = (nodes) => {
  const resources = Object.entries(resourceDefinitions).map(([category, definition]) => {
    const categoryNodes = nodes
      .filter((node) => node.kind === 'resource' && node.category === category)
      .sort((left, right) => targetDays(left) - targetDays(right));
    const current = categoryNodes.reduce((maximum, node) => Math.max(maximum, Number(node.progress?.current) || 0), 0);
    return { category, definition, nodes: categoryNodes, current, activeNode: pickResourceNode(categoryNodes) };
  }).filter((resource) => resource.nodes.length);

  const milestoneByDays = new Map(nodes
    .filter((node) => node.kind === 'milestone')
    .map((node) => [targetDays(node), node]));
  const lines = VISIBLE_LINE_DAYS.map((days) => ({
    days,
    node: milestoneByDays.get(days) || null,
    reachedCount: resources.filter((resource) => resource.current >= days).length,
    resourceCount: resources.length,
  })).filter((line) => line.node);

  const safetyNodes = nodes.filter((node) => node.kind === 'safety');
  const familyNodes = nodes.filter((node) => node.id === 'diversity-personal');
  const continuityNodes = nodes.filter((node) => (
    node.kind === 'diversity' && node.id !== 'diversity-personal'
  ) || (node.kind === 'milestone' && targetDays(node) >= 30));
  const organizedIds = new Set([
    ...resources.flatMap((resource) => resource.nodes.map((node) => node.id)),
    ...lines.map((line) => line.node.id),
    ...safetyNodes.map((node) => node.id),
    ...familyNodes.map((node) => node.id),
    ...continuityNodes.map((node) => node.id),
    ...nodes.filter((node) => node.kind === 'milestone' && targetDays(node) < 3).map((node) => node.id),
  ]);
  const otherNodes = nodes.filter((node) => !organizedIds.has(node.id));

  return {
    resources,
    lines,
    groups: [
      {
        id: 'safety',
        eyebrow: '安全は日数と別',
        title: '住まい・連絡・薬',
        description: '量の達成を待たず、先に確認します。',
        nodes: safetyNodes,
      },
      {
        id: 'family',
        eyebrow: '家族ごとに違う',
        title: 'わが家の個別用品',
        description: '常用薬、乳幼児、ペットなどを分けて確認します。',
        nodes: familyNodes,
      },
      {
        id: 'continuity',
        eyebrow: '暮らしを続ける',
        title: '電源・食の幅・休息',
        description: '同じ物の上積みとは分け、使い方と代替手段を整えます。',
        nodes: continuityNodes,
      },
      {
        id: 'other',
        eyebrow: '記録の土台',
        title: '備蓄データ',
        description: '数量・内容量・期限を記録します。',
        nodes: otherNodes,
      },
    ].filter((group) => group.nodes.length),
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
  description = 'わが家の備えを用途で分け、3日・7日の達成ラインへそろえます。',
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
    try { event.currentTarget.setPointerCapture?.(pointerId); } catch { /* Older browsers still get cancel/up events. */ }
    setPressingId(node.id);
    const timer = window.setTimeout(() => {
      if (pressRef.current?.nodeId !== node.id) return;
      pressRef.current = null;
      suppressClickRef.current = node.id;
      setPressingId(null);
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
    setSelectedId(node.id);
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
        <section className="stockpile-skill-tree-map" aria-label="わが家の備蓄達成ライン">
          <div className="stockpile-skill-tree-guide">
            <p id={instructionId}>カードをタップして条件を確認。達成可能なカードは約{Math.round(holdDuration / 100) / 10}秒の長押しでも確定できます。</p>
            <ul aria-label="カードの状態">
              <li data-state="claimable">確認可</li>
              <li data-state="claimed">確認済</li>
              <li data-state="review">再確認</li>
            </ul>
          </div>

          <div className="stockpile-skill-tree-content" data-no-horizontal-scroll="true">
            {presentation.resources.length ? <section className="stockpile-skill-quantity" aria-labelledby={`stockpile-quantity-${instanceId}`}>
              <header className="stockpile-skill-section-heading">
                <div>
                  <span>命をつなぐ量</span>
                  <h3 id={`stockpile-quantity-${instanceId}`}>3つを同じラインまでそろえる</h3>
                </div>
                <p>{people}人家族の期限内在庫で計算</p>
              </header>

              <div className="stockpile-skill-quantity-board">
                <div className="stockpile-skill-resource-chart" aria-label="水・食料・携帯トイレの現在日数">
                  <div className="stockpile-skill-chart-scale" aria-hidden="true">
                    <span>現在量</span>
                    <span className="stockpile-skill-chart-scale-lines">
                      <b style={{ '--line-position': `${(3 / 7) * 100}%` }}>3日</b>
                      <b style={{ '--line-position': '100%' }}>7日</b>
                    </span>
                  </div>
                  <ul className="stockpile-skill-resource-list">
                    {presentation.resources.map((resource) => {
                      const { activeNode, definition } = resource;
                      const currentLabel = formatNumber(resource.current);
                      const selected = selectedId === activeNode?.id;
                      const progress = `${Math.min(100, (resource.current / 7) * 100)}%`;
                      const ResourceIcon = definition.Icon;
                      return <li
                        key={resource.category}
                        className={`stockpile-skill-resource-lane ${pressingId === activeNode?.id ? 'is-pressing' : ''} ${selected ? 'is-selected' : ''}`}
                        data-category={resource.category}
                        data-state={activeNode?.state || 'locked'}
                        data-reached-three={resource.current >= 3 ? 'true' : 'false'}
                        data-reached-seven={resource.current >= 7 ? 'true' : 'false'}
                      >
                        <button
                          type="button"
                          aria-label={`${definition.label}、現在${currentLabel}日分、${STOCKPILE_SKILL_STATE_LABELS[activeNode?.state || 'locked']}`}
                          aria-pressed={selected}
                          aria-controls={panelId}
                          aria-describedby={activeNode?.state === 'claimable' ? instructionId : undefined}
                          style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                          {...interactionProps(activeNode)}
                        >
                          <span className="stockpile-skill-resource-label">
                            <span className={`stockpile-skill-resource-icon is-${definition.tone}`} aria-hidden="true"><ResourceIcon /></span>
                            <span><b>{definition.label}</b><small>{definition.purpose}</small></span>
                          </span>
                          <span className="stockpile-skill-resource-progress">
                            <span className="stockpile-skill-resource-value"><b>{currentLabel}</b>日分 <small>{definition.daily(people)}</small></span>
                            <span className="stockpile-skill-track" style={{ '--resource-progress': progress }} aria-hidden="true">
                              <i className="stockpile-skill-track-fill" />
                              <i className="stockpile-skill-track-line is-three" />
                              <i className="stockpile-skill-track-line is-seven" />
                              <i className="stockpile-skill-track-point" />
                            </span>
                            <small className="stockpile-skill-resource-formula">基準：{definition.formula(people)}</small>
                          </span>
                        </button>
                      </li>;
                    })}
                  </ul>
                </div>

                <aside className="stockpile-skill-line-rail" aria-label="達成ライン一覧">
                  <h4>達成ライン</h4>
                  <ol>
                    {presentation.lines.map((line) => {
                      const selected = selectedId === line.node.id;
                      return <li key={line.days} data-state={line.node.state}>
                        <button
                          type="button"
                          className={`stockpile-skill-line-card ${pressingId === line.node.id ? 'is-pressing' : ''}`}
                          data-state={line.node.state}
                          aria-label={`${line.days}日ライン、${line.reachedCount}/${line.resourceCount}項目到達、${STOCKPILE_SKILL_STATE_LABELS[line.node.state]}`}
                          aria-pressed={selected}
                          aria-controls={panelId}
                          aria-describedby={line.node.state === 'claimable' ? instructionId : undefined}
                          style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                          {...interactionProps(line.node)}
                        >
                          <span>{line.days === 3 ? '最低目安' : '推奨目安'}</span>
                          <b>{line.days}日ライン</b>
                          <small>{line.reachedCount}/{line.resourceCount}項目</small>
                          <i aria-hidden="true">{line.node.state === 'claimed' ? '✓' : line.node.state === 'review' ? '!' : '→'}</i>
                        </button>
                      </li>;
                    })}
                  </ol>
                  <p>3項目が同じ線へ届くと達成</p>
                </aside>
              </div>
            </section> : null}

            {presentation.groups.length ? <section className="stockpile-skill-household" aria-labelledby={`stockpile-household-${instanceId}`}>
              <header className="stockpile-skill-section-heading">
                <div>
                  <span>家庭の事情で分ける</span>
                  <h3 id={`stockpile-household-${instanceId}`}>量とは別に確認するもの</h3>
                </div>
              </header>
              <div className="stockpile-skill-household-groups">
                {presentation.groups.map((group) => <section key={group.id} className="stockpile-skill-household-group" data-group={group.id}>
                  <header><span>{group.eyebrow}</span><h4>{group.title}</h4><p>{group.description}</p></header>
                  <ul>
                    {group.nodes.map((node) => {
                      const selected = selectedId === node.id;
                      return <li key={node.id} data-state={node.state} className={`${pressingId === node.id ? 'is-pressing' : ''} ${selected ? 'is-selected' : ''}`}>
                        <button
                          type="button"
                          aria-label={`${displayTitleForNode(node)}、${STOCKPILE_SKILL_STATE_LABELS[node.state]}`}
                          aria-pressed={selected}
                          aria-controls={panelId}
                          aria-describedby={node.state === 'claimable' ? instructionId : undefined}
                          style={{ '--stockpile-skill-hold-duration': `${holdDuration}ms` }}
                          {...interactionProps(node)}
                        >
                          <SkillIdentity node={node} />
                          <span className="stockpile-skill-household-copy"><b>{displayTitleForNode(node)}</b><small>{iconDetailForNode(node)}</small></span>
                          <span className="stockpile-skill-card-state" data-state={node.state}>{STOCKPILE_SKILL_STATE_LABELS[node.state]}</span>
                        </button>
                      </li>;
                    })}
                  </ul>
                </section>)}
              </div>
            </section> : null}

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
            <p>現在量、達成ライン、家族ごとの確認内容をここに表示します。</p>
          </>}
        </aside>
      </div>
    </section>
  </div>;
}
