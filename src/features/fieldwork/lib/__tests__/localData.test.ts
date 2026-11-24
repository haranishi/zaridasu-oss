import { beforeEach, describe, expect, it } from 'vitest'

import { enqueuePendingSpot } from '@/lib/privateSpots'

import { PRIVATE_SPOT_QUEUE_KEY, clearPendingPrivateSpots, countPendingPrivateSpots } from '../localData'

const A = 'user-a'
const B = 'user-b'
const spot = (userId: string) => ({
  userId, name: '沼', note: null, lat: 39.7, lng: 140.1, accuracy: null, recordedAt: '2026-10-21T00:00:00Z',
})

beforeEach(() => localStorage.clear())

describe('非公開スポットの送信待ち（端末に残る座標）の件数と片付け', () => {
  it('保存先のキーが privateSpots.ts と同じ（ここは import を増やせないので値を持ち直している）', () => {
    expect(enqueuePendingSpot(spot(A))).not.toBeNull()
    expect(localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY)).not.toBeNull()
    expect(countPendingPrivateSpots(A)).toBe(1)
  })

  it('件数は、その人の分だけを数える', () => {
    enqueuePendingSpot(spot(A))
    enqueuePendingSpot(spot(A))
    enqueuePendingSpot(spot(B))
    expect(countPendingPrivateSpots(A)).toBe(2)
    expect(countPendingPrivateSpots(B)).toBe(1)
    expect(countPendingPrivateSpots('nobody')).toBe(0)
  })

  it('片付けは、その人の分だけを消し、同じ端末のほかの人の分は残す', () => {
    enqueuePendingSpot(spot(A))
    enqueuePendingSpot(spot(B))
    clearPendingPrivateSpots(A)
    expect(countPendingPrivateSpots(A)).toBe(0)
    expect(countPendingPrivateSpots(B)).toBe(1)
  })

  it('全員の分が無くなったら、保存先のキーごと消す', () => {
    enqueuePendingSpot(spot(A))
    clearPendingPrivateSpots(A)
    expect(localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY)).toBeNull()
  })

  it('その人の分が無いときは、保存先を書き換えない', () => {
    enqueuePendingSpot(spot(B))
    const before = localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY)
    clearPendingPrivateSpots(A)
    expect(localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY)).toBe(before)
  })

  it('壊れた保存内容でも投げず、0 件として扱う', () => {
    localStorage.setItem(PRIVATE_SPOT_QUEUE_KEY, '{not json')
    expect(countPendingPrivateSpots(A)).toBe(0)
    expect(() => clearPendingPrivateSpots(A)).not.toThrow()
    localStorage.setItem(PRIVATE_SPOT_QUEUE_KEY, JSON.stringify([null, 'x', 3]))
    expect(countPendingPrivateSpots(A)).toBe(0)
  })
})
