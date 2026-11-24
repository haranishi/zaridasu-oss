# REQ-110: E2E テストの拡充（認証 / 投稿 / 調査依頼）

> 親 REQ: REQ-092
> 関連 REQ: REQ-051（test-e2e-core-flows）

## 背景
ザリダスの Playwright E2E は現状 **3 ファイルのみ**：
- `tests/e2e/admin-guard.spec.ts`
- `tests/e2e/error-boundary.spec.ts`
- `tests/e2e/home.spec.ts`

主要ユーザージャーニー（認証 / 投稿 / コメント / 地図インタラクション / 調査依頼）が E2E 未カバー。REQ-051 で追加要件が定義済だが部分実装止まり。

## 現状の問題
- 認証 E2E が無く、Google OAuth / メール認証 / セッション管理の回帰検出ができない
- 投稿フロー E2E が無く、PostForm の修正が他機能を壊しても気づかない
- 調査依頼（REQ-085〜091）の主要フロー（一覧 → 詳細 → 結果投稿 → 協力 → コメント）が未カバー
- Playwright は `fullyParallel: false` で 1 ブラウザ chromium のみ。並列化と Firefox/WebKit 追加の検討も無い

## 目的
主要ユーザージャーニー 3 本（認証 / 投稿 / 調査依頼）を E2E で守る。

## 要件

### 機能要件
- [ ] FR-110-01: `tests/e2e/auth.spec.ts`（新規）— ログイン → ダッシュボード遷移 → サインアウトの基本フロー
- [ ] FR-110-02: `tests/e2e/post.spec.ts`（新規）— ホーム → 投稿モーダル開く → 種別選択 → 位置選択 → 写真添付（mock）→ 送信 → 詳細遷移
- [ ] FR-110-03: `tests/e2e/survey-request.spec.ts`（新規）— /requests 一覧 → 詳細 → 「調査結果を投稿する」遷移 → ホーム PostForm に survey_request_id がセットされる
- [ ] FR-110-04: テスト用フィクスチャ（テストユーザー / テスト投稿）を `tests/fixtures/` に整備
- [ ] FR-110-05: Supabase テスト用 DB を CI で用意（既存の `pg-tap` ジョブ流用 / または supabase local CLI）
- [ ] FR-110-06: 各テストで `page.context()` クッキーをクリアして独立性を担保
- [ ] FR-110-07: `playwright.config.ts` に `retries: 1`（CI のフレーク対策）

### 非機能要件
- [ ] NFR-110-01: E2E ジョブの実行時間が 5 分以内
- [ ] NFR-110-02: 各 spec が単独で実行できること（依存順なし）
- [ ] NFR-110-03: テストデータが他テストを汚染しないこと（teardown / unique seed）

## 受入条件
- [ ] AC-01: 上記 3 つの spec ファイルが存在し、ローカル `npm run e2e` で全て pass
- [ ] AC-02: GitHub Actions の `e2e` ジョブで全て pass
- [ ] AC-03: 既存 3 spec も無修正で pass
- [ ] AC-04: 認証 spec で「未ログイン → /dashboard アクセス → / にリダイレクト」が確認される
- [ ] AC-05: 投稿 spec で「PostForm 送信後にトーストが出る or 詳細遷移する」が確認される
- [ ] AC-06: 調査依頼 spec で「/requests → 詳細 → 結果投稿リンクで survey_request_id セット」が確認される

## 影響範囲
- `tests/e2e/auth.spec.ts`（新規）
- `tests/e2e/post.spec.ts`（新規）
- `tests/e2e/survey-request.spec.ts`（新規）
- `tests/fixtures/`（拡張）
- `playwright.config.ts`（retries 設定）
- `.github/workflows/ci.yml`（テスト用 DB セットアップを追加する場合）

## 優先度
- **緊急度**: Medium
- **重要度**: High
- **理由**: 機能の信頼性を恒常的に守る基盤。1 PR ずつ段階的に追加可能（M 規模、合計 1〜2 日）。

## 実装メモ
- Supabase の認証は OAuth が絡むので、E2E では **Magic link / Email-Password** ベースのテストアカウントを使う
- 投稿時の写真添付は `page.setInputFiles('input[type=file]', 'tests/fixtures/sample.jpg')` で mock
- 地図のクリック座標は `page.click('.leaflet-container', { position: { x: 100, y: 100 } })` 等
- 調査依頼の seed データは Supabase テスト DB に SQL で投入するか、admin API で事前作成
- セレクタは `data-testid` を活用すると safer（既存コードに `data-testid` が無ければ追加していく方針）
