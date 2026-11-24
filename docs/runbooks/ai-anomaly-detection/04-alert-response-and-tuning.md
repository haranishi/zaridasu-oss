## 3. アラートが来たときの対応

通知メールには signal と metric（auto-approve 率・総数・単一 actor 最大・top user_id）が載る。

1. **どの signal か** を見る。
   - `high_auto_approve_rate` → `AI_AUTO_APPROVE_BOTH` 等の env を**下げ過ぎていないか**確認（コード下限 `0.5` でクランプはされるが、0.5〜0.7 だと誤承認が増える）。プロンプトインジェクションの痕跡（同一文言の `notes`/種申告）も確認。必要なら誤承認投稿を `/admin/posts` で手動却下。
   - `user_call_spike` / `ip_call_spike` → `/admin/posts` で当該 user / 投稿群を確認。濫用なら [cloud-cost-guardrails.md §3 段階 1](./cloud-cost-guardrails.md)（利用者/IP のレート制限・ブロック＝REQ-212）で絞る。
   - `high_call_volume` → コスト暴走の疑い。[cloud-cost-guardrails.md §3](./cloud-cost-guardrails.md) の段階表に従う。**AI 起因なら `AI_ANALYSIS_ENABLED=false`（段階 2）が第一手**（キーを失効させずに AI 課金だけ即停止・投稿は保存され手動レビューへ）。
2. **切り分け**: 不正 / バグ（リトライ暴走）/ 正当な増加 のいずれか（[incident/03](./incident/03-cloud-billing-anomaly.md) の切り分け表）。
3. 原因を塞いだら、必要なら停止した機能を段階的に戻す。

---

## 4. 誤検知時の調整

- **平常で鳴り続ける**: 閾値を上げる。優先度は `high_auto_approve_rate`（率）→ `high_call_volume`（総数）→ `per_actor`。env を変えるだけ（再デプロイ不要・Secrets 反映は即時）。
- **小さな窓で率が跳ねる（少投稿時に 100% など）**: `AI_ANOMALY_MIN_SAMPLES` を上げる（分母がこれ未満の窓は率を評価せず `null`＝鳴らない）。
- **通知が多すぎる**: `AI_ANOMALY_NOTIFY_INTERVAL_HOURS` を伸ばす（同種通知の最小間隔。`admin_alerts.notified_at` で抑制）。
- **逆に鳴らない（鳴ってほしいのに）**: 閾値を下げる / `AI_ANOMALY_WINDOW_MINUTES` を短くして急変に敏感にする。まず手動 SQL（下記）で「今 signal が立つか」を確認してから env を調整する。

---
