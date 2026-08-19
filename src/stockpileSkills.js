import { inventorySummary } from './domain.js';
import { essentialPreparednessGates } from './preparedness.js';
import { buildStockpileGuideline } from './stockpileGuideline.js';

export const STOCKPILE_SKILL_STATUS = Object.freeze({
  LOCKED: 'locked',
  CLAIMABLE: 'claimable',
  CLAIMED: 'claimed',
  REVIEW: 'review',
});

// Water and toilet quantities are represented by the day-level branches below.
// Safety is a separate root so each resource path can reflect its real stock,
// even while another resource or a safety check is still incomplete.
export const STOCKPILE_SKILL_SAFETY_GATE_KEYS = Object.freeze(['home', 'risk', 'contact', 'medicine']);

const RESOURCE_SKILLS = Object.freeze([
  { category: 'water', title: '水', summaryKey: 'waterDays' },
  { category: 'food', title: '食料', summaryKey: 'foodDays' },
  { category: 'toilet', title: '携帯トイレ', summaryKey: 'toiletDays' },
]);

export const STOCKPILE_DIVERSITY_SKILLS = Object.freeze([
  { id: 'diversity-power', guidelineBranchId: 'power', title: '停電時の選択肢を足す', category: 'light', parentIds: ['home-3'], unlockDescription: '主要備蓄の参考量3日分と並行して' },
  { id: 'diversity-food', guidelineBranchId: 'food-variety', title: '食べ慣れた味を足す', category: 'food', parentIds: ['food-3'], unlockDescription: '食料の重量換算3日分と並行して' },
  { id: 'diversity-calm', guidelineBranchId: 'calm', title: '落ち着ける時間を作る', category: 'comfort', parentIds: ['home-7'], unlockDescription: '主要備蓄7日分を維持しながら' },
  { id: 'diversity-personal', guidelineBranchId: 'personal', title: '家族固有品を登録する', category: 'comfort', parentIds: [], unlockDescription: '備蓄日数を待たず' },
]);

const freezeNode = (node) => Object.freeze({
  ...node,
  parentIds: Object.freeze([...(node.parentIds || [])]),
  criterion: Object.freeze({ ...node.criterion }),
});

const resourceNodes = (days, parentDays) => RESOURCE_SKILLS.map((resource) => ({
  id: `${resource.category}-${days}`,
  title: `${resource.title}${resource.category === 'food' ? '・重量換算' : ''}${days}日分`,
  description: resource.category === 'food'
    ? `登録重量をアプリ内の参考値（1人1日450g）で換算して${days}日分以上です。栄養・アレルギー・調理可否は別に確認します。`
    : `${resource.title}の期限内在庫が${days}日分以上です。`,
  tier: `${days}-day`,
  kind: 'resource',
  category: resource.category,
  parentIds: parentDays ? [`${resource.category}-${parentDays}`] : [],
  criterion: { type: 'category-days', summaryKey: resource.summaryKey, days },
  claimEffect: resource.category === 'food' && days === 3 ? 'launcher' : null,
}));

