import type { Post } from './index'

// REQ-126: gemini_auth (400/401/403) と gemini_transient (5xx/429) を追加。
// REQ-127: gemini_truncated (MAX_TOKENS) と gemini_safety (SAFETY/RECITATION/blockReason) を追加。
// 既存の gemini_api / json_parse 値は後方互換のため残す（過去レコード／HTTP status 不明ケース）。
export type AIErrorKind =
  | 'image_fetch'
  | 'gemini_auth'
  | 'gemini_transient'
  | 'gemini_truncated'
  | 'gemini_safety'
  | 'gemini_api'
  | 'json_parse'
  | 'unknown'

export interface AIErrorFields {
  error?: string
  error_kind?: AIErrorKind
  error_message_truncated?: string
  error_created_at?: string
  error_function_name?: 'analyze-image' | 'analyze-audio'
  error_model?: string
  error_latency_ms?: number | null
}

// REQ-215 FR-215-03: AI 出力の concerns は自由文ではなく enum 配列に固定。
// Edge Function 側（_shared/aiSchema.ts の CONCERN_ENUM）と一致させる。受信側で enum 外は除去済み。
export type AIConcern =
  | 'species_mismatch'
  | 'low_quality'
  | 'inappropriate'
  | 'no_animal'

/**
 * AI判定の個別写真結果
 */
export interface AIPhotoResult {
  confidence: number | null
  species_match: boolean | null
  error?: string
}

/**
 * AI 音声判定結果（REQ-072）
 */
export interface AIAudioAnalysis extends AIErrorFields {
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
  audio_quality?: 'good' | 'acceptable' | 'poor'
  // REQ-215: null = 不明（自動承認に進ませない）。明示的 true / false のみ確定値。
  is_appropriate?: boolean | null
  concerns?: AIConcern[]
  notes?: string | null
  // REQ-170: 投稿者向け教育的フィードバック（言語非依存コード）
  improvement_advice?: string[]
  mismatch_reason?: string | null
  analyzed_at?: string
}

/**
 * 画像+音声 統合判定結果（REQ-073）
 */
export interface AICombinedDecision {
  should_approve: boolean
  should_reject: boolean
  reason: string
}

/**
 * AI判定結果
 * - 画像判定フィールドはトップレベル（既存互換）
 * - 音声判定は audio_analysis、統合判定は combined_decision
 */
export interface AIResult extends AIErrorFields {
  detected_species?: string
  species_match?: boolean | null
  confidence?: number | null
  image_quality?: string
  // REQ-215: null = 不明（自動承認に進ませない）。明示的 true / false のみ確定値。
  is_appropriate?: boolean | null
  // REQ-215 FR-215-03: enum 配列に固定（受信側で enum 外は除去済み）。
  concerns?: AIConcern[]
  notes?: string | null
  // REQ-170: 投稿者向け教育的フィードバック。improvement_advice は言語非依存コード配列
  // （angle/distance/lighting/focus/closer/whole_body 等）、mismatch_reason は不一致根拠（判別不能時 null）
  improvement_advice?: string[]
  mismatch_reason?: string | null
  per_photo?: AIPhotoResult[]
  analyzed_count?: number
  photo_count?: number
  audio_analysis?: AIAudioAnalysis
  image_analysis?: AIResult
  combined_decision?: AICombinedDecision
  model?: string
  analyzed_at?: string
}

/**
 * 管理画面で使う拡張Postフィールド
 * DB定義にはまだ含まれていないが実際に存在するカラム
 */
export interface PostExtendedFields {
  status?: string
  ai_result?: AIResult | null
  rejection_reason?: string | null
  rejection_message?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
  weather?: string | null
  temperature?: number | null
  humidity?: number | null
  // REQ-172: GPS 水平位置精度（m）。NULL=手動地図選択
  accuracy?: number | null
  // REQ-174: 調査手法（structured=定点反復 / opportunistic=機会記録）と定点サイト参照
  survey_method?: 'structured' | 'opportunistic' | null
  survey_site_id?: string | null
  survey_request_id?: string | null
  custom_metadata?: Record<string, unknown> | null
  auto_approved?: boolean
  audio_url?: string | null
  ai_failure_count?: number | null
}

/**
 * REQ-231: 逆ジオコーディングで付与する地理メタデータ。
 * 全フィールド NULL 許容（取得失敗・未付与でも投稿は成立する fail-open）。
 * 値の産出元は Edge Function enrich-place（サーバー側集約）。Post の Row に同名列があり、
 * 本型はそのサブセットを「地名表示・素材供給（REQ-227/228/229 連携）」で扱うための明示型。
 */
export interface PlaceEnrichment {
  locality?: string | null
  water_body?: string | null
  is_on_water?: boolean | null
  elevation_m?: number | null
  geo_enriched_at?: string | null
  geo_source?: 'nominatim' | 'opencage' | 'geoapify' | 'onwater' | 'opentopodata' | 'cache' | null
}

/**
 * AI判定結果付きPost
 */
export type PostWithAI = Post & PostExtendedFields

/**
 * 管理画面の投稿一覧で使う型
 */
// 管理一覧は取得境界で自由な JSONB を AIResult へ検証する。Row の Json 型との交差を避ける。
export type AdminPost = Omit<Post, 'ai_result'> & PostExtendedFields

/**
 * 投稿詳細ページで使う型
 */
export type DetailPost = Post & PostExtendedFields

/**
 * 調査依頼の関連投稿（軽量版）
 */
export interface RelatedPost {
  id: string
  created_at: string
  species: string
  info_type: string
  municipality: string | null
  comment: string | null
  photos: string[] | null
  user_id: string | null
  lat: number
  lng: number
}

/**
 * CSV用のカラム（全カラム取得時）
 */
export type CsvPost = Post & PostExtendedFields
