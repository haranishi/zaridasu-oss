# REQ-161: 旧 Vite ビルド成果物・サーバーレス関数の残存除去

## 背景
ザリダスは元々 Vite + React SPA として構築されており、現在は Next.js 15 App Router（`src/app/`）へ移行済みである。デプロイは Vercel（`vercel.json` で `"framework": "nextjs"`）で行われる。移行前の Vite 時代の成果物・スクリプトがリポジトリ内に残存している。

## 現状の問題
リポジトリルートに以下の旧 Vite 関連ファイル/ディレクトリが残っている。

### 1. `dist/`（旧 SPA ビルド成果物）
- `dist/index.html`、`dist/assets/`、`dist/sw.js`、`dist/workbox-0b0dccde.js`、`dist/sitemap.xml`、`dist/manifest.webmanifest`、`dist/registerSW.js`、`dist/_redirects`、`dist/og-image.*`、`dist/icon-*.svg`、`dist/images/` 等を含む（`Mar 20` 付の旧ビルド）。
- `.gitignore` に `dist/`（「ビルド成果物」セクション）が登録されており、`git ls-files dist/` の結果は 0 件。つまり **Git 追跡対象外**で、ローカル作業ツリーにのみ残存している。
- 現行 Next.js のビルド出力は `.next/`（`.gitignore` 済み）であり、`dist/` は Next.js では生成・参照されない。

### 2. `api/sitemap.js` / `api/prerender.js`（旧 Vercel サーバーレス関数）
- `git ls-files api/` の結果、両ファイルとも **Git 追跡対象**（コミット済み）。
- `api/sitemap.js` は Vite 時代の env (`process.env.VITE_APP_URL` / `process.env.VITE_SUPABASE_URL` / `process.env.VITE_SUPABASE_ANON_KEY`) を参照しており、Next.js では使用されない env プレフィックス。
- `api/sitemap.js:72` に `<loc>${BASE_URL}/api/sitemap?page=${i + 1}</loc>` という自己参照のみが存在し、`src/` 配下や `vercel.json` / `next.config.*` からは一切参照されていない（`grep` で `src/`・設定ファイルからの参照ゼロを確認済み）。
- 現行のサイトマップ機能は Next.js Metadata Route の `src/app/sitemap.ts` が担っており、`api/sitemap.js` は到達不能（dead route）。`api/prerender.js` も同様に現行コードから参照されていない。
- 関連既存課題: `docs/requirements/REQ-004-dead-prerender-route.md`（prerender ルートのデッドコード化）が既に起票されている。

## 目的
現行 Next.js 構成で参照されていない旧 Vite 成果物・サーバーレス関数を、参照ゼロを確認した上で安全に除去し、リポジトリとデプロイ表面積を縮小する。

## 要件
### 機能要件
- [ ] FR-161-01: ルートの `dist/` ディレクトリをローカル作業ツリーから削除する（`.gitignore` 済みのため Git 履歴への影響なし）。
- [ ] FR-161-02: `api/sitemap.js` を Git から削除する（`git rm`）。サイトマップは `src/app/sitemap.ts` に一本化する。
- [ ] FR-161-03: `api/prerender.js` を Git から削除する（REQ-004 とも整合させる）。削除後、`api/` ディレクトリが空になる場合はディレクトリごと除去する。
- [ ] FR-161-04: 削除前に、対象ファイル/パスへの参照が現行コード・設定に存在しないことを再確認する。確認対象は最低限: `src/**`、`vercel.json`、`next.config.*`、`package.json` の scripts、`public/**`、`robots.txt`、`middleware.ts`。
- [ ] FR-161-05: `.gitignore` に既に `dist/` があることを踏まえ、`api/`（追跡解除後に再生成不要なため）について ignore 追加が必要か検討し、必要なら追記する。

### 非機能要件（該当する場合）
- [ ] NFR-161-01: 削除後も `next build` が成功し、`/sitemap.xml`（Next.js が `src/app/sitemap.ts` から生成）が正しく出力されること。
- [ ] NFR-161-02: 本番サイトマップ URL の正規化を確認し、`/api/sitemap` への外部参照（robots.txt 等）が残っていないこと。

## 受入条件
- [ ] AC-01: 削除実行前に、`grep -rn "api/sitemap\|api/prerender\|/dist/"` を `src/`・`vercel.json`・`next.config.*`・`package.json`・`robots.txt` に対して実行し、自己参照（ファイル自身の内部記述）を除いて参照が 0 件であることをレポートに残している。
- [ ] AC-02: `dist/` がローカル作業ツリーに存在しない。
- [ ] AC-03: `api/sitemap.js` と `api/prerender.js` が Git 追跡から外れている（`git ls-files api/` が 0 件）。
- [ ] AC-04: `next build` が成功する。
- [ ] AC-05: ビルド成果物の `/sitemap.xml` が `src/app/sitemap.ts` 由来の内容（static / area / post / request / profile の各 URL）を返す。
- [ ] AC-06: Vercel プレビュー/本番で 404 や経路エラーが新たに発生しない（`/api/sitemap` への直アクセスが既存導線として残っていないことを含む）。

## 影響範囲
- ルート `dist/`（ローカルのみ、Git 追跡外）
- `api/sitemap.js`（Git 追跡、削除対象）
- `api/prerender.js`（Git 追跡、削除対象、REQ-004 と関連）
- `.gitignore`（必要に応じて `api/` の扱いを追記）
- `src/app/sitemap.ts`（削除後の唯一のサイトマップ生成元として動作確認）
- `vercel.json`（参照確認のみ。現状 `api/` への rewrite/routes 設定なし）

## 優先度
- **緊急度**: 低 / **重要度**: 低〜中 / **理由**: 機能には影響しないが、`VITE_*` env を参照する到達不能なサーバーレス関数が残ることで、誤った env 設定・混乱・潜在的な情報露出の温床になる。削除自体は低リスクだが「削除前の参照ゼロ確認」を必須手順として担保する必要がある。