const baseNodes = [
  {
    id: 'safety-foundation',
    title: '備蓄量と並行する安全確認',
    description: '住まい・避難先・連絡・常用薬は備蓄日数と別に確認し、未確認ならホームの必須確認を優先します。',
    tier: 'safety',
    kind: 'safety',
    parentIds: [],
    criterion: { type: 'safety-gates' },
  },
  ...resourceNodes(1, null),
  {
    id: 'home-1',
    title: '主要備蓄・参考量1日分',
    description: '水・食料の重量換算・携帯トイレの最短が1日分以上のアプリ上の着手点です。',
    tier: '1-day',
    kind: 'milestone',
    parentIds: ['water-1', 'food-1', 'toilet-1'],
    criterion: { type: 'essential-days', days: 1 },
  },
  ...resourceNodes(3, 1),
  {
    id: 'home-3',
    title: '主要備蓄・参考量3日分',
    description: '水・食料の重量換算・携帯トイレの最短が3日分以上です。3日は公的な最低目安ですが、栄養・アレルギー・調理可否は別に確認します。',
    tier: '3-day',
    kind: 'milestone',
    parentIds: ['home-1', 'water-3', 'food-3', 'toilet-3'],
    criterion: { type: 'essential-days', days: 3 },
    claimEffect: 'launcher',
  },
  ...resourceNodes(7, 3),
  {
    id: 'home-7',
    title: '主要備蓄・参考量7日分',
    description: '水・食料の重量換算・携帯トイレの最短が7日分以上です。7日は公的な推奨目安ですが、栄養・アレルギー・調理可否は別に確認します。',
    tier: '7-day',
    kind: 'milestone',
    parentIds: ['home-3', 'water-7', 'food-7', 'toilet-7'],
    criterion: { type: 'essential-days', days: 7 },
    claimEffect: 'launcher',
  },
  {
    id: 'home-30',
    title: 'アプリ方針・参考量30日分',
    description: '30日は国の一律基準ではありません。地域リスクと家族事情を確認し、同じ物を増やすより快適性・代替手段・更新しやすさを優先する判断点です。',
    tier: '30-day',
    kind: 'milestone',
    parentIds: ['home-7'],
    criterion: { type: 'essential-days', days: 30 },
    claimEffect: 'launcher',
  },
  ...STOCKPILE_DIVERSITY_SKILLS.map((branch) => ({
    ...branch,
    description: `${branch.unlockDescription}、該当する期限内の実物を登録すると確認できます。`,
    tier: 'diversity',
    kind: 'diversity',
    criterion: { type: 'diversity-branch', branchId: branch.guidelineBranchId },
  })),
];

export const STOCKPILE_SKILL_NODES = Object.freeze(baseNodes.map(freezeNode));

const nodeDefinitionById = new Map(STOCKPILE_SKILL_NODES.map((node) => [node.id, node]));

