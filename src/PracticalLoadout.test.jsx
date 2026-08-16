// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PracticalLoadout from './PracticalLoadout.jsx';

const state = {
  household: 1,
  inventory: [{ id: 'water', name: '飲料水 500ml', category: 'water', tier: 1, unit: '本', quantity: 5, volumeMl: 500 }],
  preparedness: { completed: [], loadouts: {}, bagSettings: {} },
};

const handlers = { onChange: vi.fn(), onBagSettings: vi.fn(), onComplete: vi.fn(), onClose: vi.fn() };

describe('避難バッグの自動判定表示', () => {
  afterEach(() => cleanup());

  it('一時避難の目的と在庫提案理由を表示する', () => {
    render(<PracticalLoadout taskId="bag-primary" state={state} {...handlers} />);
    expect(screen.getByText('AUTO IDENTIFIED・一時避難')).toBeInTheDocument();
    expect(screen.getByText(/移動中の最低限の水分/)).toBeInTheDocument();
    expect(screen.getByText('💊 常用薬')).toBeInTheDocument();
  });

  it('2次避難では一時避難への割当を除外して提案する', () => {
    render(<PracticalLoadout taskId="bag-secondary" state={state} {...handlers} />);
    expect(screen.getByText('AUTO IDENTIFIED・2次避難')).toBeInTheDocument();
    expect(screen.getByText(/一時避難バッグへ先に割り当てた 2 単位を除外/)).toBeInTheDocument();
    expect(screen.getByText(/3本・1.80L/)).toBeInTheDocument();
    expect(screen.getByText(/避難生活で追加する水分/)).toBeInTheDocument();
  });
});
