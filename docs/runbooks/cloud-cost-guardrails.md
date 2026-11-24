# クラウド課金ガードレール 運用手順書（コスト濫用・暴走防止）

> 参照要件: [REQ-218](../requirements/REQ-218-cloud-cost-guardrails.md)
> 関連: [REQ-212](../requirements/REQ-212-public-endpoint-bot-rate-limit.md)（入口 bot/レート制限）, [REQ-215](../requirements/REQ-215-ai-llm-security.md)（AI 出力検証・送信前サイズ上限）, [REQ-126](../requirements/REQ-126-gemini-key-failure-detection.md)（鍵失効検知）, [REQ-220](../requirements/REQ-220-incident-response-runbook.md)（インシデント対応）
> 課金事故が**起きた後**の初動: [incident/03-cloud-billing-anomaly.md](./incident/03-cloud-billing-anomaly.md)（本書は「事前設定 + 段階的停止手順」の主管。発火後の手順はそちら）
> 関連 Obsidian（読み取り専用）: `02_notes/.../25_Cloud_Cost_Abuse_Defense`（§7 段階的 kill switch / billing 無効化の破壊性）, `18_Cloud_IAM_Billing_Guardrails`（多層化・予算はハード上限ではない・週次確認）
> 所要時間: 初回設定 30〜45 分 / 週次確認 5〜10 分 / 緊急停止（kill switch）数分

---

## これは何か / なぜやるか

ザリダス（Next.js / Supabase / Vercel / Gemini API）は**利用が増えるほど従量課金が増幅する**構造を多数持つ（画像/音声アップロード = Storage + Egress、Gemini 分析、地図タイル、Vercel 画像最適化）。これは「正常な利用増」でも「実装事故（リトライ/ジョブ暴走）」でも「bot / 鍵漏えいによる API 悪用」でも費用が伸びる。一人運用の卒研 PF では**事故 1 回で月額枠を大きく超え得る**テールリスクが本質的な問題。

> **大原則: 予算アラートはハード上限ではない。** Google Cloud / Vercel / Supabase の予算アラートは、設定額を超えても**利用も請求も自動停止しない**（通知が来るだけ）。**止めるのは人が kill switch を引く**しかない。したがって単一の防壁に頼らず、次の順で多層に防ぐ。

```
分離 → 認証制限 → 利用量制限 → 暴走防止 → 検知 → kill switch → 説明可能性
```

本書は無料〜低額枠 + 手動運用で実行できる手段（予算アラート・Cost Anomaly・Spend Management・週次確認・env フラグでの即停止・段階的停止手順）に絞る。WAF / FinOps 製品は導入しない。

---

## 主要な決定事項（要点）

- **予算アラートで止まらない**前提で、検知を多層に重ねる（GCP 予算 + Cost Anomaly + クォータ + キー制限 / Vercel Spend Management / Supabase 使用量の週次目視）。
- **AI 暴走時の第一手は `AI_ANALYSIS_ENABLED=false`**（段階 2）。キーを失効させずに Gemini 課金だけ止められ、投稿は保存されて手動レビューに回る（自動承認しない＝フェイルセーフ）。
- **billing 無効化（段階 6）は最終手段**。復旧不能になり得るため、専用プロジェクト + バックアップがある前提でのみ。まず段階 2〜5 で止める。
- **自動停止する billing は採用しない。** 破壊的すぎるため、コード側 kill switch + 人の判断で止める設計にしている。
- 開発 / 本番の分離（Gemini キー・Supabase プロジェクト・Vercel env スコープ）を明示的に確認・記録する。

## 各部品

- [01-code-guardrails.md](./cloud-cost-guardrails/01-code-guardrails.md) — 0. コード側ガードレール（実装済みの kill switch・リトライ抑止・冪等性・サイズ上限・再分析レート制限・鍵失効検知・コスト集計の一覧表）。事故時に「何が効くか」の確認用。
- [02-initial-setup.md](./cloud-cost-guardrails/02-initial-setup.md) — 1. 初回設定（Google Cloud の予算アラート/異常検知/クォータ/キー制限、Vercel Spend Management、Supabase 使用量と Webhook・Secrets、開発/本番分離のチェックボックス）。
- [03-weekly-routine.md](./cloud-cost-guardrails/03-weekly-routine.md) — 2. 定期運用（週次 5〜10 分の確認 5 項目、`ai_call_logs` の集計 SQL、`gemini_truncated` / `gemini_auth` の読み方、異常検知自動化との閾値共有）。
- [04-kill-switch-stages.md](./cloud-cost-guardrails/04-kill-switch-stages.md) — 3. 緊急時の段階的 kill switch（段階 1〜6 の対象・操作場所・リスク表、やってはいけないこと、引いたあとの確認と復旧）。
- [05-verification-and-links.md](./cloud-cost-guardrails/05-verification-and-links.md) — 4. 検証チェックリスト（設定が機能しているか）と関連リンク・対象コード。