const resolveDate = (options = {}) => {
  const date = new Date(options.today ?? options.now ?? new Date());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const claimedIdsFromState = (state = {}) => {
  const claims = Array.isArray(state.preparedness?.stockpileSkillClaims)
    ? state.preparedness.stockpileSkillClaims
    : [];
  return [...new Set(claims.filter((id) => typeof id === 'string' && nodeDefinitionById.has(id)))];
};

const evaluateCriterion = (criterion, context) => {
  if (criterion.type === 'safety-gates') {
    return {
      met: context.safety.complete,
      current: context.safety.completeCount,
      target: context.safety.gates.length,
      unit: '項目',
    };
  }
  if (criterion.type === 'category-days') {
    const current = Math.max(0, Number(context.summary[criterion.summaryKey]) || 0);
    return { met: current >= criterion.days, current, target: criterion.days, unit: '日分' };
  }
  if (criterion.type === 'essential-days') {
    return { met: context.essentialDays >= criterion.days, current: context.essentialDays, target: criterion.days, unit: '日分' };
  }
  if (criterion.type === 'diversity-branch') {
    const branch = context.guidelineBranchById.get(criterion.branchId);
    return { met: Boolean(branch?.registered), current: branch?.registered ? 1 : 0, target: 1, unit: '登録' };
  }
  return { met: false, current: 0, target: 1, unit: '' };
};

export function buildStockpileSkillTree(state = {}, options = {}) {
  const today = resolveDate(options);
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const summary = inventorySummary(inventory, state.household, today);
  const allSafety = essentialPreparednessGates(state, summary);
  const safetyGateKeys = new Set(STOCKPILE_SKILL_SAFETY_GATE_KEYS);
  const safetyGates = allSafety.gates.filter((gate) => safetyGateKeys.has(gate.key));
  const safety = {
    gates: safetyGates,
    completeCount: safetyGates.filter((gate) => gate.complete).length,
    complete: safetyGates.length > 0 && safetyGates.every((gate) => gate.complete),
    allGates: allSafety.gates,
  };
  const guideline = buildStockpileGuideline(summary, inventory, today);
  const guidelineBranchById = new Map(guideline.branches.map((branch) => [branch.id, branch]));
  const context = { summary, safety, essentialDays: guideline.essentialDays, guidelineBranchById };
  const evaluations = new Map(STOCKPILE_SKILL_NODES.map((node) => [node.id, evaluateCriterion(node.criterion, context)]));
  const ancestorCache = new Map();

  const ancestorIdsFor = (nodeId, visiting = new Set()) => {
    if (ancestorCache.has(nodeId)) return ancestorCache.get(nodeId);
    if (visiting.has(nodeId)) return [];
    const node = nodeDefinitionById.get(nodeId);
    if (!node) return [];
    const nextVisiting = new Set(visiting).add(nodeId);
    const ancestors = [...new Set(node.parentIds.flatMap((parentId) => [parentId, ...ancestorIdsFor(parentId, nextVisiting)]))];
    ancestorCache.set(nodeId, ancestors);
    return ancestors;
  };

  const claimedIds = claimedIdsFromState(state);
  const claimed = new Set(claimedIds);
  const nodes = STOCKPILE_SKILL_NODES.map((definition) => {
    const evaluation = evaluations.get(definition.id);
    const ancestorIds = ancestorIdsFor(definition.id);
    const blockingAncestorIds = ancestorIds.filter((id) => !evaluations.get(id)?.met);
    const currentlySatisfied = evaluation.met && blockingAncestorIds.length === 0;
    const wasClaimed = claimed.has(definition.id);
    const status = wasClaimed
      ? currentlySatisfied ? STOCKPILE_SKILL_STATUS.CLAIMED : STOCKPILE_SKILL_STATUS.REVIEW
      : currentlySatisfied ? STOCKPILE_SKILL_STATUS.CLAIMABLE : STOCKPILE_SKILL_STATUS.LOCKED;
    return {
      ...definition,
      status,
      claimed: wasClaimed,
      conditionMet: evaluation.met,
      currentlySatisfied,
      needsReview: status === STOCKPILE_SKILL_STATUS.REVIEW,
      ancestorIds,
      blockingAncestorIds,
      progress: { current: evaluation.current, target: evaluation.target, unit: evaluation.unit },
    };
  });
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));

  return {
    nodes,
    byId,
    claimedIds,
    claimableIds: nodes.filter((node) => node.status === STOCKPILE_SKILL_STATUS.CLAIMABLE).map((node) => node.id),
    reviewIds: nodes.filter((node) => node.status === STOCKPILE_SKILL_STATUS.REVIEW).map((node) => node.id),
    essentialDays: guideline.essentialDays,
    summary,
    safety,
  };
}

export function claimStockpileSkill(state, nodeId, options = {}) {
  if (!state || typeof state !== 'object') return state;
  const now = resolveDate(options);
  const model = buildStockpileSkillTree(state, { today: now });
  const target = model.byId[nodeId];
  if (!target || target.status !== STOCKPILE_SKILL_STATUS.CLAIMABLE) return state;

  const autoClaim = new Set([target.id, ...target.ancestorIds]);
  const orderedAutoClaims = STOCKPILE_SKILL_NODES
    .filter((node) => autoClaim.has(node.id) && model.byId[node.id].currentlySatisfied)
    .map((node) => node.id);
  const preparedness = state.preparedness && typeof state.preparedness === 'object' ? state.preparedness : {};
  const existing = Array.isArray(preparedness.stockpileSkillClaims)
    ? preparedness.stockpileSkillClaims.filter((id) => typeof id === 'string')
    : [];

  return {
    ...state,
    preparedness: {
      ...preparedness,
      stockpileSkillClaims: [...new Set([...existing, ...orderedAutoClaims])],
      updatedAt: now.toISOString(),
    },
  };
}
