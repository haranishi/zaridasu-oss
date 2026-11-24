## 3. ステージングでの実送信検証（本番投入の前提）

> pg_cron/pg_net・Vault は本番ダッシュボード依存で、未設定だと黙って no-op になる。
> **本番投入の前に、ステージングで実送信を 1 通検証する**（影響範囲リスクの緩和）。

1. 研究採用通知:
   ```sql
   -- 自分の非匿名投稿 id で（admin もしくは service_role で実行）。
   SELECT public.adopt_post_research('<post-uuid>', true);
   ```
   → 投稿者本人に「研究に採用されました」メールが 1 通届く。`research_adopted_notified_at` が立つ。
   → もう一度 `adopt_post_research(..., true)` しても**再送されない**（冪等 / NFR-234-02）。

2. 休眠復帰（手動起動）:
   ```sql
   SELECT public.run_dormant_reengage_batch();   -- pg_net で Edge Function を叩く
   ```
   または Edge Function を直接（`x-webhook-secret` 必須）:
   ```bash
   curl -X POST "$SITE/functions/v1/notify-dormant-reengage" \
     -H "Authorization: Bearer $SERVICE_ROLE" -H "x-webhook-secret: $WEBHOOK_SECRET" -d '{}'
   ```

3. 週次ダイジェスト（手動起動）:
   ```sql
   SELECT public.run_weekly_digest_batch();
   ```

4. List-Unsubscribe 検証: 届いたメールのヘッダ `List-Unsubscribe` の URL を開く →
   `/u/unsubscribe?t=...&c=...` が**ログイン不要**で開き、該当カテゴリが opt-out される。
   `lifecycle_email_log` に `event='unsubscribed'` が記録される。

---
