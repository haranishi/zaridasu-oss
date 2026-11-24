import { describe, it, expect } from 'vitest'
import { sanitizeOgParams, TITLE_MAX, AREA_MAX } from '../route'
import { DEFAULT_SPECIES_EMOJI, SPECIES } from '@/lib/constants'

describe('sanitizeOgParams', () => {
  it('title は TITLE_MAX(80) 文字で切り捨てる', () => {
    const long = 'あ'.repeat(200)
    const { title } = sanitizeOgParams({ title: long, species: null, area: null })
    expect(title.length).toBe(TITLE_MAX)
  })

  it('area は AREA_MAX(40) 文字で切り捨てる', () => {
    const long = 'い'.repeat(100)
    const { area } = sanitizeOgParams({ title: null, species: null, area: long })
    expect(area.length).toBe(AREA_MAX)
  })

  it('未知 species はデフォルト絵文字にフォールバック', () => {
    const { emoji } = sanitizeOgParams({ title: null, species: 'unknown-species', area: null })
    expect(emoji).toBe(DEFAULT_SPECIES_EMOJI)
  })

  it('既知 species は SPECIES テーブルの絵文字を返す', () => {
    const { emoji } = sanitizeOgParams({ title: null, species: 'american', area: null })
    expect(emoji).toBe(SPECIES.find((s) => s.value === 'american')?.emoji)
  })

  it('空・空白のみの title/area はデフォルト値（ザリダス／秋田県）に戻る', () => {
    const { title, area } = sanitizeOgParams({ title: '   ', species: null, area: '' })
    expect(title).toBe('ザリダス')
    expect(area).toBe('秋田県')
  })

  it('XSS ペイロード入りの超長 title でも 200 文字以内に切られ、例外を投げない', () => {
    const payload = '<script>alert(1)</script>' + 'a'.repeat(10000)
    expect(() => sanitizeOgParams({ title: payload, species: null, area: null })).not.toThrow()
    const { title } = sanitizeOgParams({ title: payload, species: null, area: null })
    expect(title.length).toBe(TITLE_MAX)
  })
})
