import { describe, it, expect } from 'vitest'
import { toLocalISODate, todayLocalISODate } from '../localDate'

describe('toLocalISODate', () => {
  it('ローカル成分どおりの YYYY-MM-DD を返す（ゼロ埋め込み）', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toLocalISODate(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(toLocalISODate(new Date(1999, 8, 9))).toBe('1999-09-09')
  })

  it('ローカル深夜でも日付が変わらない（UTC変換の1日ズレを起こさない）', () => {
    // ローカル 00:30 に作った Date。toISOString() だと UTC+n の環境で前日になるが、
    // 本ヘルパーはローカル成分を読むため必ず同じ日付を返す。
    const localMidnight = new Date(2026, 6, 17, 0, 30)
    expect(toLocalISODate(localMidnight)).toBe('2026-07-17')
    const localLateNight = new Date(2026, 6, 17, 23, 30)
    expect(toLocalISODate(localLateNight)).toBe('2026-07-17')
  })

  it('todayLocalISODate は現在時刻のローカル成分と一致する', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(todayLocalISODate()).toBe(expected)
  })
})
