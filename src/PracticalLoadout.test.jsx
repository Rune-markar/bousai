// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import PracticalLoadout from './PracticalLoadout.jsx';

const state = {
  household: 1,
  inventory: [{ id: 'water', name: '飲料水 500ml', category: 'water', waterPurpose: 'drinking-cooking', tier: 1, unit: '本', quantity: 5, volumeMl: 500 }],
  preparedness: { completed: [], loadouts: {}, bagSettings: {
    'bag-primary': { mode: 'standard', autoMode: 'inventory' },
    'bag-secondary': { mode: 'standard', autoMode: 'inventory' },
  }, bagPurchasePlan: [] },
};

const handlers = { onChange: vi.fn(), onBagSettings: vi.fn(), onAddPurchase: vi.fn(), onComplete: vi.fn(), onClose: vi.fn() };

describe('避難バッグの自動判定表示', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('未設定では中身を配列せず、3つの自動モードを選べる', () => {
    const unsetState = { ...state, preparedness: { ...state.preparedness, bagSettings: {} } };
    render(<PracticalLoadout taskId="bag-primary" state={unsetState} {...handlers} />);

    expect(screen.getByRole('heading', { name: '自動モードを設定してください' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'バッグへ入れる物' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    fireEvent.click(screen.getByRole('radio', { name: /理想構成/ }));
    expect(handlers.onBagSettings).toHaveBeenCalledWith(expect.objectContaining({ autoMode: 'ideal' }));
  });

  it('避難バッグ以外の装備ケースは従来どおり現物確認だけを表示する', () => {
    render(<PracticalLoadout taskId="light-fire" state={state} {...handlers} />);
    expect(screen.queryByText('自動モード')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '枕元セーフティケースの装備品' })).toBeInTheDocument();
  });

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
    expect(screen.getByRole('heading', { name: '保有備蓄から自動選定' })).toBeInTheDocument();
    expect(screen.getByText('現状の備蓄品')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'バッグへ入れる物' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '自動モードの提案' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /現物確認/ })).toHaveAttribute('aria-selected', 'false');
    expect(handlers.onChange).not.toHaveBeenCalled();
  });

  it('古い完了記録が残っていても必須品が未確認なら完了表示にしない', () => {
    const staleState = {
      ...state,
      preparedness: { ...state.preparedness, completed: ['bag-primary'], loadouts: { 'bag-primary': [] } },
    };
    render(<PracticalLoadout taskId="bag-primary" state={staleState} {...handlers} />);

    const incomplete = screen.getByRole('button', { name: /あと\d+点を確認/ });
    expect(incomplete).toBeDisabled();
    expect(screen.queryByRole('button', { name: '装備確認済み' })).not.toBeInTheDocument();
  });

  it('期限切れ・確認待ちの在庫を表示しつつ自動選定外と明記する', () => {
    const unsafeState = {
      ...state,
      inventory: [
        { ...state.inventory[0], expiry: '2020-01-01' },
        { id: 'food-review', name: '確認待ち食品', category: 'food', tier: 1, unit: '個', quantity: 2, expiry: '', expiryMode: 'unknown' },
      ],
    };
    render(<PracticalLoadout taskId="bag-primary" state={unsafeState} today={new Date('2026-08-22T12:00:00')} {...handlers} />);
    fireEvent.click(screen.getByText(/現状の備蓄品と容量目安を確認/));

    expect(screen.getByText('期限切れ・選定外')).toBeInTheDocument();
    expect(screen.getByText('確認待ち・選定外')).toBeInTheDocument();
    expect(screen.getByText('期限切れ・登録内容の確認待ちは、自動選定から除外します。')).toBeInTheDocument();
  });

  it('現物確認は品名つきの項目から詳細を開いて収納確認する', () => {
    render(<PracticalLoadout taskId="bag-primary" state={state} {...handlers} />);
    expect(screen.getByText('参考予算（アプリ内概算）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /現物確認/ }));
    expect(screen.getByRole('tab', { name: /現物確認/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: '飲料水 500mlの詳細を表示' }));
    expect(screen.getByText('容量目安 1本 約600ml')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '実物を確認して収納' }));
    expect(handlers.onChange).toHaveBeenCalledWith(['water']);
  });

  it('理想構成の不足品をタップして備蓄計画へ追加できる', () => {
    const idealState = {
      ...state,
      preparedness: { ...state.preparedness, bagSettings: { ...state.preparedness.bagSettings, 'bag-primary': { mode: 'standard', autoMode: 'ideal' } } },
    };
    render(<PracticalLoadout taskId="bag-primary" state={idealState} {...handlers} />);

    expect(screen.getByRole('heading', { name: '理想的な持出品の構成' })).toBeInTheDocument();
    const medicine = screen.getAllByText('常用薬').map((element) => element.closest('article')).find(Boolean);
    fireEvent.click(within(medicine).getByRole('button', { name: '備蓄計画に追加' }));
    expect(handlers.onAddPurchase).toHaveBeenCalledWith('medicine');
  });

  it('理想構成ではバッグ容量に収まらなくても有効な保有備蓄を不足扱いにしない', () => {
    const idealState = {
      ...state,
      inventory: [{ id: 'medicine-stock', name: '常用薬', category: 'hygiene', tier: 1, unit: '袋', quantity: 1, packingVolumeMl: 50000 }],
      preparedness: { ...state.preparedness, bagSettings: { ...state.preparedness.bagSettings, 'bag-primary': { mode: 'standard', autoMode: 'ideal' } } },
    };
    render(<PracticalLoadout taskId="bag-primary" state={idealState} {...handlers} />);

    const medicine = screen.getAllByText('常用薬').map((element) => element.closest('article')).find(Boolean);
    expect(within(medicine).getByText('備蓄または実物確認済み')).toBeInTheDocument();
    expect(within(medicine).queryByRole('button', { name: '備蓄計画に追加' })).not.toBeInTheDocument();
  });

  it('実容量入力に44pxのタッチ領域を確保する', () => {
    const stylesheet = readFileSync('src/styles.css', 'utf8');
    expect(stylesheet).toMatch(/\.bag-capacity-control input,\.modal input,\.modal select\{min-height:44px\}/);
    expect(stylesheet).toMatch(/\.packing-reference>summary\{min-height:44px\}/);
    expect(stylesheet).toMatch(/@media\(max-height:520px\)[\s\S]*?\.loadout-head>button\{width:44px;height:44px;min-height:44px;flex-basis:44px\}[\s\S]*?\.bag-planning-tabs button\{min-height:44px\}/);
  });
});
