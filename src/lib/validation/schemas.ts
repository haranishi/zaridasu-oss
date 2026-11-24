/**
 * REQ-213: ユーザー入力検証の zod 統一（共有スキーマ・許可リスト方式）
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ⚠️ 多層防御における本モジュールの役割（信頼境界の明文化 / FR-213-06・AC-05）
 * ──────────────────────────────────────────────────────────────────────────
 * (a) ここで定義する zod 検証は **クライアント側の「第一の網」＋ UX 向上**が目的であり、
 *     開発者ツール・改造クライアント・直接 API 叩きで **容易にバイパス可能**である。
 *     したがって「検証を通った＝安全」では決してない。
 * (b) ザリダスは **Server Actions / 書き込み API（サーバー側の関所）を持たない**。
 *     クライアントは Supabase JS から直接 insert/update する設計のため、zod は
 *     「サーバー側の唯一の検証」には**なり得ない**。zod を実防御と誤認しないこと。
 * (c) 敵対的入力に対する **最終的な信頼境界は DB**：
 *       - CHECK 制約（長さ・列挙・範囲。例: reports.comment <=500 / survey_requests.reason 1..300 ＝REQ-133 ほか）
 *       - RLS ポリシー（auth.uid() = user_id 等の行レベル所有権 ＝REQ-208 / REQ-179）
 *       - BEFORE トリガー（列固定・レートリミット ＝REQ-208 / check_post_rate_limit）
 *     これらが「正本」であり、zod の各定数・列挙は **DB CHECK 制約に一致させる**
 *     （DB より厳しくしない）。DB 値を変えるときは constants.ts と本ファイルも追従する。
 *
 * 値の単一ソース: 長さ上限・範囲・列挙は src/lib/constants.ts に集約し、ここはそれを参照する。
 * 型の単一ソース: 各スキーマから `z.infer` で入力型を導出する（database.types.ts の Insert と整合）。
 * i18n: 検証失敗メッセージは **i18n キー**で返す（呼び出し側で t() する。password.ts の messageKey 方式に倣う）。
 *
 * バンドル: zod は**書き込み（フォーム送信）コードパスでのみ**必要。読み取り主体ルート
 *   （home `/` 10KB / `/trends` 5KB / `/lp` 10KB の perf-budget）に zod を載せないため、
 *   home `/` の同期モジュールグラフに乗るフック（useSurveyRequests 等）からは本モジュールを
 *   **動的 import（await import）**して呼び出すこと。詳細は各フックのコメント参照（NFR-213-01）。
 */

import { z } from 'zod'
import {
  MAX_COMMENT_LENGTH,
  MAX_REPORT_COMMENT_LENGTH,
  MAX_SURVEY_REQUEST_COMMENT_LENGTH,
  MAX_SURVEY_REASON_LENGTH,
  COUNT_MIN,
  COUNT_MAX,
  HUMIDITY_MIN,
  HUMIDITY_MAX,
  SURVEY_DURATION_MIN,
  SURVEY_DURATION_MAX,
  PROFILE_DISPLAY_NAME_MIN,
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_BIO_MAX,
  SURVEY_SITE_NAME_MIN,
  SURVEY_SITE_NAME_MAX,
  SURVEY_SITE_NOTES_MAX,
  LAT_MIN,
  LAT_MAX,
  LNG_MIN,
  LNG_MAX,
  AKITA_BOUNDS,
} from '@/lib/constants'

// ── 共通部品（再利用単位。FR-213-02 末尾） ───────────────────────────────────

/** 種（posts / survey_sites の CHECK: american|bullfrog）。許可リスト方式。 */
export const speciesSchema = z.enum(['american', 'bullfrog'], {
  message: 'validation.species.invalid',
})

/** 情報種別（posts.info_type の CHECK）。許可リスト方式。 */
export const infoTypeSchema = z.enum(
  ['sighting', 'capture', 'trace', 'damage', 'absence'],
  { message: 'validation.infoType.invalid' },
)

/** 天気（posts.weather の CHECK）。許可リスト方式。 */
export const weatherSchema = z.enum(
  ['sunny', 'cloudy', 'overcast', 'rainy', 'snowy', 'thunderstorm', 'unknown'],
  { message: 'validation.weather.invalid' },
)

