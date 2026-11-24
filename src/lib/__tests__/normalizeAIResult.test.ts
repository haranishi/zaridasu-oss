import { describe, expect, it } from 'vitest'
import { normalizeAIResult } from '../normalizeAIResult'
import type { AIResult } from '@/types/post'

describe('normalizeAIResult', () => {
  it('旧形式・画像/音声・エラー情報の正常値を変更せず保持する', () => {
    const result: AIResult = {
      detected_species: 'american', species_match: true, confidence: 0.92,
      image_quality: 'good', is_appropriate: true, concerns: [], notes: '旧形式の説明\n改行も保持',
      improvement_advice: ['angle'], mismatch_reason: null,
      per_photo: [{ confidence: 0, species_match: null }, { confidence: 1, species_match: true, error: 'past error' }],
      analyzed_count: 2, photo_count: 2, model: 'legacy-model', analyzed_at: '2026-01-01T00:00:00Z',
      image_analysis: { detected_species: 'other', confidence: null, notes: null },
      audio_analysis: {
        detected_species: 'bullfrog', audio_quality: 'acceptable', confidence: 0.83,
        species_match: false, is_appropriate: null, concerns: ['species_mismatch'],
        error: 'failed', error_kind: 'gemini_api', error_message_truncated: 'past message',
        error_created_at: 'invalid historical date', error_function_name: 'analyze-audio',
        error_model: 'past-model', error_latency_ms: 0,
      },
      combined_decision: { should_approve: false, should_reject: false, reason: 'custom_legacy_reason' },
    }
    expect(normalizeAIResult(result)).toStrictEqual(result)
  })

  it('自由JSONの不正な表示フィールドだけを取り除く', () => {
    expect(normalizeAIResult({
      detected_species: 'historic_species', notes: { reason: 'object' }, image_quality: ['good'],
      confidence: '0.9', species_match: 'true', is_appropriate: null,
      error: { message: 'nested' }, error_latency_ms: Infinity,
      concerns: ['low_quality', null, {}], improvement_advice: {},
      custom_metadata: { keep: true },
    })).toStrictEqual({
      detected_species: 'historic_species', is_appropriate: null,
      concerns: ['low_quality'], custom_metadata: { keep: true },
    })
  })

  it('入れ子の不正値も未判定へ戻し、写真別の正常値を保つ', () => {
    expect(normalizeAIResult({
      image_analysis: { notes: [], confidence: NaN }, audio_analysis: ['bad'],
      combined_decision: { should_approve: true, should_reject: 'false', reason: { nested: true } },
      per_photo: [null, 3, { confidence: 0.75, species_match: false }, { confidence: {}, species_match: [], error: {} }],
    })).toStrictEqual({
      image_analysis: {}, audio_analysis: null,
      combined_decision: { should_approve: true, should_reject: false, reason: 'needs_manual_review' },
      per_photo: [{ confidence: 0.75, species_match: false }, { confidence: null, species_match: null }],
    })
  })

  it.each([null, undefined, 'bad', 0, false, []])('AI結果全体がオブジェクト以外なら未取得として扱う: %j', (value) => {
    expect(normalizeAIResult(value)).toBeNull()
  })

  it('ラベル辞書のprototypeに一致するコードを表示に渡さない', () => {
    expect(normalizeAIResult({ detected_species: '__proto__', image_quality: 'constructor', error_kind: 'toString' })).toStrictEqual({})
    expect(normalizeAIResult({ combined_decision: { reason: '__proto__' } })?.combined_decision?.reason).toBe('needs_manual_review')
  })
})
