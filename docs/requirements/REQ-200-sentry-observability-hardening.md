# REQ-200: Sentry 可観測性の堅牢化（global-error.tsx 追加・非推奨/Turbopack 構成の是正）

## 背景
ザリダス (Next.js 15 App Router) は `@sentry/nextjs ^10.52.0`（`package.json:29`）でエラー監視を行う。初期化は `instrumentation.ts`（`src/instrumentation.ts`）から `sentry.server.config.ts` / `sentry.edge.config.ts` を `register()` で読み込み、クライアントは `sentry.client.config.ts` で `Sentry.init()` する構成。本番のみ `NEXT_PUBLIC_SENTRY_DSN` + `NODE_ENV === 'production'` で送信する。

この構成を実コードとビルド出力で確認したところ、(1) root layout 自身のクラッシュを捕捉できず Sentry にも残らない穴と、(2) 現バージョン / Turbopack 前提では非推奨・将来失効する設定が複数あり、いずれもビルド時に警告として実測される。本番の障害を「気づけない / 後で追えない」リスクに直結するため是正する。

実コードを確認した上での現状は以下の通り。

> 実装時の注意: 移行先 API（`disableLogger` の置換先・`instrumentation-client.ts` の有無）は `@sentry/nextjs` の **実際にインストールされているバージョン（現状 ^10.52.0）** の公式ドキュメント / 型定義で最終確認すること。本 REQ は v10 系を前提に記述するが、マイナー差で API 名が変わり得る。

## 現状の問題
（ファイルパス:行番号つき）

### 1. `global-error.tsx` が存在せず、root layout のクラッシュが白画面＋Sentry 未記録
- リポジトリに `src/app/global-error.tsx` が**存在しない**（`ls src/app/global-error.tsx` で不在を確認）。
- `src/app/error.tsx` は存在するが、これは App Router の仕様上「配下セグメントのエラー境界」であり、**`src/app/layout.tsx` 自身（および `src/app/providers.tsx`）の描画中に発生したエラーは捕捉できない**。
- `src/app/layout.tsx` 直下の `Providers`（`src/app/providers.tsx`）には i18n 初期化（`@/lib/i18n`）、Auth / Theme / Toast / MapSettings の各 Provider、Service Worker 登録、`useTranslation()` 呼び出しなど**アプリ全体の初期化が集中**している（`providers.tsx:8-94`）。ここで例外が出ると `error.tsx` では捕まらず、ユーザーには白画面が出るだけで Sentry にも記録されない。
- ビルド時に `[@sentry/nextjs] It seems like you don't have a global error handler set up.` の警告が**実測される**（Sentry SDK が `global-error.tsx` の不在を検知して出す警告）。
- なお既存 `src/app/error.tsx` は実体としては `GlobalError` という名前のコンポーネント（チャンクロード失敗時の SW/キャッシュ再読込ロジックを持つ）だが、ファイル名が `error.tsx` のため root layout の保険にはならない。

### 2. 非推奨 / Turbopack 非対応の Sentry 構成
- **`disableLogger` が非推奨**: `next.config.ts:106` の `withSentryConfig` 第 2 引数で `disableLogger: true` を指定しているが、これは現行 `@sentry/nextjs` で deprecated 扱いであり、`next build` 時に非推奨警告が**実測される**。
- **`sentry.client.config.ts` が Turbopack で読み込まれなくなる**: クライアント初期化を `sentry.client.config.ts`（`Sentry.init` を呼ぶ、`:14-29`）で行っているが、Turbopack ベースのビルド/開発では `sentry.client.config.ts` が自動ロードされず、`instrumentation-client.ts` への移行が推奨されている。現状 `dev` は `next dev`（`package.json:8`）で、将来 Turbopack を有効化するとクライアント側 Sentry が**無効化される**。
- **`environment` が preview でも `'production'` になる**: `sentry.client.config.ts:17`・`sentry.server.config.ts:16`・`sentry.edge.config.ts:16` がいずれも `environment: process.env.NODE_ENV` を渡している。Vercel の preview デプロイでも `NODE_ENV` は `'production'` のため、preview のエラーが本番（`environment: production`）と混ざって区別できない。Vercel が提供する `VERCEL_ENV`（`production` / `preview` / `development`）を使うべき。

