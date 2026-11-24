import { MAX_COMMENT_LENGTH, COUNT_MIN, COUNT_MAX } from './constants'
import { speciesSchema, infoTypeSchema } from './validation/schemas'

export interface PostValidationInput {
  comment?: string | null
  count?: number | string | null
  lat?: number | null
  lng?: number | null
  species?: string
  info_type?: string
}

export interface ValidationResult {
  valid: boolean
  error: string | null
}

/**
 * 投稿データのバリデーション（PostForm / EditPost / OfflineQueue で共有）。
 *
 * REQ-213 FR-213-04: 種・情報種別の**許可リストは共有 zod スキーマ
 * （speciesSchema / infoTypeSchema）の `.options` を単一ソースとして参照**し、
 * 列挙値の二重管理を解消する（DB CHECK 制約が正本。FR-213-07）。
 *
 * 本関数は同期 API（`{valid, error}` 返却・呼び出し側 useEditPost の挙動・既存テスト）を
 * 維持するため、長さ・範囲チェックと「未入力はスキップ」「count は数値文字列を許容」
 * という従来セマンティクスはそのまま保つ。新規の書き込み経路（usePostForm 等）は
 * postInputSchema を直接 safeParse する（FR-213-05）。
 *
 * ⚠️ これはクライアント側の「第一の網」。最終防御は DB の CHECK 制約（schema.sql）。
 * 本モジュールは PostForm（dynamic import）/ DetailPage / PostCard 経由でのみ読み込まれ、
 * home `/` の perf-budget チャンクには載らない（NFR-213-01）。
 */
export function validatePost(input: PostValidationInput): ValidationResult {
  // コメント長
  if (input.comment && input.comment.length > MAX_COMMENT_LENGTH) {
    return { valid: false, error: `コメントは${MAX_COMMENT_LENGTH}文字以内で入力してください` }
  }

  // 個体数の範囲
  if (input.count != null && input.count !== '') {
    const num = Number(input.count)
    if (!Number.isInteger(num) || num < COUNT_MIN || num > COUNT_MAX) {
      return { valid: false, error: `個体数は${COUNT_MIN}〜${COUNT_MAX}の整数で入力してください` }
    }
  }

  // 緯度の範囲
  if (input.lat != null) {
    if (input.lat < -90 || input.lat > 90) {
      return { valid: false, error: '緯度は-90〜90の範囲で指定してください' }
    }
  }

  // 経度の範囲
  if (input.lng != null) {
    if (input.lng < -180 || input.lng > 180) {
      return { valid: false, error: '経度は-180〜180の範囲で指定してください' }
    }
  }

  // 種類の検証（許可リストは共有 zod スキーマの options を単一ソースとする）
  if (input.species && !(speciesSchema.options as readonly string[]).includes(input.species)) {
    return { valid: false, error: '無効な種類が指定されています' }
  }

  // 情報種別の検証（許可リストは共有 zod スキーマの options を単一ソースとする）
  if (input.info_type && !(infoTypeSchema.options as readonly string[]).includes(input.info_type)) {
    return { valid: false, error: '無効な情報種別が指定されています' }
  }

  return { valid: true, error: null }
}
