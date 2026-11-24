## 要件

### 機能要件

#### A. エラー分類の細分化

- [ ] **FR-126-01: `gemini_auth` / `gemini_transient` の追加**
  `supabase/functions/_shared/aiLogging.ts` の `AiErrorKind` 型を以下に拡張:
  ```ts
  export type AiErrorKind =
    | 'image_fetch'
    | 'gemini_auth'        // 400 / 401 / 403 (恒久, 設定エラー)
    | 'gemini_transient'   // 5xx / 429 (一時, 再判定で復旧見込み)
    | 'gemini_api'         // 既存互換 (HTTP status 不明 or その他)
    | 'json_parse'
    | 'unknown'
  ```

- [ ] **FR-126-02: 構造化エラー throw**
  `analyze-image/index.ts:187` および `analyze-audio/index.ts` の対応箇所で、Gemini エラー時に HTTP status を保持した Error を投げる:
  ```ts
  class GeminiApiError extends Error {
    constructor(public status: number, public body: string) {
      super(`Gemini API エラー (${status}): ${body}`)
    }
  }
  throw new GeminiApiError(geminiRes.status, errText)
  ```
  `classifyAiError` は文字列パターンマッチではなく、Error インスタンスの `status` を見て分類できるオーバーロードを追加する。

- [ ] **FR-126-03: `classifyAiError` のシグネチャ拡張**
  ```ts
  export function classifyAiError(err: unknown): AiErrorKind {
    if (err instanceof GeminiApiError) {
      if ([400, 401, 403].includes(err.status)) return 'gemini_auth'
      if (err.status >= 500 || err.status === 429) return 'gemini_transient'
      return 'gemini_api'
    }
    if (typeof err === 'string' || err instanceof Error) {
      const message = err instanceof Error ? err.message : err
      // 既存の正規表現ベース判定（後方互換）...
    }
    return 'unknown'
  }
  ```

#### B. 管理画面 UI

- [ ] **FR-126-04: 再判定ボタンの抑制**
  `src/components/features/admin/ReviewCardAI.tsx` で `error_kind === 'gemini_auth'` の場合、`<再判定する>` ボタンを disabled にし、ツールチップに「API キー設定エラーのため再判定不可。管理者は `docs/runbooks/gemini-key-rotation.md` を参照」と表示する。
  既存の `ai_failure_count >= 3` の disabled 条件と OR で結合する。

- [ ] **FR-126-05: 設定エラー文言の専用化**
  `error_kind === 'gemini_auth'` のエラー UI を、`gemini_transient` / `gemini_api` とは別文言・別色（赤系の濃色）で表示:
  - 文言: 「🔑 API キー設定エラー（管理者対応が必要）」
  - 色: `text-red-700 font-semibold`
  - サブテキスト: 「再判定では復旧しません。GEMINI_API_KEY のローテーションが必要です」

- [ ] **FR-126-06: 常時表示の警告バナー**
  `src/views/admin/AdminLayout.tsx` のヘッダー直下に、直近 1 時間以内に `ai_call_logs.status='error'` かつ `error_kind='gemini_auth'` が 1 件以上ある場合に表示するバナーを追加:
  - 文言: 「⚠️ Gemini API キーが無効です。`docs/runbooks/gemini-key-rotation.md` を参照してローテーションしてください。」
  - クローズ可（`sessionStorage` で当該セッション中は再表示しない）
  - 直近 1 時間の判定は `supabase.from('ai_call_logs').select(...).gte('created_at', oneHourAgo).eq('status', 'error')` を `AdminLayout` 側で SWR 取得（30 秒 polling）
