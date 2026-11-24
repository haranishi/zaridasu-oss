# REQ-127: Gemini malformed JSON 応答の頑健化 + Edge Function デプロイラグ検知

## これは何か

`analyze-image` が Gemini の途中で切れた JSON を `JSON.parse` して落ちた実障害（2026-05-12）の再発防止要件。実装課題（Gemini 応答の扱い）と運用課題（Edge Function のデプロイラグ）の 2 本立て。
本文は全文を下の部品ファイルへ逐語で移動してある（この入口の要約部分のみ新規記述）。

## 目的・背景の要約

由利本荘市のテスト投稿で `SyntaxError: Unterminated string in JSON` が発生。原因は Gemini が `finishReason: "MAX_TOKENS"` で JSON を途中打ち切りしたこと。さらに UI が「AI判定失敗（詳細不明）」としか出せなかったのは、REQ-125 で入れた `error_kind` を含むコミットが**本番 Edge Function に反映されていなかった**（本番 version 19 が 4 日古い）ため。`git push` だけでは Edge Function は本番反映されず、`supabase functions deploy` がオペレータの記憶頼みになっていた。

## 主要な決定事項の要点

- **`AiErrorKind` に `gemini_truncated` / `gemini_safety` を追加**し、`finishReason` 起因の失敗を `json_parse` / `unknown` に丸めない（FR-127-01）。
- **`GeminiResponseError` クラスを新設**して `finishReason` / `blockReason` / `rawText` を保持し、`classifyAiError` で分岐する（FR-127-02〜03）。
- `maxOutputTokens` を **300 → 512**（env `GEMINI_MAX_OUTPUT_TOKENS` で上書き可）に引き上げ、あわせてプロンプトの `notes` 制約を **50 → 30 文字**に短縮（FR-127-04〜05）。
- `finishReason` / `promptFeedback.blockReason` の**確認を必須化**。SAFETY / RECITATION / blockReason は即エラー、MAX_TOKENS は truncated として投げる（FR-127-06）。
- JSON 抽出は **最も外側の `{...}` を正規表現で抽出**する方式に変更し、地の文の前置きを許容（FR-127-07）。
- **retry は MAX_TOKENS 限定・写真 1 枚あたり 1 回まで**（`maxOutputTokens` を倍にして再試行）。SAFETY は確定的なので retry しない（FR-127-08）。
- UI は `gemini_truncated` を amber・再判定可（ツールチップで警告）、`gemini_safety` を赤・**再判定 disabled** に出し分ける（FR-127-09〜10）。
- **CI に `edge-functions-deploy-lag` ジョブを新設**。PR では warning、`main` で 24h 超のラグは `error` で fail させリリースを止める（FR-127-11）。あわせて `docs/runbooks/edge-function-deploy.md` を新規作成（FR-127-12）。
- 実装は 3 フェーズ推奨。**Phase 1（FR-127-01〜08）だけで運用障害の根本対策になる**。
- スコープ外: `gemini_truncated` 多発時の管理者通知（将来検討）。

## 部品ファイル

| ファイル | 内容 |
|---|---|
| [01-background.md](REQ-127-gemini-malformed-json-resilience/01-background.md) | 背景 — 2026-05-12 の障害の詳細と、デプロイラグ／`analyzeWithGemini` 脆弱性という 2 つの重なり |
| [02-current-problems-and-goals.md](REQ-127-gemini-malformed-json-resilience/02-current-problems-and-goals.md) | 現状の問題（各ファイルの行番号付き指摘）と目的 4 点 |
| [03-fr-error-classification.md](REQ-127-gemini-malformed-json-resilience/03-fr-error-classification.md) | 要件 / 機能要件 A. エラー分類の拡張 — FR-127-01〜03（型追加、`GeminiResponseError`、`classifyAiError`） |
| [04-fr-gemini-robustness.md](REQ-127-gemini-malformed-json-resilience/04-fr-gemini-robustness.md) | B. `analyzeWithGemini` の頑健化 — FR-127-04〜08（トークン上限、プロンプト、finishReason 確認、JSON 抽出、retry） |
| [05-fr-ui-and-ci-deploy-lag.md](REQ-127-gemini-malformed-json-resilience/05-fr-ui-and-ci-deploy-lag.md) | C. UI 出し分け FR-127-09〜10 と D. CI でのデプロイラグ検知 FR-127-11〜12 |
| [06-nfr-and-test-requirements.md](REQ-127-gemini-malformed-json-resilience/06-nfr-and-test-requirements.md) | 非機能要件 NFR-127-01〜03（コスト試算、後方互換、観測可能性）とテスト要件 FR-127-13〜16 |
| [07-acceptance-criteria.md](REQ-127-gemini-malformed-json-resilience/07-acceptance-criteria.md) | 受入条件 AC-127-01〜10（Given/When/Then 形式） |
| [08-impact-and-priority.md](REQ-127-gemini-malformed-json-resilience/08-impact-and-priority.md) | 影響範囲（変更対象ファイル一覧、他機能への影響）と優先度・Phase 分け |
