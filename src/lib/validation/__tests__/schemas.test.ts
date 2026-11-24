import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  postInputSchema,
  reportInputSchema,
  commentInputSchema,
  surveyRequestInputSchema,
  surveyRequestCommentInputSchema,
  surveySiteInputSchema,
  profileUpdateSchema,
  speciesSchema,
  infoTypeSchema,
  weatherSchema,
  akitaLatLngSchema,
  validateWithSchema,
} from '../schemas'
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
  PROFILE_DISPLAY_NAME_MAX,
  PROFILE_BIO_MAX,
  SURVEY_SITE_NAME_MAX,
  SURVEY_SITE_NOTES_MAX,
  AKITA_BOUNDS,
  WEATHER_CATEGORIES,
} from '@/lib/constants'

// 秋田県内の代表座標（postInputSchema / akitaLatLngSchema の正常系で使い回す）
const AKITA_LAT = 39.7186
const AKITA_LNG = 140.1023

describe('shared validation schemas (REQ-213)', () => {
  // ── 共通部品 ────────────────────────────────────────────────
  describe('speciesSchema (allow-list)', () => {
    it('accepts american / bullfrog', () => {
      expect(speciesSchema.safeParse('american').success).toBe(true)
      expect(speciesSchema.safeParse('bullfrog').success).toBe(true)
    })
    it('rejects unknown / arbitrary species (allow-list, not block-list)', () => {
      expect(speciesSchema.safeParse('unknown').success).toBe(false)
      expect(speciesSchema.safeParse('signal').success).toBe(false)
      expect(speciesSchema.safeParse('').success).toBe(false)
    })
    it('returns the i18n key as the error message', () => {
      const r = speciesSchema.safeParse('x')
      expect(r.success).toBe(false)
      if (!r.success) expect(r.error.issues[0]?.message).toBe('validation.species.invalid')
    })
  })

  describe('infoTypeSchema (allow-list)', () => {
    it('accepts the five valid info types', () => {
      for (const v of ['sighting', 'capture', 'trace', 'damage', 'absence']) {
        expect(infoTypeSchema.safeParse(v).success).toBe(true)
      }
    })
    it('rejects unknown / wrong-cased', () => {
      expect(infoTypeSchema.safeParse('hunting').success).toBe(false)
      expect(infoTypeSchema.safeParse('Sighting').success).toBe(false)
    })
  })

  describe('weatherSchema (allow-list mirrors WEATHER_CATEGORIES)', () => {
    it('accepts every WEATHER_CATEGORIES value', () => {
      for (const v of WEATHER_CATEGORIES) {
        expect(weatherSchema.safeParse(v).success).toBe(true)
      }
    })
    it('rejects an unknown weather value', () => {
      expect(weatherSchema.safeParse('hail').success).toBe(false)
    })
  })

  describe('akitaLatLngSchema (Akita bounds)', () => {
    it('accepts a coordinate inside Akita', () => {
      expect(akitaLatLngSchema.safeParse({ lat: AKITA_LAT, lng: AKITA_LNG }).success).toBe(true)
    })
    it('accepts the inclusive Akita boundary corners', () => {
      expect(
        akitaLatLngSchema.safeParse({ lat: AKITA_BOUNDS.latMin, lng: AKITA_BOUNDS.lngMin }).success,
      ).toBe(true)
      expect(
        akitaLatLngSchema.safeParse({ lat: AKITA_BOUNDS.latMax, lng: AKITA_BOUNDS.lngMax }).success,
      ).toBe(true)
    })
    it('rejects coordinates outside Akita (Tokyo)', () => {
      expect(akitaLatLngSchema.safeParse({ lat: 35.68, lng: 139.76 }).success).toBe(false)
    })
    it('rejects physically impossible coordinates', () => {
      expect(akitaLatLngSchema.safeParse({ lat: 999, lng: 999 }).success).toBe(false)
    })
  })

  // ── postInputSchema ─────────────────────────────────────────
  describe('postInputSchema', () => {
    const base = { species: 'american', info_type: 'sighting', lat: AKITA_LAT, lng: AKITA_LNG }

    it('accepts a minimal valid post', () => {
      expect(postInputSchema.safeParse(base).success).toBe(true)
    })
    it('accepts a fully-populated valid post', () => {
      expect(
        postInputSchema.safeParse({
          ...base,
          comment: 'found near river',
          count: 5,
          weather: 'sunny',
          humidity: 50,
          survey_duration_minutes: 30,
          survey_method: 'structured',
          location_source: 'gps',
        }).success,
      ).toBe(true)
    })
    it('accepts comment at exactly MAX_COMMENT_LENGTH, rejects +1', () => {
      expect(postInputSchema.safeParse({ ...base, comment: 'a'.repeat(MAX_COMMENT_LENGTH) }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, comment: 'a'.repeat(MAX_COMMENT_LENGTH + 1) }).success).toBe(false)
    })
    it('accepts count at COUNT_MIN and COUNT_MAX, rejects out of range / non-integer', () => {
      expect(postInputSchema.safeParse({ ...base, count: COUNT_MIN }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, count: COUNT_MAX }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, count: 0 }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, count: COUNT_MAX + 1 }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, count: 2.5 }).success).toBe(false)
    })
    it('accepts humidity 0..100 boundary, rejects out of range', () => {
      expect(postInputSchema.safeParse({ ...base, humidity: HUMIDITY_MIN }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, humidity: HUMIDITY_MAX }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, humidity: 101 }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, humidity: -1 }).success).toBe(false)
    })
    it('accepts survey_duration_minutes 1..480 boundary, rejects out of range', () => {
      expect(postInputSchema.safeParse({ ...base, survey_duration_minutes: SURVEY_DURATION_MIN }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, survey_duration_minutes: SURVEY_DURATION_MAX }).success).toBe(true)
      expect(postInputSchema.safeParse({ ...base, survey_duration_minutes: 0 }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, survey_duration_minutes: SURVEY_DURATION_MAX + 1 }).success).toBe(false)
    })
    it('rejects enum violations (species / info_type / weather / survey_method / location_source)', () => {
      expect(postInputSchema.safeParse({ ...base, species: 'lobster' }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, info_type: 'x' }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, weather: 'x' }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, survey_method: 'x' }).success).toBe(false)
      expect(postInputSchema.safeParse({ ...base, location_source: 'x' }).success).toBe(false)
    })
    it('rejects out-of-Akita coordinates', () => {
      expect(postInputSchema.safeParse({ ...base, lat: 35.68, lng: 139.76 }).success).toBe(false)
    })
    it('allows null/optional for nullable fields', () => {
      expect(postInputSchema.safeParse({ ...base, comment: null, count: null, weather: null }).success).toBe(true)
    })
  })

  // ── reportInputSchema ───────────────────────────────────────
  describe('reportInputSchema', () => {
    it('accepts each valid reason', () => {
      for (const reason of ['spam', 'wrong_location', 'inappropriate', 'other']) {
        expect(reportInputSchema.safeParse({ reason }).success).toBe(true)
      }
    })
    it('rejects a tampered/unknown reason (allow-list)', () => {
      expect(reportInputSchema.safeParse({ reason: 'malicious' }).success).toBe(false)
      expect(reportInputSchema.safeParse({ reason: '' }).success).toBe(false)
    })
    it('accepts comment at MAX_REPORT_COMMENT_LENGTH, rejects +1', () => {
      expect(reportInputSchema.safeParse({ reason: 'spam', comment: 'a'.repeat(MAX_REPORT_COMMENT_LENGTH) }).success).toBe(true)
      expect(reportInputSchema.safeParse({ reason: 'spam', comment: 'a'.repeat(MAX_REPORT_COMMENT_LENGTH + 1) }).success).toBe(false)
    })
  })

  // ── commentInputSchema ──────────────────────────────────────
  describe('commentInputSchema', () => {
    it('accepts a normal comment', () => {
      expect(commentInputSchema.safeParse({ content: 'hello' }).success).toBe(true)
    })
    it('rejects empty / whitespace-only (trim then min 1)', () => {
      expect(commentInputSchema.safeParse({ content: '' }).success).toBe(false)
      expect(commentInputSchema.safeParse({ content: '   ' }).success).toBe(false)
    })
    it('accepts content at MAX_COMMENT_LENGTH, rejects +1', () => {
      expect(commentInputSchema.safeParse({ content: 'a'.repeat(MAX_COMMENT_LENGTH) }).success).toBe(true)
      expect(commentInputSchema.safeParse({ content: 'a'.repeat(MAX_COMMENT_LENGTH + 1) }).success).toBe(false)
    })
  })

  // ── surveyRequestInputSchema (the reason 500→300 drift fix) ──
  describe('surveyRequestInputSchema', () => {
    const base = { species: 'american', urgency: 'normal', lat: AKITA_LAT, lng: AKITA_LNG }

    it('accepts unknown as a valid species here (DB allows american|bullfrog|unknown)', () => {
      expect(surveyRequestInputSchema.safeParse({ ...base, species: 'unknown', reason: 'r' }).success).toBe(true)
    })
    it('AC-02: accepts reason at exactly 300 chars and rejects 301 (drift fixed: not 500)', () => {
      expect(surveyRequestInputSchema.safeParse({ ...base, reason: 'a'.repeat(MAX_SURVEY_REASON_LENGTH) }).success).toBe(true)
      expect(surveyRequestInputSchema.safeParse({ ...base, reason: 'a'.repeat(MAX_SURVEY_REASON_LENGTH + 1) }).success).toBe(false)
    })
    it('AC-02: rejects a 400-char reason that the old 500 limit would have let through', () => {
      expect(surveyRequestInputSchema.safeParse({ ...base, reason: 'a'.repeat(400) }).success).toBe(false)
    })
    it('rejects empty reason and invalid urgency', () => {
      expect(surveyRequestInputSchema.safeParse({ ...base, reason: '' }).success).toBe(false)
      expect(surveyRequestInputSchema.safeParse({ ...base, reason: 'r', urgency: 'super' }).success).toBe(false)
    })
  })

  // ── surveyRequestCommentInputSchema ─────────────────────────
  describe('surveyRequestCommentInputSchema', () => {
    it('accepts body at MAX_SURVEY_REQUEST_COMMENT_LENGTH, rejects empty / +1', () => {
      expect(surveyRequestCommentInputSchema.safeParse({ body: 'a'.repeat(MAX_SURVEY_REQUEST_COMMENT_LENGTH) }).success).toBe(true)
      expect(surveyRequestCommentInputSchema.safeParse({ body: '' }).success).toBe(false)
      expect(surveyRequestCommentInputSchema.safeParse({ body: 'a'.repeat(MAX_SURVEY_REQUEST_COMMENT_LENGTH + 1) }).success).toBe(false)
    })
  })

  // ── surveySiteInputSchema ───────────────────────────────────
  describe('surveySiteInputSchema', () => {
    const base = { name: 'pond A', lat: AKITA_LAT, lng: AKITA_LNG }
    it('accepts a valid site', () => {
      expect(surveySiteInputSchema.safeParse(base).success).toBe(true)
    })
    it('accepts name at SURVEY_SITE_NAME_MAX, rejects empty / +1', () => {
      expect(surveySiteInputSchema.safeParse({ ...base, name: 'a'.repeat(SURVEY_SITE_NAME_MAX) }).success).toBe(true)
      expect(surveySiteInputSchema.safeParse({ ...base, name: '' }).success).toBe(false)
      expect(surveySiteInputSchema.safeParse({ ...base, name: 'a'.repeat(SURVEY_SITE_NAME_MAX + 1) }).success).toBe(false)
    })
    it('accepts notes at SURVEY_SITE_NOTES_MAX, rejects +1; allows null', () => {
      expect(surveySiteInputSchema.safeParse({ ...base, notes: 'a'.repeat(SURVEY_SITE_NOTES_MAX) }).success).toBe(true)
      expect(surveySiteInputSchema.safeParse({ ...base, notes: 'a'.repeat(SURVEY_SITE_NOTES_MAX + 1) }).success).toBe(false)
      expect(surveySiteInputSchema.safeParse({ ...base, notes: null }).success).toBe(true)
    })
    it('species nullable but allow-list when present', () => {
      expect(surveySiteInputSchema.safeParse({ ...base, species: null }).success).toBe(true)
      expect(surveySiteInputSchema.safeParse({ ...base, species: 'american' }).success).toBe(true)
      expect(surveySiteInputSchema.safeParse({ ...base, species: 'unknown' }).success).toBe(false)
    })
  })

  // ── profileUpdateSchema (partial) ───────────────────────────
  describe('profileUpdateSchema', () => {
    it('accepts an empty partial update', () => {
      expect(profileUpdateSchema.safeParse({}).success).toBe(true)
    })
    it('accepts display_name at PROFILE_DISPLAY_NAME_MAX and null (clearing), rejects empty / +1', () => {
      expect(profileUpdateSchema.safeParse({ display_name: 'a'.repeat(PROFILE_DISPLAY_NAME_MAX) }).success).toBe(true)
      expect(profileUpdateSchema.safeParse({ display_name: null }).success).toBe(true)
      expect(profileUpdateSchema.safeParse({ display_name: '' }).success).toBe(false)
      expect(profileUpdateSchema.safeParse({ display_name: 'a'.repeat(PROFILE_DISPLAY_NAME_MAX + 1) }).success).toBe(false)
    })
    it('accepts bio at PROFILE_BIO_MAX and null, rejects +1', () => {
      expect(profileUpdateSchema.safeParse({ bio: 'a'.repeat(PROFILE_BIO_MAX) }).success).toBe(true)
      expect(profileUpdateSchema.safeParse({ bio: null }).success).toBe(true)
      expect(profileUpdateSchema.safeParse({ bio: 'a'.repeat(PROFILE_BIO_MAX + 1) }).success).toBe(false)
    })
  })

  // ── validateWithSchema helper ───────────────────────────────
  describe('validateWithSchema helper', () => {
    it('returns {valid:true} for valid input', () => {
      expect(validateWithSchema(commentInputSchema, { content: 'ok' })).toEqual({ valid: true })
    })
    it('returns {valid:false, messageKey} carrying the i18n key for invalid input', () => {
      const r = validateWithSchema(commentInputSchema, { content: '' })
      expect(r.valid).toBe(false)
      expect(r.messageKey).toBe('validation.content.required')
    })
  })
})

