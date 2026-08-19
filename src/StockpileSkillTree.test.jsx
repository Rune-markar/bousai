// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StockpileSkillTree, { STOCKPILE_SKILL_LONG_PRESS_MS } from './StockpileSkillTree.jsx';

const nodes = [
  { id: 'start', title: '備蓄を始める', symbol: '🏠', state: 'claimed', detail: '最初の備えです。', condition: '備蓄場所を決める', parents: [] },
  { id: 'water', title: '水を3日分', symbol: '💧', state: 'claimable', detail: '家族分の水を備えます。', condition: '1人1日3Lを3日分用意する', parents: ['start'] },
  { id: 'food', title: '食料を3日分', symbol: '🍚', state: 'locked', detail: '食べ慣れた食品を備えます。', condition: '水を3日分達成する', parents: ['water'] },
  { id: 'toilet', title: '携帯トイレを再点検', symbol: '🚽', state: 'review', detail: '数量をもう一度確認します。', condition: '現在の家族人数で必要数を確認する', parents: ['start'] },
  { id: 'week', title: '1週間分を確保', symbol: '7', state: 'claimed', detail: '備蓄を1週間へ広げます。', condition: '主要備蓄を7日分確保する', parents: ['water'] },
];

describe('StockpileSkillTree', () => {
  const onClaim = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('シンボルだけを見せ、読み上げ名にタイトルと状態を含める', () => {
    const { container } = render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: '備蓄スキルツリー' })).toBeInTheDocument();
    const water = screen.getByRole('button', { name: '水を3日分、達成可能' });
    expect(water).toHaveTextContent('💧');
    expect(water).not.toHaveTextContent('水を3日分');
    expect(screen.getByRole('button', { name: '食料を3日分、未開放' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '携帯トイレを再点検、再確認' })).toBeInTheDocument();
    expect(container.querySelectorAll('.stockpile-skill-tree-connector.is-active')).toHaveLength(1);
    expect(container.querySelectorAll('.stockpile-skill-tree-connector.is-review')).toHaveLength(1);
  });

  it('タップで条件を表示し、明示ボタンから達成を確定できる', () => {
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '水を3日分、達成可能' }));
    expect(screen.getByRole('heading', { name: '水を3日分' })).toBeInTheDocument();
    expect(screen.getByText('1人1日3Lを3日分用意する')).toBeInTheDocument();
    const claimButton = screen.getByRole('button', { name: '達成を確定' });
    expect(claimButton).toBeEnabled();
    fireEvent.click(claimButton);
    expect(onClaim).toHaveBeenCalledWith('water');

    fireEvent.click(screen.getByRole('button', { name: '携帯トイレを再点検、再確認' }));
    expect(screen.getByText('再確認', { selector: '.stockpile-skill-tree-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '達成を確定' })).toBeDisabled();
  });

  it('650msの長押しでclaimし、pointer cancelと大きな移動では中止する', () => {
    vi.useFakeTimers();
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);
    const water = screen.getByRole('button', { name: '水を3日分、達成可能' });

    fireEvent.pointerDown(water, { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS - 1));
    expect(onClaim).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(onClaim).toHaveBeenLastCalledWith('water');

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

  it('Escapeで閉じ、未開放ノードでも条件は確認できる', () => {
    render(<StockpileSkillTree nodes={nodes} onClaim={onClaim} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '食料を3日分、未開放' }));

    expect(screen.getByText('水を3日分達成する')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '達成を確定' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('modelのstatus・parentIds・description・progressを直接受け取れる', () => {
    render(<StockpileSkillTree nodes={[{
      id: 'model-water',
      title: '水1日分',
      category: 'water',
      status: 'claimable',
      parentIds: [],
      description: '水の現在量が1日分以上なら取得できます。',
      progress: { current: 1, target: 1, unit: '日分' },
    }]} onClaim={onClaim} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '水1日分、達成可能' }));
    expect(screen.getAllByText('💧')).toHaveLength(2);
    expect(screen.getByText('水の現在量が1日分以上なら取得できます。')).toBeInTheDocument();
    expect(screen.getByText('現在 1日分 ／ 目標 1日分')).toBeInTheDocument();
  });
});
