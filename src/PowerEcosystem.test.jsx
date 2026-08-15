// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import PowerEcosystem from './PowerEcosystem.jsx';
import { createDefaultPowerPlan } from './power.js';

function Planner({ onChange = vi.fn() }) {
  const [plan, setPlan] = useState(createDefaultPowerPlan());
  return <PowerEcosystem plan={plan} onChange={(nextPlan) => {
    onChange(nextPlan);
    setPlan(nextPlan);
  }} onBack={vi.fn()} />;
}

afterEach(() => cleanup());

describe('停電時の電力設計', () => {
  it('太陽光から蓄電池と負荷へつながる配線図を一画面に表示する', () => {
    const { container } = render(<Planner />);

    const flow = screen.getByLabelText('太陽光から蓄電池を経由して負荷へ流れる電力');
    expect(within(flow).getByText('太陽光パネル')).toBeInTheDocument();
    expect(within(flow).getByText('蓄電池')).toBeInTheDocument();
    expect(within(flow).getByRole('button', { name: /負荷を調整/ })).toBeInTheDocument();
    expect(container.querySelectorAll('.power-wire-pulse')).toHaveLength(2);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(container.querySelector('.power-device-rail')).not.toBeInTheDocument();
  });

  it('各ノード直下に負荷、損失、入力、予備、必要容量と太陽光出力を具体値で示す', () => {
    render(<Planner />);

    const breakdown = screen.getByLabelText('電力計算の内訳');
    expect(within(breakdown).getByText('1日負荷')).toBeInTheDocument();
    expect(within(breakdown).getByText('384 Wh')).toBeInTheDocument();
    expect(within(breakdown).getByText('同時最大')).toBeInTheDocument();
    expect(within(breakdown).getByText('70 W')).toBeInTheDocument();
    expect(within(breakdown).getByText('変換損失')).toBeInTheDocument();
    expect(within(breakdown).getByText('52 Wh / 日')).toBeInTheDocument();
    expect(within(breakdown).getByText('蓄電池入力')).toBeInTheDocument();
    expect(within(breakdown).getByText('436 Wh / 日')).toBeInTheDocument();
    expect(within(breakdown).getByText('予備・使用可能域')).toBeInTheDocument();
    expect(within(breakdown).getByText('541 Wh')).toBeInTheDocument();
    expect(within(breakdown).getByText('1.85 kWh')).toBeInTheDocument();
    expect(within(breakdown).getByText('200 W')).toBeInTheDocument();
  });

  it('負荷ボタンのウィンドウに全機器をまとめ、個数変更後の値を画面へ反映する', () => {
    const onChange = vi.fn();
    render(<Planner onChange={onChange} />);

    const loadTrigger = screen.getByRole('button', { name: /負荷を調整/ });
    fireEvent.click(loadTrigger);
    const dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    expect(within(dialog).getAllByRole('article')).toHaveLength(8);
    expect(within(dialog).getByText('4種類を選択')).toBeInTheDocument();
    expect(within(dialog).getByText('384 Wh / 日')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'スマートフォンを増やす' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      devices: expect.objectContaining({ phone: expect.objectContaining({ quantity: 3 }) }),
    }));
    expect(within(dialog).getByText('408 Wh / 日')).toBeInTheDocument();
    expect(within(screen.getByLabelText('太陽光から蓄電池を経由して負荷へ流れる電力')).getByText('408 Wh')).toBeInTheDocument();
  });

  it('共通条件と詳細入力を変更し、安全上の注意を維持する', () => {
    const onChange = vi.fn();
    render(<Planner onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('電気を保ちたい日数'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autonomyDays: 5 }));
    fireEvent.change(screen.getByLabelText('1日の有効日照'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sunHours: 4 }));
    fireEvent.click(screen.getByRole('button', { name: '詳細' }));

    fireEvent.click(screen.getByRole('button', { name: /負荷を調整/ }));
    let dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'スマートフォンの詳細' }));
    dialog = screen.getByRole('dialog', { name: 'スマートフォンの使用条件' });
    fireEvent.change(within(dialog).getByLabelText('スマートフォンの実測消費電力'), { target: { value: '18' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'detail',
      devices: expect.objectContaining({ phone: expect.objectContaining({ actualWatts: 18 }) }),
    }));
    expect(screen.getByText(/医療機器は停止リスクを自己判断せず/)).toBeInTheDocument();
  });

  it('容量・発電・価格の内容別補足を開ける', () => {
    render(<Planner />);

    fireEvent.click(screen.getByRole('button', { name: '蓄電池容量の補足' }));
    let dialog = screen.getByRole('dialog', { name: '必要容量の考え方' });
    expect(within(dialog).getByText(/使用可能率90%/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));

    fireEvent.click(screen.getByRole('button', { name: '太陽光発電条件の補足' }));
    dialog = screen.getByRole('dialog', { name: '太陽光の発電条件' });
    expect(within(dialog).getByText(/システム効率75%/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: '蓄電池価格の補足' }));
    dialog = screen.getByRole('dialog', { name: '蓄電池の価格比較' });
    expect(within(dialog).getByText('メーカー公式価格の比較')).toBeInTheDocument();
    for (const link of within(dialog).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('負荷ウィンドウにフォーカスを閉じ込め、閉じた後は負荷ボタンへ戻す', async () => {
    render(<Planner />);

    const loadTrigger = screen.getByRole('button', { name: /負荷を調整/ });
    fireEvent.click(loadTrigger);
    const dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    const close = within(dialog).getByRole('button', { name: '負荷の調整を閉じる' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getAllByRole('button').at(-1)).toHaveFocus();
    fireEvent.click(close);
    await waitFor(() => expect(loadTrigger).toHaveFocus());

    fireEvent.click(loadTrigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('機器詳細を閉じると負荷一覧の起点へ戻り、その後は主画面の負荷ボタンへ戻す', async () => {
    render(<Planner />);

    const loadTrigger = screen.getByRole('button', { name: /負荷を調整/ });
    fireEvent.click(loadTrigger);
    let dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    const detailTrigger = within(dialog).getByRole('button', { name: 'スマートフォンの詳細' });
    fireEvent.click(detailTrigger);

    dialog = screen.getByRole('dialog', { name: 'スマートフォンの使用条件' });
    expect(within(dialog).getByRole('button', { name: '補足を閉じる' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));

    dialog = await screen.findByRole('dialog', { name: '使用する機器を調整' });
    const restoredDetailTrigger = within(dialog).getByRole('button', { name: 'スマートフォンの詳細' });
    await waitFor(() => expect(restoredDetailTrigger).toHaveFocus());
    fireEvent.click(within(dialog).getByRole('button', { name: '負荷の調整を閉じる' }));
    await waitFor(() => expect(loadTrigger).toHaveFocus());
  });

  it('低いスマートフォンでもノード操作を隠さず44pxのタッチ領域を保つ', () => {
    const stylesheet = readFileSync('src/styles.css', 'utf8');

    expect(stylesheet).not.toMatch(/\.power-node-actions\s*\{[^}]*display\s*:\s*none/s);
    expect(stylesheet).toMatch(/\.power-node-actions button\s*\{[^}]*min-height\s*:\s*44px/s);
    expect(stylesheet).toMatch(/\.power-node-value \.power-help-button\s*\{[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px/s);
  });
});
