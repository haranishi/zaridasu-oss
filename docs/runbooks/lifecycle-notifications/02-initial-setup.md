## 2. 初回セットアップ手順

### 2-1. Resend（送信）

1. `RESEND_API_KEY` を Supabase Dashboard → Edge Functions → Secrets に設定（既存取引通知と共用）。
2. `SITE_URL`（例 `https://zaridasu.com`）・`NOTIFY_FROM_EMAIL`（既定 `ザリダス <noreply@zarigani-das.com>`）を確認。
3. **REQ-219 の到達性設定（SPF/DKIM/DMARC）が完了していること**を Resend ダッシュボードの Domain で確認。

### 2-2. webhook 共有秘密

- `WEBHOOK_SECRET` を Secrets に設定し、pg_net 呼び出し側ヘッダ（`x-webhook-secret`）と一致させる
  （REQ-131）。未設定だと grace period で通るが、本番では必ず設定する。

### 2-3. pg_net / pg_cron / Vault（定期実行の土台）

> migration `20260615000006_lifecycle_notifications.sql` は pg_cron 拡張の有効化とジョブ登録を
> **冪等かつ fail-soft** に試みる。権限が無い/未対応の環境では `RAISE NOTICE` で握り潰し no-op になる。
> したがって**「migration を流した＝cron が動いている」とは限らない**。下記で必ず確認する。

1. 拡張を有効化（Dashboard → Database → Extensions、または SQL）:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_net;
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```
2. Vault に service-role key を登録（既存 enrich-place / 調査依頼通知と同じキー名）:
   ```sql
   -- 値はコミットしない。Dashboard の Vault UI から登録するのが安全。
   SELECT vault.create_secret('<service-role-key>', 'edge_function_service_role_key');
   ```
3. プロジェクト URL の GUC（pg_net がフォールバックを持つので任意だが明示推奨）:
   ```sql
   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://edxmkqmjzbarjdgnkcvc.supabase.co';
   ```
4. **cron ジョブが登録されたかを確認**（AC-07 の「有効化チェック」）:
   ```sql
   SELECT jobname, schedule, active FROM cron.job
   WHERE jobname IN ('lifecycle_dormant_reengage_daily', 'lifecycle_weekly_digest');
   -- 0 行なら pg_cron 未有効 or 権限不足。§2-3 手順 1 を実施して migration を再適用するか、
   -- 手動で cron.schedule(...) を実行する（migration 内の DO ブロックと同じ式）。
   ```
   - 日次: `lifecycle_dormant_reengage_daily` = `0 9 * * *`（UTC 09:00 = JST 18:00）
   - 週次: `lifecycle_weekly_digest` = `0 0 * * 1`（UTC 月曜 00:00 = JST 月曜 09:00）

### 2-4. Edge Function のデプロイ

`supabase/functions/_shared/mailer.ts` を新設したため、**それを import する新規 3 関数を含めデプロイ**する
（`docs/runbooks/edge-function-deploy.md` の「全関数デプロイ」推奨に従う）。

```bash
npx supabase functions deploy notify-research-adopted --project-ref edxmkqmjzbarjdgnkcvc
npx supabase functions deploy notify-dormant-reengage --project-ref edxmkqmjzbarjdgnkcvc
npx supabase functions deploy notify-weekly-digest    --project-ref edxmkqmjzbarjdgnkcvc
```

---
