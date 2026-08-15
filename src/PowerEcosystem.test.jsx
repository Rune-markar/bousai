// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
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
  it('3タブで表示を切り替え、機器と共通条件を変更できる', () => {
    const onChange = vi.fn();
    render(<Planner onChange={onChange} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.textContent)).toEqual(['機器', '蓄電池', '太陽光']);
    expect(screen.getByRole('tab', { name: '機器' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '機器' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'スマートフォンを増やす' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      devices: expect.objectContaining({ phone: expect.objectContaining({ quantity: 3 }) }),
    }));

    fireEvent.change(screen.getByLabelText('電気を保ちたい日数'), { target: { value: '5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ autonomyDays: 5 }));

    fireEvent.change(screen.getByLabelText('1日の有効日照'), { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sunHours: 4 }));

    fireEvent.click(screen.getByRole('tab', { name: '蓄電池' }));
    expect(screen.getByRole('tab', { name: '蓄電池' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: '蓄電池' })).getByText('必要な表示容量')).toBeVisible();

    fireEvent.click(screen.getByRole('tab', { name: '太陽光' }));
    expect(screen.getByRole('tab', { name: '太陽光' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: '太陽光' })).getByText('必要な定格出力')).toBeVisible();
  });

  it('矢印とHome・Endでタブを巡回し、参照先パネルを常に保持する', () => {
    render(<Planner />);
    const deviceTab = screen.getByRole('tab', { name: '機器' });
    const batteryTab = screen.getByRole('tab', { name: '蓄電池' });
    const solarTab = screen.getByRole('tab', { name: '太陽光' });

    for (const tab of [deviceTab, batteryTab, solarTab]) {
      expect(document.getElementById(tab.getAttribute('aria-controls'))).toBeInTheDocument();
    }

    deviceTab.focus();
    fireEvent.keyDown(deviceTab, { key: 'ArrowRight' });
    expect(batteryTab).toHaveFocus();
    expect(batteryTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(batteryTab, { key: 'ArrowLeft' });
    expect(deviceTab).toHaveFocus();
    fireEvent.keyDown(deviceTab, { key: 'ArrowLeft' });
    expect(solarTab).toHaveFocus();
    expect(solarTab).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(solarTab, { key: 'Home' });
    expect(deviceTab).toHaveFocus();
    fireEvent.keyDown(deviceTab, { key: 'End' });
    expect(solarTab).toHaveFocus();
  });

  it('機器タブに選択数・1日使用量・同時最大出力を表示する', () => {
    render(<Planner />);
    const summary = screen.getByLabelText('選択中の機器の集計');

    expect(within(summary).getByText('4種類')).toBeInTheDocument();
    expect(within(summary).getByText('384 Wh / 日')).toBeInTheDocument();
    expect(within(summary).getByText('同時最大 70 W')).toBeInTheDocument();
  });

  it('内容別の補足シートを開き、閉じる操作を選べる', () => {
    render(<Planner />);

    fireEvent.click(screen.getByRole('tab', { name: '蓄電池' }));
    fireEvent.click(screen.getByRole('button', { name: '蓄電池容量の補足' }));
    let dialog = screen.getByRole('dialog', { name: '必要容量の考え方' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByText(/使用可能率90%/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/システム効率75%/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '太陽光' }));
    fireEvent.click(screen.getByRole('button', { name: '太陽光発電条件の補足' }));
    dialog = screen.getByRole('dialog', { name: '太陽光の発電条件' });
    expect(within(dialog).getByText(/システム効率75%/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/使用可能率90%/)).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '太陽光発電条件の補足' }));
    dialog = screen.getByRole('dialog', { name: '太陽光の発電条件' });
    fireEvent.mouseDown(dialog.parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('価格比較と詳細編集を対応する補足シートへ整理する', () => {
    const onChange = vi.fn();
    render(<Planner onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '詳細' }));
    fireEvent.click(screen.getByRole('button', { name: 'スマートフォンの詳細' }));
    let dialog = screen.getByRole('dialog', { name: 'スマートフォンの使用条件' });
    fireEvent.change(within(dialog).getByLabelText('スマートフォンの実測消費電力'), { target: { value: '18' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      mode: 'detail',
      devices: expect.objectContaining({ phone: expect.objectContaining({ actualWatts: 18 }) }),
    }));
    fireEvent.click(within(dialog).getByRole('button', { name: '補足を閉じる' }));

    fireEvent.click(screen.getByRole('tab', { name: '蓄電池' }));
    fireEvent.click(screen.getByRole('button', { name: '蓄電池価格の補足' }));
    dialog = screen.getByRole('dialog', { name: '蓄電池の価格比較' });
    expect(within(dialog).getByText('メーカー公式価格の比較')).toBeInTheDocument();
    for (const link of within(dialog).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('補足シート内にフォーカスを閉じ込め、閉じた後は起点へ戻す', async () => {
    render(<Planner />);

    fireEvent.click(screen.getByRole('tab', { name: '蓄電池' }));
    const capacityTrigger = screen.getByRole('button', { name: '蓄電池容量の補足' });
    fireEvent.click(capacityTrigger);
    let dialog = screen.getByRole('dialog', { name: '必要容量の考え方' });
    const onlyClose = within(dialog).getByRole('button', { name: '補足を閉じる' });
    expect(onlyClose).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(onlyClose).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(onlyClose).toHaveFocus();
    fireEvent.click(onlyClose);
    await waitFor(() => expect(capacityTrigger).toHaveFocus());

    const priceTrigger = screen.getByRole('button', { name: '蓄電池価格の補足' });
    fireEvent.click(priceTrigger);
    dialog = screen.getByRole('dialog', { name: '蓄電池の価格比較' });
    const close = within(dialog).getByRole('button', { name: '補足を閉じる' });
    const links = within(dialog).getAllByRole('link');
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(links.at(-1)).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
  });
});
