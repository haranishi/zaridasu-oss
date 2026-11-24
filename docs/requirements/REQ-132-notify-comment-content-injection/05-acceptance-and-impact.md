## 受入条件

- [ ] **AC-132-01**: **Given** 認証済攻撃者が `supabase.functions.invoke('notify-comment', { body: { post_id, comment_content: '<phishing>' } })` を呼ぶ、**When** 旧形式 payload を送信、**Then** Edge Function は `comment_id` 不在で 400 を返し、Resend が呼ばれない
- [ ] **AC-132-02**: **Given** 認証済ユーザー A が他人 B のコメント id を `comment_id` に指定して呼ぶ、**When** Edge Function が JWT 検証、**Then** A.id ≠ comment.user_id で 403 が返り通知メールは送信されない
- [ ] **AC-132-03**: **Given** 正規 UI からコメント投稿、**When** `CommentSection` が `comment_id` 付きで invoke、**Then** 投稿者に DB の `content` 内容そのままの通知メールが届く
- [ ] **AC-132-04**: **Given** 同一 `comment_id` で 2 回 invoke、**When** Edge Function が処理、**Then** 1 回目は送信成功、2 回目は `skipped: 'already_sent'` で Resend が再呼出されない
- [ ] **AC-132-05**: **Given** 1 ユーザーが 1 分間に 11 回 invoke、**When** Edge Function がレート制限チェック、**Then** 11 回目以降は 429 を返し送信しない
- [ ] **AC-132-06**: **Given** 投稿者 = コメント者の場合、**When** Edge Function 処理、**Then** 既存ロジック通り `skipped: 'own post'` を返し送信しない（冪等性ログには記録しない、または記録するかは Phase 判断）
- [ ] **AC-132-07**: **Given** 攻撃者が `comment_content: 'evil'` をペイロードに追加して送る、**When** Edge Function 処理、**Then** メール本文には DB の `content` が使われ、`evil` は一切現れない
- [ ] **AC-132-08**: **Given** `comment_id: '<存在しない uuid>'` で invoke、**When** Edge Function 処理、**Then** 200 `{ skipped: 'not_found' }` が返り、攻撃者は存在確認に利用できない

## 影響範囲

### 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/functions/notify-comment/index.ts` | payload を `comment_id` のみに変更、DB 再 fetch、冪等性、レート制限を追加 |
| `supabase/functions/notify-comment/__tests__/handler.test.ts` | 新規（FR-132-10） |
| `supabase/functions/_shared/commentNotifyRateLimit.ts` | 新規（FR-132-07） |
| `supabase/migrations/<new>_comment_notification_log.sql` | 新規（FR-132-05） |
| `supabase/migrations/<new>_comment_notify_logs.sql` | 新規（FR-132-07 集約ログ） |
| `src/components/features/posts/CommentSection.tsx` | insert 後の invoke を `comment_id` に変更（FR-132-09） |
| `src/components/features/posts/__tests__/CommentSection.test.tsx` | クライアント側テスト更新 |
| `e2e/comment-notification.spec.ts` | 統合テスト新規（FR-132-11） |
| `docs/runbooks/edge-function-deploy.md` | `comment_notification_log` の運用注意を追記 |

### 他機能への影響

- **REQ-131 (Edge Function webhook 認証)**: `notify-comment` は webhook ではなく client invoke なので `WEBHOOK_SECRET` の対象外。両 REQ は独立して進行可能
- **コメント投稿 UI**: `CommentSection` の修正のみ。他コンポーネントへの影響は無し
- **DB スキーマ**: 新規テーブル 2 つ追加。既存テーブルへの変更は無し
- **Resend クオータ**: レート制限により消費が抑制される（既存比 改善方向）
- **既存テスト**: `CommentSection.test.tsx` の mock を更新する必要あり
