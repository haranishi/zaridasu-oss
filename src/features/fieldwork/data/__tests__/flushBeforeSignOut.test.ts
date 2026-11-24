import { beforeEach, describe, expect, it, vi } from 'vitest'

// ログアウト前に「送ってからログアウト」を選んだとき、圏外で保存した非公開スポット（座標入り）も送る。
// 送れたものは端末から外し、送れないものは件数と理由を返す（呼び手はログアウトをやめる）。

const m = vi.hoisted(() => ({
  flushQueue: vi.fn(),
  isFlushing: vi.fn(),
  readQueue: vi.fn(),
  insertPrivateSpot: vi.fn(),
}))

vi.mock('../../lib/queue', () => ({
  flushQueue: m.flushQueue,
  isFlushing: m.isFlushing,
  readQueue: m.readQueue,
}))
vi.mock('../sendQueued', () => ({ sendQueuedItem: vi.fn() }))
vi.mock('../../lib/errors', () => ({ errorReason: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/data/private-spots', () => ({ insertPrivateSpot: m.insertPrivateSpot }))
vi.mock('@/lib/offlineStore', () => ({ getPendingPosts: async () => [] }))
vi.mock('@/lib/offlineSend', () => ({ sendPendingPost: vi.fn() }))

import { enqueuePendingSpot, readPendingSpots, removePendingSpot } from '@/lib/privateSpots'

import { flushBeforeSignOut } from '../flushBeforeSignOut'

const A = 'user-a'
const B = 'user-b'
const spot = (userId: string, name = '沼') => ({
  userId, name, note: null, lat: 39.7, lng: 140.1, accuracy: null, recordedAt: '2026-10-21T00:00:00Z',
})
const leftFor = (userId: string) => readPendingSpots().filter((s) => s.userId === userId).length

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  localStorage.clear()
  m.flushQueue.mockResolvedValue({ interrupted: false, failed: [] })
  m.isFlushing.mockReturnValue(false)
  m.readQueue.mockReturnValue([])
  m.insertPrivateSpot.mockResolvedValue({ id: 'new' })
})

describe('flushBeforeSignOut — 非公開スポット', () => {
  it('その人の送信待ちを送り、送れたものは端末から外す。ほかの人の分は送らず残す', async () => {
    enqueuePendingSpot(spot(A, '沼1'))
    enqueuePendingSpot(spot(A, '沼2'))
    enqueuePendingSpot(spot(B, '他人の沼'))
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 0, reason: null })
    expect(m.insertPrivateSpot).toHaveBeenCalledTimes(2)
    expect(m.insertPrivateSpot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: A, name: '沼1', lat: 39.7, lng: 140.1 }))
    expect(leftFor(A)).toBe(0)
    expect(leftFor(B)).toBe(1)
  })

  it('通信が切れて送れなかったら、端末に残し、件数と「圏外」の理由を返す', async () => {
    enqueuePendingSpot(spot(A))
    m.insertPrivateSpot.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 1, reason: 'offline' })
    expect(leftFor(A)).toBe(1)
  })

  it('送り直しても通らない失敗（権限・上限）は、端末に残し「送れない」の理由を返す', async () => {
    enqueuePendingSpot(spot(A))
    m.insertPrivateSpot.mockRejectedValue({ message: 'new row violates row-level security policy' })
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 1, reason: 'failed' })
    expect(leftFor(A)).toBe(1)
  })

  it('端末が圏外なら、送ろうとせずに残して「圏外」を返す', async () => {
    enqueuePendingSpot(spot(A))
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 1, reason: 'offline' })
    expect(m.insertPrivateSpot).not.toHaveBeenCalled()
  })

  it('地図の画面が同じものを先に送って端末から外していたら、二重に送らない', async () => {
    const first = enqueuePendingSpot(spot(A, '沼1'))!
    const second = enqueuePendingSpot(spot(A, '沼2'))!
    // 1 件目を送っている間に、別の送信（地図の画面）が 2 件目を送り終えて外した、という状況
    m.insertPrivateSpot.mockImplementationOnce(async () => {
      removePendingSpot(second.localId)
      return { id: 'x' }
    })
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 0, reason: null })
    expect(m.insertPrivateSpot).toHaveBeenCalledTimes(1)
    expect(m.insertPrivateSpot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: '沼1' }))
    expect(first.localId).not.toBe(second.localId)
  })

  it('送るものが無ければ、非公開スポットの送信は走らない', async () => {
    const result = await flushBeforeSignOut(A)
    expect(result).toEqual({ left: 0, reason: null })
    expect(m.insertPrivateSpot).not.toHaveBeenCalled()
  })
})
