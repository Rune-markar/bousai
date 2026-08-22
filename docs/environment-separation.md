# ローカル環境とデモ環境の分離

## 境界

| 対象 | ローカル | デモ |
| --- | --- | --- |
| Vite mode | `local-app` | `demo` |
| 開発ポート | `5173` | `5174` |
| Node配信ポート | `4173` | `4174` |
| ビルド出力 | `dist/` | `dist-demo/` |
| ブラウザ保存キー | `sonae-note-state-v1` | `sonae-note-demo-state-v1` |
| Nodeアプリ内API | 有効 | 無効 |
| 商品検索 | 同一オリジンAPIを優先 | Open Food Factsへ直接接続 |
| PWAキャッシュ接頭辞 | `sonae-note-local` | `sonae-note-demo` |

ローカル環境は従来の保存キーを維持するため、既存データをそのまま読み込みます。デモ環境は従来キーを読まず、デモ専用キーだけを読み書きします。環境を間違えた場合にローカルへ暗黙フォールバックしないよう、未定義の環境名はビルドを失敗させます。

## 実行

別々のターミナルで同時に起動できます。

```text
npm run dev:local
npm run dev:demo
```

本番相当の静的成果物とNode配信も分かれます。

```text
npm run build:local && npm run start:local
npm run build:demo && npm run start:demo
```

GitHub Pagesは `.github/workflows/deploy-pages.yml` からデモビルドだけを公開します。

## 設定の扱い

- ブラウザへ公開してよい値だけを `VITE_` 接頭辞の変数にします。秘密情報は置きません。
- `APP_BASE` は配信パス、`PUBLIC_URL` はQRコード候補、`APP_CONTACT_URL` はNode側の商品API識別子です。
- デモ用の非秘密設定は `.env.demo` で管理します。端末固有値や秘密情報はコミットしません。
- 同じホストへ両環境を配置する場合は、オリジンまたは `APP_BASE` を分けます。Service Workerのスコープまで完全に分離するため、同じオリジン・同じパスへ両方を配置しません。

新しい環境を増やす場合は、`src/appEnvironment.js` のプロファイル、Viteの出力先・ポート、サーバーのAPI可否、CIの配信先を一組として追加します。
