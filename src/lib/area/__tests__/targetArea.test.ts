import { describe, it, expect } from 'vitest'
import { isWithinTargetPrefecture, isWithinTargetBBox } from '../targetArea'
import { AKITA_BOUNDS } from '@/lib/constants'

describe('isWithinTargetPrefecture', () => {
  it('対象県（秋田県）の各表記を対象内と判定する', () => {
    expect(isWithinTargetPrefecture('秋田県')).toBe(true)
    expect(isWithinTargetPrefecture('秋田')).toBe(true)
    // 逆ジオコで市名が紛れ込んでも "秋田" を含めば許容
    expect(isWithinTargetPrefecture('秋田市')).toBe(true)
  })

  it('英字表記（表記ゆれ）も対象内と判定する', () => {
    expect(isWithinTargetPrefecture('Akita')).toBe(true)
    expect(isWithinTargetPrefecture('Akita Prefecture')).toBe(true)
    expect(isWithinTargetPrefecture('Akita-ken')).toBe(true)
    expect(isWithinTargetPrefecture('akita')).toBe(true)
  })

  it('前後の空白（半角/全角）を無視する', () => {
    expect(isWithinTargetPrefecture('  秋田県 ')).toBe(true)
    expect(isWithinTargetPrefecture('　秋田県　')).toBe(true)
  })

  it('対象外の県は対象外と判定する', () => {
    expect(isWithinTargetPrefecture('青森県')).toBe(false)
    expect(isWithinTargetPrefecture('岩手県')).toBe(false)
    expect(isWithinTargetPrefecture('山形県')).toBe(false)
    expect(isWithinTargetPrefecture('東京都')).toBe(false)
    expect(isWithinTargetPrefecture('Aomori')).toBe(false)
  })

  it('未定義・null・空文字は「対象内と断定しない」＝ false を返す', () => {
    expect(isWithinTargetPrefecture(undefined)).toBe(false)
    expect(isWithinTargetPrefecture(null)).toBe(false)
    expect(isWithinTargetPrefecture('')).toBe(false)
    expect(isWithinTargetPrefecture('   ')).toBe(false)
  })
})

describe('isWithinTargetBBox', () => {
  it('境界ボックス内の座標（秋田市付近）を対象内と判定する', () => {
    expect(isWithinTargetBBox(39.7186, 140.1023)).toBe(true)
  })

  it('境界の端（min/max）を含む', () => {
    const { latMin, latMax, lngMin, lngMax } = AKITA_BOUNDS
    expect(isWithinTargetBBox(latMin, lngMin)).toBe(true)
    expect(isWithinTargetBBox(latMin, lngMax)).toBe(true)
    expect(isWithinTargetBBox(latMax, lngMin)).toBe(true)
    expect(isWithinTargetBBox(latMax, lngMax)).toBe(true)
  })

  it('境界ボックス外（東京付近）を対象外と判定する', () => {
    expect(isWithinTargetBBox(35.6812, 139.7671)).toBe(false)
  })

  it('緯度・経度いずれかが範囲外なら false', () => {
    const { latMin, lngMin } = AKITA_BOUNDS
    expect(isWithinTargetBBox(latMin - 0.1, lngMin)).toBe(false)
    expect(isWithinTargetBBox(latMin, lngMin - 0.1)).toBe(false)
  })

  it('非有限値は false', () => {
    expect(isWithinTargetBBox(Number.NaN, 140)).toBe(false)
    expect(isWithinTargetBBox(39.7, Number.POSITIVE_INFINITY)).toBe(false)
  })
})