/** 調査手法（posts.survey_method の CHECK）。 */
export const surveyMethodSchema = z.enum(['structured', 'opportunistic'], {
  message: 'validation.surveyMethod.invalid',
})

/** 位置取得手段（posts.location_source の CHECK）。 */
export const locationSourceSchema = z.enum(['gps', 'manual', 'exif'], {
  message: 'validation.locationSource.invalid',
})

/**
 * 緯度経度（秋田県境界 AKITA_BOUNDS＋DB の物理範囲 -90..90 / -180..180）。
 * アプリの実用境界（AKITA_BOUNDS）でまず弾き、物理範囲は DB CHECK が最終防御。
 * ここでは「秋田県の範囲外」を 1 メッセージで返す（既存 UX と同じ粒度）。
 */
export const akitaLatLngSchema = z.object({
  lat: z
    .number({ message: 'validation.location.outOfBounds' })
    .min(LAT_MIN, { message: 'validation.location.outOfBounds' })
    .max(LAT_MAX, { message: 'validation.location.outOfBounds' })
    .refine((v) => v >= AKITA_BOUNDS.latMin && v <= AKITA_BOUNDS.latMax, {
      message: 'validation.location.outOfBounds',
    }),
  lng: z
    .number({ message: 'validation.location.outOfBounds' })
    .min(LNG_MIN, { message: 'validation.location.outOfBounds' })
    .max(LNG_MAX, { message: 'validation.location.outOfBounds' })
    .refine((v) => v >= AKITA_BOUNDS.lngMin && v <= AKITA_BOUNDS.lngMax, {
      message: 'validation.location.outOfBounds',
    }),
})

// ── 入力スキーマ（書き込み経路ごと） ────────────────────────────────────────

/**
 * 投稿（posts insert）。usePostForm / useOfflineQueue / postValidation が共有する。
 * comment は trim 済みの非空 or null を想定（呼び出し側で trim() || null する）。
 */
export const postInputSchema = z.object({
  species: speciesSchema,
  info_type: infoTypeSchema,
  lat: akitaLatLngSchema.shape.lat,
  lng: akitaLatLngSchema.shape.lng,
  comment: z
    .string()
    .max(MAX_COMMENT_LENGTH, { message: 'validation.comment.tooLong' })
    .nullable()
    .optional(),
  count: z
    .number({ message: 'validation.count.invalid' })
    .int({ message: 'validation.count.invalid' })
    .min(COUNT_MIN, { message: 'validation.count.range' })
    .max(COUNT_MAX, { message: 'validation.count.range' })
    .nullable()
    .optional(),
  weather: weatherSchema.nullable().optional(),
  humidity: z
    .number({ message: 'validation.humidity.range' })
    .min(HUMIDITY_MIN, { message: 'validation.humidity.range' })
    .max(HUMIDITY_MAX, { message: 'validation.humidity.range' })
    .nullable()
    .optional(),
  survey_duration_minutes: z
    .number({ message: 'validation.surveyDuration.range' })
    .int({ message: 'validation.surveyDuration.range' })
    .min(SURVEY_DURATION_MIN, { message: 'validation.surveyDuration.range' })
    .max(SURVEY_DURATION_MAX, { message: 'validation.surveyDuration.range' })
    .nullable()
    .optional(),
  survey_method: surveyMethodSchema.nullable().optional(),
  location_source: locationSourceSchema.nullable().optional(),
})

/** 通報（reports insert）。reason は列挙、comment は <=500（DB 値に統一）。 */
export const reportInputSchema = z.object({
  reason: z.enum(['spam', 'wrong_location', 'inappropriate', 'other'], {
    message: 'validation.report.reason',
  }),
  comment: z
    .string()
    .max(MAX_REPORT_COMMENT_LENGTH, { message: 'validation.comment.tooLong' })
    .nullable()
    .optional(),
})

/** コメント（comments insert）。content は trim 後 1〜500。 */
export const commentInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, { message: 'validation.content.required' })
    .max(MAX_COMMENT_LENGTH, { message: 'validation.content.tooLong' }),
})

