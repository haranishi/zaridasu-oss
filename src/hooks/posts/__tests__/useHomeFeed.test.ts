import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useHomeFeed } from '../useHomeFeed'

const { finish } = vi.hoisted(() => ({ finish: vi.fn() }))
const builder = { in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: finish }
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/data/posts', () => ({ selectPublicPostsForHome: () => builder }))
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))

beforeEach(() => {
  vi.clearAllMocks()
  builder.order.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

it('再試行より遅れて届いた古い応答で、新しい一覧を上書きしない', async () => {
  let resolveOld!: (result: unknown) => void
  finish.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
  finish.mockResolvedValueOnce({ data: [{ id: 'new' }], error: null })
  const { result } = renderHook(() => useHomeFeed())
  const oldSignal = finish.mock.calls[0]![0] as AbortSignal
  await act(async () => { await result.current.refresh() })
  expect(oldSignal.aborted).toBe(true)
  await act(async () => { resolveOld({ data: [{ id: 'old' }], error: null }) })
  expect(result.current.posts).toEqual([{ id: 'new' }])
  expect(result.current.error).toBe(false)
})

it('通信失敗は空の成功と区別し、再試行後に解除する', async () => {
  finish.mockResolvedValueOnce({ data: null, error: { message: 'failure' } })
  finish.mockResolvedValueOnce({ data: [], error: null })
  const { result } = renderHook(() => useHomeFeed())
  await waitFor(() => expect(result.current.error).toBe(true))
  await act(async () => { await result.current.refresh() })
  expect(result.current.loading).toBe(false)
  expect(result.current.error).toBe(false)
})

it('画面を離れると進行中のリクエストを中断する', () => {
  finish.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = renderHook(() => useHomeFeed())
  const signal = finish.mock.calls[0]![0] as AbortSignal
  unmount()
  expect(signal.aborted).toBe(true)
})

it('保存がない場合は全投稿を代わりに取得しない', async () => {
  const { result } = renderHook(() => useHomeFeed([]))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(finish).not.toHaveBeenCalled()
  expect(result.current.posts).toEqual([])
})

it('保存一覧の取得は指定IDと200件の上限に絞る', async () => {
  finish.mockResolvedValue({ data: [{ id: 'saved' }], error: null })
  const ids = ['saved']
  const { result } = renderHook(() => useHomeFeed(ids))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(builder.in).toHaveBeenCalledWith('id', ids)
  expect(builder.limit).toHaveBeenCalledWith(200)
})
