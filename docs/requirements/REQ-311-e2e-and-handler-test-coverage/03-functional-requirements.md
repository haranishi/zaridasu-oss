## 機能要件

- **FR-311-01（ハンドラの export 化）**: 対象 5 本を `export async function handleRequest(req: Request): Promise<Response>` ＋ `serve(handleRequest)` の形に変更する（`enrich-place` / `notify-ai-anomaly` と同形）。**振る舞いを変えないリファクタリングとして単独で行い、テスト追加とはコミットを分ける**。
- **FR-311-02（5 本のハンドラテスト追加）**: 各関数に最低 3 ケースを追加する。雛形は `notify-ai-anomaly/__tests__/handler.test.ts` と `enrich-place/__tests__/handler.test.ts`。
  - (a) **webhook secret 不正で 401**（`WEBHOOK_SECRET` を設定した状態で不一致ヘッダを送る）
  - (b) **対象 0 件で `skipped` を返して 200**（外部 `fetch` が 1 度も呼ばれないことをアサート）
  - (c) **オプトアウト時に送信しない**。`send-push` は `PUSH_OPT_IN_COLUMN` の 3 カテゴリすべてについて `notify_push_* === false` で `{skipped:'push_opt_out'}` を返すことを検証する。メール 3 本は**渡している `category` リテラルが正しいこと**を検証する（共通メーラのオプトイン判定自体は `mailer.test.ts` で既にカバー済みなので、ハンドラ側は「正しいカテゴリで呼んでいるか」を固定する）。
  - `social-announce` は Storage 書き込みをモックし、(a)(b) に加えて「書き込み先バケット／キー形式」と「公開 JSON に PII・生座標が含まれないこと」を検証する。
- **FR-311-03（認証・DB を伴う e2e 系統の追加）**: Supabase ローカル（`supabase start`）または専用テストプロジェクトを使う **2 系統目の Playwright プロジェクト**を追加し、seed ユーザーで最低 2 本を通す。
  - 「ログイン済みユーザーが投稿を送信 → 自分の投稿が `pending` として見える」
  - 「管理者が承認 → 一般利用者から見て公開されている」
  - 既存の placeholder 構成は残し、**新系統は別プロジェクト名（例 `chromium-authed`）にして独立に実行可否を制御する**（ローカル Supabase が無い環境では skip できるようにする）。
  > [!important] トレードオフを明記する
  > この系統は CI 実行時間を確実に増やし、ローカル Supabase（Docker）を e2e の前提にする。加えて `supabase db reset` は現状 from-scratch で失敗する（**REQ-281 / REQ-282 C-1 の実測**: 2 本目 `20240101000001` で `ERROR 42703 column "survey_request_id" does not exist`）ため、**ローカル Supabase を使う方式は REQ-281 FR-281-01 のベースライン是正に依存する**。専用テストプロジェクト方式ならこの依存は無いが、CI から到達可能な secrets 管理と、テストデータが本番と混ざらない分離設計が必要になる。**どちらを採るかは着手時に決め、決めた理由を本要件に追記すること。**
- **FR-311-04（現行 e2e の名前と実態を一致させる）**: 現行の placeholder 構成の系統を「未認証 UI スモーク」であると `playwright.config.ts` と `tests/e2e/README` 相当の場所に明示する。`tests/e2e/error-boundary.spec.ts` は内容が 404 のみなので `not-found.spec.ts` 等へ改名する。
- **FR-311-05（エラーバウンダリの実描画検証）**: `?e2e=1` 等のクエリで意図的に例外を throw するルートを用意し、`app/error.tsx` の実描画を e2e で 1 件検証する。
  - **必須条件**: そのルートは本番で到達不能にする（`NODE_ENV !== 'production'` ガード、または e2e 専用の環境変数でのみ有効化）。恒久的に到達可能な「クラッシュするページ」を本番に置かないこと。
- **FR-311-06（既存テストとの重複整理）**: FR-311-02 の実施時、`notify-post-status` / `notify-survey-request` / `notify-comment` の source-level smoke テストを実際のハンドラ呼び出しへ移行するかを判断する。**本要件では必須としない**（対象 5 本を先に埋めることを優先する）が、移行する場合は `_shared/__tests__/supabaseAdmin.test.ts` が採っている「対象を `supabase/functions/` から自動導出する不変条件テスト」の形を壊さないこと。

