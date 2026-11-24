## 5. 確認・デバッグ

### pg_cron ジョブが登録されているか

```sql
-- ジョブ一覧（ai_anomaly_check_15min が */15 で登録されているか）
SELECT jobid, schedule, jobname, active FROM cron.job WHERE jobname = 'ai_anomaly_check_15min';

-- 直近の実行履歴（成功/失敗）
SELECT jobid, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'ai_anomaly_check_15min')
ORDER BY start_time DESC LIMIT 10;
```

### 今この瞬間に異常が立つか（手動集計）

```sql
-- 既定の閾値で（service_role か admin で）
SELECT jsonb_pretty(public.detect_ai_anomalies());

-- 閾値を変えて試す: window 30 分・auto-approve 率 0.8・per_actor 30・total 300
SELECT jsonb_pretty(public.detect_ai_anomalies(30, 20, 0.80, 30, 300));
```

`anomaly`/`signals`/`metrics` を見て、閾値が現実に合っているか確認してから env を決める。

### 通知 EF を手動で叩く（pg_cron を待たずにテスト）

```bash
curl -X POST "$SUPABASE_URL/functions/v1/notify-ai-anomaly" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
# anomaly が無ければ {"skipped":"no_anomaly",...}、有れば送信 or 各種 skipped 理由を返す
```

### アラート履歴

```sql
SELECT triggered_at, notified_at, metadata
FROM admin_alerts WHERE alert_type = 'ai_anomaly'
ORDER BY triggered_at DESC LIMIT 20;
```

---

## 6. 検証チェックリスト

- [ ] migration `20260616000003_ai_anomaly_detection.sql` を本番に適用した
- [ ] `cron.job` に `ai_anomaly_check_15min` が `active=true` で登録されている（pg_cron 有効環境）
- [ ] `detect_ai_anomalies()` を手動実行し、平常時に `anomaly=false` を返す（誤検知していない）
- [ ] 閾値を一時的に下げて手動実行 → `signals` が立ち、`notify-ai-anomaly` 手動叩きでメールが届く
- [ ] メール本文に鍵 / 平文 IP / メールが出ていない（redaction 効いている）
- [ ] `ADMIN_NOTIFY_EMAIL` / `RESEND_API_KEY` 未設定でも EF が 500 で落ちず fail-soft（200 + skipped）
- [ ] コスト観点の閾値は `AI_COST_ALERT_CALLS_PER_HOUR` に一本化されている（REQ-218 と二重定義していない）

---

## 関連

- コスト暴走の段階的 kill switch / 週次確認: [cloud-cost-guardrails.md](./cloud-cost-guardrails.md)（REQ-218）
- 課金事故の初動: [incident/03-cloud-billing-anomaly.md](./incident/03-cloud-billing-anomaly.md)
- Gemini キー失効検知: [gemini-key-rotation.md](./gemini-key-rotation.md)（REQ-126）
- pg_net / Vault セットアップ: [lifecycle-notifications.md](./lifecycle-notifications.md)
- 要件定義: [REQ-215](../requirements/REQ-215-ai-llm-security.md) FR-215-07(b) / AC-07 / NFR-215-03/04
- 対象コード:
  - `supabase/functions/notify-ai-anomaly/index.ts`
  - `supabase/migrations/20260616000003_ai_anomaly_detection.sql`
  - `public.detect_ai_anomalies()`（`supabase/schema.sql` 正本反映）
