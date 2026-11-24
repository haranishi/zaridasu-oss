#### C. usage 情報の保持

- [ ] **FR-130-06: `GeminiResponseError` に `usage` を追加**
  `_shared/aiLogging.ts:87` の `GeminiResponseError`:
  ```ts
  export class GeminiResponseError extends Error {
    readonly finishReason: GeminiFinishReason | null
    readonly blockReason: string | null
    readonly rawText: string
    readonly usage: { input?: number; output?: number } | null  // 追加
    constructor(opts: {
      finishReason: GeminiFinishReason | null
      blockReason: string | null
      rawText: string
      usage?: { input?: number; output?: number } | null  // 追加
      cause?: string
    }) {
      // ...
      this.usage = opts.usage ?? null
    }
  }
  ```

- [ ] **FR-130-07: `analyzeWithGemini` で usage を Error に乗せる**
  `analyze-audio/index.ts:211-229` と `analyze-image/index.ts` の相当箇所で、MAX_TOKENS / SAFETY 検出 → throw 前に `extractUsage(geminiData)` を呼んで `GeminiResponseError` の `usage` に渡す。

- [ ] **FR-130-08: `logAiCall` で usage を保持**
  `analyze-audio` / `analyze-image` の catch ブロック内で `logAiCall` を呼ぶ際、`e instanceof GeminiResponseError && e.usage` なら `inputTokens` / `outputTokens` を渡す。これで `ai_call_logs.input_tokens` / `output_tokens` が NULL でなくなる。

#### D. retry 回数の拡張

- [ ] **FR-130-09: retry を 2 回に拡張**
  `analyzeWithGeminiRetry` (analyze-audio:276 / analyze-image:441) を:
  ```ts
  async function analyzeWithGeminiRetry(...) {
    const base = getMaxOutputTokens()
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {  // 初回 + 2 retry = max 3 calls
      const override = attempt === 0 ? undefined : { maxOutputTokensOverride: base * Math.pow(2, attempt) }
      try {
        return await analyzeWithGemini(audioUrl, claimedSpecies, cachedContentId, override)
      } catch (e) {
        if (e instanceof GeminiResponseError && e.finishReason === 'MAX_TOKENS' && attempt < 2) {
          console.warn(`[analyze-${kind}] MAX_TOKENS retry attempt=${attempt + 1} / 2`)
          lastError = e
          continue
        }
        throw e
      }
    }
    throw lastError ?? new Error('analyze: retry exhausted')
  }
  ```
  - 初回: 512
  - retry 1: 1024
  - retry 2: 2048
  - thinkingBudget=0 で大半は初回成功するはずなので、retry は本当に必要なケース (大きな画像 + 詳細解説) のセーフティネット
