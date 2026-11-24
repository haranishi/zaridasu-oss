## 0. コンポーネント（どこに何があるか）

| 部品 | 役割 | 場所 / 設定 |
|---|---|---|
| **集計関数** | 直近ウィンドウの auto-approve 率 / 単一 actor の呼び出し頻度 / 総呼び出し数を集計し `signals` を返す | `public.detect_ai_anomalies()`（schema.sql 正本 + `supabase/migrations/20260616000003_ai_anomaly_detection.sql`） |
| **通知 EF** | 集計結果を受け取り、閾値超過なら `ADMIN_NOTIFY_EMAIL` へ Resend 通知。重複抑制は `admin_alerts(alert_type='ai_anomaly')` | `supabase/functions/notify-ai-anomaly/index.ts` |
| **起動ラッパ** | `notify-ai-anomaly` を pg_net で叩く（fail-soft） | `public.run_ai_anomaly_check()`（migration） |
| **スケジュール** | 15 分ごとに `run_ai_anomaly_check()` を実行 | pg_cron ジョブ `ai_anomaly_check_15min`（migration） |
| **閾値 env** | 検知の各次元の閾値（安全側の既定あり） | `AI_ANOMALY_*` / `AI_COST_ALERT_CALLS_PER_HOUR`（`.env.example`） |

> `ai_call_logs` / `admin_alerts` は migration 由来で schema.sql には**テーブル定義が無い**（集計関数のみ正本反映）。`alert_type='ai_anomaly'` の許可値追加と pg_cron は migration 側が正本。

---
