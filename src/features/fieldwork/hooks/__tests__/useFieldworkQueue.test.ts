import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('../../data/sendQueued', () => ({ sendQueuedItem: send }))

import { useFieldworkQueue } from '../useFieldworkQueue'
import { enqueue, readQueue, type QueueItem } from '../../lib/queue'

// REQ-330 AC-07 / AC-08: 電波が戻ったら 1 回だけ送る。別の人の送信待ちは送らない。

const A = '00000000-0000-0000-0000-00000000aaaa'
const B = '00000000-0000-0000-0000-00000000bbbb'

function status(userId: string, clientId: string): QueueItem {
  return { type: 'status', clientId, userId, at: '2026-10-01T05:00:00.000Z', stopId: 's1', status: 'done' }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  send.mockResolvedValue(undefined)
})

describe('useFieldworkQueue', () => {
  it('開いた時点で残っていれば送り、送れたら onSent を呼ぶ', async () => {
    enqueue(status(A, 'c1'))
    const onSent = vi.fn()
    const { result } = renderHook(() => useFieldworkQueue(A, { onSent }))
    await waitFor(() => expect(result.current.items).toEqual([]))
    expect(send).toHaveBeenCalledTimes(1)
    expect(onSent).toHaveBeenCalledTimes(1)
  })

  it('online イベントが続けて来ても、同じ client_id は 1 回しか送らない', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    enqueue(status(A, 'c1'))
    let release!: () => void
    send.mockImplementation(() => new Promise<void>((r) => (release = r)))
    const { result } = renderHook(() => useFieldworkQueue(A))
    expect(send).not.toHaveBeenCalled()

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })
    await act(async () => {
      release()
    })
    await waitFor(() => expect(result.current.items).toEqual([]))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('別の人の送信待ちは、ログインしている人の画面からは送らない', async () => {
    enqueue(status(A, 'from-a'))
    const { result } = renderHook(() => useFieldworkQueue(B))
    await act(() => result.current.flush())
    expect(send).not.toHaveBeenCalled()
    expect(result.current.items).toEqual([])
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['from-a'])
  })

  it('積むと画面の一覧にも出る', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useFieldworkQueue(A))
    act(() => {
      expect(result.current.enqueue(status(A, 'c9'))).toBe(true)
    })
    expect(result.current.items.map((i) => i.clientId)).toEqual(['c9'])
  })
})