/**
 * NFR-213-04: 検証ドリフト検知。
 * 共有定数（constants.ts、= zod スキーマが参照する正本）が DB の CHECK 制約値
 * （supabase/schema.sql / migration）と一致することを「実ファイルから抽出した値」で照合する。
 * これにより、将来 DB 制約だけ／定数だけを変えた場合に CI（vitest）が落ちて検知できる。
 * 特に本 REQ で修正した reason 300（旧 500）の再発を 1 本以上のテストで防ぐ（NFR-213-04 末尾）。
 */
describe('validation drift detection vs DB CHECK constraints (NFR-213-04)', () => {
  const schemaSql = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')
  const reqCommentSql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260425000005_survey_request_comments.sql'),
    'utf8',
  )

  it('AC-02: survey_requests.reason DB CHECK is BETWEEN 1 AND 300 (matches MAX_SURVEY_REASON_LENGTH)', () => {
    expect(schemaSql).toMatch(/reason[^\n]*char_length\(reason\)\s+BETWEEN\s+1\s+AND\s+300/)
    expect(MAX_SURVEY_REASON_LENGTH).toBe(300)
  })

  it('posts.comment DB CHECK is <= 500 (matches MAX_COMMENT_LENGTH)', () => {
    expect(schemaSql).toMatch(/char_length\(comment\)\s*<=\s*500/)
    expect(MAX_COMMENT_LENGTH).toBe(500)
  })

  it('comments.content DB CHECK is <= 500 (matches MAX_COMMENT_LENGTH)', () => {
    expect(schemaSql).toMatch(/char_length\(content\)\s*<=\s*500/)
  })

  it('reports.comment DB CHECK is <= 500 (matches MAX_REPORT_COMMENT_LENGTH)', () => {
    // schema.sql:286 ALTER ... CHECK (comment IS NULL OR char_length(comment) <= 500)
    expect(schemaSql).toMatch(/comment IS NULL OR char_length\(comment\)\s*<=\s*500/)
    expect(MAX_REPORT_COMMENT_LENGTH).toBe(500)
  })

  it('survey_request_comments.body DB CHECK is BETWEEN 1 AND 500 (matches constant)', () => {
    expect(reqCommentSql).toMatch(/char_length\(body\)\s+BETWEEN\s+1\s+AND\s+500/)
    expect(MAX_SURVEY_REQUEST_COMMENT_LENGTH).toBe(500)
  })

  it('survey_sites.name BETWEEN 1 AND 100 and notes <= 500 (matches constants)', () => {
    expect(schemaSql).toMatch(/char_length\(name\)\s+BETWEEN\s+1\s+AND\s+100/)
    expect(schemaSql).toMatch(/char_length\(notes\)\s*<=\s*500/)
    expect(SURVEY_SITE_NAME_MAX).toBe(100)
    expect(SURVEY_SITE_NOTES_MAX).toBe(500)
  })

  it('user_profiles.display_name BETWEEN 1 AND 20 and bio <= 100 (matches constants)', () => {
    expect(schemaSql).toMatch(/char_length\(display_name\)\s+BETWEEN\s+1\s+AND\s+20/)
    expect(schemaSql).toMatch(/char_length\(bio\)\s*<=\s*100/)
    expect(PROFILE_DISPLAY_NAME_MAX).toBe(20)
    expect(PROFILE_BIO_MAX).toBe(100)
  })

  it('posts.count 1..999, humidity 0..100, survey_duration 1..480 (matches constants)', () => {
    expect(schemaSql).toMatch(/count\s*>\s*0\s+AND\s+count\s*<=\s*999/)
    expect(schemaSql).toMatch(/humidity\s+BETWEEN\s+0\s+AND\s+100/)
    expect(schemaSql).toMatch(/survey_duration_minutes\s*>\s*0\s+AND\s+survey_duration_minutes\s*<=\s*480/)
    expect([COUNT_MIN, COUNT_MAX]).toEqual([1, 999])
    expect([HUMIDITY_MIN, HUMIDITY_MAX]).toEqual([0, 100])
    expect([SURVEY_DURATION_MIN, SURVEY_DURATION_MAX]).toEqual([1, 480])
  })

  it('enum allow-lists match DB CHECK IN(...) lists exactly', () => {
    // posts.species / survey_requests.species / report reason / urgency are the load-bearing enums.
    expect(schemaSql).toMatch(/species IN \('american', 'bullfrog'\)/)
    expect(schemaSql).toMatch(/species IN \('american', 'bullfrog', 'unknown'\)/)
    expect(schemaSql).toMatch(/reason IN \('spam', 'wrong_location', 'inappropriate', 'other'\)/)
    expect(schemaSql).toMatch(/urgency IN \('normal', 'urgent'\)/)
    // zod allow-lists (single source via constants/schemas) line up with the above.
    expect(speciesSchema.options).toEqual(['american', 'bullfrog'])
    expect(infoTypeSchema.options).toEqual(['sighting', 'capture', 'trace', 'damage', 'absence'])
  })
})
