// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StockpileSkillTree, { STOCKPILE_SKILL_LONG_PRESS_MS } from './StockpileSkillTree.jsx';

const resourceNode = (category, days, state, current) => ({
  id: `${category}-${days}`,
  title: `${category}${days}日分`,
  category,
  kind: 'resource',
  tier: `${days}-day`,
  state,
  description: `${category}の現在量を確認します。`,
  condition: `現在 ${current}日分 ／ 条件 ${days}日分`,
  progress: { current, target: days, unit: '日分' },
  parentIds: days === 1 ? [] : [`${category}-${days === 3 ? 1 : 3}`],
});

const nodes = [
  resourceNode('water', 1, 'claimable', 3),
  resourceNode('water', 3, 'claimable', 3),
  resourceNode('water', 7, 'locked', 3),
  resourceNode('food', 1, 'claimable', 2),
  resourceNode('food', 3, 'locked', 2),
  resourceNode('food', 7, 'locked', 2),
  resourceNode('toilet', 1, 'review', 3),
  resourceNode('toilet', 3, 'review', 3),
  resourceNode('toilet', 7, 'locked', 3),
  { id: 'home-1', title: '主要備蓄1日分', kind: 'milestone', tier: '1-day', state: 'claimable', progress: { current: 2, target: 1, unit: '日分' } },
  { id: 'home-3', title: '主要備蓄3日分', kind: 'milestone', tier: '3-day', state: 'locked', condition: '3項目を3日ラインまでそろえる', progress: { current: 2, target: 3, unit: '日分' } },
  { id: 'home-7', title: '主要備蓄7日分', kind: 'milestone', tier: '7-day', state: 'locked', condition: '3項目を7日ラインまでそろえる', progress: { current: 2, target: 7, unit: '日分' } },
  { id: 'safety-foundation', title: '備蓄量と並行する安全確認', kind: 'safety', state: 'claimable', condition: '住まい・避難先・連絡・常用薬を確認する' },
  { id: 'diversity-personal', title: '家族固有品を登録する', kind: 'diversity', category: 'comfort', state: 'claimable', condition: '常用薬や乳幼児用品を登録する' },
  { id: 'diversity-power', title: '停電時の選択肢を足す', kind: 'diversity', category: 'light', state: 'locked', parentIds: ['home-3'], condition: '必要な電源を登録する' },
];

describe('StockpileSkillTree', () => {
  const onClaim = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('1日・3日・7日を縦に並べ、各段階で3資源が分岐して合流する', () => {
    const { container } = render(<StockpileSkillTree nodes={nodes} household={2} onClaim={onClaim} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '備蓄スキルツリー' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'わが家の備蓄レベル樹形図' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1日 → 3日 → 7日へ育てる' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '1日分の水・食料・携帯トイレ' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '3日分の水・食料・携帯トイレ' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '7日分の水・食料・携帯トイレ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '飲料水3日分、現在3日分、確認できます' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '食料（重量換算）3日分、現在2日分、未達成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '携帯トイレ3日分、現在3日分、再確認' })).toBeInTheDocument();
    expect(screen.getAllByText(/6L \/ 日/)).toHaveLength(3);
    expect(screen.getAllByText(/900g \/ 日/)).toHaveLength(3);
    expect(screen.getAllByText(/10回 \/ 日/)).toHaveLength(3);

    expect(screen.getByRole('button', { name: '主要備蓄3日分、2/3項目到達、未達成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '主要備蓄7日分、0/3項目到達、未達成' })).toBeInTheDocument();
    expect(container.querySelector('.stockpile-skill-tree-content')).toHaveAttribute('data-no-horizontal-scroll', 'true');
    expect(container.querySelector('.stockpile-skill-vertical-tree')).toBeInTheDocument();
    expect(container.querySelectorAll('.stockpile-skill-stage')).toHaveLength(3);
  });

  it('安全・家族固有・暮らしの継続を量から分割し、具体名を表示する', () => {
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);

    expect(screen.getByRole('heading', { name: '安全・家族固有の備え' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '備蓄量と並行する安全確認、確認できます' })).toHaveTextContent('住まい・避難・連絡・薬');
    expect(screen.getByRole('button', { name: '家族固有品を登録する、確認できます' })).toHaveTextContent('薬・乳幼児・ペット');
    expect(screen.getByRole('button', { name: '停電時の選択肢を足す、未達成' })).toHaveTextContent('医療電源・通信・灯り');
    expect(screen.getByLabelText('3日分から枝分かれする備え')).toContainElement(screen.getByRole('button', { name: '停電時の選択肢を足す、未達成' }));
  });

  it('資源カードのタップで条件を表示し、明示ボタンから達成を確定できる', () => {
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '飲料水3日分、現在3日分、確認できます' }));
    expect(screen.getByRole('heading', { name: '飲料水' })).toBeInTheDocument();
    expect(screen.getByText('現在 3日分 ／ 条件 3日分')).toBeInTheDocument();
    const claimButton = screen.getByRole('button', { name: '達成を確定' });
    expect(claimButton).toBeEnabled();
    fireEvent.click(claimButton);
    expect(onClaim).toHaveBeenCalledWith('water-3');

    fireEvent.click(screen.getByRole('button', { name: '食料（重量換算）3日分、現在2日分、未達成' }));
    expect(screen.getByRole('heading', { name: '食料（重量換算）' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '達成を確定' })).toBeDisabled();
  });

  it('650msの長押しでclaimし、pointer cancelと大きな移動では中止する', () => {
    vi.useFakeTimers();
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);
    const water = screen.getByRole('button', { name: '飲料水3日分、現在3日分、確認できます' });

    fireEvent.pointerDown(water, { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS - 1));
    expect(onClaim).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClaim).toHaveBeenLastCalledWith('water-3');

    onClaim.mockClear();
    fireEvent.pointerDown(water, { pointerId: 2, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerCancel(water, { pointerId: 2, isPrimary: true });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS));
    expect(onClaim).not.toHaveBeenCalled();

    fireEvent.pointerDown(water, { pointerId: 3, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(water, { pointerId: 3, isPrimary: true, clientX: 30, clientY: 10 });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS));
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('Escapeで閉じ、未達成ラインでも条件を確認できる', () => {
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '主要備蓄3日分、2/3項目到達、未達成' }));

    expect(screen.getByText('3項目を3日ラインまでそろえる')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '達成を確定' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('単独のmodelノードも説明とprogressを表示できる', () => {
    render(<StockpileSkillTree nodes={[{
      id: 'model-water',
      title: '水の確認',
      category: 'water',
      kind: 'resource',
      status: 'claimable',
      parentIds: [],
      description: '水の現在量が1日分以上です。',
      condition: '現在 1日分 ／ 目標 1日分',
      progress: { current: 1, target: 1, unit: '日分' },
    }]} onClaim={onClaim} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '飲料水1日分、現在1日分、確認できます' }));
    expect(screen.getByRole('heading', { name: '飲料水' })).toBeInTheDocument();
    expect(screen.getByText('水の現在量が1日分以上です。')).toBeInTheDocument();
    expect(screen.getByText('現在 1日分 ／ 目標 1日分')).toBeInTheDocument();
  });
});
