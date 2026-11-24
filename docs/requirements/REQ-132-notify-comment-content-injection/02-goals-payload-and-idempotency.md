## 目的

1. **メール本文は `comments` テーブルに実在する行の内容のみを使う**ことで、任意文面送信を不可能にする
2. **同一コメントに対する通知の冪等性**を担保する
3. **レート制限**で大量送信を抑止する

## 要件

### 機能要件

#### A. payload を `comment_id` のみに変更

- [ ] **FR-132-01: `notify-comment` の入力契約を変更**
  `supabase/functions/notify-comment/index.ts:42` を以下に変更:
  ```ts
  const { comment_id } = await req.json()
  if (!comment_id || typeof comment_id !== 'string') {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400, headers: corsHeaders })
  }
  ```
  - `comment_content` / `post_id` は受け取らない
  - 旧フィールドが来たら無視（or 400 で reject、後方互換を一定期間つけるかは Phase 判断）

- [ ] **FR-132-02: comments テーブルから service-role で取得**
  - `comment_id` を使い `supabase.from('comments').select('id, post_id, user_id, content, created_at').eq('id', comment_id).single()` を実行
  - 取得できなければ 200 `{ skipped: 'not_found' }` （存在確認攻撃を防ぐため 404 を返さない）

- [ ] **FR-132-03: 呼出元ユーザー (`callerUser`) と `comment.user_id` の一致を要求**
  - JWT で確定した `callerUser.id` と取得した `comment.user_id` を比較
  - 一致しない場合は 403 `{ error: 'forbidden' }`
  - これにより「他人のコメントを使って通知トリガー」を防ぐ（深層防御）

- [ ] **FR-132-04: post_id は comments テーブルの値を信用**
  - payload からの `post_id` は受け取らず、`comment.post_id` を使って投稿を fetch
  - 既存ロジック（投稿者 = コメント者なら skip）は維持

#### B. 冪等性 - 重複送信防止

- [ ] **FR-132-05: `comment_notification_log` テーブルを新設**
  - migration: `supabase/migrations/<new>_comment_notification_log.sql`
  - schema:
    ```sql
    CREATE TABLE comment_notification_log (
      comment_id  UUID PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
      post_owner_id UUID NOT NULL,
      sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_comment_notification_log_sent_at ON comment_notification_log(sent_at DESC);
    ```
  - RLS: deny all（service-role からのみアクセス）

- [ ] **FR-132-06: Edge Function 側で送信前に insert を試みる**
  - `await supabase.from('comment_notification_log').insert({ comment_id, post_owner_id: post.user_id })`
  - 一意制約違反 (`code === '23505'`) が出たら既送なので 200 `{ skipped: 'already_sent' }`
  - 成功したら Resend で送信

