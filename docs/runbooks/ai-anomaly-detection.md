# AI 異常検知（auto-approve 濫用 / 呼び出し急増）運用手順書

> 参照要件: [REQ-215 FR-215-07(b)](../requirements/REQ-215-ai-llm-security.md)（AI 自動承認/却下の濫用検知）
> 関連: [cloud-cost-guardrails.md](./cloud-cost-guardrails.md)（REQ-218・コスト暴走の段階的 kill switch。**コスト観点の閾値はそちらと共有**）, [gemini-key-rotation.md](./gemini-key-rotation.md)（REQ-126・鍵失効検知）, [incident/03-cloud-billing-anomaly.md](./incident/03-cloud-billing-anomaly.md)（課金事故の初動）
> 所要時間: 初回設定（pg_cron 投入 + 閾値決定）20〜30 分 / 誤検知時の調整 5〜10 分

---

## これは何か / なぜやるか

ザリダスは **「ユーザー投稿した画像/音声を Gemini が自動判定し、人手レビュー無しで `approved` / `rejected` + `auto_approved=true` に遷移させる」** 点が設計の肝（[REQ-215 背景](../requirements/REQ-215-ai-llm-security.md)）。この「AI が制御する唯一の権威フラグ」は、設定ミス・プロンプトインジェクション・大量投稿による濫用で、

- **誤承認の量産**（auto-approve 率が異常に高い＝閾値を下げ過ぎた / 誘導された）
- **単一ユーザー / IP からの AI 呼び出し集中**（自動承認を狙った試行・bot）
- **窓内 AI 呼び出し総数の急増**（コスト暴走）

に倒れ得る。本書は、これらを **既存 `ai_call_logs` / `posts` を pg_cron で定期集計して検知し、閾値超過時に管理者へメール通知する** 仕組みの運用手順。

> **設計方針（重要）**: 検知は **事後集計方式**。`analyze-image` / `analyze-audio` にはフックを足さない（呼び出しパスを汚さない・別タスクと衝突しない）。集計は DB 関数 `detect_ai_anomalies()` に閉じ、通知は `notify-ai-anomaly` Edge Function が担う。これは「使う前/最中に止める」kill switch（REQ-218）とは別の **「使った後に気づく」検知レイヤ**で、両者は補い合う。

---

## 主要な決定事項（要点）

- **検知は事後集計方式**。`analyze-image` / `analyze-audio` にフックを足さず、DB 関数 `detect_ai_anomalies()` に集計を閉じる。
- 「使う前/最中に止める」kill switch（REQ-218 / cloud-cost-guardrails）とは**別レイヤ**の「使った後に気づく」検知。両者は補い合う。
- 検知の 4 次元は `high_auto_approve_rate` / `user_call_spike` / `ip_call_spike` / `high_call_volume`。
  **auto-approve 率は分母が `AI_ANOMALY_MIN_SAMPLES` 未満の窓では評価しない**（少数標本で誤検知しない）。
- 閾値は **env（`AI_ANOMALY_*`）で調整し、再デプロイ不要**。コスト観点の閾値は `AI_COST_ALERT_CALLS_PER_HOUR` に一本化し REQ-218 と二重定義しない。
- **PII 最小**（REQ-211）: 集計関数も通知本文も平文メール / 座標 / IP を出さない（`redactAiErrorMessage` で二重防御）。
- pg_cron / pg_net / Vault が未有効な環境（CI・ローカル）では **no-op で安全にスキップ**する fail-soft。

## 各部品

- [01-components.md](./ai-anomaly-detection/01-components.md) — §0 コンポーネント表（集計関数 / 通知 EF / 起動ラッパ / スケジュール / 閾値 env がどこにあるか）と schema.sql と migration の正本の分担。
- [02-detection-logic-and-thresholds.md](./ai-anomaly-detection/02-detection-logic-and-thresholds.md) — §1 検知ロジック（4 つの signal の条件と既定閾値・集計対象）と閾値の決定優先順位・env 一覧。
- [03-initial-setup.md](./ai-anomaly-detection/03-initial-setup.md) — §2 初回設定（migration 適用、pg_cron / pg_net / Vault の前提、Edge Function Secrets、最初の閾値の決め方）。
- [04-alert-response-and-tuning.md](./ai-anomaly-detection/04-alert-response-and-tuning.md) — §3 アラートが来たときの対応（signal 別の一次対応と切り分け）と §4 誤検知時の調整。
- [05-debugging-checklist-and-links.md](./ai-anomaly-detection/05-debugging-checklist-and-links.md) — §5 確認・デバッグ（cron 登録確認 / 手動集計 / EF 手動起動 / アラート履歴の SQL）、§6 検証チェックリスト、関連リンクと対象コード。
