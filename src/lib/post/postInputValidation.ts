import { postInputSchema } from '@/lib/validation/schemas'
import { COUNT_MIN, COUNT_MAX, MAX_COMMENT_LENGTH } from '@/lib/constants'

/**
 * REQ-247 (H2) / REQ-213 FR-213-05: usePostForm.submitPost の zod 検証オーケストレーションを
 * 純粋関数へ切り出したユニット。postInputSchema.safeParse と「最初の issue の path → 表示 i18n
 * キー + 補間 params」のマッピングだけを担う。t() の適用（文字列化）は呼び出し側に残す。
 *
 * マッピングは既存 submitPost の分岐と完全一致させる:
 *   - path 'comment' → postForm.commentValidation ({ max })
 *   - path 'count'   → postForm.countValidation ({ min, max })
 *   - それ以外（lat / lng の範囲外、species / info_type の列挙違反など）→ postForm.locationOutOfBounds
 *
 * ⚠️ zod は「クライアント側の第一の網」。最終防御は posts の DB CHECK 制約（schema.sql）。
 * ⚠️ zod（本モジュール）は書き込みコードパス専用。読み取り主体ルートの同期グラフに載せないこと。
 */

export interface PostValidationError {
  /** 表示すべき i18n キー。 */
  key: string
  /** t() へ渡す補間 params（無い場合は undefined）。 */
  params?: Record<string, unknown>
}

export function resolvePostValidationError(input: {
  species: string
  info_type: string
  lat: number
  lng: number
  comment: string | null
  count: number | null
}): PostValidationError | null {
  const parsed = postInputSchema.safeParse(input)
  if (parsed.success) return null

  const path = parsed.error.issues[0]?.path[0]
  if (path === 'comment') {
    return { key: 'postForm.commentValidation', params: { max: MAX_COMMENT_LENGTH } }
  }
  if (path === 'count') {
    return { key: 'postForm.countValidation', params: { min: COUNT_MIN, max: COUNT_MAX } }
  }
  // lat / lng の範囲外、および species / info_type など UI 上は起こり得ない列挙違反（改竄入力）は
  // すべて汎用「範囲外」文言で弾く（既存 UX を維持）。
  return { key: 'postForm.locationOutOfBounds' }
}
