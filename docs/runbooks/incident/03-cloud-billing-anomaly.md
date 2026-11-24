# (3) クラウド課金異常 runbook

> 参照要件: [REQ-220](../../requirements/REQ-220-incident-response-runbook.md) FR-220-05 / AC-10
> 索引・共通初動: [README.md](./README.md)　|　証拠保全: [evidence-preservation.md](./evidence-preservation.md)　|　連絡先: [contacts.md](./contacts.md)
> ガードレールの相互参照: [REQ-218](../../requirements/REQ-218-cloud-cost-guardrails.md)（予算アラート / スペンドキャップ / kill switch）
> 下敷き（Obsidian・読み取り専用）: `25_Cloud_Cost_Abuse_Defense`（F 節 / §7 段階的 kill switch）/ `18_Cloud_IAM_Billing_Guardrails`
> 最終確認日: **2026-06-16**

---

## いつ使うか

- Vercel / Supabase / Google Cloud（Gemini）の **利用量・請求が急増**している
- **予算アラート**（実績 50/80/100% or 予測 100%）が発火した（REQ-218 で設定）
- **身に覚えのない IAM 変更 / デプロイ / リソース作成**がある
- `ai_call_logs` が**異常な件数**で増えている（AI 悪用・リトライ暴走の疑い）
- bot 大量投稿 / リクエスト急増で **AI・Storage・Egress** が膨らんでいる

> **大原則: 予算アラートはハード上限ではない。** 設定額を超えても**利用も請求も自動停止しない**（REQ-218）。アラートは「検知の入口」。止めるのは**人が kill switch を引く**しかない。

---

## 主要な決定事項（要点）

- **本書は「発火後の初動」の主管。** 事前設定と段階的停止手順の詳細は [../cloud-cost-guardrails.md](../cloud-cost-guardrails.md)（REQ-218）にある。
- **順序は「記録 → 保全 → 封じ込め」。** 請求明細・利用量・監査ログ・デプロイ履歴を保全する前にリソースを削除しない。
- **AI 暴走が主因なら段階 2（`AI_ANALYSIS_ENABLED=false`）が第一手。** キーを失効させずに課金だけ止まり、投稿は保存されて手動レビューに回る。
- **billing 無効化は最終手段**（復旧不能の破壊性）。まず機能・キー・クォータで止める。
- **原因を「不正 / バグ（リトライ暴走）/ 正当な増加」に切り分けてから再開する。** 再開後もクォータ・スペンドキャップ・キー制限は残す。

## 各部品

- [01-first-response.md](./03-cloud-billing-anomaly/01-first-response.md) — 初動チェックリスト 8 ステップ（記録 → 保全 → 封じ込め → 範囲特定 → 一次連絡 → 通報相談 → 復旧 → 再発防止）と、やってはいけないこと（特に billing 無効化）。
- [02-kill-switch-stages.md](./03-cloud-billing-anomaly/02-kill-switch-stages.md) — 段階的 kill switch の表（段階 1〜6 の対象・操作場所・リスク）と、AI 暴走時の第一手。
- [03-detailed-steps.md](./03-cloud-billing-anomaly/03-detailed-steps.md) — 詳細手順 Step 1〜4（記録・保全と `ai_call_logs` 確認 SQL / 封じ込め / 不正・バグ・正当の切り分け表 / 復旧）。
- [04-exit-criteria-and-links.md](./03-cloud-billing-anomaly/04-exit-criteria-and-links.md) — 終了条件のチェックリスト（「対応したつもり」で閉じない）と関連リンク。
