## 背景

2026-05-12 21:23 の運用で、9 秒のウシガエル鳴き声を `analyze-audio` Edge Function で解析しようとして失敗。エラーは `GeminiResponseError: finishReason=MAX_TOKENS` で、REQ-127 で実装した 1 回 retry (`maxOutputTokens` を 512 → 1024 に倍増) でもなお MAX_TOKENS のまま失敗。Latency は 13760ms と長く、retry が実際に走っていることは確認できる。

調査の結果、過去の成功時は `output_tokens` が 72〜87 と非常に小さく、JSON 本体は 100 token 未満で完結することが分かった。それなのに 1024 トークンを使い果たすのは、**Gemini 2.5 Flash の "thinking tokens" (内部 reasoning) が予算を食い尽くしている**ためほぼ確定。

Gemini 2.5 Flash は内部 reasoning モードがデフォルト ON で、`generationConfig.thinkingConfig.thinkingBudget` を明示的に `0` に設定しない限り、`maxOutputTokens` 内から大量に reasoning token を消費する。**実テキスト出力が 0 文字でも `finishReason: 'MAX_TOKENS'` が返る**仕様 (Google 公式ドキュメントの "Thinking models" セクションに記載)。

過去成功時代 (REQ-076) は `gemini-2.5-flash-lite` を使っていたため、Lite は thinking を持たず問題が出なかった。本番 Supabase secret で `GEMINI_AUDIO_MODEL=gemini-2.5-flash` (Lite ではない方) が設定されている結果、地雷を踏んでいる。

直近 7 日間で `analyze-audio` の成功は 0 件 — Gemini 側の何らかの挙動変化と組み合わせて、全数失敗状態。

## 現状の問題

### コード

- `supabase/functions/analyze-audio/index.ts:188-190` の `generationConfig`:
  ```ts
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: getMaxOutputTokens(),  // 512 default
  }
  ```
  → `thinkingConfig` なし、`responseSchema` なし

- `supabase/functions/analyze-image/index.ts:358` の `generationConfig`:
  ```ts
  generationConfig: { temperature: 0.1, maxOutputTokens }
  ```
  → `thinkingConfig` なし、`responseMimeType` なし、`responseSchema` なし

- `supabase/functions/health-gemini/index.ts:83`:
  ```ts
  generationConfig: { maxOutputTokens: 1, temperature: 0 }
  ```
  → 同じく `thinkingConfig` なし。実テキストは 1 token しか要求していないが、thinking で MAX_TOKENS を踏む可能性がある (ヘルスチェックが false negative になる)

- `analyzeWithGeminiRetry` (analyze-audio:276, analyze-image:441) — retry は **1 回固定**

- `GeminiResponseError` (`_shared/aiLogging.ts:87-`) — `finishReason` / `blockReason` / `rawText` のみ保持。**usage 情報を持たない**ため、デバッグ時に「初回どれだけ使った」「retry でどう変わった」が分からない

### データ

- `ai_call_logs` の失敗レコードで `input_tokens` / `output_tokens` が **NULL** のまま (error path で usage を保持していない)
- 過去成功時 `output_tokens: 72〜87` → 必要な JSON は明らかに 100 token 未満で済む

### 環境変数

- 本番 secret: `GEMINI_AUDIO_MODEL=gemini-2.5-flash` (Lite ではない方)
- コード上の default (`analyze-audio/index.ts:46-47`): `gemini-2.5-flash-lite`
- env で上書きされて flash 系になっている経緯と精度評価が docs に残っていない
