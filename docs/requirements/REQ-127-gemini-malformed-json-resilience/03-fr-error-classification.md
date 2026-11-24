## 要件

### 機能要件

#### A. エラー分類の拡張

- [ ] **FR-127-01: `AiErrorKind` に新しい値を追加**
  `supabase/functions/_shared/aiLogging.ts`:
  ```ts
  export type AiErrorKind =
    | 'image_fetch'
    | 'gemini_auth'
    | 'gemini_transient'
    | 'gemini_truncated'    // 追加: finishReason === 'MAX_TOKENS'
    | 'gemini_safety'       // 追加: finishReason === 'SAFETY' | 'RECITATION' | promptFeedback.blockReason
    | 'gemini_api'
    | 'json_parse'
    | 'unknown'
  ```
  `src/types/post.ts` の `AIErrorKind` も同期更新。

- [ ] **FR-127-02: `GeminiResponseError` クラス新設**
  `_shared/aiLogging.ts` に `GeminiApiError` と同じパターンで:
  ```ts
  export type GeminiFinishReason =
    | 'STOP'
    | 'MAX_TOKENS'
    | 'SAFETY'
    | 'RECITATION'
    | 'OTHER'
    | string  // 未知の値も握りつぶさない
  
  export class GeminiResponseError extends Error {
    readonly finishReason: GeminiFinishReason | null
    readonly blockReason: string | null
    readonly rawText: string
    constructor(opts: { finishReason: GeminiFinishReason | null; blockReason: string | null; rawText: string; cause?: string }) {
      super(`Gemini レスポンス異常 (finishReason=${opts.finishReason ?? 'null'}, blockReason=${opts.blockReason ?? 'null'}): ${opts.cause ?? ''}`)
      this.name = 'GeminiResponseError'
      this.finishReason = opts.finishReason
      this.blockReason = opts.blockReason
      this.rawText = opts.rawText
    }
  }
  ```

- [ ] **FR-127-03: `classifyAiError` の overload 拡張**
  ```ts
  export function classifyAiError(err: unknown): AiErrorKind {
    if (err instanceof GeminiApiError) { /* 既存 */ }
    if (err instanceof GeminiResponseError) {
      if (err.finishReason === 'MAX_TOKENS') return 'gemini_truncated'
      if (err.finishReason === 'SAFETY' || err.finishReason === 'RECITATION') return 'gemini_safety'
      if (err.blockReason) return 'gemini_safety'
      // それ以外 (OTHER / 未知) は json_parse 扱い
      return 'json_parse'
    }
    // 文字列ベース判定は既存通り（後方互換）
  }
  ```
