// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';
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

  it('家族人数はオプションから変更できる', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: '家族人数を増やす' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'オプションを開く' }));
    fireEvent.click(screen.getByRole('button', { name: '家族人数を1人増やす' }));
    fireEvent.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByLabelText('家族3人')).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: '避難バッグを自動で準備' }));
    expect(window.location.hash).toBe('#/bags');
    expect(screen.getByRole('heading', { name: '避難バッグを自動で準備' })).toBeInTheDocument();
    expect(screen.getByText('一時避難を先に確保し、二次避難には残りの在庫を割り当てます。期限が近く、重要度の高い備蓄を優先します。')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /自動選定結果を開く/ })).toHaveLength(2);

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    expect(within(desktopNavigation).getByRole('button', { name: '避難バッグ' })).toHaveAttribute('aria-current', 'page');
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

  it('備蓄不足を一般的な商品の個数で表示する', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '備蓄' }));
    expect(screen.getByRole('heading', { name: '目標まで、実物であといくつ？' })).toBeInTheDocument();
    const dailyGuide = screen.getByLabelText('1人1日あたりの備蓄目安');
    expect(within(dailyGuide).getByText('合計3L')).toBeInTheDocument();
    expect(within(dailyGuide).getByText('飲料1L＋調理2L')).toBeInTheDocument();
    expect(within(dailyGuide).getByText('3食')).toBeInTheDocument();
    expect(within(dailyGuide).getByText('1人1週間 35回分')).toBeInTheDocument();
    expect(within(dailyGuide).getByRole('link', { name: /政府広報（飲料1L・調理2L）/ })).toBeInTheDocument();
    expect(within(dailyGuide).getByRole('link', { name: /経済産業省（35回分／週）/ })).toBeInTheDocument();
    expect(screen.getByText('2Lペットボトル')).toBeInTheDocument();
    expect(screen.getByText('一般的なカセットボンベ')).toBeInTheDocument();
    expect(screen.getByText('家庭用1台')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '備蓄品を追加' }));
    const dialog = screen.getByRole('dialog', { name: '備蓄品を追加' });
    expect(within(dialog).getByText('1人1日 3食')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('カテゴリ'), { target: { value: 'water' } });
    expect(within(dialog).getByText('1人1日 合計3L（飲料1L＋調理2L）')).toBeInTheDocument();
    expect(within(dialog).getByText(/生活用水は3Lに含まれない/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /政府広報（飲料1L・調理2L）/ })).toBeInTheDocument();
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

  it('緊急メモは閲覧情報と行動計画を編集フォームより先に表示する', () => {
    render(<App />);
    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '緊急メモ' }));
    const readout = screen.getByRole('region', { name: '登録済みの緊急連絡情報' });
    const actionPlan = screen.getByRole('heading', { name: 'わが家の72時間行動計画' }).closest('section');
    const editor = screen.getByText('緊急メモを編集する').closest('details');
    expect(readout.compareDocumentPosition(actionPlan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actionPlan.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('72時間と衛生1か月の備蓄目安を関連箇所の補足で確認できる', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'トイレ・非常用電源も確認' }));
    fireEvent.click(screen.getByRole('button', { name: '衛生備蓄1か月の目安' }));
    let dialog = screen.getByRole('dialog', { name: '衛生用品は1か月を目安に' });
    expect(within(dialog).getByText('目標：30日分')).toBeInTheDocument();
    expect(within(dialog).getByText(/水道の復旧には、およそ1週間から1か月/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '目安の説明を閉じる' }));

    const desktopNavigation = screen.getByRole('navigation', { name: 'メインナビゲーション' });
    fireEvent.click(within(desktopNavigation).getByRole('button', { name: '緊急メモ' }));
    fireEvent.click(screen.getByRole('button', { name: '黄金の72時間の説明' }));
    dialog = screen.getByRole('dialog', { name: '命をつなぐ72時間' });
    expect(within(dialog).getByText('目標：72時間以上')).toBeInTheDocument();
    expect(within(dialog).getByText(/黄金の72時間/)).toBeInTheDocument();
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
