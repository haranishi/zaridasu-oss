## 受入条件
- [ ] AC-071-01: **Given** 本番 Supabase で `schema.sql` 全体を再実行、**When** 2 回目を実行する、**Then** エラーなく完了する（冪等）。`posts` テーブルに `audio_url` が存在し、2 つの CHECK 制約と 1 つのインデックスが作成されている。
- [ ] AC-071-02: **Given** 認証ユーザー、**When** `audio_url='http://evil.com/a.mp3'` で INSERT（http でも format 制約は通る）、**Then** 成功する。`audio_url='javascript:alert(1)'` では `posts_audio_url_format` 違反で失敗する。
- [ ] AC-071-03: **Given** 501 文字の audio_url、**When** INSERT する、**Then** `posts_audio_url_length` 違反で失敗する。
- [ ] AC-071-04: **Given** 既存投稿（audio_url IS NULL）、**When** 公開フィード取得 `SELECT * FROM posts WHERE status='approved'`、**Then** 従来通り全件返り、`audio_url` フィールドが `null` で含まれる（後方互換）。
- [ ] AC-071-05: **Given** マイグレーション未適用の古いクライアント、**When** posts を INSERT（audio_url 指定なし）、**Then** エラーにならず NULL が入る。
- [ ] AC-071-06: Vitest で `src/types/index.ts` の `AiResult` 型が新構造と旧構造両方をパースできるかを型レベルテストで確認（`expectTypeOf` 等）。
- [ ] AC-071-07: pg-tap で CHECK 制約 2 件を直接検証するテストを追加。
