## 現状の問題

### `supabase/functions/analyze-image/index.ts`

- `:216` `generationConfig: { temperature: 0.1, maxOutputTokens: 300 }` — 8 フィールド + 日本語 `notes` で容易にオーバーフローする
- `:240-241` `geminiData.candidates?.[0]?.content?.parts?.[0]?.text` を取り出すだけで、`candidates[0].finishReason` (`STOP` / `MAX_TOKENS` / `SAFETY` / `RECITATION` / `OTHER`) と `geminiData.promptFeedback?.blockReason` を一切確認していない
- `:244-245` `rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()` のみ。Gemini が地の文を前置きするケース（例: `Here is the analysis: {...}`）や複数 JSON ブロックを返すケースで JSON.parse が落ちる
- `:252-256` `JSON.parse` 失敗時は `throw new Error('JSON.parse 失敗: ...')` のみ。リトライなし
- `:439-443` 写真ごとの呼び出しは `Promise.allSettled` で 1 試行のみ

### `supabase/functions/analyze-audio/index.ts`
同等の問題（`maxOutputTokens` / `finishReason` 未参照 / JSON 抽出の単純さ / retry 不在）。

### `supabase/functions/_shared/aiLogging.ts`

- `:37-43` `AiErrorKind` に `gemini_truncated` / `gemini_safety` が無く、`finishReason` 起因の失敗を全て `json_parse` または `unknown` に丸めてしまう
- `:82-119` `classifyAiError` は `GeminiApiError` のみインスタンス分岐。`finishReason` を保持した新規 Error 型を扱える設計ではない

### UI 側

- `src/components/features/admin/ReviewCardAI.tsx` の `getErrorPresentation` は REQ-126 までで `gemini_auth` / `gemini_transient` / `gemini_api` / `json_parse` / `image_fetch` / `unknown` のみ分岐。truncate / safety に対応する UI が無い

### CI / デプロイ運用

- `.github/workflows/ci.yml` に Edge Function のデプロイラグ検知ジョブが無い
- README / runbook にもデプロイ手順が薄い（`docs/runbooks/ai-model-rollback.md` には rollback はあるが、forward deploy はない）

## 目的

1. Gemini が **MAX_TOKENS / SAFETY / RECITATION** を返した場合に、JSON parse 失敗で握りつぶさず**具体的なエラー種別**として記録する
2. **MAX_TOKENS が原因の場合に限り 1 回 retry** して救えるケースを救う（運用負荷削減）
3. プロンプト + パーサ + JSON 抽出を強化して、確率的事象でテストが落ちないようにする
4. **デプロイラグを CI で機械的に検知**し、属人運用を排除する
