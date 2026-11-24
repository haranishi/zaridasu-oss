import { describe, it, expect } from 'vitest'
import { validatePost, PostValidationInput } from '../postValidation'
import { MAX_COMMENT_LENGTH, COUNT_MIN, COUNT_MAX } from '../constants'

describe('validatePost', () => {
  // ── Valid inputs ──────────────────────────────────────────────

  describe('valid inputs', () => {
    it('returns valid for a fully populated valid input', () => {
      const input: PostValidationInput = {
        comment: 'Found near the river',
        count: 5,
        lat: 39.7186,
        lng: 140.1023,
        species: 'american',
        info_type: 'sighting',
      }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns valid when all fields are omitted (empty object)', () => {
      expect(validatePost({})).toEqual({ valid: true, error: null })
    })

    it('returns valid when all optional fields are null', () => {
      const input: PostValidationInput = {
        comment: null,
        count: null,
        lat: null,
        lng: null,
      }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns valid when all optional fields are undefined', () => {
      const input: PostValidationInput = {
        comment: undefined,
        count: undefined,
        lat: undefined,
        lng: undefined,
        species: undefined,
        info_type: undefined,
      }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })
  })

  // ── Comment validation ────────────────────────────────────────

  describe('comment validation', () => {
    it('returns valid for comment at exactly MAX_COMMENT_LENGTH', () => {
      const input: PostValidationInput = {
        comment: 'a'.repeat(MAX_COMMENT_LENGTH),
      }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns invalid for comment exceeding MAX_COMMENT_LENGTH by one', () => {
      const input: PostValidationInput = {
        comment: 'a'.repeat(MAX_COMMENT_LENGTH + 1),
      }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      expect(result.error).toContain(`${MAX_COMMENT_LENGTH}`)
    })

    it('returns valid for an empty string comment', () => {
      const input: PostValidationInput = { comment: '' }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns valid for a short comment', () => {
      const input: PostValidationInput = { comment: 'Hello' }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns invalid for a very long comment', () => {
      const input: PostValidationInput = {
        comment: 'x'.repeat(1000),
      }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      expect(result.error).not.toBeNull()
    })
  })

  // ── Count validation ──────────────────────────────────────────

  describe('count validation', () => {
    it('returns valid for count at COUNT_MIN', () => {
      const input: PostValidationInput = { count: COUNT_MIN }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns valid for count at COUNT_MAX', () => {
      const input: PostValidationInput = { count: COUNT_MAX }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })

    it('returns invalid for count below COUNT_MIN (zero)', () => {
      const input: PostValidationInput = { count: 0 }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      expect(result.error).toContain(`${COUNT_MIN}`)
    })

    it('returns invalid for count above COUNT_MAX', () => {
      const input: PostValidationInput = { count: COUNT_MAX + 1 }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      expect(result.error).toContain(`${COUNT_MAX}`)
    })

    it('returns invalid for negative count', () => {
      const result = validatePost({ count: -1 })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for non-integer count (decimal)', () => {
      const result = validatePost({ count: 2.5 })
      expect(result.valid).toBe(false)
    })

    it('returns valid for count provided as a valid numeric string', () => {
      const result = validatePost({ count: '10' })
      expect(result.valid).toBe(true)
    })

    it('returns invalid for count provided as a non-numeric string "abc"', () => {
      const result = validatePost({ count: 'abc' })
      expect(result.valid).toBe(false)
    })

    it('returns valid for count as empty string (skips validation)', () => {
      const result = validatePost({ count: '' })
      expect(result.valid).toBe(true)
    })

    it('returns valid for count as null (skips validation)', () => {
      const result = validatePost({ count: null })
      expect(result.valid).toBe(true)
    })

    it('returns invalid for count as string "0"', () => {
      const result = validatePost({ count: '0' })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for count as decimal string "3.14"', () => {
      const result = validatePost({ count: '3.14' })
      expect(result.valid).toBe(false)
    })

    it('returns valid for count as string at COUNT_MAX boundary', () => {
      const result = validatePost({ count: String(COUNT_MAX) })
      expect(result.valid).toBe(true)
    })

    it('returns invalid for count as string exceeding COUNT_MAX', () => {
      const result = validatePost({ count: String(COUNT_MAX + 1) })
      expect(result.valid).toBe(false)
    })
  })

  // ── Latitude validation ───────────────────────────────────────

  describe('latitude validation', () => {
    it('returns valid for lat at lower boundary (-90)', () => {
      expect(validatePost({ lat: -90 })).toEqual({ valid: true, error: null })
    })

    it('returns valid for lat at upper boundary (90)', () => {
      expect(validatePost({ lat: 90 })).toEqual({ valid: true, error: null })
    })

    it('returns valid for lat at zero', () => {
      expect(validatePost({ lat: 0 })).toEqual({ valid: true, error: null })
    })

    it('returns invalid for lat below -90', () => {
      const result = validatePost({ lat: -90.1 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('-90')
    })

    it('returns invalid for lat above 90', () => {
      const result = validatePost({ lat: 90.1 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('90')
    })

    it('returns invalid for extremely large lat', () => {
      const result = validatePost({ lat: 1000 })
      expect(result.valid).toBe(false)
    })

    it('returns invalid for extremely negative lat', () => {
      const result = validatePost({ lat: -1000 })
      expect(result.valid).toBe(false)
    })

    it('returns valid when lat is null (skips validation)', () => {
      expect(validatePost({ lat: null })).toEqual({ valid: true, error: null })
    })
  })

  // ── Longitude validation ──────────────────────────────────────

  describe('longitude validation', () => {
    it('returns valid for lng at lower boundary (-180)', () => {
      expect(validatePost({ lng: -180 })).toEqual({ valid: true, error: null })
    })

    it('returns valid for lng at upper boundary (180)', () => {
      expect(validatePost({ lng: 180 })).toEqual({ valid: true, error: null })
    })

    it('returns valid for lng at zero', () => {
      expect(validatePost({ lng: 0 })).toEqual({ valid: true, error: null })
    })

    it('returns invalid for lng below -180', () => {
      const result = validatePost({ lng: -180.1 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('-180')
    })

    it('returns invalid for lng above 180', () => {
      const result = validatePost({ lng: 180.1 })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('180')
    })

    it('returns invalid for extremely large lng', () => {
      const result = validatePost({ lng: 999 })
      expect(result.valid).toBe(false)
    })

    it('returns valid when lng is null (skips validation)', () => {
      expect(validatePost({ lng: null })).toEqual({ valid: true, error: null })
    })
  })

  // ── Species validation ────────────────────────────────────────

  describe('species validation', () => {
    it('returns valid for species "american"', () => {
      expect(validatePost({ species: 'american' })).toEqual({ valid: true, error: null })
    })

    it('returns valid for species "bullfrog"', () => {
      expect(validatePost({ species: 'bullfrog' })).toEqual({ valid: true, error: null })
    })

    it('returns invalid for unknown species', () => {
      const result = validatePost({ species: 'signal' })
      expect(result.valid).toBe(false)
      expect(result.error).not.toBeNull()
    })

    it('returns invalid for arbitrary species string', () => {
      const result = validatePost({ species: 'lobster' })
      expect(result.valid).toBe(false)
    })

    it('returns valid when species is undefined (skips validation)', () => {
      expect(validatePost({ species: undefined })).toEqual({ valid: true, error: null })
    })

    it('returns valid when species is empty string (falsy, skips validation)', () => {
      expect(validatePost({ species: '' })).toEqual({ valid: true, error: null })
    })
  })

  // ── Info type validation ──────────────────────────────────────

  describe('info_type validation', () => {
    const validTypes = ['sighting', 'capture', 'trace', 'damage', 'absence']

    validTypes.forEach((type) => {
      it(`returns valid for info_type "${type}"`, () => {
        expect(validatePost({ info_type: type })).toEqual({ valid: true, error: null })
      })
    })

    it('returns invalid for unknown info_type', () => {
      const result = validatePost({ info_type: 'hunting' })
      expect(result.valid).toBe(false)
      expect(result.error).not.toBeNull()
    })

    it('returns invalid for info_type with wrong casing', () => {
      const result = validatePost({ info_type: 'Sighting' })
      expect(result.valid).toBe(false)
    })

    it('returns valid when info_type is undefined (skips validation)', () => {
      expect(validatePost({ info_type: undefined })).toEqual({ valid: true, error: null })
    })

    it('returns valid when info_type is empty string (falsy, skips validation)', () => {
      expect(validatePost({ info_type: '' })).toEqual({ valid: true, error: null })
    })
  })

  // ── Multiple invalid fields (first error wins) ───────────────

  describe('multiple invalid fields', () => {
    it('returns the first validation error encountered (comment checked first)', () => {
      const input: PostValidationInput = {
        comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1),
        count: -1,
        lat: 999,
        lng: 999,
        species: 'invalid',
        info_type: 'invalid',
      }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      // Comment is validated first, so the error should be about comment length
      expect(result.error).toContain(`${MAX_COMMENT_LENGTH}`)
    })

    it('returns count error when comment is valid but count is invalid', () => {
      const input: PostValidationInput = {
        comment: 'valid',
        count: -5,
      }
      const result = validatePost(input)
      expect(result.valid).toBe(false)
      expect(result.error).toContain(`${COUNT_MIN}`)
    })
  })

  // ── Edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles count as NaN-producing string', () => {
      const result = validatePost({ count: 'not-a-number' })
      expect(result.valid).toBe(false)
    })

    it('handles count as whitespace string', () => {
      // Number('  ') === 0, which is below COUNT_MIN
      const result = validatePost({ count: '  ' })
      expect(result.valid).toBe(false)
    })

    it('handles count as Infinity-like large number', () => {
      const result = validatePost({ count: 999999 })
      expect(result.valid).toBe(false)
    })

    it('returns valid for a realistic Akita prefecture coordinate', () => {
      const input: PostValidationInput = {
        comment: 'River spotted',
        count: 3,
        lat: 39.7186,
        lng: 140.1023,
        species: 'american',
        info_type: 'sighting',
      }
      expect(validatePost(input)).toEqual({ valid: true, error: null })
    })
  })
})
