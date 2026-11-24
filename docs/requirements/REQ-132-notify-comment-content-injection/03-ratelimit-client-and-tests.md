#### C. レート制限

- [ ] **FR-132-07: ユーザーごとの呼出レート制限**
  - `_shared/aiRateLimit.ts` 同様のパターンで `_shared/commentNotifyRateLimit.ts` を新設
  - 制限: 1 ユーザーあたり 10 通知/分（Resend クオータ保護）
  - 超過時は 429 `{ error: 'rate_limited' }`
  - 既存の `ai_call_logs` 同様の集約テーブル `comment_notify_logs` を新設（`comment_notification_log` とは別に「試行ログ」として）

- [ ] **FR-132-08: グローバルレート制限**
  - 同一 `post.user_id` への通知は 5 分以内に 3 通まで（投稿者からのスパム被害抑制）
  - 超過時は skip ログを残し 200 で返す（攻撃者へのフィードバックを最小化）

#### D. クライアント側の修正

- [ ] **FR-132-09: `CommentSection.tsx` の insert を返り値受領に変更**
  - `supabase/src/components/features/posts/CommentSection.tsx:81`
    ```ts
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: user.id, content: content.trim(), is_admin: isAdmin })
      .select('id')
      .single()
    ```
  - 成功後の invoke を:
    ```ts
    supabase.functions.invoke('notify-comment', {
      body: { comment_id: data.id },
    }).catch((err) => logError(err, 'notify-comment'))
    ```

#### E. テスト

- [ ] **FR-132-10: ユニットテスト追加**
  - `supabase/functions/notify-comment/__tests__/handler.test.ts` を新設
  - ケース:
    - **正常系**: `comment_id` 受領 → DB から取得 → メール送信
    - **任意文面送信不能**: `comment_content: '<phishing>'` を送っても無視され、DB の `content` が使われる
    - **他人コメント拒否**: callerUser.id ≠ comment.user_id → 403
    - **冪等性**: 同一 `comment_id` で 2 回呼ぶと 2 回目は `skipped: 'already_sent'`
    - **レート制限**: 同一ユーザーが 11 回/分呼ぶと 11 回目は 429
    - **存在しない comment_id**: 200 `{ skipped: 'not_found' }`

- [ ] **FR-132-11: 統合テスト**
  - Playwright で `CommentSection` 経由のコメント投稿 → 通知メール送信（Resend mock）を確認
  - 攻撃シミュレーション: dev console から `comment_content` を渡しても本文は DB の値であることを E2E で確認
