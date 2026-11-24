## 2. 定期運用（週次・5〜10 分）

> 18 番ノートの運用頻度表に対応。**週 1 回**、以下を順に確認する。アラートは見落とすので「自分から見に行く」ルーチンを持つ。

```
[1] Google Cloud Billing: 当月実績/予測、予算アラート履歴、Cost Anomaly の有無
[2] Vercel Usage/Spend: Functions 実行・帯域・画像最適化の推移（前週比で急増がないか）
[3] Supabase Usage: DB / Storage / Egress / Edge Invocations の推移
[4] AI コスト: `npm run cost:ai`（または /admin/ai-cost）で Gemini 月次コストと呼び出し件数
[5] ai_call_logs: 失敗率・リトライ連鎖・reanalysis の異常（下の SQL）
```

```sql
-- 直近 7 日の AI 呼び出しサマリ（急増・失敗・リトライ暴走の兆候）
select date_trunc('day', created_at) as day, function_name, status, error_kind, count(*) as n
from ai_call_logs
where created_at > now() - interval '7 days'
group by 1, function_name, status, error_kind
order by day desc, n desc;
```

- 前週比で**呼び出し件数 / コスト / Egress が不自然に増えている**→ §3 の切り分け（不正 / バグ / 正当）へ。
- `error_kind` に `gemini_truncated`（MAX_TOKENS）が多い → リトライが課金を増やしている可能性。`AI_MAX_RETRY` の引き下げや `GEMINI_MAX_OUTPUT_TOKENS` の見直しを検討。
- `gemini_auth` が急増 → 鍵失効。[gemini-key-rotation.md](./gemini-key-rotation.md)（REQ-126）。

> **異常検知の自動化**: REQ-215 が `notify-gemini-key-failure` と同じ pg_cron + Edge Function 方式で
> **AI 自動判定の異常通知**（auto-approve 率 / 単一 actor の呼び出し頻度 / 窓内 AI 呼び出し総数）を
> 実装済み（`notify-ai-anomaly` / `detect_ai_anomalies()` / pg_cron `ai_anomaly_check_15min`）。
> 手順・閾値の決め方・誤検知時の調整は [ai-anomaly-detection.md](./ai-anomaly-detection.md) を参照。
> **コスト観点の閾値は `AI_COST_ALERT_CALLS_PER_HOUR` を共有**し、二重実装しない（`notify-ai-anomaly` が
> 「窓内 AI 呼び出し総数」の閾値としてこの env を読む）。`AI_COST_ALERT_USD_PER_DAY` は週次手動確認に使う。
> 通知本文は必ず `redactAiErrorMessage` を通し、鍵を出さない。

---
