# REQ-130: Gemini 2.5 Flash の thinking tokens で MAX_TOKENS が発生する問題の修正

## これは何か

`analyze-audio` / `analyze-image` が `finishReason=MAX_TOKENS` で全件失敗している障害の原因分析と、
その修正要件。**緊急度 Critical / 重要度 High**。

## 目的・背景（要約）

2026-05-12 の運用で 9 秒の音声解析が MAX_TOKENS で失敗し、REQ-127 の 1 回 retry（512→1024）でも復旧しなかった。
過去の成功時は `output_tokens` が 72〜87 しかなく JSON 本体は 100 token 未満で完結する。それでも 1024 を
使い切るのは、**Gemini 2.5 Flash の "thinking tokens"（内部 reasoning）が予算を食い尽くしている**ため。

Gemini 2.5 Flash は thinking がデフォルト ON で、`thinkingBudget` を明示的に `0` にしない限り
`maxOutputTokens` から大量に消費し、**実テキスト出力が 0 文字でも MAX_TOKENS を返す**。
本番 secret が `GEMINI_AUDIO_MODEL=gemini-2.5-flash`（thinking を持たない Lite ではない方）に
上書きされていたため、REQ-076 で Lite を選んでいた意図が失われて地雷を踏んでいた。
直近 7 日間で `analyze-audio` の成功は **0 件**。

## 主要な決定事項（要点）

- **`thinkingConfig.thinkingBudget` を既定 `0`** で全 Gemini 呼び出しに付ける（analyze-audio /
  analyze-image / health-gemini の3関数）。env `GEMINI_THINKING_BUDGET` で部分有効化も可能にする。
- **`responseSchema` で出力構造を強制**し、出力 token 上限を予測可能にする（audio / image 両方）。
- **`GeminiResponseError` に `usage` を持たせる**。error path で usage が失われ `ai_call_logs` の
  `input_tokens` / `output_tokens` が NULL になっていた問題を解消する。
- **retry を 1 回 → 2 回に拡張**（512 → 1024 → 2048）。thinking 無効化で大半は初回成功する想定なので、
  retry は真の MAX_TOKENS に対するセーフティネット。
- **コストは約 1/10 に減る見込み**（thinking 1000+ token → 80 token 前後）。
- 修正は本質的に `thinkingBudget: 0` の1〜2行なので **Phase 分けせず 1 PR で全部実装**する。
- `gemini-2.5-flash` 採用の経緯と精度評価は docs に残っていないため、runbook へ追記して
  Lite へ戻すか A/B 評価するかは **REQ-131 候補**として別途起票する。

## 各部品

| ファイル | 内容 |
|---|---|
| [01-background-and-problems.md](REQ-130-gemini-thinking-budget-zero/01-background-and-problems.md) | 背景（原因特定の経緯）と現状の問題（コード該当箇所・データ・環境変数） |
| [02-goals-and-thinking-budget.md](REQ-130-gemini-thinking-budget-zero/02-goals-and-thinking-budget.md) | 目的4点と機能要件 A: thinkingBudget 制御（FR-130-01〜03） |
| [03-response-schema.md](REQ-130-gemini-thinking-budget-zero/03-response-schema.md) | 機能要件 B: responseSchema による出力構造強制（FR-130-04〜05） |
| [04-usage-and-retry.md](REQ-130-gemini-thinking-budget-zero/04-usage-and-retry.md) | 機能要件 C: usage 情報の保持（FR-130-06〜08）と D: retry 2 回への拡張（FR-130-09） |
| [05-model-nfr-and-tests.md](REQ-130-gemini-thinking-budget-zero/05-model-nfr-and-tests.md) | 機能要件 E: モデル選定の確認（FR-130-10）、非機能要件 NFR-130-01〜03、テスト要件 FR-130-11〜13 |
| [06-acceptance-impact-priority.md](REQ-130-gemini-thinking-budget-zero/06-acceptance-impact-priority.md) | 受入条件 AC-130-01〜07、影響範囲（変更ファイル・他機能への影響・デプロイ手順）、優先度 |