/** 調査依頼（survey_requests insert）。reason は 1〜300（DB と一致。旧 500 の検証ドリフトを解消）。 */
export const surveyRequestInputSchema = z.object({
  species: z.enum(['american', 'bullfrog', 'unknown'], {
    message: 'validation.species.invalid',
  }),
  reason: z
    .string()
    .trim()
    .min(1, { message: 'validation.reason.required' })
    .max(MAX_SURVEY_REASON_LENGTH, { message: 'validation.reason.tooLong' }),
  urgency: z.enum(['normal', 'urgent'], { message: 'validation.urgency.invalid' }),
  lat: akitaLatLngSchema.shape.lat,
  lng: akitaLatLngSchema.shape.lng,
})

/** 調査依頼コメント（survey_request_comments insert）。body は trim 後 1〜500。 */
export const surveyRequestCommentInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { message: 'validation.content.required' })
    .max(MAX_SURVEY_REQUEST_COMMENT_LENGTH, { message: 'validation.content.tooLong' }),
})

/** 定点サイト（survey_sites insert）。name 1〜100 / notes <=100 / species nullable。 */
export const surveySiteInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SURVEY_SITE_NAME_MIN, { message: 'validation.siteName.required' })
    .max(SURVEY_SITE_NAME_MAX, { message: 'validation.siteName.tooLong' }),
  notes: z
    .string()
    .max(SURVEY_SITE_NOTES_MAX, { message: 'validation.notes.tooLong' })
    .nullable()
    .optional(),
  species: speciesSchema.nullable().optional(),
  lat: akitaLatLngSchema.shape.lat,
  lng: akitaLatLngSchema.shape.lng,
})

/**
 * プロフィール更新（user_profiles update）。部分更新を許すため .partial()。
 * display_name は 1〜20（指定する場合は空文字不可）、bio は <=100。
 */
export const profileUpdateSchema = z
  .object({
    // display_name は DB CHECK が `IS NULL OR char_length BETWEEN 1 AND 20`。
    // ニックネーム未設定（クリア）は null を許容し、文字列のときのみ 1〜20 を強制する。
    display_name: z
      .string()
      .trim()
      .min(PROFILE_DISPLAY_NAME_MIN, { message: 'validation.displayName.required' })
      .max(PROFILE_DISPLAY_NAME_MAX, { message: 'validation.displayName.tooLong' })
      .nullable(),
    // bio は DB CHECK が `IS NULL OR char_length <= 100`。null 許容。
    bio: z
      .string()
      .max(PROFILE_BIO_MAX, { message: 'validation.bio.tooLong' })
      .nullable(),
    avatar_emoji: z.string().nullable(),
  })
  .partial()

// ── 型の単一ソース化（FR-213-03。z.infer で導出し Insert 型と整合させる） ──────

export type PostInput = z.infer<typeof postInputSchema>
export type ReportInput = z.infer<typeof reportInputSchema>
export type CommentInput = z.infer<typeof commentInputSchema>
export type SurveyRequestInput = z.infer<typeof surveyRequestInputSchema>
export type SurveyRequestCommentInput = z.infer<typeof surveyRequestCommentInputSchema>
export type SurveySiteInput = z.infer<typeof surveySiteInputSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>

// ── 共有ヘルパー ────────────────────────────────────────────────────────────

/** 検証結果（password.ts の PasswordStrengthResult と同型の i18n キー方式）。 */
export interface SchemaValidationResult {
  valid: boolean
  /** 検証失敗時の i18n キー（valid=true のときは undefined）。呼び出し側で t() する。 */
  messageKey?: string
}

/**
 * 任意の zod スキーマで safeParse し、最初の検証エラーの i18n キーを返す共通ヘルパー。
 * insert/update の直前に呼び、失敗時は DB に投げずに分かりやすく弾く（FR-213-05）。
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
): SchemaValidationResult {
  const result = schema.safeParse(input)
  if (result.success) return { valid: true }
  // 最初の issue の message（= i18n キー）を返す。複数エラーでも UX 上は 1 件提示で十分。
  return { valid: false, messageKey: result.error.issues[0]?.message ?? 'validation.generic' }
}
