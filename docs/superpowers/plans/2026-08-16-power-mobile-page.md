# 停電時電力エコシステム専用ページ Implementation Plan

> **For agentic workers:** Implement each task with a failing test first, a focused implementation, fresh verification, and a task commit. A later task may depend only on the interfaces documented below.

**Goal:** ホームから開く専用電力ページを設け、スマートフォンでは主要操作と結果を下部ナビゲーション込みの一画面に収める。

**Architecture:** 既存の `power.js` と `state.powerPlan` を変更せず、`PowerEcosystem.jsx` を専用ページコンポーネントへ再構成する。`App.jsx` はホームカードと `power` ページ遷移だけを担当し、補足情報はコンポーネント内の共通ボトムシートで表示する。

**Tech Stack:** React 19、Vitest 4、Testing Library、CSS、Vite 8、Playwright CLI

## Global Constraints

- メインナビゲーションの5項目は変更しない。
- `state.powerPlan`、`normalizePowerPlan`、`calculatePowerSystem`、価格ベンチマークの形式を変更しない。
- 幅390pxではドキュメント全体の縦横スクロールを発生させず、低い画面では主操作領域だけ内部縦スクロールを許可する。
- 既存の注意事項とメーカー価格比較を削除せず、関連する「？」の補助シートへ移す。
- すべての新しい操作はキーボードと支援技術から利用できる名前と状態を持つ。

---

### Task 1: ホーム導線と専用ページルート

**Files:**
- Create: `src/App.navigation.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/PowerEcosystem.jsx`

**Interfaces:**
- `PowerEcosystem({ plan, onChange, onBack })`：保存済み計画を受け取り、正規化済み計画を `onChange` へ返し、戻る操作で `onBack()` を呼ぶ。
- `Dashboard({ ..., setPage })`：ホームカードから `setPage('power')` を呼ぶ。

- [ ] **Step 1: 導線の失敗テストを書く**

  `src/App.navigation.test.jsx` に `// @vitest-environment jsdom` を付け、`localStorage.clear()` と `window.scrollTo = vi.fn()` を準備する。ホームの「停電時の電力を設計」を押すと見出し「停電時の電力設計」と戻るボタンが表示され、戻ると「今日のそなえ状況」が再表示されることを Testing Library で検証する。

- [ ] **Step 2: テストが導線未実装で失敗することを確認する**

  Run: `npx vitest run src/App.navigation.test.jsx`

  Expected: 「停電時の電力を設計」ボタンが見つからず FAIL。

- [ ] **Step 3: 最小の専用ルートを実装する**

  `Dashboard` に電力設計カードを追加し、`App` に `page === 'power'` の描画分岐を追加する。`PreparednessRoadmap` から埋め込み `PowerEcosystem` を削除する。`PowerEcosystem` に `onBack` と専用ページ見出し・戻るボタンを追加する。

- [ ] **Step 4: 導線テストと既存電力計算テストを通す**

  Run: `npx vitest run src/App.navigation.test.jsx src/power.test.js`

  Expected: 全テスト PASS。

- [ ] **Step 5: Task 1をコミットする**

  `git add src/App.navigation.test.jsx src/App.jsx src/PowerEcosystem.jsx && git commit -m "feat: add dedicated power planner route"`

---

### Task 2: 3タブ操作と補助シート

**Files:**
- Create: `src/PowerEcosystem.test.jsx`
- Modify: `src/PowerEcosystem.jsx`

**Interfaces:**
- タブIDは `devices`、`battery`、`solar` とし、タブ名は「機器」「蓄電池」「太陽光」とする。
- ヘルプ内容IDは `battery-capacity`、`battery-output`、`battery-price`、`solar-generation`、`solar-price`、`device-detail` とする。
- 共通補助シートは `role="dialog"` と `aria-modal="true"` を持ち、閉じるボタン、背景押下、Escapeで閉じる。

- [ ] **Step 1: タブと機器変更の失敗テストを書く**

  `src/PowerEcosystem.test.jsx` で既定計画を描画し、3つのタブ、選択状態、蓄電池・太陽光の切り替え、スマートフォンを増やした際の `onChange`、日数・日照時間の変更を実コンポーネントで検証する。

- [ ] **Step 2: テストが旧レイアウトのため失敗することを確認する**

  Run: `npx vitest run src/PowerEcosystem.test.jsx`

  Expected: `role="tab"` が存在せず FAIL。

- [ ] **Step 3: 3タブと固定結果情報を実装する**

  `PowerEcosystem.jsx` を共通条件バー、タブリスト、選択中パネル、結果バーへ分割する。機器タブは8枚のカードを横並びにし、各カード内に減算・加算を置く。蓄電池・太陽光タブは必要量と推奨値を主表示する。機器0台では0表示と機器追加を促す文を表示する。

