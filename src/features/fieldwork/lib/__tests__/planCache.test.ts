import { beforeEach, describe, expect, it } from 'vitest'

import { planCacheKey, readPlanCache, writePlanCache } from '../planCache'

// REQ-330 §3 圏外のとき: 計画の控えは利用者ごとに別の保存先。圏外では「最後に同期した内容」として見せる。

const A = 'user-a'
const B = 'user-b'
const plan = {
  id: 'p1',
  title: '10/1 の調査',
  planned_on: '2026-10-01',
  status: 'active' as const,
  note: null,
  created_at: '2026-09-30T12:00:00Z',
  updated_at: '2026-09-30T12:00:00Z',
}

beforeEach(() => localStorage.clear())

describe('planCache', () => {
  it('利用者ごとに保存し、同期した時刻を付ける', () => {
    writePlanCache(A, { plans: [plan], currentPlanId: 'p1', stops: [], links: [], rare: [] }, new Date('2026-10-01T03:04:05Z'))
    expect(readPlanCache(A)).toMatchObject({ currentPlanId: 'p1', savedAt: '2026-10-01T03:04:05.000Z' })
    expect(readPlanCache(B)).toBeNull()
    expect(planCacheKey(A)).not.toBe(planCacheKey(B))
  })

  it('壊れた控えは読まない', () => {
    localStorage.setItem(planCacheKey(A), '{"plans":1}')
    expect(readPlanCache(A)).toBeNull()
    localStorage.setItem(planCacheKey(A), 'oops')
    expect(readPlanCache(A)).toBeNull()
  })
})
