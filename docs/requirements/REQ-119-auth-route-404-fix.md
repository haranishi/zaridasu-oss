# REQ-119: 未ログイン時の `/auth` 遷移を撤廃して AuthModal に統一する

## 背景
ザリダスは未ログインユーザーが投稿・調査依頼・コメントを試みた際に「ログインを促す」導線を複数の画面に持つ。ホーム画面（`HomeInteractive.tsx`）では既に `AuthModal` を表示するモーダル方式に統一されているが、調査依頼系の画面では `router.push('/auth')` および `<Link href="/auth">` で遷移する旧式の導線が残っている。

`/auth` というルートはアプリに**存在しない**（`src/app/auth/` 配下は `callback/` のみ）。したがって対象ユーザーは Next.js の `not-found.tsx` に落ちる。市民参加型サービスの主要動線が 404 で切れている状態は致命的で、登録に進む前の離脱を生む。

## 現状の問題
以下 3 箇所で `/auth` への遷移が残存している（2026-05-09 時点）。

| ファイル | 行 | 種別 | コード抜粋 |
|---|---|---|---|
| `src/views/SurveyRequestsListPage.tsx` | 221 | `router.push('/auth')` | 調査依頼一覧画面の FAB タップ → 未ログインなら `/auth` |
| `src/views/SurveyRequestPage.tsx` | 93 | `router.push('/auth')` | 調査依頼詳細「結果を投稿する」 → 未ログインなら `/auth` |
| `src/views/SurveyRequestPage.tsx` | 378 | `<Link href="/auth">` | コメント欄「コメントするにはログインが必要です」 |

実在ルートは `src/app/auth/callback/page.tsx`（OAuth/メール認証コールバック）のみで、`/auth` 単独の `page.tsx` は存在しない。

再現条件: 未ログイン状態で `/requests`（調査依頼一覧）か `/requests/[id]` を開き、FAB / 結果投稿ボタン / コメント欄のログインリンクをタップ。

## 目的
- ザリダス全画面で「未ログイン時のログイン要求」を `AuthModal` 表示に統一する。
- ユーザーが現在の文脈（調査依頼一覧／詳細）を失わずに、モーダル内でログイン or 新規登録を完了できるようにする。
- `/auth` への参照をコードベースから完全に除去し、将来の再混入を CI で検出する。

## 要件

### 機能要件
- [ ] FR-119-01: `SurveyRequestsListPage.tsx` の FAB タップ時、未ログインなら `AuthModal`（`defaultTab='login'`）を画面内に表示する。`router.push` は使わない。
- [ ] FR-119-02: `SurveyRequestPage.tsx` の「結果を投稿する」ボタンタップ時、未ログインなら `AuthModal`（`defaultTab='login'`）を画面内に表示する。ログイン成功後、元の `handleRespondClick` フロー（`sessionStorage` 経由でホームへ seed）を継続できること。
- [ ] FR-119-03: `SurveyRequestPage.tsx` のコメント欄「コメントするにはログインが必要です」リンクは `<Link href="/auth">` を廃止し、`AuthModal` を開くボタン化する。
- [ ] FR-119-04: 上記 2 ファイルに `AuthModal` の表示状態（`showAuth`, `authTab`）を追加し、`HomeInteractive.tsx` と同じ `<AuthModal onClose={...} defaultTab={...} />` の使い方に揃える。
- [ ] FR-119-05: `AuthModal` のログイン成功時、モーダルが閉じて元画面の状態が保持されること（route 遷移しない）。

### 非機能要件
- [ ] NFR-119-01: 既存の `AuthModal` のテスト（`src/components/modals/__tests__/AuthModal.test.tsx`）が引き続きパスすること。
- [ ] NFR-119-02: `/auth` 文字列が `src/**` から消えていることを CI で検証する（lint ルール、または `scripts/check-no-auth-route.mjs` のような単純な grep スクリプト）。`src/app/auth/callback/**` は除外。

## 受入条件
- [ ] AC-01: 未ログインで `/requests` を開いて FAB をタップ → 同画面上に AuthModal が出現し、URL は `/requests` のまま。
- [ ] AC-02: 未ログインで `/requests/[id]` を開いて「結果を投稿する」をタップ → AuthModal が出現。ログイン後、`handleRespondClick` の sessionStorage seed が保たれ、ホーム遷移後に PostForm が seed 付きで開く。
- [ ] AC-03: 未ログインで `/requests/[id]` のコメント欄ログインリンクをタップ → AuthModal が出現。`/auth` への遷移は発生しない。
- [ ] AC-04: ログイン後の操作はそれぞれ既存と同じ画面遷移／状態となる（後方互換）。
- [ ] AC-05: `git grep "router.push.'/auth'" src/`、`git grep "href=\"/auth\"" src/` の結果が空であること（`callback` を除く）。
- [ ] AC-06: Playwright E2E（`tests/e2e/survey-request.spec.ts` 等）に「未ログイン → AuthModal 表示」のステップを追加し、緑になる。

## 影響範囲
- 変更対象ファイル
  - `src/views/SurveyRequestsListPage.tsx`
  - `src/views/SurveyRequestPage.tsx`
- 影響を受ける機能
  - 調査依頼の作成導線（FAB）
  - 調査結果の投稿導線（PostForm への seed 引き継ぎを壊さないこと）
  - 調査依頼へのコメント導線
- 影響しないこと
  - `/auth/callback` ルート（OAuth/メール認証用）はそのまま残す。
  - DB スキーマ・RLS の変更は不要。

## 優先度
- **緊急度**: Critical
- **重要度**: High
- **理由**: ユーザー導線が 404 で切れており、市民参加型サービスのコア機能（調査依頼・コメント）の入口で離脱を発生させている。修正コストは小さく（〜100 行）、ホームの実装パターンを真似るだけで完了する。
