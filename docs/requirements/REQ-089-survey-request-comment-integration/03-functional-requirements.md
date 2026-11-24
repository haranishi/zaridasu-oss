## 機能要件

### FR-089-01: `survey_request_comments` テーブル新設
- **DDL:**
  ```sql
  CREATE TABLE IF NOT EXISTS survey_request_comments (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id  UUID NOT NULL REFERENCES survey_requests(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
  );
  CREATE INDEX idx_request_comments_request ON survey_request_comments(request_id, created_at DESC);
  CREATE INDEX idx_request_comments_user ON survey_request_comments(user_id);
  ```
- **RLS:**
  - SELECT: 全員（公開コメント）。ただし `deleted_at IS NULL` のみ表示
  - INSERT: `auth.uid() = user_id` かつ親が closed でない
  - UPDATE: 不可（ソフトデリート時の deleted_at のみ別 RPC）
  - DELETE（ソフト）: `auth.uid() = user_id`、`deleted_at = NOW()` を立てる RPC で対応

### FR-089-02: spam-check / レート制限の踏襲
- **説明:** 既存 `posts` のコメント spam-check ロジックを流用
- **トリガー:** BEFORE INSERT で 24h あたり 30 件超を拒否（admin バイパス）
- **本文長:** CHECK 制約で 1〜500 文字

### FR-089-03: 詳細ページのコメント UI
- **配置:** `/request/[id]` の関連投稿セクションの下
- **要素:**
  - コメント入力欄（500 字制限、文字数カウンタ）
  - 投稿ボタン
  - スレッド表示（新しい順 or 古い順、デフォルトは古い順）
  - 削除ボタン（自分のコメントのみ）
  - 未ログイン時は入力欄を「ログインしてコメント」CTA に置換

### FR-089-04: 統合タイムライン view
- **DB view:**
  ```sql
  CREATE OR REPLACE VIEW survey_request_timeline AS
    SELECT
      'request_comment' AS source,
      src.request_id,
      src.user_id,
      src.body,
      src.created_at,
      NULL::UUID AS post_id
    FROM survey_request_comments src WHERE src.deleted_at IS NULL
    UNION ALL
    SELECT
      'post_comment' AS source,
      p.survey_request_id AS request_id,
      c.user_id,
      c.body,
      c.created_at,
      c.post_id
    FROM comments c JOIN posts p ON p.id = c.post_id
    WHERE p.survey_request_id IS NOT NULL;
  ```
- **使い方:** 詳細ページで `request_id` で絞り、created_at でソート
- **RLS:** ベーステーブルの RLS が適用される（view 自体に追加 RLS は不要）

### FR-089-05: 通知連携（REQ-088 基盤流用）
- **トリガー:** `survey_request_comments INSERT` の AFTER で pg_net Webhook → `notify-survey-request` Edge Function
- **対象:**
  - 依頼者（自分のコメント以外）
  - 同スレッドに投稿経験のある他ユーザー（自分以外）
  - opt-out 設定を尊重

### FR-089-06: 削除 RPC（ソフトデリート）
- **DDL:**
  ```sql
  CREATE OR REPLACE FUNCTION soft_delete_request_comment(comment_id UUID)
  RETURNS VOID AS $$
  BEGIN
    UPDATE survey_request_comments
      SET deleted_at = NOW()
      WHERE id = comment_id AND user_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION '権限がありません'; END IF;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- **クライアント:** `supabase.rpc('soft_delete_request_comment', { comment_id })` で呼び出し

---
