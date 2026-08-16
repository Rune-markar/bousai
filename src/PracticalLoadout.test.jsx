// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PracticalLoadout from './PracticalLoadout.jsx';

const state = {
  household: 1,
  inventory: [{ id: 'water', name: '飲料水 500ml', category: 'water', tier: 1, unit: '本', quantity: 5, volumeMl: 500 }],
  preparedness: { completed: [], loadouts: {}, bagSettings: {} },
};

const handlers = { onChange: vi.fn(), onBagSettings: vi.fn(), onComplete: vi.fn(), onClose: vi.fn() };

describe('避難バッグの自動判定表示', () => {
  beforeEach(() => vi.clearAllMocks());
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

  it('自動提案だけでは実物確認済みにしない', () => {
    render(<PracticalLoadout taskId="bag-primary" state={state} {...handlers} />);
    expect(screen.queryByRole('button', { name: '必須品を一括確認' })).not.toBeInTheDocument();
    expect(screen.getByText('保有備蓄から自動提案')).toBeInTheDocument();
    expect(screen.getByText('現状の備蓄品')).toBeInTheDocument();
    expect(screen.getByText('バッグへの自動配置')).toBeInTheDocument();
    expect(handlers.onChange).not.toHaveBeenCalled();
  });

  it('理想構成はアイコンから詳細を開いて収納確認する', () => {
    render(<PracticalLoadout taskId="bag-primary" state={state} {...handlers} />);
    expect(screen.getByText('参考予算（アプリ内概算）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '飲料水 500mlの詳細を表示' }));
    expect(screen.getByText('容量目安 1本 約600ml')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '実物を確認して収納' }));
    expect(handlers.onChange).toHaveBeenCalledWith(['water']);
  });
});
