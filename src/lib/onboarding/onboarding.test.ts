import { describe, expect, it } from 'vitest'
import { AKITA_FIT_BOUNDS } from '@/lib/constants'
import { REGIONS, SEEN, regionBounds, stepFor, isRegion, isSeen, isFreshSignup } from './index'

describe('REQ-325 onboarding logic', () => {
  it('5地域・3経験の値と表示キーを持つ', () => {
    expect(REGIONS.map(x => x.value)).toEqual(['akita_city', 'north', 'central', 'south', 'other'])
    expect(SEEN.map(x => x.value)).toEqual(['yes', 'no', 'maybe'])
    for (const option of [...REGIONS, ...SEEN]) expect(option.labelKey).toContain('onboarding.')
  })
  it('確定した回答と確認状態で1〜5へ進む', () => {
    expect(stepFor({})).toBe(1)
    expect(stepFor({ introduced: true })).toBe(2)
    expect(stepFor({ introduced: true, region: 'north' })).toBe(3)
    expect(stepFor({ introduced: true, region: 'north', seen: 'no' })).toBe(4)
    expect(stepFor({ introduced: true, region: 'north', seen: 'no', factAcknowledged: true })).toBe(5)
    expect(stepFor({ introduced: true, factAcknowledged: true, seen: 'yes' })).toBe(2)
  })
  it.each([
    ['akita_city', [[39.55, 139.95], [39.85, 140.35]]],
    ['north', [[39.95, 139.69], [40.51, 140.99]]],
    ['central', [[39.35, 139.69], [39.95, 140.60]]],
    ['south', [[38.87, 139.90], [39.40, 140.99]]],
    ['other', AKITA_FIT_BOUNDS],
  ])('%sの南西・北東を返す', (region, bounds) => {
    expect(regionBounds(region)).toEqual(bounds)
  })
  it.each([undefined, null, '', 'tokyo', '__proto__', 1])('不正な地域 %s は県全域', value => {
    expect(regionBounds(value)).toEqual(AKITA_FIT_BOUNDS)
    expect(isRegion(value)).toBe(false)
    expect(isSeen(value)).toBe(false)
  })
  it('返却配列の変更は定数へ波及しない', () => {
    const bounds = regionBounds('other')
    bounds[0][0] = 0
    expect(regionBounds('other')).toEqual(AKITA_FIT_BOUNDS)
  })
})

describe('isFreshSignup（REQ-326: 登録直後かどうか）', () => {
  const now = Date.parse('2026-09-14T12:00:00Z')
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

  it('登録直後は新規として扱う', () => {
    expect(isFreshSignup(at(0), now)).toBe(true)
    expect(isFreshSignup(at(29), now)).toBe(true)
  })

  it('30分を過ぎたら既存会員として扱う', () => {
    expect(isFreshSignup(at(31), now)).toBe(false)
    expect(isFreshSignup(at(60 * 24), now)).toBe(false)
  })

  // 判定できないことを理由に閉じ込めない＝既存会員側（スキップを出す側）に倒す。
  it('値が無い・壊れているときは既存会員として扱う', () => {
    expect(isFreshSignup(null, now)).toBe(false)
    expect(isFreshSignup(undefined, now)).toBe(false)
    expect(isFreshSignup('not-a-date', now)).toBe(false)
    expect(isFreshSignup('', now)).toBe(false)
  })
})
