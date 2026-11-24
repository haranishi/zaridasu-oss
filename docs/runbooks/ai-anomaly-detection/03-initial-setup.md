## 2. 初回設定（人手）

### 2-1. マイグレーション適用（pg_cron + 集計関数）

```bash
# 本番 Supabase に migration を適用（通常のデプロイフローで）。
supabase db push          # または CI/CD の migration 適用
```

適用後、pg_cron が有効な本番では `ai_anomaly_check_15min` ジョブが登録される。**pg_cron / pg_net / Vault が未有効な環境（CI・ローカル）では no-op で安全にスキップ**される（fail-soft）。

### 2-2. pg_cron / pg_net / Vault の前提（lifecycle 通知と共通）

`run_ai_anomaly_check()` は `vault.decrypted_secrets` の **`edge_function_service_role_key`** と `app.settings.supabase_url` を使って `notify-ai-anomaly` を叩く。これらは [lifecycle-notifications.md](./lifecycle-notifications.md) の pg_net セットアップと**同じ前提**（既に設定済みなら追加作業なし）。未設定なら lifecycle 同様 no-op になるため、まずそちらの「pg_net / Vault 設定」を済ませる。

### 2-3. Edge Function Secrets（Supabase Dashboard → Settings → Edge Functions → Secrets）

```
ADMIN_NOTIFY_EMAIL=...        # 既存（REQ-126 と共用）。未設定なら通知は飛ばない（fail-soft）
RESEND_API_KEY=...            # 既存（共用）
NOTIFY_FROM_EMAIL=...         # 既存（共用・認証済みドメイン）
SITE_URL=...                  # 既存（本文の管理画面リンク）
# 以下は任意（未設定なら安全側の既定。まずは既定で様子を見て調整する）
AI_ANOMALY_AUTO_APPROVE_RATE=0.90
AI_ANOMALY_PER_ACTOR_CALLS=50
AI_ANOMALY_WINDOW_MINUTES=60
AI_ANOMALY_MIN_SAMPLES=20
AI_ANOMALY_NOTIFY_INTERVAL_HOURS=6
AI_COST_ALERT_CALLS_PER_HOUR=500   # REQ-218 と共有
```

> Secrets はコミットしない（変数名のみ `.env.example` に記載）。鍵は本文・ログ・通知に出さない（`redactAiErrorMessage`）。

### 2-4. 閾値の決め方（最初の数字）

1. まず **既定のまま** 1〜2 週間運用し、`/admin/ai-cost`（REQ-075）と下の SQL で**平常時のベースライン**を把握する。
2. `high_call_volume`（総数）は **平常ピークの 2〜3 倍** を目安に `AI_COST_ALERT_CALLS_PER_HOUR` を置く。
3. `high_auto_approve_rate` は **「健全な auto-approve 率」の上限**。ザリダスは高信頼のときだけ自動承認するので 0.85〜0.95 が目安。低すぎると平常で鳴り続ける（→誤検知）。
4. `per_actor` は **熱心な 1 ユーザーの 1 時間あたり投稿数の上限**より少し上に。少人数運用では 50 で十分。

---
