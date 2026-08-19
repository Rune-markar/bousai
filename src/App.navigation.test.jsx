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

  it('命と衛生の必須条件を平均点より先に案内する', () => {
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
    const referenceScore = screen.getByText('備えの進捗（参考）').closest('article');
    expect(priorities.compareDocumentPosition(referenceScore) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(priorities).getByRole('button', { name: '危険と避難先を確認する' }));
    expect(window.location.hash).toBe('#/roadmap');
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
    const dialog = screen.getByRole('dialog', { name: '年間予算で購入順を決める' });
    expect(within(dialog).getByRole('heading', { name: '今年、何から買うか' })).toBeInTheDocument();
    expect(within(dialog).getByText('飲料水 500ml')).toBeInTheDocument();
    expect(within(dialog).getByText('アルファ米')).toBeInTheDocument();
    const annualBudget = within(dialog).getByLabelText(/毎年の備蓄予算/);
    fireEvent.change(annualBudget, { target: { value: '10000' } });
    expect(annualBudget).toHaveValue(10000);
    expect(within(dialog).getAllByText('今年買う').length).toBeGreaterThan(0);
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

    fireEvent.click(screen.getByRole('button', { name: /内訳と不足を確認/ }));
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
