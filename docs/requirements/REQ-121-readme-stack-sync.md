# REQ-121: README を Next.js 15 / React 19 / Supabase SSR の現行スタックに合わせて全面更新する

## 背景
ザリダスは Vite + React Router + React 18 + React Helmet 構成から Next.js 15 App Router + React 19 + Supabase SSR + Sentry へ移行済み。実装・CI・デプロイ設定はすべて Next.js を前提に動いているが、`README.md` は Vite 時代のままで止まっている。新規開発者のオンボーディングと、本人（数か月後）の引き継ぎで確実に混乱を生む。

## 現状の問題

### 1. 技術スタック表が完全に旧構成
`README.md:45-58` の表は以下の通り、現実と乖離：

| README 記述 | 実装 |
|---|---|
| React 18 | React 19.1（package.json:40） |
| React Router v6 | Next.js 15 App Router（next 15.3.4） |
| Vite 5（ビルド） | Next.js（`next build`） |
| React Helmet Async（SEO） | App Router の Metadata API（`generateMetadata`） |
| vite-plugin-pwa | `scripts/build-sw.mjs` + `public/sw.js.tpl` |

### 2. 環境変数が `VITE_*` のまま
`README.md:88-91` で `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を案内しているが、実際は `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`。`.env.example` は既に `NEXT_PUBLIC_*` に更新済みなので、README だけが古い。

### 3. 開発サーバー URL が間違っている
`README.md:107` で `http://localhost:5173` を案内（Vite のデフォルト）。Next.js は `http://localhost:3000`。

### 4. npm スクリプト表が不完全
`README.md:139-146` の表に以下が未記載：
- `npm run e2e` / `npm run e2e:install`（Playwright）
- `npm run type-check`
- `npm run size`（size-limit）
- `npm run analyze`（bundle-analyzer）
- `npm run i18n:check`
- `npm run eval:ai` / `npm run cost:ai`
- `npm run build:sw`（および `predev`/`prebuild` で SW を自動ビルドする挙動）

### 5. ディレクトリ構成が古い
`README.md:171-194` で `src/pages/` を案内しているが、実体は `src/app/`（App Router）+ `src/views/`（実装本体）+ `src/app/**/*Client.tsx`（'use client' 再エクスポート）。`AuthContext` 以外に `ToastContext` `MapSettingsContext` も存在。

### 6. Edge Functions の説明が `notify-comment` のみ
`README.md:198-209` は `notify-comment` のみ記載だが、実装は以下が並行稼働：
- `analyze-image`（Gemini API で写真判定）
- `analyze-audio`（鳴き声判定）
- `notify-comment` / `notify-post-status` / `notify-survey-request`

必要な環境変数も `GEMINI_API_KEY` 等が抜けている。

### 7. デプロイ設定の記述が古い
`README.md:152` で `vercel.json` に「セキュリティヘッダ、SPA リライト、`/api/sitemap` ルーティング」と書いているが、現行 `vercel.json` は `{ "framework": "nextjs", "git": { "deploymentEnabled": false } }` のみ。セキュリティヘッダは `next.config.ts` の `headers()` に移行済み。SPA リライトは不要（App Router）、`/api/sitemap` も `app/sitemap.ts` に置換済み。

### 8. Sentry / GTM / Google Analytics の記述がない
`next.config.ts` で `withSentryConfig`、`layout.tsx` で GTM Script を読み込んでいるが、README にも `.env.example` の説明にも触れていない。新規セットアップ時に「DSN 未設定で動くのか」の判断ができない。

## 目的
- README を読めば「現行スタックを再現できる」状態にする。
- 新規開発者が `git clone` → `.env.example` コピー → `npm install` → `npm run dev` の順で迷わず立ち上げられる。
- Sentry・Google Analytics・Edge Functions などのオプション機能を「未設定でも動くのか」「本番で必須か」が一目で分かる。

## 要件

