import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, LockKeyhole, RotateCcw, X } from 'lucide-react';
import './stockpileSkillTree.css';

export const STOCKPILE_SKILL_LONG_PRESS_MS = 650;

const STOCKPILE_SKILL_STATE_LABELS = Object.freeze({
  locked: '未開放',
  claimable: '達成可能',
  claimed: '達成済み',
  review: '再確認',
});

const VALID_STATES = new Set(Object.keys(STOCKPILE_SKILL_STATE_LABELS));
const LEVEL_GAP = 164;
const TREE_TOP = 78;
const MOVE_CANCEL_DISTANCE = 12;

const fallbackSymbol = (node) => {
  const categorySymbols = {
    water: '💧',
    food: '🍚',
    toilet: '🚽',
    hygiene: '🧻',
    light: '🔋',
    comfort: '🧸',
  };
  if (categorySymbols[node.category]) return categorySymbols[node.category];
  if (node.kind === 'safety') return '🛡️';
  if (node.kind === 'milestone') return '🏠';
  if (node.kind === 'diversity') return '✦';
  return '・';
};

const progressCondition = (progress) => {
  if (!progress || typeof progress !== 'object') return '';
  const current = Number.isFinite(Number(progress.current)) ? Number(progress.current) : 0;
  const target = Number.isFinite(Number(progress.target)) ? Number(progress.target) : 0;
  const unit = progress.unit || '';
  return `現在 ${current}${unit} ／ 目標 ${target}${unit}`;
};

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
      symbol: node.symbol || fallbackSymbol(node),
      state: VALID_STATES.has(node.state || node.status) ? node.state || node.status : 'locked',
      detail: node.detail || node.description || '',
      condition: node.condition || progressCondition(node.progress),
      parents: (Array.isArray(node.parents) ? node.parents : Array.isArray(node.parentIds) ? node.parentIds : []).map(String),
    });
    return result;
  }, []);
};

const buildTreeLayout = (nodes) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const sourceOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const depthCache = new Map();

  const findDepth = (id, trail = new Set()) => {
    if (depthCache.has(id)) return depthCache.get(id);
    if (trail.has(id)) return 0;
    const node = nodeMap.get(id);
    if (!node) return 0;
    const nextTrail = new Set(trail).add(id);
    const parentDepths = node.parents
      .filter((parentId) => nodeMap.has(parentId))
      .map((parentId) => findDepth(parentId, nextTrail));
    const depth = parentDepths.length ? Math.max(...parentDepths) + 1 : 0;
    depthCache.set(id, depth);
    return depth;
  };

  const levels = [];
  nodes.forEach((node) => {
    const depth = findDepth(node.id);
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(node);
  });

  const positions = new Map();
  levels.forEach((level = [], depth) => {
    if (depth > 0) {
      level.sort((left, right) => {
        const barycenter = (node) => {
          const parentPositions = node.parents.map((parentId) => positions.get(parentId)).filter(Boolean);
          if (!parentPositions.length) return 500;
          return parentPositions.reduce((sum, position) => sum + position.x, 0) / parentPositions.length;
        };
        return barycenter(left) - barycenter(right) || sourceOrder.get(left.id) - sourceOrder.get(right.id);
      });
    }
    level.forEach((node, index) => {
      positions.set(node.id, {
        x: ((index + 1) / (level.length + 1)) * 1000,
        y: TREE_TOP + depth * LEVEL_GAP,
      });
    });
  });

  const maxDepth = Math.max(0, levels.length - 1);
  const maxLevelSize = Math.max(1, ...levels.map((level) => level?.length || 0));
  const height = Math.max(260, TREE_TOP * 2 + maxDepth * LEVEL_GAP);
  const minWidth = Math.max(300, maxLevelSize * 96);
  const edges = nodes.flatMap((child) => child.parents
    .filter((parentId) => positions.has(parentId))
    .map((parentId) => ({
      id: `${parentId}--${child.id}`,
      parent: positions.get(parentId),
      child: positions.get(child.id),
      state: child.state,
    })));

  return { positions, edges, height, minWidth };
};

