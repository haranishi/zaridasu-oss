import { afterEach, describe, expect, it, vi } from 'vitest'

// REQ-330（2 周目の点検 C6）: ピンの吹き出しの「ここで投稿」も希少種の保護を通す。
// 近くに自分の記録がある・圏外・確かめられない → 位置を非公開に固定（true）。確かめて無ければ固定しない（false）。

const m = vi.hoisted(() => ({ hasOwnRareNear: vi.fn() }))
vi.mock('@/features/fieldwork/data/rareSightings', () => ({ hasOwnRareNear: m.hasOwnRareNear }))
vi.mock('@/lib/supabase/client', () => ({ supabase: { tag: 'client' } }))

import { mustLockPostAt } from '../postLock'

const U = '00000000-0000-0000-0000-00000000aaaa'
const P = { lat: 39.72, lng: 140.1 }

afterEach(() => {
  vi.restoreAllMocks()
  m.hasOwnRareNear.mockReset()
})

describe('mustLockPostAt（REQ-330 C6）', () => {
  it('近くに自分の希少種の記録があれば固定する。DB には利用者と位置を渡す', async () => {
    m.hasOwnRareNear.mockResolvedValue(true)
    await expect(mustLockPostAt(U, P)).resolves.toBe(true)
    expect(m.hasOwnRareNear).toHaveBeenCalledWith({ tag: 'client' }, U, P)
  })

  it('確かめて近くに無ければ固定しない', async () => {
    m.hasOwnRareNear.mockResolvedValue(false)
    await expect(mustLockPostAt(U, P)).resolves.toBe(false)
  })

  it('確かめられない（通信の失敗など）ときは伏せる側に倒す', async () => {
    m.hasOwnRareNear.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(mustLockPostAt(U, P)).resolves.toBe(true)
  })

  it('圏外では DB を見に行かずに固定する', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(mustLockPostAt(U, P)).resolves.toBe(true)
    expect(m.hasOwnRareNear).not.toHaveBeenCalled()
  })
})