### 機能要件
- [ ] FR-121-01: 技術スタック表（README.md:45-58）を Next.js 15 / React 19 / App Router / Supabase SSR / Sentry / Tailwind 3 / Playwright / size-limit / Vitest 4 に更新する。
- [ ] FR-121-02: セットアップ章の環境変数を `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` に修正し、ポートを `http://localhost:3000` に修正する。
- [ ] FR-121-03: npm スクリプト表に以下を追加し、`predev` / `prebuild` で `scripts/build-sw.mjs` が自動実行される旨を補足する：
  - `dev`, `build`, `start`, `lint`, `test`, `test:watch`, `test:coverage`, `type-check`, `e2e`, `e2e:install`, `size`, `analyze`, `i18n:check`, `eval:ai`, `cost:ai`, `build:sw`
- [ ] FR-121-04: ディレクトリ構成を現行に合わせて書き直す。`src/app/`（ルート）/ `src/views/`（実装本体）/ `src/app/**/*Client.tsx`（'use client' 再エクスポート）/ `src/lib/supabase/{client,server,middleware}.ts` の三分化など。
- [ ] FR-121-05: Edge Functions 章を以下 5 関数に拡張：`analyze-image`, `analyze-audio`, `notify-comment`, `notify-post-status`, `notify-survey-request`。各関数の必要 env と発火条件（DB Webhook / 直接呼び出し）を 1 行ずつ記載。
- [ ] FR-121-06: Sentry セットアップを「DSN 未設定で dev/preview は動く」「本番は SENTRY_AUTH_TOKEN を Vercel に設定」と書く（`next.config.ts:91-101` の挙動と一致）。
- [ ] FR-121-07: GTM/GA セットアップを「`NEXT_PUBLIC_GTM_ID` 未設定なら GTM タグを出さない」と書く（`layout.tsx:64-76` の挙動と一致）。
- [ ] FR-121-08: デプロイ章から `public/_redirects`（Netlify 用）と `/api/sitemap` の旧説明を撤去する。Vercel が `next.config.ts` のセキュリティヘッダと App Router を直接配信する旨に書き換える。
- [ ] FR-121-09: `.env.example` に未記載の env があれば追加（`NEXT_PUBLIC_AI_INPUT_COMPRESSION_ENABLED` など、コードから grep して洗い出す）。
- [ ] FR-121-10: 機能一覧（README.md:9-41）の「匿名投稿にも対応」を削除（REQ-120 と整合）。

### 非機能要件
- [ ] NFR-121-01: README.md の Markdown が CI で lint されるなら lint 違反ゼロ。
- [ ] NFR-121-02: README に書かれたコマンドはすべて実機で動作確認済み（書いて終わりにしない）。

## 受入条件
- [ ] AC-01: README.md に `Vite` / `React Router` / `React Helmet` / `vite-plugin-pwa` の文字列が残っていない。
- [ ] AC-02: README.md に `localhost:5173` が残っていない。
- [ ] AC-03: README.md に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` が残っていない（`.env.example` の旧サンプルを参照する記述も含む）。
- [ ] AC-04: 新規 clone から README 通りの手順で `npm run dev` がエラーなく起動し、`/` が表示される（クリーンな環境で確認）。
- [ ] AC-05: README に列挙された npm スクリプトが `package.json` の scripts と一致している。
- [ ] AC-06: Sentry 章の記述と `next.config.ts:91-101` / `sentry.*.config.ts` の挙動が矛盾しない。

## 影響範囲
- 変更対象ファイル
  - `README.md`（全面改訂）
  - `.env.example`（差分があれば追記、削除はしない）
- 影響しないこと
  - 実装コード一切。

## 優先度
- **緊急度**: High
- **重要度**: High
- **理由**: ドキュメント乖離は時限爆弾。セットアップに失敗した開発者が `VITE_*` で env を作って動かない理由を探す時間は、本来不要なコスト。実装変更ゼロで済むため、いつでも単独 PR で完結する。