const edgePath = (parent, child) => {
  const bend = Math.max(42, (child.y - parent.y) * 0.48);
  return `M ${parent.x} ${parent.y} C ${parent.x} ${parent.y + bend}, ${child.x} ${child.y - bend}, ${child.x} ${child.y}`;
};

const focusableElements = (root) => Array.from(root?.querySelectorAll(
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
) || []).filter((element) => element.getAttribute('aria-hidden') !== 'true');

export default function StockpileSkillTree({
  nodes = [],
  onClaim = () => {},
  onClose = () => {},
  title = '備蓄スキルツリー',
  description = 'シンボルを選んで、達成条件と次に備える内容を確認します。',
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
  const layout = useMemo(() => buildTreeLayout(normalizedNodes), [normalizedNodes]);
  const [selectedId, setSelectedId] = useState(() => initialSelectedId == null ? null : String(initialSelectedId));
  const [pressingId, setPressingId] = useState(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const pressRef = useRef(null);
  const suppressClickRef = useRef(null);
  const claimRef = useRef(onClaim);
  const closeHandlerRef = useRef(onClose);
  const selectedNode = selectedId ? nodeMap.get(selectedId) || null : null;
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
    // A new pointer gesture is never the synthetic click that follows the
    // previous long press, so stale click suppression can be released here.
    suppressClickRef.current = null;
    if (node.state !== 'claimable' || event.button !== 0 || event.isPrimary === false) return;
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
    if (suppressClickRef.current === node.id && event.detail !== 0) {
      suppressClickRef.current = null;
      event.preventDefault();
      return;
    }
    suppressClickRef.current = null;
    setSelectedId(node.id);
  };

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
          <span>STOCKPILE SKILL TREE</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <button ref={closeRef} type="button" aria-label="備蓄スキルツリーを閉じる" onClick={() => closeHandlerRef.current()}><X aria-hidden="true" /></button>
      </header>

      <div className="stockpile-skill-tree-main">
        <section className="stockpile-skill-tree-map" aria-label="備蓄の達成経路">
          <div className="stockpile-skill-tree-guide">
            <p id={instructionId}>シンボルをタップして条件を確認。達成可能なシンボルは約{Math.round(holdDuration / 100) / 10}秒の長押しでも確定できます。</p>
            <ul aria-label="ノードの状態">
              <li data-state="claimable">達成可能</li>
              <li data-state="claimed">達成済み</li>
              <li data-state="locked">未開放</li>
              <li data-state="review">再確認</li>
            </ul>
          </div>

          <div className="stockpile-skill-tree-scroll" tabIndex="0" aria-label="備蓄スキルツリー。必要な場合は縦横にスクロールできます">
            {normalizedNodes.length ? <div
              className="stockpile-skill-tree-surface"
              style={{
                '--stockpile-skill-tree-height': `${layout.height}px`,
                '--stockpile-skill-tree-min-width': `${layout.minWidth}px`,
              }}
            >
              <svg className="stockpile-skill-tree-connectors" viewBox={`0 0 1000 ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
                {layout.edges.map((edge) => <path
                  key={edge.id}
                  className={`stockpile-skill-tree-connector ${edge.state === 'claimed' ? 'is-active' : edge.state === 'review' ? 'is-review' : ''}`}
                  d={edgePath(edge.parent, edge.child)}
                  pathLength="100"
                  vectorEffect="non-scaling-stroke"
                />)}
              </svg>
              <ul className="stockpile-skill-tree-nodes" aria-label="備蓄達成ノード">
                {normalizedNodes.map((node) => {
                  const position = layout.positions.get(node.id);
                  const stateLabel = STOCKPILE_SKILL_STATE_LABELS[node.state];
                  const selected = selectedId === node.id;
                  return <li
                    key={node.id}
                    className={`${pressingId === node.id ? 'is-pressing' : ''} ${selected ? 'is-selected' : ''}`}
                    data-state={node.state}
                    style={{
                      '--stockpile-skill-node-x': `${position.x / 10}%`,
                      '--stockpile-skill-node-y': `${position.y}px`,
                      '--stockpile-skill-hold-duration': `${holdDuration}ms`,
                    }}
                  >
                    <button
                      type="button"
                      aria-label={`${node.title}、${stateLabel}`}
                      aria-pressed={selected}
                      aria-controls={panelId}
                      aria-describedby={node.state === 'claimable' ? instructionId : undefined}
                      onClick={(event) => selectNode(event, node)}
                      onPointerDown={(event) => beginPress(event, node)}
                      onPointerMove={movePress}
                      onPointerUp={clearPress}
                      onPointerCancel={clearPress}
                      onLostPointerCapture={clearPress}
                      onPointerLeave={clearPress}
                      onContextMenu={(event) => node.state === 'claimable' && event.preventDefault()}
                    >
                      <span aria-hidden="true">{node.symbol}</span>
                    </button>
                  </li>;
                })}
              </ul>
            </div> : <div className="stockpile-skill-tree-empty"><span aria-hidden="true">◇</span><p>表示できる備蓄スキルはまだありません。</p></div>}
          </div>
        </section>

        <aside id={panelId} className={`stockpile-skill-tree-detail ${selectedNode ? 'has-selection' : 'is-empty'}`} aria-live="polite" aria-atomic="true">
          {selectedNode ? <>
            <div className="stockpile-skill-tree-detail-scroll">
              <div className="stockpile-skill-tree-detail-heading">
                <span className="stockpile-skill-tree-detail-symbol" data-state={selectedNode.state} aria-hidden="true">{selectedNode.symbol}</span>
                <div>
                  <span className="stockpile-skill-tree-state" data-state={selectedNode.state}>{STOCKPILE_SKILL_STATE_LABELS[selectedNode.state]}</span>
                  <h3>{selectedNode.title}</h3>
                </div>
              </div>
              {selectedNode.detail && <p className="stockpile-skill-tree-detail-copy">{selectedNode.detail}</p>}
              <div className="stockpile-skill-tree-condition">
                <span>達成条件</span>
                <p id={conditionId}>{selectedNode.condition || '条件はまだ設定されていません。'}</p>
              </div>
              {selectedNode.source?.url && <a className="stockpile-skill-tree-source" href={selectedNode.source.url} target="_blank" rel="noreferrer">根拠を確認：{selectedNode.source.label}<span aria-hidden="true">↗</span></a>}
              {selectedNode.state === 'claimable' && <p className="stockpile-skill-tree-claim-note"><Check aria-hidden="true" />条件を確認したら、下のボタンまたはシンボルの長押しで確定できます。</p>}
              {selectedNode.state === 'claimed' && <p className="stockpile-skill-tree-claimed-note"><Check aria-hidden="true" />この項目は達成済みです。</p>}
              {selectedNode.state === 'locked' && <p className="stockpile-skill-tree-locked-note"><LockKeyhole aria-hidden="true" />表示された達成条件を満たすと開放されます。安全や家族固有の備えは、開放を待たず先に確認してください。</p>}
              {selectedNode.state === 'review' && <p className="stockpile-skill-tree-review-note"><RotateCcw aria-hidden="true" />過去に達成済みですが、現在の条件を満たしているか再確認してください。</p>}
            </div>
            <button
              className="stockpile-skill-tree-claim-button"
              type="button"
              disabled={selectedNode.state !== 'claimable'}
              aria-describedby={conditionId}
              onClick={() => claimRef.current(selectedNode.id)}
            ><Check aria-hidden="true" />達成を確定</button>
          </> : <>
            <span className="stockpile-skill-tree-empty-symbol" aria-hidden="true">◎</span>
            <h3>シンボルを選択</h3>
            <p>備蓄スキルの条件、現在の状態、次に行うことをここに表示します。</p>
          </>}
        </aside>
      </div>
    </section>
  </div>;
}