- [ ] **Step 4: ヘルプシートの失敗テストを書く**

  容量の「？」が容量説明を、太陽光の「？」が発電条件を開くこと、別内容が混在しないこと、閉じるボタンとEscapeで閉じることを追加検証する。

- [ ] **Step 5: テストがヘルプ未実装で失敗することを確認する**

  Run: `npx vitest run src/PowerEcosystem.test.jsx`

  Expected: 対応するヘルプボタンまたはdialogが見つからず FAIL。

- [ ] **Step 6: 共通ヘルプシートを実装する**

  計算損失、使用可能率と予備、医療機器、起動電力、価格確認日、メーカーリンクを内容別に整理する。詳細モードの想定W・実測W・使用時間編集も `device-detail` シートへ置く。外部リンクは `target="_blank" rel="noreferrer"` を維持する。

- [ ] **Step 7: コンポーネントと計算テストを通す**

  Run: `npx vitest run src/PowerEcosystem.test.jsx src/power.test.js`

  Expected: 全テスト PASS、React警告なし。

- [ ] **Step 8: Task 2をコミットする**

  `git add src/PowerEcosystem.test.jsx src/PowerEcosystem.jsx && git commit -m "feat: compact power planner into three tabs"`

---

### Task 3: 一画面レスポンシブUIと回帰検証

**Files:**
- Modify: `src/styles.css`
- Modify: `src/App.navigation.test.jsx`
- Modify: `README.md`

**Interfaces:**
- 専用ページルートの最上位クラスは `.power-page`。
- 固定結果バーは `.power-results-dock`、内部スクロール領域は `.power-tab-viewport`、横送り列は `.power-device-rail`。
- 幅850px以下では `.app-shell.power-active` または同等のページ状態クラスを使い、専用ページ表示中だけドキュメントスクロールを抑止する。

- [ ] **Step 1: ページ状態クラスの失敗テストを書く**

  専用ページ表示時にアプリ外枠が電力専用状態クラスを持ち、戻ると外れることを `src/App.navigation.test.jsx` へ追加する。

- [ ] **Step 2: テストが状態クラス未実装で失敗することを確認する**

  Run: `npx vitest run src/App.navigation.test.jsx`

  Expected: 専用状態クラスが存在せず FAIL。

- [ ] **Step 3: レスポンシブCSSを実装する**

  `.power-page` を利用可能高さいっぱいのgridにし、見出し・条件・タブ・結果バーを固定行、`.power-tab-viewport` を `minmax(0, 1fr)` とする。390pxではドキュメントの縦横overflowを抑え、カード列だけ `overflow-x:auto` と `scroll-snap-type:x mandatory` を使う。低い画面は `.power-tab-viewport` のみ `overflow-y:auto` とする。ヘルプは下部シートとして表示する。PCは広いレイアウトへ展開する。

- [ ] **Step 4: READMEの機能説明を専用ページ仕様へ更新する**

  電力エコシステムの項目へ、ホームから開く専用3タブページ、補足シート、スマートフォン一画面設計を追記する。

- [ ] **Step 5: 全自動検証を実行する**

  Run: `npm run check`

  Expected: 全VitestテストPASS、Vite build exit 0。

- [ ] **Step 6: 実ブラウザで390pxとPCを確認する**

  `npm run dev -- --port 40001` を非表示で起動し、Playwright CLIでホームから専用ページへ遷移する。390x844で `scrollWidth === clientWidth`、`scrollHeight === clientHeight`、結果バーと下部ナビが同時表示されること、8機器へフォーカスまたは横送りで到達できること、各タブと「？」シートを確認する。高さ667pxでページ全体は固定され主操作領域のみスクロールすること、1280x800で崩れがないことも確認し、最後にブラウザとサーバーを終了する。

- [ ] **Step 7: Task 3をコミットする**

  `git add src/styles.css src/App.navigation.test.jsx README.md && git commit -m "style: fit power planner within mobile viewport"`

---

### Final Review and Integration

- [ ] 仕様書の全要件を差分へ対応付ける。
- [ ] `npm run check` を新たに実行して出力を確認する。
- [ ] `git diff --check` と `git status --short` を確認する。
- [ ] featureブランチをmainへfast-forward可能な形で統合する。
- [ ] mainで `npm run check` と `origin/main...HEAD` を確認する。pushは行わない。
- [ ] worktreeとfeatureブランチを削除し、一時的に追加した `.worktrees/` 除外だけを元へ戻す。他セッションの `.superpowers/` 変更は保持する。
