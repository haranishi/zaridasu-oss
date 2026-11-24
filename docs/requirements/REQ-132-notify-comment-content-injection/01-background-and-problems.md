## 背景

`notify-comment` Edge Function は「投稿にコメントが付いたら投稿者へメール通知する」機能で、`CommentSection` から `supabase.functions.invoke('notify-comment', { body: { post_id, comment_content } })` で呼ばれる設計になっている。

- JWT 検証 (Authorization ヘッダで callerUser を確定する処理) は実装済 (`supabase/functions/notify-comment/index.ts:19-39`)
- しかし **メール本文に埋め込む `comment_content` をクライアントの req.body から直接受け取っており、実際に `comments` テーブルへ insert された行と一致するかを検証していない**
- 結果として **認証済みの一般ユーザーが任意の文面で投稿者へ通知メールを送れる**状態になっている

REQ-131（webhook 認証バイパス）が「未認証外部からの攻撃」を扱うのに対し、本 REQ は「**認証済の悪意あるユーザー**」を脅威モデルとする。zaridasu はサインアップ自由（`supabase/config.toml: enable_signup = true`）なので、攻撃者は容易にアカウントを取得でき、実害は十分大きい。

## 現状の問題

### 1. `comment_content` を req.body から直接受領

- **場所**: `supabase/functions/notify-comment/index.ts:42`
  ```ts
  const { post_id, comment_content } = await req.json()
  ```
- **メール本文への埋込**: `supabase/functions/notify-comment/index.ts:106`
  ```html
  <blockquote ...>
    ${escapeHtml(comment_content)}
  </blockquote>
  ```
- `escapeHtml` で HTML タグはサニタイズされるが、**フィッシング文言・偽 URL・恐喝メッセージはそのまま素通し**
- `comment_id` も `comments` テーブルへの insert verify も無し

### 2. 攻撃シナリオ

認証済攻撃者（攻撃者本人がアカウントを作成済）が以下を実行:

```ts
// 攻撃者の dev console から
await supabase.functions.invoke('notify-comment', {
  body: {
    post_id: '<被害者の投稿 id>',
    comment_content: '【ザリダス事務局】規約違反が検出されました。下記より本人確認をお願いします: https://evil.example.com/login'
  }
})
```

→ 被害者（投稿者）に zaridasu の本物そっくりなコメント通知メールが届き、本文は攻撃者指定のフィッシング文言。実際の `comments` テーブルには何も insert されないため、被害者がアプリを開いて「あれ、コメント無いな」と気付くまでフィッシングが先行する。

### 3. レート制限・冪等性も無い

- 同一 `post_id` への高頻度呼び出し制限が無く、攻撃者は **1 投稿者に対し短時間で大量のフィッシングメールを送れる**
- 既送通知の管理が無いため、正規利用でも「同じコメントへの通知が複数回」のリスク

### 4. 被害ターゲット

- 投稿者のメールアドレスは `auth.admin.getUserById(post.user_id)` で取得され、メール送信先となる（攻撃者からはメアドは直接見えないが、投稿 id 経由で投稿者をピンポイント攻撃可能）
- zaridasu の投稿は公開なので、攻撃者は被害者を一覧から自由に選択できる

### 5. 関連実装

- **コメント insert 側**: `src/components/features/posts/CommentSection.tsx:81-94`
  - `comments` への insert 成功後に `supabase.functions.invoke('notify-comment', ...)` を呼んでいる
  - クライアント側に `comment_id` を返り値で取得していないため、現状の UI 側でも `comment_id` 受け渡しに修正が必要

