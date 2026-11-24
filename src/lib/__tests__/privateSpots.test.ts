import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_PENDING_SPOTS,
  defaultSpotName,
  enqueuePendingSpot,
  isNetworkError,
  normalizeSpotName,
  normalizeSpotNote,
  readPendingSpots,
  removePendingSpot,
} from '../privateSpots'
import { PRIVATE_SPOT_NAME_MAX } from '../constants'

const base = {
  userId: 'user-1',
  name: 'メダカの池',
  note: null,
  lat: 39.7,
  lng: 140.1,
  accuracy: 8,
  recordedAt: '2026-09-26T05:00:00.000Z',
}

beforeEach(() => localStorage.clear())

describe('名前の正規化 (REQ-329)', () => {
  it('前後の空白を落とし、連続する空白を 1 つにする', () => {
    expect(normalizeSpotName('  〇〇沼   の  メダカ ')).toBe('〇〇沼 の メダカ')
  })
  it('上限（DB の CHECK と同じ 60 文字）で切る', () => {
    expect(normalizeSpotName('あ'.repeat(100))).toHaveLength(PRIVATE_SPOT_NAME_MAX)
  })
  it('空白だけなら空文字（呼び出し側が既定名を入れる）', () => {
    expect(normalizeSpotName('   ')).toBe('')
  })
  it('メモは空なら null', () => {
    expect(normalizeSpotNote('  ')).toBeNull()
    expect(normalizeSpotNote(' 3匹 ')).toBe('3匹')
  })
  it('既定名は「接頭辞 月/日 時:分」', () => {
    expect(defaultSpotName('非公開スポット', new Date(2026, 8, 26, 9, 5))).toBe('非公開スポット 9/26 09:05')
  })
})

describe('圏外キュー (REQ-329)', () => {
  it('積んだものを読み出せ、外せる', () => {
    const item = enqueuePendingSpot(base)
    expect(item).not.toBeNull()
    expect(readPendingSpots()).toHaveLength(1)
    removePendingSpot(item!.localId)
    expect(readPendingSpots()).toHaveLength(0)
  })

  it('上限に達したら積まずに null を返す（黙って捨てない）', () => {
    for (let i = 0; i < MAX_PENDING_SPOTS; i++) expect(enqueuePendingSpot(base)).not.toBeNull()
    expect(enqueuePendingSpot(base)).toBeNull()
    expect(readPendingSpots()).toHaveLength(MAX_PENDING_SPOTS)
  })

  it('壊れた値が入っていても落ちず、正しい要素だけ返す', () => {
    localStorage.setItem('zaridasu_pending_private_spots', JSON.stringify([{ foo: 1 }, { ...base, localId: 'x' }]))
    expect(readPendingSpots().map((s) => s.localId)).toEqual(['x'])
    localStorage.setItem('zaridasu_pending_private_spots', '{not json')
    expect(readPendingSpots()).toEqual([])
  })
})

describe('isNetworkError (REQ-329)', () => {
  it('fetch 失敗は通信エラー', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })
  it('RLS 拒否や上限（P0001）は通信エラーではない', () => {
    expect(isNetworkError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false)
    expect(isNetworkError({ code: 'P0001', message: '非公開スポットの保存上限（1時間あたり60件）に達しました' })).toBe(false)
  })
})