## 目的
- root layout / Providers のクラッシュを含む「最後の砦」のエラーを捕捉し、フォールバック UI を出しつつ Sentry に必ず記録する。
- 非推奨 API とビルド警告を解消し、Turbopack 移行後もクライアント側 Sentry が機能する構成にする。
- preview と production のイベントを `environment` で分離し、ノイズ無く障害を切り分けられるようにする。

## 要件
### 機能要件
- [ ] FR-200-01: `src/app/global-error.tsx` を新規作成する。`'use client'` で `html`/`body` を自前で描画する最小フォールバック UI（再読込導線つき）を持ち、`useEffect`（または受領した `error`）で `Sentry.captureException(error)` を呼んで必ず Sentry へ送る。既存 `src/app/error.tsx` のチャンクロード復旧ロジック・文言・スタイルと一貫性を持たせる（i18n 化は REQ-201 のフォールバック i18n と整合させてよい）。
- [ ] FR-200-02: `next.config.ts:106` の `disableLogger: true` を、現行 `@sentry/nextjs ^10.52.0` における非推奨でない指定へ置換する（ロガー抑止の意図を維持しつつ、ドキュメントが示す後継オプションへ移す。後継が存在しない場合は当該行を削除し、ビルド警告が消えることを確認）。
- [ ] FR-200-03: クライアント初期化を Turbopack 対応の形へ移す。`sentry.client.config.ts` の内容を `instrumentation-client.ts`（プロジェクトルート、Next.js 規約に従う配置）へ移設・リネームし、Turbopack 有効時でもクライアント Sentry が読み込まれるようにする。`sentry.server.config.ts` / `sentry.edge.config.ts` と `src/instrumentation.ts` の `register()` 構成は現行どおり維持する。
- [ ] FR-200-04: `environment` の算出を `VERCEL_ENV` ベースへ変更する。`instrumentation-client.ts`（旧 client config）・`sentry.server.config.ts`・`sentry.edge.config.ts` の `environment: process.env.NODE_ENV` を、`process.env.VERCEL_ENV ?? process.env.NODE_ENV` 等へ変更し、preview デプロイが `environment: 'preview'` として記録されるようにする。送信ガード（DSN かつ本番のみ）の意図は維持する。

### 非機能要件（該当する場合のみ）
- [ ] NFR-200-01: 変更後、`next build` で「global error handler が無い」警告および `disableLogger` 非推奨警告が出ないこと。
- [ ] NFR-200-02: 本番以外（dev / preview のうち送信対象外とする環境）では従来どおり Sentry へ送信されない（誤送信・課金増を招かない）こと。
- [ ] NFR-200-03: global-error のフォールバック UI 自体が二次例外を投げないよう、`error` が無い・`digest` が無い等のケースで安全に描画されること。

## 受入条件
- [ ] AC-01: `src/app/global-error.tsx` が存在し、強制的に layout/Providers をクラッシュさせた場合にフォールバック UI が表示され、Sentry に当該例外が記録される（または `Sentry.captureException` が呼ばれることをテストで確認）。
- [ ] AC-02: `next build` のログに `It seems like you don't have a global error handler set up` 警告が出ない。
- [ ] AC-03: `next build` のログに `disableLogger` の非推奨警告が出ない。
- [ ] AC-04: クライアント Sentry 初期化が `instrumentation-client.ts`（または現バージョン推奨の配置）から行われ、`sentry.client.config.ts` への依存が無い。
- [ ] AC-05: Vercel preview 環境のイベントが `environment: 'preview'`（production と区別可能）で送信される設定になっている。
- [ ] AC-06: `tsc --noEmit` / lint / `next build` が成功する。

## 影響範囲
- `src/app/global-error.tsx`（新規）
- `next.config.ts`（withSentryConfig オプション）
- `sentry.client.config.ts` → `instrumentation-client.ts`（移設・リネーム）
- `sentry.server.config.ts` / `sentry.edge.config.ts`（environment 算出）
- `src/instrumentation.ts`（参照整合の確認のみ。構成変更は最小限）
- `package.json`（Turbopack を併せて有効化する場合のみ scripts）

## 優先度
- **緊急度**: Medium / **重要度**: Medium / **理由**: 通常時の機能は動くが、(1) は「最も重大な初期化クラッシュほど観測できない」という監視の穴で、本番障害の検知・原因追跡を直接損なう。(2) は今は警告止まりだが Turbopack 移行や SDK アップデートで実害（クライアント監視の無効化・preview ノイズ）になる。いずれも局所的な設定変更で対応でき、可観測性の信頼性向上として優先度は中。
