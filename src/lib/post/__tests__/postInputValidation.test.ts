import { describe, it, expect } from 'vitest'
import { resolvePostValidationError } from '../postInputValidation'
import { COUNT_MIN, COUNT_MAX, MAX_COMMENT_LENGTH } from '@/lib/constants'

// 秋田県内の有効座標（usePostForm.test の validPostData と同じ）
const VALID = {
  species: 'american',
  info_type: 'sighting',
  lat: 39.7,
  lng: 140.1,
  comment: null as string | null,
  count: null as number | null,
}

describe('resolvePostValidationError', () => {
  it('有効な入力は null（エラー無し）', () => {
    expect(resolvePostValidationError(VALID)).toBeNull()
  })

  it('コメント長超過は commentValidation キー + max params', () => {
    const err = resolvePostValidationError({
      ...VALID,
      comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1),
    })
    expect(err).toEqual({ key: 'postForm.commentValidation', params: { max: MAX_COMMENT_LENGTH } })
  })

  it('個体数の範囲外は countValidation キー + min/max params', () => {
    const err = resolvePostValidationError({ ...VALID, count: COUNT_MAX + 1 })
    expect(err).toEqual({
      key: 'postForm.countValidation',
      params: { min: COUNT_MIN, max: COUNT_MAX },
    })
  })

  it('座標が秋田県外は locationOutOfBounds キー（params 無し）', () => {
    const err = resolvePostValidationError({ ...VALID, lat: 10, lng: 10 })
    expect(err).toEqual({ key: 'postForm.locationOutOfBounds' })
    expect(err?.params).toBeUndefined()
  })

  it('列挙違反（改竄された species）も汎用 locationOutOfBounds で弾く', () => {
    const err = resolvePostValidationError({ ...VALID, species: 'catfish' })
    expect(err).toEqual({ key: 'postForm.locationOutOfBounds' })
  })
})
