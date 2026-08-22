// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import App from './App.jsx';
import { createInitialInventory } from './domain.js';
import { STOCKPILE_SKILL_LONG_PRESS_MS } from './StockpileSkillTree.jsx';
import { createDefaultState, RECOVERY_KEY_PREFIX, SCHEMA_VERSION, STORAGE_KEY } from './state.js';

const createSeededState = () => ({ ...createDefaultState(), inventory: createInitialInventory() });

const openInventoryCategory = (categoryName) => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
  fireEvent.click(within(screen.getByRole('group', { name: '備蓄カテゴリ' })).getByRole('button', { name: categoryName }));
};

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...createSeededState(), onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' } }));
    window.history.replaceState({}, '', '#/home');
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('初回は3ステップで家族人数、備蓄目標、連絡先を設定する', async () => {
    localStorage.clear();
    const { container } = render(<App />);

    expect(screen.getByRole('dialog', { name: '何人分の備えをしますか？' })).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByLabelText('初期設定 3ステップ中1ステップ目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: '何日分の備蓄を目指しますか？' })).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '14日分' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: '集合場所と連絡先' })).toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'あとで設定' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByLabelText('家族3人')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /14日/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'わが家の防災状況' })).toHaveFocus());
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

  it('保存領域へ書き込めない場合は永続的に警告し、復旧後に再試行できる', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    render(<App />);
    let alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('変更をこの端末へ保存できていません');
    expect(within(alert).getByRole('button', { name: '現在データを保存' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /備蓄日数の目標/ }));
    const dialog = screen.getByRole('dialog', { name: '目標備蓄日数を変更' });
    alert = await within(dialog).findByRole('alert');
    expect(dialog).toContainElement(alert);
    setItem.mockRestore();
    fireEvent.click(within(alert).getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(screen.queryByText('変更をこの端末へ保存できていません')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('現在のデータを端末へ保存しました');
  });

  it('別タブの更新を検知すると自動上書きを止め、現タブ保存後に最新データを読み込む', async () => {
    render(<App />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).lastVisitAt).not.toBe(''));
    fireEvent.click(screen.getByRole('button', { name: /備蓄日数の目標/ }));
    expect(screen.getByRole('dialog', { name: '目標備蓄日数を変更' })).toBeInTheDocument();
    const externalState = { ...JSON.parse(localStorage.getItem(STORAGE_KEY)), household: 4 };
    const externalRaw = JSON.stringify(externalState);
    localStorage.setItem(STORAGE_KEY, externalRaw);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: externalRaw, storageArea: localStorage }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('別のタブで保存データが変更されました');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(externalRaw);
    const loadLatest = within(alert).getByRole('button', { name: '最新データを読み込む' });
    expect(loadLatest).toBeDisabled();

    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:unsaved-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(within(alert).getByRole('button', { name: 'このタブを保存' }));
    expect(loadLatest).toBeEnabled();
    fireEvent.click(loadLatest);

    await waitFor(() => expect(screen.queryByText('別のタブで保存データが変更されました')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog', { name: '目標備蓄日数を変更' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('家族4人')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).household).toBe(4);
  });

  it('別タブのlocalStorage.clearをデータ競合として検知する', async () => {
    render(<App />);
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:unsaved-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null, storageArea: localStorage }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('別のタブで保存データが削除されました');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const restoreCurrent = within(alert).getByRole('button', { name: 'このタブを端末へ戻す' });
    expect(restoreCurrent).toBeDisabled();
    fireEvent.click(within(alert).getByRole('button', { name: 'このタブを保存' }));
    fireEvent.click(restoreCurrent);

    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());
    expect(screen.getByRole('status')).toHaveTextContent('このタブのデータを端末へ戻しました');
  });

  it('壊れた保存データを上書きせず、背景操作を止めて利用者の確認を待つ', async () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    const { container } = render(<App />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('保存データを安全に読み込めませんでした');
    expect(alert).toHaveTextContent('元データは上書きしていません');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
    expect(container.querySelector('main')).toHaveAttribute('inert');
    expect(container.querySelector('main')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.topbar')).toHaveAttribute('inert');
    const downloadButton = within(alert).getByRole('button', { name: '保護データを保存' });
    const continueButton = within(alert).getByRole('button', { name: '空の状態で続ける' });
    await waitFor(() => expect(downloadButton).toHaveFocus());
    expect(continueButton).toBeDisabled();
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:protected-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(downloadButton);
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('main')).not.toHaveAttribute('inert');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory).toEqual([]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'わが家の防災状況' })).toHaveFocus());
  });

  it('復旧コピーを作れない場合は、保護ファイルを保存するまで元キーの置換を許可しない', () => {
    localStorage.setItem(STORAGE_KEY, '{broken');
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (String(key).startsWith(RECOVERY_KEY_PREFIX)) throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    render(<App />);

    const alert = screen.getByRole('alert');
    const continueButton = within(alert).getByRole('button', { name: '空の状態で続ける' });
    expect(alert).toHaveTextContent('空の状態で続ける前に保護データをファイル保存してください');
    expect(continueButton).toBeDisabled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
  });

  it('未来形式のファイル復元を拒否し、現在データを保つ', async () => {
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:current-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('データ管理'));
    const dataManagement = screen.getByText('データ管理').closest('details');
    const restoreButton = within(dataManagement).getByRole('button', { name: '復元' });
    expect(restoreButton).toBeDisabled();
    fireEvent.click(within(dataManagement).getByRole('button', { name: '現在データを保存' }));
    expect(restoreButton).toBeEnabled();
    const before = localStorage.getItem(STORAGE_KEY);
    const fileInput = document.querySelector('input[type="file"]');

    fireEvent.change(fileInput, { target: { files: [{ text: vi.fn().mockResolvedValue(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, inventory: [{ id: 'future' }] })) }] } });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('このアプリより新しい形式のため復元できません'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });

  it('ファイル復元前の現在データを別キーへ保護し、保護失敗時は置換しない', async () => {
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:current-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('データ管理'));
    fireEvent.click(screen.getByRole('button', { name: '現在データを保存' }));
    const before = localStorage.getItem(STORAGE_KEY);
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (String(key).startsWith(`${RECOVERY_KEY_PREFIX}-before-import-`)) throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const replacement = { ...createDefaultState(), onboarding: { completed: true }, inventory: [{ id: 'replacement', name: '保存食', category: 'food', quantity: 1, target: 1, foodWeightG: 150 }] };

    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [{ text: vi.fn().mockResolvedValue(JSON.stringify(replacement)) }] } });

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('現在のデータを保護できなかったため、復元を中止しました'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(screen.queryByText('保存食')).not.toBeInTheDocument();
  });

  it('復元前に保存した後でデータが変わった場合は、再保存するまで復元を許可しない', async () => {
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:current-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByText('データ管理'));
    const dataManagement = screen.getByText('データ管理').closest('details');
    const restoreButton = within(dataManagement).getByRole('button', { name: '復元' });
    fireEvent.click(within(dataManagement).getByRole('button', { name: '現在データを保存' }));
    expect(restoreButton).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
    const dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    fireEvent.change(within(dialog).getByLabelText(/毎年の備蓄予算/), { target: { value: '12000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'この年間予算で保存' }));

    await waitFor(() => expect(restoreButton).toBeDisabled());
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [{ text: vi.fn().mockResolvedValue('{}') }] } });
    expect(screen.getByRole('status')).toHaveTextContent('現在データが変わったため、もう一度ファイル保存してから復元してください');
  });

  it('ファイル読込待ち中に現在データが変わった場合も復元を中止する', async () => {
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    const BrowserUrl = globalThis.URL;
    vi.stubGlobal('URL', Object.assign(class MockUrl extends BrowserUrl {}, {
      createObjectURL: vi.fn(() => 'blob:current-state'),
      revokeObjectURL: vi.fn(),
    }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('データ管理'));
    fireEvent.click(screen.getByRole('button', { name: '現在データを保存' }));
    let resolveFile;
    const delayedText = vi.fn(() => new Promise((resolve) => { resolveFile = resolve; }));
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [{ text: delayedText }] } });

    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: 'ホーム' }));
    fireEvent.click(screen.getByRole('button', { name: 'オプションを開く' }));
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    await act(async () => resolveFile(JSON.stringify({ ...createDefaultState(), onboarding: { completed: true }, household: 9 })));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('現在データが変わったため、もう一度ファイル保存してから復元してください'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).household).toBe(3);
  });

  it('新規利用者の未確認在庫・生活継続日数・バッグ提案をゼロから始める', () => {
    localStorage.clear();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: '次へ' }));
    fireEvent.click(screen.getByRole('button', { name: 'あとで設定' }));

    expect(screen.getByRole('button', { name: '自宅の備蓄情報を開く' })).toHaveAccessibleDescription(/生活継続の目安 0\.0日分/);
    fireEvent.click(screen.getByRole('button', { name: '避難バッグを自動で準備' }));
    expect(screen.getAllByText('自動モードは未設定です')).toHaveLength(2);
    expect(screen.getAllByText('方式を選ぶまで中身は配列しません')).toHaveLength(2);
  });

  it('在庫未登録でも命をつなぐ3分類を通知し、登録画面へ案内する', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      inventory: [],
    }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '通知一覧を開く（3件）' }));
    const dialog = screen.getByRole('dialog', { name: '今、対応すること' });
    expect(within(dialog).getByRole('heading', { name: '主要備蓄の補充' })).toBeInTheDocument();
    expect(within(dialog).getByText('飲料・調理用水')).toBeInTheDocument();
    expect(within(dialog).getByText('食料')).toBeInTheDocument();
    expect(within(dialog).getByText('携帯トイレ')).toBeInTheDocument();
    expect(within(dialog).queryByText('今すぐ対応するお知らせはありません')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /飲料・調理用水/ }));
    expect(window.location.hash).toBe('#/inventory');
    expect(screen.getByRole('heading', { name: 'わが家の備蓄' })).toBeInTheDocument();
  });

  it('主要備蓄が確認待ちの間は補充を促さず、先に実物確認を案内する', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      household: 1,
      inventory: [
        { id: 'water-review', name: '保存水 2L', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 10, target: 10, volumeMl: 2000 },
        { id: 'food-ready', name: '保存食', category: 'food', unit: '食', quantity: 3, target: 3, foodWeightG: 450, expiry: '2099-12-31' },
        { id: 'toilet-ready', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 15, target: 15 },
      ],
    }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '通知一覧を開く（1件）' }));
    const dialog = screen.getByRole('dialog', { name: '今、対応すること' });
    expect(within(dialog).getByRole('heading', { name: '主要備蓄を先に確認' })).toBeInTheDocument();
    expect(within(dialog).getByText('確認後に不足量を再計算します')).toBeInTheDocument();
    expect(within(dialog).getByText('保存水 2L')).toBeInTheDocument();
    expect(within(dialog).queryByRole('heading', { name: '主要備蓄の補充' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /補充/ })).not.toBeInTheDocument();
  });

  it('通知から不足していた期限を入力すると確認待ちをその場で解消する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      household: 1,
      inventory: [{ id: 'water-review', productId: 'manual:water-review', name: '保存水 2L', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 10, target: 10, volumeMl: 2000 }],
    }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '通知一覧を開く（3件）' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: '今、対応すること' })).getByRole('button', { name: /保存水 2L/ }));
    const itemDialog = screen.getByRole('dialog', { name: '備蓄品を編集' });
    fireEvent.change(within(itemDialog).getByLabelText('期限または交換日'), { target: { value: '2099-12-31' } });
    fireEvent.click(within(itemDialog).getByRole('button', { name: '保存する' }));

    await waitFor(() => {
      const item = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory[0];
      expect(item.expiry).toBe('2099-12-31');
      expect(item).not.toHaveProperty('verificationStatus');
      expect(item).not.toHaveProperty('verificationReason');
    });
    expect(screen.queryByText('期限または交換日を確認してください')).not.toBeInTheDocument();
  });

  it('理由不明の確認待ち在庫も実物確認後に安全計算へ戻せる', async () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ ...saved.inventory[0], id: 'generic-review', productId: 'manual:generic-review', quantity: 6, target: 6, verificationStatus: 'needs-review' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    openInventoryCategory(/水分の備蓄を表示/);

    expect(screen.getByText('登録内容を確認してください')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '飲料水 500mlの登録内容を実物と確認して在庫に反映' }));

    expect(screen.queryByText('登録内容を確認してください')).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory[0]).not.toHaveProperty('verificationStatus'));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory[0]).not.toHaveProperty('verificationReason');
  });

  it('同一バーコードの矛盾は1ロットの実物編集で共有定義をそろえて解消する', async () => {
    const barcode = '4900000000000';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      schemaVersion: SCHEMA_VERSION,
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      household: 1,
      inventory: [
        { id: 'food-a', productId: `gtin:${barcode}`, barcode, name: '保存食', category: 'food', unit: '袋', tier: 1, quantity: 1, target: 2, foodWeightG: 100, expiry: '2099-12-31' },
        { id: 'food-b', productId: `gtin:${barcode}`, barcode, name: '保存食', category: 'food', unit: '袋', tier: 1, quantity: 1, target: 0, foodWeightG: 10000, expiry: '2099-11-30' },
      ],
    }));
    render(<App />);
    openInventoryCategory(/食料の備蓄を表示/);

    expect(screen.getAllByText('同じバーコードの登録内容が一致しません')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /登録内容を実物と確認して在庫に反映/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '保存食を編集' })[0]);
    const dialog = screen.getByRole('dialog', { name: '備蓄品を編集' });
    fireEvent.change(within(dialog).getByText('1単位あたりの食料重量（g）').closest('label').querySelector('input'), { target: { value: '150' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));

    await waitFor(() => {
      const lots = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory;
      expect(lots.map((item) => item.foodWeightG)).toEqual([150, 150]);
      expect(lots.every((item) => !item.verificationStatus && !item.verificationReason)).toBe(true);
    });
  });

  it('旧版の水用途は編集画面で明示すると確認待ちを解消する', async () => {
    const legacyWater = {
      ...createInitialInventory()[0],
      name: '水タンク',
      quantity: 6,
      target: 6,
      volumeMl: 1000,
    };
    delete legacyWater.waterPurpose;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      schemaVersion: 14,
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      household: 1,
      inventory: [legacyWater],
    }));
    render(<App />);
    openInventoryCategory(/水分の備蓄を表示/);

    expect(screen.getByText('水の用途を確認してください')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '水タンクの登録内容を実物と確認して在庫に反映' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '水タンクを編集' }));
    const dialog = screen.getByRole('dialog', { name: '備蓄品を編集' });
    fireEvent.change(within(dialog).getByLabelText('水の用途'), { target: { value: 'drinking-cooking' } });
    fireEvent.change(within(dialog).getByLabelText('期限または交換日'), { target: { value: '2099-12-31' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory[0];
      expect(saved).toMatchObject({ waterPurpose: 'drinking-cooking', volumeMl: 1000, expiry: '2099-12-31' });
      expect(saved).not.toHaveProperty('verificationStatus');
      expect(saved).not.toHaveProperty('verificationReason');
    });
    expect(screen.queryByText('水の用途を確認してください')).not.toBeInTheDocument();
  });

  it('家族人数はオプションから変更できる', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: '家族人数を増やす' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'オプションを開く' }));
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByLabelText('家族3人')).toBeInTheDocument();
  });

  it('通常モーダルは背景を隔離し、外部フォーカスをダイアログ内へ戻す', () => {
    const { container } = render(<App />);
    const trigger = screen.getByRole('button', { name: /備蓄日数の目標/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '目標備蓄日数を変更' });
    const first = within(dialog).getByRole('button', { name: '閉じる' });
    const last = within(dialog).getByRole('button', { name: '設定する' });
    const background = container.querySelector('.topbar');

    expect(background.inert).toBe(true);
    expect(background).toHaveAttribute('aria-hidden', 'true');
    container.querySelector('.desktop-nav button').focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
    container.querySelector('.desktop-nav button').focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.click(first);
    expect(background.inert).not.toBe(true);
    expect(background).not.toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
  });

  it('命と衛生の必須条件を平均点より先に案内し、選んだ確認項目を直接表示する', async () => {
    const saved = createSeededState();
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
    expect(within(priorities).getAllByRole('button')).toHaveLength(8);
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
    const saved = createSeededState();
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
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'water' ? { ...item, volumeMl: 0 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    expect(screen.getByText('内容量未登録の水は日数に含みません')).toBeVisible();
  });

  it('期限切れ・確認待ちの主要備蓄を生活継続日数から除外したことを吹き出しに明記する', () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'water'
      ? { ...item, expiry: '', expiryMode: 'unknown' }
      : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    const house = screen.getByRole('button', { name: '自宅の備蓄情報を開く' });
    expect(within(house).getByText('主要備蓄の期限切れ・確認待ちは日数から除外')).toBeVisible();
    expect(house).toHaveAccessibleDescription(/主要備蓄の期限切れ・確認待ちは日数から除外/);
  });

  it('重量日数が目標を満たしても食料構成の未確認を吹き出し内に残す', () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = saved.inventory.map((item) => item.id === 'water' ? { ...item, quantity: 42 }
      : item.id === 'rice' ? { ...item, quantity: 21 }
        : item.id === 'toilet' ? { ...item, quantity: 35, target: 35 }
          : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);

    const house = screen.getByRole('button', { name: '自宅の備蓄情報を開く' });
    expect(within(house).getByText('7日目標を達成')).toBeVisible();
    expect(within(house).getByText('食料の構成・家族適合は未確認です')).toBeVisible();
    expect(house).toHaveAccessibleDescription(/食料の構成・家族適合は未確認/);
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
    const saved = createSeededState();
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

  it('備蓄ガイドをメインから外し、通知付きボタンから縦型樹形図を開く', async () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 3, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    expect(screen.queryByRole('group', { name: '備蓄レベルの樹形図' })).not.toBeInTheDocument();
    const launcher = screen.getByRole('button', { name: '備蓄スキルツリーを開く。達成確認可能 1件' });
    expect(launcher.querySelector('.stockpile-skill-launcher-alert')).toHaveTextContent('!');
    fireEvent.click(launcher);

    expect(window.location.hash).toBe('#/stockpile-skills');
    const dialog = screen.getByRole('dialog', { name: '備蓄スキルツリー' });
    const food = within(dialog).getByRole('button', { name: '食料（重量換算）3日分、現在3日分、確認できます' });
    expect(food).toHaveTextContent('食料（重量換算）');
    expect(food.querySelector('.lucide-utensils')).toBeInTheDocument();
    expect(food.closest('li')).toHaveAttribute('data-state', 'claimable');
    fireEvent.click(food);
    expect(within(dialog).getByRole('heading', { name: '食料（重量換算）' })).toBeInTheDocument();
    expect(within(dialog).getByText(/登録重量による参考換算/)).toBeInTheDocument();
    expect(within(dialog).getAllByText(/栄養・アレルギー・調理可否は別に確認/)).toHaveLength(2);
    expect(within(dialog).getByRole('link', { name: /根拠を確認：農林水産省/ })).toHaveAttribute('href', expect.stringContaining('maff.go.jp'));

    fireEvent.click(within(dialog).getByRole('button', { name: '備蓄スキルツリーを閉じる' }));
    expect(window.location.hash).toBe('#/inventory');
    await waitFor(() => expect(screen.getByRole('button', { name: '備蓄スキルツリーを開く。達成確認可能 1件' })).toHaveFocus());
  });

  it('達成可能ノードの長押しで祖先と経路を達成色にし、確認済み状態を保存する', async () => {
    vi.useFakeTimers();
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 3, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    fireEvent.click(screen.getByRole('button', { name: /備蓄スキルツリーを開く/ }));

    const food = screen.getByRole('button', { name: '食料（重量換算）3日分、現在3日分、確認できます' });
    fireEvent.pointerDown(food, { pointerId: 7, isPrimary: true, button: 0, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(STOCKPILE_SKILL_LONG_PRESS_MS));

    expect(screen.getByRole('button', { name: '食料（重量換算）3日分、現在3日分、確認済み' })).toBeInTheDocument();
    expect(container.querySelector('.stockpile-skill-stage[data-days="3"] [data-category="food"]')).toHaveAttribute('data-state', 'claimed');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).preparedness.stockpileSkillClaims).toEqual(['food-1', 'food-3']);

    fireEvent.click(screen.getByRole('button', { name: '備蓄スキルツリーを閉じる' }));
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole('button', { name: '備蓄スキルツリーを開く。新しい達成確認はありません' })).toBeInTheDocument();
  });

  it('取得後に在庫が不足した項目は右下ボタンで再確認件数を知らせる', () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.inventory = [{ id: 'food-test', name: '保存食', category: 'food', tier: 1, unit: '袋', quantity: 0, target: 3, price: 100, foodWeightG: 450, expiry: '2030-01-01' }];
    saved.preparedness.stockpileSkillClaims = ['food-1', 'food-3'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const launcher = screen.getByRole('button', { name: '備蓄スキルツリーを開く。再確認が必要 1件' });
    expect(launcher).toHaveClass('has-review');
    expect(launcher.querySelector('.stockpile-skill-launcher-alert')).toHaveTextContent('!');
  });

  it('灯り・電源カテゴリの充填色を黄色に固定する', () => {
    const stylesheet = readFileSync('src/styles.css', 'utf8');
    expect(stylesheet).toMatch(/button\[data-category="light"\] \.liquid-glyph-fill\{fill:#e3b82f\}/);
    expect(stylesheet).toMatch(/button\[data-category="light"\] \.liquid-glyph-wave\{fill:#f6d86a\}/);
    expect(stylesheet).toMatch(/\.item-benchmark a\{[^}]*min-height:44px/s);
    expect(stylesheet).toMatch(/\.modal input,\.modal select\{min-height:44px\}/);
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

  it('分類カード上でスクロールすると長押し説明を誤表示しない', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    const water = screen.getByRole('button', { name: /水分の備蓄を表示/ });
    fireEvent.pointerDown(water, { pointerType: 'touch', pointerId: 9, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(water, { pointerType: 'touch', pointerId: 9, clientX: 10, clientY: 40 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('dialog', { name: '水分の意味' })).not.toBeInTheDocument();
  });

  it('数量目標がない分類は在庫があっても水位を0%として目標未設定と伝える', () => {
    const saved = createSeededState();
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
    const saved = createSeededState();
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
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = saved.inventory.map((item) => item.id === 'water' ? { ...item, quantity: 83.9 } : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));

    const water = screen.getByRole('button', { name: '水分の備蓄を表示。7日目標の達成度 99%' });
    expect(water.querySelector('[data-liquid-fill]').style.getPropertyValue('--fill-level')).toBe('99%');
  });

  it('目標未設定の品目を同じ分類の達成率へ混ぜない', () => {
    const saved = createSeededState();
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

    fireEvent.click(screen.getByRole('button', { name: /備えの進捗 .* の詳細を開く/ }));

    expect(screen.getByRole('heading', { name: '防災力ロードマップ' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '停電時の電力を、一つの流れで設計' })).not.toBeInTheDocument();
  });

  it('避難バッグはホームの避難導線へ合流し、常設ナビを増やさない', () => {
    render(<App />);

    const scene = screen.getByRole('region', { name: '自宅から避難先までの備え' });
    fireEvent.click(within(scene).getByRole('button', { name: '避難バッグを自動で準備' }));
    expect(window.location.hash).toBe('#/bags');
    expect(screen.getByRole('heading', { name: '避難バッグを自動で準備' })).toBeInTheDocument();
    expect(screen.getByText(/自宅や経路の安全を確認できない場合は帰宅せず/)).toBeVisible();
    const purposeGuide = screen.getByText('2つのバッグの使い分け').closest('details');
    expect(purposeGuide).not.toHaveAttribute('open');
    fireEvent.click(purposeGuide.querySelector('summary'));
    expect(purposeGuide).toHaveAttribute('open');
    expect(screen.getByText('危険から即座に逃げる')).toBeInTheDocument();
    expect(screen.getByText('避難先で数日を過ごす')).toBeInTheDocument();
    expect(screen.getByText(/未設定のまま勝手に配列しません/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /自動モードを設定/ })).toHaveLength(2);

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    expect(within(desktopNavigation).queryByRole('button', { name: '避難バッグ' })).not.toBeInTheDocument();
    expect(within(desktopNavigation).queryByRole('button', { name: '防災力' })).not.toBeInTheDocument();
    expect(within(desktopNavigation).getByRole('button', { name: 'ホーム' })).toHaveAttribute('aria-current', 'page');
  });

  it('理想構成の不足品を防災予算計画へ追加し、想定単価を保存できる', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '避難バッグを自動で準備' }));
    fireEvent.click(screen.getAllByRole('button', { name: /自動モードを設定/ })[0]);
    const loadoutDialog = screen.getByRole('dialog', { name: '1次避難バッグ' });
    fireEvent.click(within(loadoutDialog).getByRole('radio', { name: /理想構成/ }));
    const medicine = [...loadoutDialog.querySelectorAll('.ideal-balance-list article')].find((article) => article.textContent.includes('常用薬'));
    fireEvent.click(within(medicine).getByRole('button', { name: '備蓄計画に追加' }));
    expect(screen.getByRole('status')).toHaveTextContent('不足品を防災予算計画へ追加しました');
    fireEvent.click(within(loadoutDialog).getByRole('button', { name: '装備ケースを閉じる' }));

    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    expect(screen.getByText(/バッグ候補 1点/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
    const budgetDialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    const bagPlan = within(budgetDialog).getByRole('region', { name: '避難バッグから追加した購入候補' });
    expect(within(bagPlan).getByText('常用薬')).toBeInTheDocument();
    fireEvent.change(within(bagPlan).getByLabelText('常用薬の想定単価'), { target: { value: '1800' } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).preparedness.bagPurchasePlan).toEqual([
      { taskId: 'bag-primary', itemId: 'medicine', price: 1800 },
    ]));
  });

  it('情報量の多い主要ページは要点から詳細を段階的に開ける', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });

    fireEvent.click(screen.getByRole('button', { name: /備えの進捗 .* の詳細を開く/ }));
    const roadmap = screen.getByText('6段階の防災マップ').closest('details');
    expect(roadmap).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'いまは、これだけ' })).toBeInTheDocument();
    fireEvent.click(roadmap.querySelector('summary'));
    expect(roadmap).toHaveAttribute('open');
    expect(within(roadmap).getAllByRole('button', { name: /命を守る土台|72時間をしのぐ|避難を二層化|一週間を継続|電力と通信を自立|復旧力を育てる/ })).toHaveLength(6);
    expect(within(roadmap).getAllByRole('listitem')).toHaveLength(6);

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
    expect(screen.queryByRole('button', { name: '備蓄品を追加' })).not.toBeInTheDocument();
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    expect(document.querySelector('.app-shell')).toHaveClass('inventory-dashboard-active');
    const independentAddButton = screen.getByRole('button', { name: '備蓄品を追加' });
    expect(independentAddButton).toHaveClass('stockpile-add-fab');
    expect(independentAddButton.closest('.inventory-dashboard-page')).toBeNull();
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

    fireEvent.click(independentAddButton);
    const dialog = screen.getByRole('dialog', { name: '備蓄品を追加' });
    expect(within(dialog).getByText('1人1日 3食')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('カテゴリ'), { target: { value: 'water' } });
    expect(within(dialog).getByText('1人1日 合計3L（飲料1L＋調理2L）')).toBeInTheDocument();
    expect(within(dialog).getByText(/生活用水は3Lに含まれない/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /政府広報（飲料1L・調理2L）/ })).toBeInTheDocument();
    const purpose = within(dialog).getByLabelText('水の用途');
    expect(purpose).toBeRequired();
    expect(purpose).toHaveValue('');
    fireEvent.change(within(dialog).getByLabelText('品目名'), { target: { value: '用途を確認する水' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(screen.getByRole('dialog', { name: '備蓄品を追加' })).toBeInTheDocument();
    fireEvent.change(purpose, { target: { value: 'utility' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(screen.queryByRole('dialog', { name: '備蓄品を追加' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory.find((item) => item.name === '用途を確認する水')).toMatchObject({ waterPurpose: 'utility' });
  });

  it('目標日数の概算費用と年間予算から購入順を示す', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    expect(screen.getByText('7日目標まで')).toBeInTheDocument();
    const planHub = screen.getByRole('region', { name: '使う計画と、買う計画' });
    expect(within(planHub).getByText('年間予算')).toBeInTheDocument();
    expect(within(planHub).getByText('未設定')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '使う計画と、買う計画' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ローリングストック計画を開く' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
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

  it('携帯トイレの混合購入は必要部品と今年買う内訳を分けて表示する', () => {
    const saved = createDefaultState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.household = 1;
    saved.preparedness = { ...saved.preparedness, targetDays: 2, annualBudget: 150 };
    saved.inventory = [
      { id: 'water', productId: 'manual:water', name: '2L飲料水', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', quantity: 3, target: 3, volumeMl: 2000, price: 100 },
      { id: 'food', productId: 'manual:food', name: '保存食', category: 'food', unit: '食', quantity: 6, target: 6, foodWeightG: 150, price: 100 },
      { id: 'bag', productId: 'manual:bag', name: '非常用便袋', category: 'hygiene', unit: '枚', quantity: 5, target: 5, price: 20 },
      { id: 'gel', productId: 'manual:gel', name: '非常用凝固剤', category: 'hygiene', unit: '個', quantity: 0, target: 5, price: 30 },
      { id: 'kit', productId: 'manual:kit', name: '携帯トイレ', category: 'hygiene', unit: '回分', quantity: 0, target: 5, price: 40 },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メインナビゲーション' })).getByRole('button', { name: '備蓄' }));
    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
    const dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });

    expect(within(dialog).getByText('目標まで 非常用凝固剤 5個＋携帯トイレ 5回分・概算 ¥350')).toBeInTheDocument();
    const planned = within(dialog).getByText('非常用凝固剤 5個').closest('strong');
    expect(planned).toBeInTheDocument();
    expect(within(planned).getByText('¥150')).toBeInTheDocument();
  });

  it('年間予算の編集中はフォーカスを保ち、Escapeでは変更を破棄する', async () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    const trigger = screen.getByRole('button', { name: '防災予算計画を開く' });
    trigger.focus();
    fireEvent.click(trigger);
    let dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    let annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);

    annualBudget.focus();
    fireEvent.change(annualBudget, { target: { value: '123000' } });
    expect(annualBudget).toHaveValue(123000);
    await waitFor(() => expect(annualBudget).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '予算で、いつ何を揃えるか' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '使う計画と、買う計画' })).getByText('未設定')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);
    expect(annualBudget).toHaveValue(0);
  });

  it('年間予算は保存操作をした場合だけ確定する', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
    let dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    fireEvent.change(within(dialog).getByLabelText(/毎年の備蓄予算/), { target: { value: '12000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'この年間予算で保存' }));

    expect(screen.queryByRole('dialog', { name: '予算で、いつ何を揃えるか' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '使う計画と、買う計画' })).getByText('¥12,000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '防災予算計画を開く' }));
    dialog = screen.getByRole('dialog', { name: '予算で、いつ何を揃えるか' });
    expect(within(dialog).getByLabelText(/毎年の備蓄予算/)).toHaveValue(12000);
  });

  it('期限切れロットは消費ではなく廃棄として記録する', async () => {
    const saved = createSeededState();
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
    fireEvent.click(screen.getByRole('button', { name: 'ローリングストック計画を開く' }));

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

  it('備蓄カードから期限切れロットを減らす場合も廃棄理由を固定する', async () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = [{
      ...saved.inventory[0],
      id: 'expired-card-water',
      productId: 'manual:expired-card-water',
      name: 'カード上の期限切れ飲料水',
      quantity: 2,
      target: 2,
      expiry: '2000-01-01',
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    openInventoryCategory(/水分の備蓄を表示/);
    fireEvent.click(screen.getByRole('button', { name: 'カード上の期限切れ飲料水を消費・廃棄' }));

    const dialog = screen.getByRole('dialog', { name: 'カード上の期限切れ飲料水を記録' });
    expect(within(dialog).getByLabelText('理由')).toBeDisabled();
    expect(within(dialog).getByLabelText('理由')).toHaveValue('期限切れ・廃棄');
    expect(within(dialog).getByText(/食べた記録にせず/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '廃棄として記録する' }));

    expect(screen.getByRole('status')).toHaveTextContent('1本を記録しました');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).transactions[0]).toMatchObject({ type: 'discard', reason: '期限切れ・廃棄', quantityDelta: -1 }));
  });

  it('日付をまたいだ時は開いている消費画面も期限切れ廃棄へ切り替える', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59, 50));
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = [{
      ...saved.inventory[1],
      id: 'midnight-food',
      productId: 'manual:midnight-food',
      name: '日付境界の保存食',
      quantity: 1,
      target: 1,
      expiry: '2026-08-22',
    }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    openInventoryCategory(/食料の備蓄を表示/);
    fireEvent.click(screen.getByRole('button', { name: '日付境界の保存食を消費・廃棄' }));

    let dialog = screen.getByRole('dialog', { name: '日付境界の保存食を記録' });
    expect(within(dialog).getByLabelText('理由')).toBeEnabled();
    expect(within(dialog).getByLabelText('理由')).toHaveValue('日常消費');
    act(() => {
      vi.setSystemTime(new Date(2026, 7, 23, 0, 0, 1));
      window.dispatchEvent(new Event('focus'));
    });

    dialog = screen.getByRole('dialog', { name: '日付境界の保存食を記録' });
    expect(within(dialog).getByLabelText('理由')).toBeDisabled();
    expect(within(dialog).getByLabelText('理由')).toHaveValue('期限切れ・廃棄');
    fireEvent.click(within(dialog).getByRole('button', { name: '廃棄として記録する' }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).transactions[0]).toMatchObject({ type: 'discard', reason: '期限切れ・廃棄' });
  });

  it('同じ商品の旧ロットを消費した後も残りロットへ商品目標を移す', () => {
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = [
      { ...saved.inventory[1], id: 'old-food', productId: 'manual:shared-food', name: '共有目標の保存食', quantity: 10, target: 10, expiry: '2026-09-01' },
      { ...saved.inventory[1], id: 'new-food', productId: 'manual:shared-food', name: '共有目標の保存食', quantity: 10, target: 0, expiry: '2027-09-01' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    openInventoryCategory(/食料の備蓄を表示/);
    fireEvent.click(screen.getAllByRole('button', { name: '共有目標の保存食を消費・廃棄' })[0]);
    const dialog = screen.getByRole('dialog', { name: '共有目標の保存食を記録' });
    fireEvent.change(within(dialog).getByLabelText(/数量/), { target: { value: 10 } });
    fireEvent.click(within(dialog).getByRole('button', { name: '記録して在庫を減らす' }));

    const lots = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory.filter((item) => item.productId === 'manual:shared-food');
    expect(lots.map(({ quantity, target }) => ({ quantity, target }))).toEqual([
      { quantity: 0, target: 0 },
      { quantity: 10, target: 10 },
    ]);
  });

  it('同じバーコードの商品情報を直すと全期限ロットへ反映する', () => {
    const barcode = '4901234567894';
    const saved = createSeededState();
    saved.onboarding = { completed: true, completedAt: '2026-08-17T00:00:00.000Z' };
    saved.inventory = [
      { ...saved.inventory[0], id: 'water-a', productId: `gtin:${barcode}`, barcode, name: '誤登録の商品', quantity: 2, target: 4, expiry: '2027-01-01' },
      { ...saved.inventory[0], id: 'water-b', productId: `gtin:${barcode}`, barcode, name: '誤登録の商品', quantity: 2, target: 0, expiry: '2028-01-01', location: '別の棚' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    render(<App />);
    openInventoryCategory(/水分の備蓄を表示/);
    fireEvent.click(screen.getAllByRole('button', { name: '誤登録の商品を編集' })[0]);
    const dialog = screen.getByRole('dialog', { name: '備蓄品を編集' });
    fireEvent.change(within(dialog).getByLabelText('品目名'), { target: { value: '正しい保存食' } });
    fireEvent.change(within(dialog).getByLabelText('カテゴリ'), { target: { value: 'food' } });
    fireEvent.change(within(dialog).getByLabelText(/1単位あたりの食料重量/), { target: { value: 150 } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));

    const lots = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory.filter((item) => item.productId === `gtin:${barcode}`);
    expect(lots).toHaveLength(2);
    expect(lots.every((item) => item.name === '正しい保存食' && item.category === 'food' && item.foodWeightG === 150 && item.waterPurpose === undefined)).toBe(true);
    expect(lots.reduce((sum, item) => sum + item.target, 0)).toBe(4);
    expect(lots.find((item) => item.id === 'water-b').location).toBe('別の棚');
  });

  it('同じ商品の新しい期限ロットで直した商品情報を既存ロットにも反映する', () => {
    render(<App />);
    openInventoryCategory(/水分の備蓄を表示/);
    fireEvent.click(screen.getByRole('button', { name: '飲料水 500mlを新しい期限ロットとして補充' }));
    const dialog = screen.getByRole('dialog', { name: '新しい期限ロットを追加' });
    fireEvent.change(within(dialog).getByLabelText('品目名'), { target: { value: '生活用水 2L' } });
    fireEvent.change(within(dialog).getByLabelText('水の用途'), { target: { value: 'utility' } });
    fireEvent.change(within(dialog).getByLabelText(/1単位あたりの水量/), { target: { value: 2000 } });
    fireEvent.change(within(dialog).getByLabelText('重要度'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('単位'), { target: { value: '容器' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const original = saved.inventory.find((item) => item.id === 'water');
    const lots = saved.inventory.filter((item) => item.productId === original.productId);
    expect(lots).toHaveLength(2);
    expect(lots.every((item) => item.name === '生活用水 2L'
      && item.category === 'water'
      && item.waterPurpose === 'utility'
      && item.volumeMl === 2000
      && item.tier === 2
      && item.unit === '容器')).toBe(true);
    expect(lots.reduce((sum, item) => sum + item.target, 0)).toBe(24);
    expect(lots.find((item) => item.id === 'water').expiry).not.toBe('');
    expect(lots.find((item) => item.id !== 'water').expiry).toBe('');
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

  it('不足通知から新しい期限ロットとして補充できる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /通知一覧を開く/ }));
    fireEvent.click(screen.getByRole('button', { name: '15回分補充' }));
    const dialog = screen.getByRole('dialog', { name: '新しい期限ロットを追加' });
    expect(within(dialog).getByLabelText('在庫数')).toHaveValue(15);
    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    expect(screen.getByRole('status')).toHaveTextContent('新しい期限ロットを追加しました');
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const lots = saved.inventory.filter((item) => item.name === '携帯トイレ');
    expect(lots.map((item) => item.quantity)).toEqual([20, 15]);
    expect(new Set(lots.map((item) => item.productId)).size).toBe(1);
    expect(lots.reduce((sum, item) => sum + item.target, 0)).toBe(35);
    expect(lots.map((item) => item.target)).toEqual([20, 15]);
    fireEvent.click(screen.getByRole('button', { name: /通知一覧を開く/ }));
    expect(screen.queryByRole('button', { name: '15回分補充' })).not.toBeInTheDocument();
  });

  it('別の登録済みバーコードへ切り替えると商品設定のみを読み込む', async () => {
    const sourceBarcode = '4901234567894';
    const destinationBarcode = '4909876543210';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      inventory: [
        {
          id: 'source-lot', productId: `gtin:${sourceBarcode}`, barcode: sourceBarcode,
          name: '携帯トイレA', category: 'hygiene', unit: '回分', tier: 1,
          quantity: 20, target: 35, price: 110, expiry: '2030-01-02', packingVolumeMl: 120,
          location: '押入れA', rotationEnabled: true, rotationLeadDays: 10,
          replenishmentPriority: 'high', replenishBy: '2026-12-01', purchaseFrom: '店A',
          lastChecked: '2026-07-01', nextCheck: '2026-08-01',
        },
        {
          id: 'destination-lot', productId: `gtin:${destinationBarcode}`, barcode: destinationBarcode,
          name: '保存水B', category: 'water', waterPurpose: 'drinking-cooking', unit: '本', tier: 2,
          quantity: 12, target: 12, price: 148, expiry: '2031-04-05', volumeMl: 500, packingVolumeMl: 650,
          location: '玄関右棚', rotationEnabled: false, rotationLeadDays: 45,
          replenishmentPriority: 'low', replenishBy: '2027-02-03', purchaseFrom: '近所のスーパー',
          lastChecked: '2025-01-01', nextCheck: '2025-02-01',
        },
      ],
    }));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /通知一覧を開く/ }));
    fireEvent.click(screen.getByRole('button', { name: '15回分補充' }));
    const dialog = screen.getByRole('dialog', { name: '新しい期限ロットを追加' });
    fireEvent.click(within(dialog).getByRole('button', { name: /バーコードから入力/ }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'バーコード番号' }), { target: { value: destinationBarcode } });
    fireEvent.click(within(dialog).getByRole('button', { name: '商品を検索' }));

    expect(await within(dialog).findByText('登録済みの商品情報を端末から読み込みました。')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('品目名')).toHaveValue('保存水B');
    expect(within(dialog).getByLabelText('カテゴリ')).toHaveValue('water');
    expect(within(dialog).getByLabelText('水の用途')).toHaveValue('drinking-cooking');
    expect(within(dialog).getByLabelText('在庫数')).toHaveValue(1);
    expect(within(dialog).getByLabelText('目標数')).toHaveValue(12);
    expect(within(dialog).getByLabelText('単位')).toHaveValue('本');
    expect(within(dialog).getByLabelText('重要度')).toHaveValue('2');
    const expiry = within(dialog).getByLabelText('期限または交換日');
    expect(expiry).toHaveValue('');
    expect(expiry).toBeRequired();
    fireEvent.change(expiry, { target: { value: '2032-01-01' } });
    expect(within(dialog).getByLabelText('単価（円）')).toHaveValue(148);
    expect(within(dialog).getByLabelText(/1単位あたりの収納容量/)).toHaveValue(650);
    expect(within(dialog).getByLabelText('保管場所')).toHaveValue('玄関右棚');
    expect(within(dialog).getByLabelText('期限順の消費候補に含める')).not.toBeChecked();
    expect(within(dialog).getByLabelText('期限の何日前から消費候補にするか')).toHaveValue(45);
    expect(within(dialog).getByLabelText('優先度')).toHaveValue('low');
    expect(within(dialog).getByLabelText('補充期限')).toHaveValue('2027-02-03');
    expect(within(dialog).getByLabelText('購入先候補')).toHaveValue('近所のスーパー');

    fireEvent.click(within(dialog).getByRole('button', { name: '保存する' }));
    await waitFor(() => {
      const lots = JSON.parse(localStorage.getItem(STORAGE_KEY)).inventory.filter((entry) => entry.barcode === destinationBarcode);
      expect(lots).toHaveLength(2);
      const newLot = lots.find((entry) => entry.id !== 'destination-lot');
      expect(newLot).toMatchObject({
        productId: `gtin:${destinationBarcode}`, quantity: 1, expiry: '2032-01-01', waterPurpose: 'drinking-cooking',
        unit: '本', tier: 2, price: 148, packingVolumeMl: 650, location: '玄関右棚',
        rotationEnabled: false, rotationLeadDays: 45, replenishmentPriority: 'low',
        replenishBy: '2027-02-03', purchaseFrom: '近所のスーパー',
      });
      expect(newLot.lastChecked).not.toBe('2025-01-01');
      expect(newLot.nextCheck).not.toBe('2025-02-01');
      expect(lots.reduce((sum, entry) => sum + entry.target, 0)).toBe(12);
    });
  });

  it('同じバーコードは補充数を保ち、未登録コードへの切替でロット固有値を初期化する', async () => {
    const sourceBarcode = '4901234567894';
    const unknownBarcode = '3017620422003';
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...createDefaultState(),
      onboarding: { completed: true, completedAt: '2026-08-17T00:00:00.000Z' },
      inventory: [{
        id: 'source-lot', productId: `gtin:${sourceBarcode}`, barcode: sourceBarcode,
        name: '携帯トイレA', category: 'hygiene', unit: '回分', tier: 2,
        quantity: 20, target: 35, price: 110, expiry: '2030-01-02', packingVolumeMl: 120,
        location: '押入れA', rotationEnabled: false, rotationLeadDays: 9,
        replenishmentPriority: 'low', replenishBy: '2026-12-01', purchaseFrom: '店A',
        lastChecked: '2026-07-01', nextCheck: '2026-08-01',
      }],
    }));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /通知一覧を開く/ }));
    fireEvent.click(screen.getByRole('button', { name: '15回分補充' }));
    const dialog = screen.getByRole('dialog', { name: '新しい期限ロットを追加' });
    fireEvent.click(within(dialog).getByRole('button', { name: /バーコードから入力/ }));
    const barcodeInput = within(dialog).getByRole('textbox', { name: 'バーコード番号' });

    fireEvent.click(within(dialog).getByRole('button', { name: '商品を検索' }));
    expect(await within(dialog).findByText('登録済みの商品情報を端末から読み込みました。')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('在庫数')).toHaveValue(15);
    expect(within(dialog).getByLabelText('保管場所')).toHaveValue('押入れA');
    expect(within(dialog).getByLabelText('期限順の消費候補に含める')).not.toBeChecked();
    expect(within(dialog).getByLabelText('優先度')).toHaveValue('low');

    fireEvent.change(barcodeInput, { target: { value: unknownBarcode } });
    fireEvent.click(within(dialog).getByRole('button', { name: '商品を検索' }));
    expect(await within(dialog).findByText('オフラインで保存済みの商品情報が見つかりません。番号を保持して手入力できます。')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('品目名')).toHaveValue('');
    expect(within(dialog).getByLabelText('カテゴリ')).toHaveValue('');
    expect(within(dialog).getByLabelText('在庫数')).toHaveValue(1);
    expect(within(dialog).getByLabelText('目標数')).toHaveValue(3);
    expect(within(dialog).getByLabelText('単位')).toHaveValue('個');
    expect(within(dialog).getByLabelText('重要度')).toHaveValue('1');
    expect(within(dialog).getByLabelText('期限（任意）')).toHaveValue('');
    expect(within(dialog).getByLabelText('単価（円）')).toHaveValue(0);
    expect(within(dialog).getByLabelText(/1単位あたりの収納容量/)).toHaveValue(0);
    expect(within(dialog).getByLabelText('保管場所')).toHaveValue('');
    expect(within(dialog).getByLabelText('期限順の消費候補に含める')).toBeChecked();
    expect(within(dialog).getByLabelText('期限の何日前から消費候補にするか')).toHaveValue(30);
    expect(within(dialog).getByLabelText('優先度')).toHaveValue('high');
    expect(within(dialog).getByLabelText('補充期限')).toHaveValue('');
    expect(within(dialog).getByLabelText('購入先候補')).toHaveValue('');
    expect(within(dialog).getByLabelText('メモ')).toHaveValue('');
  });

  it('備蓄検索は支援技術から名前で特定できる', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '自宅の備蓄情報を開く' }));
    fireEvent.click(screen.getByRole('button', { name: /水分の備蓄を表示/ }));
    expect(screen.getByRole('textbox', { name: '備蓄品を検索' })).toBeInTheDocument();
  });

  it('ミッション完了後は次のミッション見出しへフォーカスする', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /備えの進捗 .* の詳細を開く/ }));
    fireEvent.click(screen.getAllByRole('button', { name: '地域の災害リスクを確認を達成にする' })[0]);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'いまは、これだけ' })).toHaveFocus());
  });
});
