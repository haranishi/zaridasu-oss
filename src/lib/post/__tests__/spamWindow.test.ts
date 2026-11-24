import { describe, it, expect } from 'vitest'
import { parseTimestampList, evaluateSpamWindow } from '../spamWindow'
import { SPAM_LIMIT_POSTS, SPAM_LIMIT_WINDOW_MS } from '@/lib/constants'

const NOW = Date.parse('2026-03-14T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString()

describe('parseTimestampList', () => {
  it('有効な JSON 配列はそのまま返す', () => {
    const arr = ['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z']
    expect(parseTimestampList(JSON.stringify(arr))).toEqual(arr)
  })

  it('null は空配列に丸める', () => {
    expect(parseTimestampList(null)).toEqual([])
  })

  it('空文字は空配列に丸める', () => {
    expect(parseTimestampList('')).toEqual([])
  })

  it('壊れた JSON は空配列に丸める', () => {
    expect(parseTimestampList('{not json')).toEqual([])
  })

  it('配列でない JSON（オブジェクト/数値）は空配列に丸める', () => {
    expect(parseTimestampList('{"a":1}')).toEqual([])
    expect(parseTimestampList('5')).toEqual([])
  })

  it('破損した配列に文字列以外が混じっても履歴として使わない', () => {
    expect(parseTimestampList('[null,5,{},true,"2026-01-01T00:00:00.000Z"]'))
      .toEqual(['2026-01-01T00:00:00.000Z'])
  })
})

describe('evaluateSpamWindow', () => {
  it('空の履歴は許可し recent は空', () => {
    const r = evaluateSpamWindow([], NOW)
    expect(r.allowed).toBe(true)
    expect(r.recent).toEqual([])
    expect(r.nextAvailable).toBeUndefined()
  })

  it('上限未満（LIMIT-1 件が窓内）は許可する', () => {
    const stored = Array.from({ length: SPAM_LIMIT_POSTS - 1 }, () => iso(1000))
    const r = evaluateSpamWindow(stored, NOW)
    expect(r.allowed).toBe(true)
    expect(r.recent).toHaveLength(SPAM_LIMIT_POSTS - 1)
  })

  it('上限到達（LIMIT 件が窓内）はブロックし nextAvailable を返す', () => {
    const oldestOffset = SPAM_LIMIT_WINDOW_MS - 60_000 // 窓内で最も古い
    const stored = [
      iso(oldestOffset),
      ...Array.from({ length: SPAM_LIMIT_POSTS - 1 }, () => iso(1000)),
    ]
    const r = evaluateSpamWindow(stored, NOW)
    expect(r.allowed).toBe(false)
    // 最古の有効投稿 + 窓長 が次回可能時刻
    const oldestMs = NOW - oldestOffset
    expect(r.nextAvailable?.getTime()).toBe(oldestMs + SPAM_LIMIT_WINDOW_MS)
  })

  it('窓より古いタイムスタンプは無視され、実質件数が上限未満なら許可する', () => {
    const stored = Array.from({ length: SPAM_LIMIT_POSTS + 3 }, () =>
      iso(SPAM_LIMIT_WINDOW_MS + 60_000),
    )
    const r = evaluateSpamWindow(stored, NOW)
    expect(r.allowed).toBe(true)
    expect(r.recent).toEqual([]) // すべて窓外
  })

  it('新旧混在では窓内のみで判定する', () => {
    const recent = Array.from({ length: SPAM_LIMIT_POSTS }, () => iso(1000))
    const old = Array.from({ length: 5 }, () => iso(SPAM_LIMIT_WINDOW_MS + 1000))
    const r = evaluateSpamWindow([...old, ...recent], NOW)
    expect(r.allowed).toBe(false)
    expect(r.recent).toHaveLength(SPAM_LIMIT_POSTS)
  })
})
