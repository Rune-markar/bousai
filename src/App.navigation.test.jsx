// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import App from './App.jsx';
import { STOCKPILE_SKILL_LONG_PRESS_MS } from './StockpileSkillTree.jsx';
import { createDefaultState, STORAGE_KEY } from './state.js';

describe('電力設計ページの導線', () => {
  beforeEach(() => {
    if (!globalThis.localStorage) {
      const values = new Map();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          clear: () => values.clear(),
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => { values.set(key, String(value)); },
        },
      });
    }
    localStorage.clear();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createDefaultState(), onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' } }));
    window.history.replaceState({}, '', '#/home');
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('初回は3ステップで家族人数、備蓄目標、連絡先を設定する', () => {
    localStorage.clear();
    render(<App />);

    expect(screen.getByRole('dialog', { name: '何人分の備えをしますか？' })).toBeInTheDocument();
    expect(screen.getByLabelText('初期設定 3ステップ中1ステップ目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: '何日分の備蓄を目指しますか？' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '14日分' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: '集合場所と連絡先' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'あとで設定' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('家族3人')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /14日/ })).toBeInTheDocument();
  });

  it('必須の初期設定中は背景を操作対象から外し、フォーカスをダイアログ内に留める', () => {
    localStorage.clear();
    const { container } = render(<App />);
    const dialog = screen.getByRole('dialog', { name: '何人分の備えをしますか？' });
    const first = within(dialog).getByRole('button', { name: '家族人数を1人減らす' });
    const last = within(dialog).getByRole('button', { name: '次へ' });

    expect(container.querySelector('main')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('main')).toHaveAttribute('inert');
    expect(container.querySelector('.topbar')).toHaveAttribute('inert');

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
  });

  it('初期設定前にスキルツリーURLを直接開いてもダイアログを重ねない', () => {
    localStorage.clear();
    window.history.replaceState({}, '', '#/stockpile-skills');
    render(<App />);

    expect(screen.getByRole('dialog', { name: '何人分の備えをしますか？' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '備蓄スキルツリー' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('保存領域へ書き込めない場合も画面を壊さず案内する', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    render(<App />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('端末に保存できませんでした'));
  });

  it('家族人数はオプションから変更できる', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: '家族人数を増やす' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'オプションを開く' }));
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByLabelText('家族3人')).toBeInTheDocument();
  });

  it('命と衛生の必須条件を平均点より先に案内し、選んだ確認項目を直接表示する', async () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.powerPlan.autonomyDays = 3;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    const priorityDisclosure = screen.getByText('すべて見る').closest('details');
    expect(priorityDisclosure).not.toHaveAttribute('open');
    expect(within(priorityDisclosure).getByText(/次は「住まいの安全」/)).toBeInTheDocument();
    fireEvent.click(priorityDisclosure.querySelector('summary'));
    expect(priorityDisclosure).toHaveAttribute('open');
    const priorities = screen.getByRole('region', { name: '命と衛生の必須確認' });
    expect(within(priorities).getAllByRole('button')).toHaveLength(7);
    expect(within(priorities).getByRole('button', { name: '住まいの安全を確認する' })).toBeInTheDocument();
    expect(within(priorities).getByRole('button', { name: '危険と避難先を確認する' })).toBeInTheDocument();
    expect(within(priorities).getByRole('button', { name: '携帯トイレを確認する' })).toBeInTheDocument();
    expect(within(priorities).queryByText(/電気7日/)).not.toBeInTheDocument();
    expect(within(priorityDisclosure).getByText(/平均点より先に/)).toBeInTheDocument();
    const referenceScore = screen.getByText('備えの進捗（参考）').closest('.home-progress-card');
    expect(priorities.compareDocumentPosition(referenceScore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(priorities).getByRole('button', { name: '住まいの安全を確認する' }));
    expect(window.location.hash).toBe('#/roadmap');
    const nextMission = screen.getByRole('heading', { name: 'いまは、これだけ' }).closest('section');
    const focusedCard = nextMission.querySelector(':scope > .mission-focus');
    const furnitureMission = within(focusedCard).getByRole('heading', { name: '寝室と避難路の安全化' });
    expect(within(focusedCard).queryByRole('heading', { name: '地域の災害リスクを確認' })).not.toBeInTheDocument();
    await waitFor(() => expect(furnitureMission).toHaveFocus());
  });

  it('家・バッグ・避難先を一続きのグラフィックで案内し、避難先候補をその場で確認できる', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.contact = { ...saved.contact, shelter: '市立青葉小学校 体育館', phone: '090-0000-0000' };
    saved.inventory = saved.inventory.map((item) => item.id === 'toilet' ? { ...item, quantity: 1 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    const scene = screen.getByRole('region', { name: '自宅から避難先までの備え' });
    const house = within(scene).getByRole('button', { name: '自宅の備蓄情報を開く' });
    const bag = within(scene).getByRole('button', { name: '避難バッグを自動で準備' });
    const shelter = within(scene).getByRole('button', { name: '避難先の情報を開く。登録先 市立青葉小学校 体育館' });
    expect(house).toHaveAccessibleDescription('生活継続の目安 0.1日分。目標まであと6.9日分。水・食料・携帯トイレのうち最短');
    expect(house.compareDocumentPosition(bag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bag.compareDocumentPosition(shelter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scene.querySelector('.house-wall-shade')).toBeInTheDocument();
    expect(scene.querySelector('.backpack-flap')).toBeInTheDocument();
    expect(scene.querySelector('.shelter-canopy')).toBeInTheDocument();
    expect(scene.querySelector('.shelter-ramp')).toBeInTheDocument();

    shelter.focus();
    fireEvent.click(shelter);
    const dialog = screen.getByRole('dialog', { name: '避難先候補の情報' });
    expect(within(dialog).getByText('市立青葉小学校 体育館')).toBeInTheDocument();
    expect(within(dialog).getByText(/開設状況/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '避難先情報を閉じる' }));
    expect(shelter).toHaveFocus();
  });

  it('内容量を計算できない備蓄があると生活継続日数の注意を吹き出し内に表示する', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'water' ? { ...item, volumeMl: 0 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    expect(screen.getByText('内容量未登録の水は日数に含みません')).toBeVisible();
  });

  it('家から備蓄ダッシュボードを開き、水位つき分類から品目の詳細ページへ移動できる', async () => {
    render(<App />);
    const house = screen.getByRole('button', { name: '自宅の備蓄情報を開く' });
    fireEvent.click(house);

    expect(window.location.hash).toBe('#/inventory');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'わが家の備蓄' })).toHaveFocus());
    const categories = screen.getByRole('group', { name: '備蓄カテゴリ' });
    expect(within(categories).getAllByRole('button')).toHaveLength(6);
    const water = within(categories).getByRole('button', { name: '水分の備蓄を表示。7日目標の達成度 21%' });
    expect(within(water).getByText('21%')).toBeInTheDocument();
    expect(water.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('21%');
    expect(water.querySelector('.liquid-glyph-fill')).toHaveAttribute('y', '46.9');
    expect(screen.queryByRole('heading', { name: '飲料水 500ml' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'アルファ米' })).not.toBeInTheDocument();

    const food = within(categories).getByRole('button', { name: '食料の備蓄を表示。7日目標の達成度 21%' });
    fireEvent.click(food);
    expect(window.location.hash).toBe('#/inventory-category/food');
    await waitFor(() => expect(screen.getByRole('heading', { name: '食料の備蓄' })).toHaveFocus());
    expect(screen.getByRole('heading', { name: 'アルファ米' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '飲料水 500ml' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'メインナビゲーション' }).querySelector('[aria-current="page"]')).toHaveTextContent('備蓄');
  });

  it('備蓄ダッシュボードに直近のローリングストック対象を品名つきで表示する', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    const soon = new Date();
    soon.setDate(soon.getDate() + 5);
    saved.inventory = saved.inventory.map((item) => item.id === 'rice'
      ? { ...item, name: '今週食べるアルファ米', expiry: soon.toISOString().slice(0, 10), rotationEnabled: true, rotationLeadDays: 30 }
      : { ...item, rotationEnabled: false });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    const nextActions = screen.getByRole('region', { name: '次に使う・確認する備蓄' });
    expect(within(nextActions).getByText('今週食べるアルファ米')).toBeInTheDocument();
    expect(within(nextActions).getByText('消費時期です')).toBeInTheDocument();
    expect(within(nextActions).getByText('今すぐ 1品')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '今週食べるアルファ米' })).not.toBeInTheDocument();

    fireEvent.click(within(nextActions).getByRole('button', { name: /今週食べるアルファ米/ }));
    expect(window.location.hash).toBe('#/rolling');
    expect(screen.getByRole('heading', { name: 'ローリングストック消費計画' })).toBeInTheDocument();
  });

  it('備蓄ガイドをメインから外し、右下の通知付きボタンからシンボル主体のスキルツリーを開く', async () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 3, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    expect(screen.queryByRole('group', { name: '備蓄レベルの樹形図' })).not.toBeInTheDocument();
    const launcher = screen.getByRole('button', { name: '備蓄スキルツリーを開く。達成確認可能 2件' });
    expect(launcher.querySelector('.stockpile-skill-launcher-alert')).toHaveTextContent('!');
    fireEvent.click(launcher);

    expect(window.location.hash).toBe('#/stockpile-skills');
    const dialog = screen.getByRole('dialog', { name: '備蓄スキルツリー' });
    const food = within(dialog).getByRole('button', { name: '食料・重量換算3日分、達成可能' });
    expect(food).toHaveTextContent('🍚');
    expect(food).not.toHaveTextContent('食料');
    expect(food.closest('li')).toHaveAttribute('data-state', 'claimable');
    fireEvent.click(food);
    expect(within(dialog).getByRole('heading', { name: '食料・重量換算3日分' })).toBeInTheDocument();
    expect(within(dialog).getByText(/登録重量による参考換算/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/栄養・アレルギー・調理可否は別に確認/)).toHaveLength(2);
    expect(within(dialog).getByRole('link', { name: /根拠を確認：農林水産省/ })).toHaveAttribute('href', expect.stringContaining('maff.go.jp'));

    fireEvent.click(within(dialog).getByRole('button', { name: '備蓄スキルツリーを閉じる' }));
    expect(window.location.hash).toBe('#/inventory');
    await waitFor(() => expect(screen.getByRole('button', { name: '備蓄スキルツリーを開く。達成確認可能 2件' })).toHaveFocus());
  });

  it('達成可能ノードの長押しで祖先と経路を達成色にし、確認済み状態を保存する', async () => {
    vi.useFakeTimers();
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 3, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    fireEvent.click(screen.getByRole('button', { name: /備蓄スキルツリーを開く/ }));

    const food = screen.getByRole('button', { name: '食料・重量換算3日分、達成可能' });
    fireEvent.pointerDown(food, { pointerId: 7, isPrimary: true, button: 0, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS));

    expect(screen.getByRole('button', { name: '食料・重量換算1日分、達成済み' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '食料・重量換算3日分、達成済み' })).toBeInTheDocument();
    expect(container.querySelectorAll('.stockpile-skill-tree-connector.is-active').length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).preparedness.stockpileSkillClaims).toEqual(['food-1', 'food-3']);

    fireEvent.click(screen.getByRole('button', { name: '備蓄スキルツリーを閉じる' }));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('button', { name: '備蓄スキルツリーを開く。新しい達成確認はありません' })).toBeInTheDocument();
  });

  it('取得後に在庫が不足した項目は右下ボタンで再確認件数を知らせる', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 0, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    saved.preparedness.stockpileSkillClaims = ['food-1', 'food-3'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const launcher = screen.getByRole('button', { name: '備蓄スキルツリーを開く。再確認が必要 2件' });
    expect(launcher).toHaveClass('has-review');
    expect(launcher.querySelector('.stockpile-skill-launcher-alert')).toHaveTextContent('!');
  });

  it('灯り・電源カテゴリの充填色を黄色に固定する', () => {
    const stylesheet = readFileSync('src/styles.css', 'utf8');
    expect(stylesheet).toMatch(/button\[data-category="light"\] \.liquid-glyph-fill\{fill:#e3b82f\}/);
    expect(stylesheet).toMatch(/button\[data-category="light"\] \.liquid-glyph-wave\{fill:#f6d86a\}/);
  });

  it('水・食料・衛生を重点表示し、分類カードの長押しで意味を確認できる', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    const categories = screen.getByRole('group', { name: '備蓄カテゴリ' });
    const water = within(categories).getByRole('button', { name: '水分の備蓄を表示。7日目標の達成度 21%' });
    const food = within(categories).getByRole('button', { name: '食料の備蓄を表示。7日目標の達成度 21%' });
    const hygiene = within(categories).getByRole('button', { name: /衛生の備蓄を表示/ });
    const heat = within(categories).getByRole('button', { name: /燃料の備蓄を表示/ });

    for (const priority of [water, food, hygiene]) {
      expect(priority).toHaveAttribute('data-priority', 'true');
      expect(within(priority).getByText('重点')).toBeInTheDocument();
      expect(within(priority).getByText('長押しで意味')).toBeInTheDocument();
    }
    expect(heat).not.toHaveAttribute('data-priority');

    act(() => vi.runOnlyPendingTimers());
    fireEvent.pointerDown(water, { pointerType: 'touch', button: 0 });
    act(() => vi.advanceTimersByTime(600));
    const dialog = screen.getByRole('dialog', { name: '水分の意味' });
    expect(within(dialog).getByText('3L / 人・日')).toBeInTheDocument();
    expect(within(dialog).getByText('飲料＋調理用')).toBeInTheDocument();
    expect(within(dialog).getByText('生活用水')).toBeInTheDocument();
    expect(within(dialog).getByText(/生活用水は3Lに含まれない/)).toBeInTheDocument();
    expect(window.location.hash).toBe('#/inventory');
    fireEvent.click(within(dialog).getByRole('button', { name: '確認しました' }));
    expect(water).toHaveFocus();
  });

  it('数量目標がない分類は在庫があっても水位を0%として目標未設定と伝える', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.category === 'comfort' ? { ...item, target: 0 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const comfort = screen.getByRole('button', { name: '快適の備蓄を表示。目標未設定' });
    expect(within(comfort).getByText('目標未設定')).toBeInTheDocument();
    expect(comfort.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('0%');
    expect(comfort.querySelector('[data-liquid-fill]')).toHaveClass('empty');
  });

  it('期限切れ在庫だけの分類は登録目標があっても達成率と水位を0%にする', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.category === 'water' ? { ...item, expiry: '2020-01-01' } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const water = screen.getByRole('button', { name: '水分の備蓄を表示。7日目標の達成度 0%' });
    expect(within(water).getByText('0%')).toBeInTheDocument();
    expect(water.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('0%');
    expect(water.querySelector('[data-liquid-fill]')).toHaveClass('empty');
  });

  it('設定日数にわずかでも未達なら分類水位を100%に丸めない', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'water' ? { ...item, quantity: 83.9 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const water = screen.getByRole('button', { name: '水分の備蓄を表示。7日目標の達成度 99%' });
    expect(water.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('99%');
  });

  it('目標未設定の品目を同じ分類の達成率へ混ぜない', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'gas' ? { ...item, target: 0 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const heat = screen.getByRole('button', { name: '燃料の備蓄を表示。登録目標の達成度 0%' });
    expect(heat.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('0%');
  });

  it('ホームから専用ページを開き、戻るとホームへ戻る', () => {
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));

    const heading = screen.getByRole('heading', { name: '停電時の電力設計' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
    expect(container.querySelector('.app-shell')).toHaveClass('power-active');
    expect(document.documentElement).toHaveClass('power-document-active');
    expect(document.body).toHaveClass('power-document-active');

    expect(screen.getByLabelText('太陽光から蓄電池を経由して負荷へ流れる電力')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ホームへ戻る' }));
    expect(screen.getByRole('heading', { name: 'わが家の防災状況' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停電時の電力を設計' })).toHaveFocus();
    expect(container.querySelector('.app-shell')).not.toHaveClass('power-active');
    expect(document.documentElement).not.toHaveClass('power-document-active');
    expect(document.body).not.toHaveClass('power-document-active');

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));
    expect(screen.getByRole('button', { name: /負荷を調整/ })).toBeInTheDocument();
  }, 15000);

  it('アプリをアンマウントするとドキュメント固定を解除する', () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '停電時の電力を設計' }));
    expect(document.documentElement).toHaveClass('power-document-active');
    expect(document.body).toHaveClass('power-document-active');

    unmount();
    expect(document.documentElement).not.toHaveClass('power-document-active');
    expect(document.body).not.toHaveClass('power-document-active');
  });

  it('防災力ページに旧電力プランナーを埋め込まない', () => {
    render(<App />);

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '防災力' }));

    expect(screen.getByRole('heading', { name: '防災力ロードマップ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '停電時の電力を、一つの流れで設計' })).not.toBeInTheDocument();
  });

  it('ホームと常設ナビから避難バッグの自動選定へ直接移動できる', () => {
    render(<App />);

    const scene = screen.getByRole('region', { name: '自宅から避難先までの備え' });
    fireEvent.click(within(scene).getByRole('button', { name: '避難バッグを自動で準備' }));
    expect(window.location.hash).toBe('#/bags');
    expect(screen.getByRole('heading', { name: '避難バッグを自動で準備' })).toBeInTheDocument();
    const purposeGuide = screen.getByText('2つのバッグの使い分け').closest('details');
    expect(purposeGuide).not.toHaveAttribute('open');
    fireEvent.click(purposeGuide.querySelector('summary'));
    expect(purposeGuide).toHaveAttribute('open');
    expect(screen.getByText('危険から即座に逃げる')).toBeInTheDocument();
    expect(screen.getByText('避難先で数日を過ごす')).toBeInTheDocument();
    expect(screen.getByText(/自宅や経路の安全を確認できない場合は帰宅せず/)).toBeInTheDocument();
    expect(screen.getByText('一時避難を先に確保し、二次避難には残りの在庫を割り当てます。期限が近く、重要度の高い備蓄を優先します。')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /自動選定結果を開く/ })).toHaveLength(2);

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    expect(within(desktopNavigation).getByRole('button', { name: '避難バッグ' })).toHaveAttribute('aria-current', 'page');
  });

  it('情報量の多い主要ページは要点から詳細を段階的に開ける', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });

    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '防災力' }));
    const roadmap = screen.getByText('6段階の防災マップ').closest('details');
    expect(roadmap).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'いまは、これだけ' })).toBeInTheDocument();
    fireEvent.click(roadmap.querySelector('summary'));
    expect(roadmap).toHaveAttribute('open');

    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '知る' }));
    const prepare = screen.getByText('事前に整える').closest('details');
    expect(prepare).not.toHaveAttribute('open');
    fireEvent.click(prepare.querySelector('summary'));
    expect(prepare).toHaveAttribute('open');
    expect(within(prepare).getByText('水は1人1日3リットル')).toBeInTheDocument();
  });

  it('災害ごとの個別対策を確認し、地震の家具固定を保存できる', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '災害対策' }));

    expect(window.location.hash).toBe('#/disasters');
    expect(screen.getByRole('heading', { name: '災害ごとの個別対策' })).toBeInTheDocument();
    const furniture = screen.getByRole('button', { name: /家具に突っ張り棒・L字金具などを取り付けた/ });
    expect(furniture).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(furniture);
    expect(furniture).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /台風・洪水/ }));
    expect(screen.getByRole('heading', { name: '台風・洪水への備え' })).toBeInTheDocument();
    expect(screen.getByText('洪水ハザードマップで浸水深を確認した')).toBeInTheDocument();
  });

  it('実物不足を主要備蓄の参考日数へまとめ、備蓄行と重複する一覧を作らない', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    expect(screen.queryByRole('heading', { name: '目標まで、実物であといくつ？' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '最優先の補充' })).not.toBeInTheDocument();
    expect(screen.getByText('主要備蓄の参考日数')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '主要備蓄の参考日数と実物不足を開く' }));
    const runwayDialog = screen.getByRole('dialog', { name: '主要備蓄の参考日数と不足' });
    expect(within(runwayDialog).getByText(/2Lボトル あと/)).toBeInTheDocument();
    expect(within(runwayDialog).getByLabelText('生活を支える備蓄')).toBeInTheDocument();
    expect(within(runwayDialog).getByText('カセットボンベ')).toBeInTheDocument();
    expect(within(runwayDialog).getByText('カセットコンロ')).toBeInTheDocument();
    fireEvent.click(within(runwayDialog).getByRole('button', { name: '閉じる' }));

    fireEvent.click(screen.getByRole('button', { name: '備蓄品を追加' }));
    const dialog = screen.getByRole('dialog', { name: '備蓄品を追加' });
    expect(within(dialog).getByText('1人1日 3食')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('カテゴリ'), { target: { value: 'water' } });
    expect(within(dialog).getByText('1人1日 合計3L（飲料1L＋調理2L）')).toBeInTheDocument();
    expect(within(dialog).getByText(/生活用水は3Lに含まれない/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /政府広報（飲料1L・調理2L）/ })).toBeInTheDocument();
  });

  it('目標日数の概算費用と年間予算から購入順を示す', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    expect(screen.getByText('7日目標まで')).toBeInTheDocument();
    expect(screen.getByText('年間予算')).toBeInTheDocument();
    expect(screen.getByText('未設定')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '年間購入計画を開く' }));
    const dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    expect(within(dialog).getByRole('heading', { name: '今年、何から買うか' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: '予算を変えると、到達時期がすぐ変わります' })).toBeInTheDocument();
    expect(within(dialog).getByText('飲料水 500ml')).toBeInTheDocument();
    expect(within(dialog).getByText('アルファ米')).toBeInTheDocument();
    const annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);
    const initialChartPath = dialog.querySelector('.budget-line').getAttribute('d');
    expect(within(dialog).getByRole('img', { name: /年間予算0円/ })).toBeInTheDocument();
    fireEvent.change(annualBudget, { target: { value: '10000' } });
    expect(annualBudget).toHaveValue(10000);
    expect(within(dialog).getByRole('img', { name: /年間予算10,000円/ })).toBeInTheDocument();
    expect(dialog.querySelector('.budget-line').getAttribute('d')).not.toBe(initialChartPath);
    expect(within(dialog).getByText('1年後・水')).toBeInTheDocument();
    expect(within(dialog).getAllByText('今年買う').length).toBeGreaterThan(0);
  });

  it('年間予算の編集中はフォーカスを保ち、Escapeでは変更を破棄する', async () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    fireEvent.click(screen.getByRole('button', { name: '年間購入計画を開く' }));
    let dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    let annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);

    annualBudget.focus();
    fireEvent.change(annualBudget, { target: { value: '123000' } });
    expect(annualBudget).toHaveValue(123000);
    await waitFor(() => expect(annualBudget).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '予算で、いつ何を揃えるか' })).not.toBeInTheDocument();
    expect(screen.getByText('未設定')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '年間購入計画を開く' }));
    dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);
    expect(annualBudget).toHaveValue(0);
  });

  it('年間予算は保存操作をした場合だけ確定する', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    fireEvent.click(screen.getByRole('button', { name: '年間購入計画を開く' }));
    let dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    fireEvent.change(within(dialog).getByLabelText(/毎年の備蓄予算/), { target: { value: '12000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'この年間予算で保存' }));

    expect(screen.queryByRole('dialog', { name: '予算で、いつ何を揃えるか' })).not.toBeInTheDocument();
    expect(screen.getByText('¥12,000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '年間購入計画を開く' }));
    dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    expect(within(dialog).getByLabelText(/毎年の備蓄予算/)).toHaveValue(12000);
  });

  it('期限切れロットは消費ではなく廃棄として記録する', async () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = [{
      ...saved.inventory[0],
      id: 'expired-water',
      productId: 'manual:expired-water',
      name: '期限切れ飲料水',
      quantity: 1,
      target: 1,
      expiry: '2000-01-01',
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    fireEvent.click(screen.getByRole('button', { name: 'ローリングストック計画' }));

    expect(screen.getByText('期限切れ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1本を消費として記録' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '1本を廃棄として記録' }));

    expect(screen.getByRole('status')).toHaveTextContent('期限切れ飲料水を期限切れ・廃棄として記録しました');
    const history = screen.getByRole('heading', { name: '消費履歴' }).closest('article');
    expect(within(history).getByText('期限切れ・廃棄')).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).transactions[0]).toMatchObject({
      type: 'discard',
      source: 'rolling-stock',
      reason: '期限切れ・廃棄',
    }));
  });

  it('画面をURLへ反映し、履歴移動時に見出しへフォーカスする', async () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '緊急メモ' }));
    expect(window.location.hash).toBe('#/plan');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'もしもの時のメモ' })).toHaveFocus());

    window.history.replaceState({}, '', '#/home');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'わが家の防災状況' })).toBeInTheDocument());
  });

  it('緊急メモは安全・公的情報・避難判断・連絡の順を最初に表示する', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '緊急メモ' }));
    const flow = screen.getByRole('region', { name: '緊急時に確認する順序' });
    const readout = screen.getByRole('region', { name: '登録済みの緊急連絡情報' });
    const actionPlan = screen.getByText('備蓄と連絡の72時間計画').closest('details');
    const editor = screen.getByText('緊急メモを編集する').closest('details');
    expect(within(flow).getByText('身の安全を確保')).toBeInTheDocument();
    expect(within(flow).getByRole('link', { name: '気象庁 防災情報' })).toBeInTheDocument();
    expect(within(flow).getByText('危険なら安全な場所へ')).toBeInTheDocument();
    expect(within(flow).getByText('家族へ連絡')).toBeInTheDocument();
    expect(flow.compareDocumentPosition(readout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(readout.compareDocumentPosition(actionPlan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actionPlan.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('72時間と携帯トイレ1週間の目安を関連箇所の補足で確認できる', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    fireEvent.click(screen.getByRole('button', { name: /衛生の備蓄を表示/ }));
    fireEvent.click(screen.getByRole('button', { name: '携帯トイレ7日分の目安' }));
    let dialog = screen.getByRole('dialog', { name: '携帯トイレはまず1週間分' });
    expect(within(dialog).getByText('目標：1人35回分／週')).toBeInTheDocument();
    expect(within(dialog).getByText(/手指衛生用品は別に確認/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '目安の説明を閉じる' }));

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '緊急メモ' }));
    fireEvent.click(screen.getByText('備蓄と連絡の72時間計画').closest('summary'));
    fireEvent.click(screen.getByRole('button', { name: '72時間と家庭備蓄の説明' }));
    dialog = screen.getByRole('dialog', { name: '命をつなぐ72時間' });
    expect(within(dialog).getByText('目標：72時間以上')).toBeInTheDocument();
    expect(within(dialog).getByText(/家庭備蓄は別の基準/)).toBeInTheDocument();
  });

  it('不足通知から不足分を直接補充できる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /通知一覧を開く/ }));
    fireEvent.click(screen.getByRole('button', { name: '15回分補充' }));
    expect(screen.queryByRole('dialog', { name: '備蓄のお知らせ' })).not.toBeInTheDocument();
    expect(screen.getByText('携帯トイレを15回分補充しました')).toBeInTheDocument();
  });

  it('ミッション完了後は次のミッション見出しへフォーカスする', async () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '防災力' }));
    fireEvent.click(screen.getAllByRole('button', { name: '地域の災害リスクを確認を達成にする' })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'いまは、これだけ' })).toHaveFocus());
  });
});
