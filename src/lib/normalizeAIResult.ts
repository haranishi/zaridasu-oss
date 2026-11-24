import type { AIPhotoResult, AIResult } from '@/types/post'

const STRING_FIELDS = [
  'detected_species', 'image_quality', 'audio_quality', 'notes', 'mismatch_reason',
  'model', 'analyzed_at', 'error', 'error_kind', 'error_message_truncated',
  'error_created_at', 'error_function_name', 'error_model',
] as const
const NUMBER_FIELDS = ['confidence', 'analyzed_count', 'photo_count', 'error_latency_ms'] as const
const BOOLEAN_FIELDS = ['species_match', 'is_appropriate'] as const
const LABEL_FIELDS = ['detected_species', 'image_quality', 'audio_quality', 'error_kind'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 表示に使うフィールドだけを検証し、旧形式・拡張フィールドは保持する。 */
function normalizeAnalysis(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  const result = { ...value }
  for (const key of STRING_FIELDS) {
    if (value[key] != null && typeof value[key] !== 'string') delete result[key]
  }
  for (const key of NUMBER_FIELDS) {
    if (value[key] != null && !isFiniteNumber(value[key])) delete result[key]
  }
  for (const key of BOOLEAN_FIELDS) {
    if (value[key] != null && typeof value[key] !== 'boolean') delete result[key]
  }
  // 古い未知のコードは保持するが、ラベル辞書の prototype を参照する値は表示しない。
  for (const key of LABEL_FIELDS) {
    if (typeof result[key] === 'string' && Object.hasOwn(Object.prototype, result[key])) delete result[key]
  }
  for (const key of ['concerns', 'improvement_advice'] as const) {
    if (value[key] == null) continue
    if (Array.isArray(value[key])) result[key] = value[key].filter((entry) => typeof entry === 'string')
    else delete result[key]
  }
  if (value.per_photo != null) {
    if (Array.isArray(value.per_photo)) {
      result.per_photo = value.per_photo.filter(isRecord).map((photo): AIPhotoResult => {
        const normalized: Record<string, unknown> = {
          ...photo,
          confidence: isFiniteNumber(photo.confidence) ? photo.confidence : null,
          species_match: typeof photo.species_match === 'boolean' ? photo.species_match : null,
        }
        if (photo.error != null && typeof photo.error !== 'string') delete normalized.error
        return normalized as unknown as AIPhotoResult
      })
    } else delete result.per_photo
  }
  return result
}

/**
 * DB の ai_result は自由な JSONB。現在の AI 応答は検証済みでも、旧データは型を保証しない。
 * 管理画面の取得境界で不正フィールドだけを省略し、正常な判定やエラー情報を残す。
 * この処理は表示用であり、承認・却下の判断や DB の保存値を変更しない。
 */
export function normalizeAIResult(value: unknown): AIResult | null {
  const result = normalizeAnalysis(value)
  if (!result || !isRecord(value)) return null
  for (const key of ['image_analysis', 'audio_analysis'] as const) {
    if (value[key] != null) result[key] = normalizeAnalysis(value[key])
  }
  if (value.combined_decision != null) {
    const combined = value.combined_decision
    result.combined_decision = isRecord(combined) ? {
      ...combined,
      should_approve: combined.should_approve === true,
      should_reject: combined.should_reject === true,
      reason: typeof combined.reason === 'string' && !Object.hasOwn(Object.prototype, combined.reason)
        ? combined.reason : 'needs_manual_review',
    } : undefined
  }
  // 各表示フィールドの型を確認済み。未知の拡張フィールドは表示せず保持する。
  return result as AIResult
}
