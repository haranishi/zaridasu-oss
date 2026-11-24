#### B. `analyzeWithGemini` の頑健化

- [ ] **FR-127-04: `maxOutputTokens` を 512 に引き上げ**
  `analyze-image/index.ts:216` および `analyze-audio` の対応箇所。固定値で env 上書き可能にする:
  ```ts
  const GEMINI_MAX_OUTPUT_TOKENS = Number(Deno.env.get('GEMINI_MAX_OUTPUT_TOKENS') ?? '512')
  generationConfig: { temperature: 0.1, maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS }
  ```

- [ ] **FR-127-05: システムプロンプトの `notes` 制約を 30 文字に短縮**
  `analyze-image/index.ts:122-133` の `IMAGE_SYSTEM_PROMPT` を以下のように修正:
  - 旧: `"notes":"日本語50文字以内"` および本文末尾 `notes: 日本語で簡潔なコメント`
  - 新: `"notes":"日本語30文字以内"` および `notes: 日本語30文字以内の簡潔なコメント。長文禁止`
  
  `analyze-audio` の `AUDIO_SYSTEM_PROMPT` も同等に調整。

- [ ] **FR-127-06: `finishReason` / `blockReason` の確認を必須化**
  `analyze-image/index.ts:238-245` を以下に差し替え:
  ```ts
  const geminiData = await geminiRes.json()
  const usage = extractUsage(geminiData)
  const candidate = geminiData.candidates?.[0]
  const finishReason: string | null = candidate?.finishReason ?? null
  const blockReason: string | null = geminiData.promptFeedback?.blockReason ?? null
  const rawText: string = candidate?.content?.parts?.[0]?.text ?? ''
  
  // 異常終了 → 構造化 Error を投げる
  if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || blockReason) {
    throw new GeminiResponseError({ finishReason, blockReason, rawText, cause: 'response_blocked' })
  }
  if (finishReason === 'MAX_TOKENS') {
    throw new GeminiResponseError({ finishReason, blockReason, rawText, cause: 'response_truncated' })
  }
  // それ以外 (STOP / null / 未知) はパース試行に進む
  ```

- [ ] **FR-127-07: JSON 抽出の頑健化**
  `analyze-image/index.ts:244-256` の cleaning + parse を以下に差し替え:
  ```ts
  // markdown コードブロックや前置きの自然言語を許容するため、最も外側の {...} を抽出する。
  // 例: "Here is the analysis: {\"detected_species\":...}" のような前置きを許容。
  const match = rawText.match(/\{[\s\S]*\}/)
  const jsonText = match?.[0] ?? rawText.trim()
  try {
    return { result: JSON.parse(jsonText), inputTokens: usage.input, outputTokens: usage.output }
  } catch (e) {
    // ここに来る = finishReason は STOP だが JSON が壊れている → json_parse 扱い
    throw new GeminiResponseError({
      finishReason,
      blockReason: null,
      rawText,
      cause: `JSON.parse 失敗: ${e instanceof Error ? e.message : String(e)}`,
    })
  }
  ```
  `analyze-audio` 側も同等に修正。

- [ ] **FR-127-08: MAX_TOKENS 限定の retry**
  `analyzeWithGemini` を呼び出す箇所（`analyze-image/index.ts:439-443` 付近の `Promise.allSettled`）で、catch 内で `err instanceof GeminiResponseError && err.finishReason === 'MAX_TOKENS'` を判定し、`maxOutputTokens` を倍にして 1 回だけ retry する:
  ```ts
  async function analyzeWithGeminiRetry(url, claimedSpecies, cachedContentId): Promise<...> {
    try {
      return await analyzeWithGemini(url, claimedSpecies, cachedContentId)
    } catch (e) {
      if (e instanceof GeminiResponseError && e.finishReason === 'MAX_TOKENS') {
        console.warn('[analyze-image] MAX_TOKENS につき maxOutputTokens を倍にして retry')
        return await analyzeWithGemini(url, claimedSpecies, cachedContentId, { maxOutputTokensOverride: GEMINI_MAX_OUTPUT_TOKENS * 2 })
      }
      throw e
    }
  }
  ```
  `analyzeWithGemini` の引数に `{ maxOutputTokensOverride?: number }` を追加して受け取る。retry は写真 1 枚あたり 1 回まで（無限ループ防止）。
