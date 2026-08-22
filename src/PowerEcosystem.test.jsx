// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import PowerEcosystem from './PowerEcosystem.jsx';
import { createDefaultPowerPlan } from './power.js';

function Planner({ onChange = vi.fn(), initialPlan = createDefaultPowerPlan() }) {
  const [plan, setPlan] = useState(initialPlan);
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
    const load = within(flow).getByRole('article', { name: '負荷' });
    const battery = within(flow).getByRole('article', { name: '蓄電池' });
    const solar = within(flow).getByRole('article', { name: '太陽光パネル' });
    expect(Array.from(flow.querySelectorAll('.power-flow-node'))).toEqual([solar, battery, load]);
    expect(within(load).getByRole('button', { name: /負荷を調整/ })).toBeInTheDocument();
    expect(flow).toHaveAccessibleDescription(/左に太陽光パネル.*中央に蓄電池.*右に電気を使う負荷.*左から右へ流れます/);
    expect(container.querySelector('.power-wire-pulse.solar-to-battery')).toHaveAttribute('d', 'M177 105 H500');
    expect(container.querySelector('.power-wire-pulse.battery-to-load')).toHaveAttribute('d', 'M500 105 H823');
    expect(container.querySelectorAll('.power-wire-pulse')).toHaveLength(2);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(container.querySelector('.power-device-rail')).not.toBeInTheDocument();
  });

  it('簡易と詳細で計算に使う値を明示し、選択状態を支援技術へ伝える', () => {
    render(<Planner />);

    const modeGroup = screen.getByRole('group', { name: '計算モード' });
    const simple = within(modeGroup).getByRole('button', { name: '簡易' });
    const detail = within(modeGroup).getByRole('button', { name: '詳細' });
    const description = document.getElementById('power-mode-description');
    expect(simple).toHaveAttribute('aria-pressed', 'true');
    expect(detail).toHaveAttribute('aria-pressed', 'false');
    expect(simple).toHaveAttribute('aria-controls', 'power-mode-description power-usage-summary');
    expect(description).toHaveAttribute('data-mode', 'simple');
    expect(description).toHaveAttribute('aria-live', 'polite');
    expect(description).toHaveTextContent('簡易計算');
    expect(description).toHaveTextContent('想定W・台数・1日の使用時間');
    expect(description).toHaveTextContent('実測Wは使いません');

    fireEvent.click(detail);
    expect(simple).toHaveAttribute('aria-pressed', 'false');
    expect(detail).toHaveAttribute('aria-pressed', 'true');
    expect(description).toHaveAttribute('data-mode', 'detail');
    expect(description).toHaveTextContent('詳細計算');
    expect(description).toHaveTextContent('実測Wを優先');
    expect(description).toHaveTextContent('未入力の機器は想定Wで補完');
  });

  it('機器別の1日使用量と全体比を可視化し、詳細値を保ったままモードを切り替える', () => {
    const onChange = vi.fn();
    const initialPlan = createDefaultPowerPlan();
    initialPlan.mode = 'detail';
    initialPlan.devices.phone.actualWatts = 18;
    render(<Planner initialPlan={initialPlan} onChange={onChange} />);

    const usage = screen.getByRole('region', { name: '1日の電気使用' });
    expect(usage).toHaveAttribute('data-mode', 'detail');
    expect(within(usage).getByText('408 Wh')).toBeInTheDocument();
    expect(within(usage).getByText(/選択中4種類/).closest('.power-usage-lead')).toHaveTextContent('扇風機の200 Wh（全体の49%）');

    let phoneUsage = within(usage).getByRole('progressbar', { name: 'スマートフォン' });
    expect(phoneUsage).toHaveAttribute('value', '72');
    expect(phoneUsage).toHaveAttribute('max', '408');
    expect(phoneUsage).toHaveAttribute('aria-valuetext', '72 Wh、全体の18%');
    expect(phoneUsage.closest('li')).toHaveTextContent('実測値 運転 18 W × 2台 × 2時間');

    const fanUsage = within(usage).getByRole('progressbar', { name: '扇風機' });
    expect(fanUsage.closest('li')).toHaveTextContent('想定値（実測未入力） 運転 25 W × 1台 × 8時間');
    expect(fanUsage.closest('li')).toHaveTextContent('起動電力 未確認');

    fireEvent.click(screen.getByRole('button', { name: '簡易' }));
    expect(usage).toHaveAttribute('data-mode', 'simple');
    expect(within(usage).getByText('384 Wh')).toBeInTheDocument();
    phoneUsage = within(usage).getByRole('progressbar', { name: 'スマートフォン' });
    expect(phoneUsage).toHaveAttribute('value', '48');
    expect(phoneUsage).toHaveAttribute('max', '384');
    expect(phoneUsage.closest('li')).toHaveTextContent('想定値 運転 12 W × 2台 × 2時間');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'simple',
      devices: expect.objectContaining({ phone: expect.objectContaining({ actualWatts: 18 }) }),
    }));
  });

  it('電気の流れと主要値を黄色で重点表示する', () => {
    const stylesheet = readFileSync('src/styles.css', 'utf8');

    expect(stylesheet).toContain('--power-electric:#c47f00');
    expect(stylesheet).toMatch(/\.power-wire-pulse\{[^}]*stroke:var\(--power-electric\)/s);
    expect(stylesheet).toMatch(/\.power-flow-direction\{[^}]*background:var\(--power-electric-soft\)[^}]*color:var\(--power-electric-ink\)/s);
    expect(stylesheet).toMatch(/\.power-results-dock b\{[^}]*color:var\(--power-electric-highlight\)/s);
  });

  it('各ノード直下に負荷、損失、入力、予備、必要容量と太陽光出力を具体値で示す', () => {
    render(<Planner />);

    const breakdown = screen.getByLabelText('電力計算の内訳');
    expect(within(breakdown).getByText('1日負荷')).toBeInTheDocument();
    expect(within(breakdown).getByText('384 Wh')).toBeInTheDocument();
    expect(within(breakdown).getByText('運転時同時負荷')).toBeInTheDocument();
    expect(within(breakdown).getByText('70 W')).toBeInTheDocument();
    expect(within(breakdown).getByText('起動時最大')).toBeInTheDocument();
    expect(within(breakdown).getByText('未確認')).toBeInTheDocument();
    expect(within(breakdown).getByText('変換損失')).toBeInTheDocument();
    expect(within(breakdown).getByText('52 Wh / 日')).toBeInTheDocument();
    expect(within(breakdown).getByText('蓄電池入力')).toBeInTheDocument();
    expect(within(breakdown).getByText('436 Wh / 日')).toBeInTheDocument();
    expect(within(breakdown).getByText('予備・使用可能域')).toBeInTheDocument();
    expect(within(breakdown).getByText('1.20 kWh')).toBeInTheDocument();
    expect(within(breakdown).getByText('4.25 kWh')).toBeInTheDocument();
    expect(within(breakdown).getByText('200 W')).toBeInTheDocument();
  });

  it('冷蔵庫の起動電力が未確認なら容量適合を保留し、入力後に運転時と起動時を分けて示す', () => {
    const onChange = vi.fn();
    const initialPlan = createDefaultPowerPlan();
    for (const device of Object.values(initialPlan.devices)) device.quantity = 0;
    initialPlan.devices.fridge.quantity = 1;
    render(<Planner initialPlan={initialPlan} onChange={onChange} />);

    const breakdown = screen.getByLabelText('電力計算の内訳');
    expect(within(breakdown).getByText('60 W')).toBeInTheDocument();
    expect(within(breakdown).getByText('未確認')).toBeInTheDocument();
    expect(screen.getByText(/電源の出力適合は未判定です/).closest('.power-caution')).toHaveTextContent('小型冷蔵庫の起動・瞬間最大W');

    fireEvent.click(screen.getByRole('button', { name: '蓄電池出力の補足' }));
    let dialog = screen.getByRole('dialog', { name: '必要出力と安全確認' });
    expect(within(dialog).getByText(/電源の出力適合はまだ判定できません/).closest('p')).toHaveTextContent('起動・瞬間最大Wが未確認');
    expect(within(dialog).getByText(/出力が足りるとは判断しないでください/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));

    fireEvent.click(screen.getByRole('button', { name: '詳細' }));
    fireEvent.click(screen.getByRole('button', { name: /負荷を調整/ }));
    dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    fireEvent.click(within(dialog).getByRole('button', { name: '小型冷蔵庫の詳細' }));
    dialog = screen.getByRole('dialog', { name: '小型冷蔵庫の使用条件' });
    const surgeInput = within(dialog).getByLabelText('小型冷蔵庫の起動時最大電力');
    expect(surgeInput).toHaveValue(0);
    fireEvent.change(surgeInput, { target: { value: '450' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'detail',
      devices: expect.objectContaining({ fridge: expect.objectContaining({ surgeWatts: 450 }) }),
    }));
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));
    dialog = screen.getByRole('dialog', { name: '使用する機器を調整' });
    expect(within(dialog).getByText(/運転時 60 W・起動時 450 W/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '負荷の調整を閉じる' }));

    fireEvent.click(screen.getByRole('button', { name: '蓄電池出力の補足' }));
    dialog = screen.getByRole('dialog', { name: '必要出力と安全確認' });
    expect(within(dialog).getByText(/確認済みの起動時最大は450W/)).toHaveTextContent('600W以上');
    expect(screen.queryByText(/電源の出力適合は未判定です/)).not.toBeInTheDocument();
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

  it('電気復旧に備える1週間の目安を補足で確認できる', () => {
    render(<Planner />);

    fireEvent.click(screen.getByRole('button', { name: '電気備蓄1週間の目安' }));
    const dialog = screen.getByRole('dialog', { name: '電気は1週間を目安に' });
    expect(within(dialog).getByText('目標：7日分')).toBeInTheDocument();
    expect(within(dialog).getByText(/電気の復旧は、およそ1週間/)).toBeInTheDocument();
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
    expect(stylesheet).toMatch(/\.power-page \.power-settings \.power-setting-label \.power-help-button\s*\{[^}]*width\s*:\s*44px[^}]*height\s*:\s*44px/s);
    expect(stylesheet).toMatch(/\.power-modal-head>button\{[^}]*width:44px[^}]*height:44px/s);
    expect(stylesheet).toMatch(/\.power-load-grid \.device-stepper button\{min-height:44px\}/);
    expect(stylesheet).toMatch(/\.device-detail input\{min-height:44px;font-size:12px\}/);
  });
});
