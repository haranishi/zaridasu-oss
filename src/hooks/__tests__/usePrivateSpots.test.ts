import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { selectOwnMock, insertMock, deleteMock, renameMock } = vi.hoisted(() => ({
  selectOwnMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
  renameMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('@/lib/data/private-spots', () => ({
  selectOwnPrivateSpots: selectOwnMock,
  insertPrivateSpot: insertMock,
  deletePrivateSpot: deleteMock,
  renamePrivateSpot: renameMock,
}))

import { usePrivateSpots } from '../usePrivateSpots'
import { enqueuePendingSpot, readPendingSpots } from '@/lib/privateSpots'

const spot = (id: string) => ({
  id, name: `spot ${id}`, note: null, lat: 39.7, lng: 140.1, accuracy: null, recorded_at: '2026-09-26T00:00:00Z', created_at: '2026-09-26T00:00:00Z',
})
const input = { name: 'メダカの池', note: null, lat: 39.7, lng: 140.1, accuracy: 5 }

function setOnline(v: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  setOnline(true)
  selectOwnMock.mockResolvedValue({ data: [spot('a')], error: null })
  insertMock.mockImplementation(async (_c: unknown, s: { name: string }) => ({ ...spot('new'), name: s.name }))
})
afterEach(() => setOnline(true))

describe('usePrivateSpots (REQ-329)', () => {
  it('ログイン中は自分のスポットを読み込む', async () => {
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(result.current.spots).toHaveLength(1))
    expect(selectOwnMock).toHaveBeenCalledWith(expect.anything(), 'user-1')
  })

  it('未ログインでは読み込まず、保存は login エラー', async () => {
    const { result } = renderHook(() => usePrivateSpots(null))
    let res
    await act(async () => { res = await result.current.save(input) })
    expect(res).toEqual({ status: 'error', reason: 'login' })
    expect(selectOwnMock).not.toHaveBeenCalled()
  })

  it('オンラインで保存すると一覧の先頭に入る', async () => {
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(result.current.spots).toHaveLength(1))
    let res
    await act(async () => { res = await result.current.save(input) })
    expect(res).toEqual({ status: 'saved' })
    expect(result.current.spots[0]?.name).toBe('メダカの池')
  })

  it('圏外なら端末に保存して queued を返す（送らない）', async () => {
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(selectOwnMock).toHaveBeenCalled())
    setOnline(false)
    let res
    await act(async () => { res = await result.current.save(input) })
    expect(res).toEqual({ status: 'queued' })
    expect(insertMock).not.toHaveBeenCalled()
    expect(readPendingSpots()).toHaveLength(1)
    expect(result.current.pending).toHaveLength(1)
  })

  it('送信が通信エラーで失敗したら端末に保存する', async () => {
    insertMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(selectOwnMock).toHaveBeenCalled())
    let res
    await act(async () => { res = await result.current.save(input) })
    expect(res).toEqual({ status: 'queued' })
    expect(readPendingSpots()).toHaveLength(1)
  })

  it('圏外で保存した後に初回読込が完了しても、送信せず一件だけ表示する', async () => {
    const loading = deferred<{ data: ReturnType<typeof spot>[]; error: null }>()
    selectOwnMock.mockReturnValueOnce(loading.promise)
    setOnline(false)
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await act(async () => { await result.current.save(input) })
    await act(async () => { loading.resolve({ data: [], error: null }) })
    expect(insertMock).not.toHaveBeenCalled()
    expect(readPendingSpots()).toHaveLength(1)
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.pending[0]?.name).toBe(input.name)
  })

  it('保存上限（P0001）は端末に溜めずにエラーを返す', async () => {
    insertMock.mockRejectedValueOnce({ code: 'P0001', message: '上限' })
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(selectOwnMock).toHaveBeenCalled())
    let res
    await act(async () => { res = await result.current.save(input) })
    expect(res).toEqual({ status: 'error', reason: 'rateLimit' })
    expect(readPendingSpots()).toHaveLength(0)
  })

  it('起動時に自分の未送信分だけを送る（同じ端末の他人の分は送らない）', async () => {
    enqueuePendingSpot({ userId: 'user-1', ...input, recordedAt: '2026-09-25T00:00:00Z' })
    enqueuePendingSpot({ userId: 'someone-else', ...input, recordedAt: '2026-09-25T00:00:00Z' })
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    expect(insertMock.mock.calls[0]?.[1]).toMatchObject({ userId: 'user-1', recordedAt: '2026-09-25T00:00:00Z' })
    await waitFor(() => expect(result.current.pending).toHaveLength(0))
    expect(readPendingSpots().map((s) => s.userId)).toEqual(['someone-else'])
  })

  it('削除すると一覧から消える', async () => {
    deleteMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(result.current.spots).toHaveLength(1))
    await act(async () => { await result.current.remove('a') })
    expect(result.current.spots).toHaveLength(0)
  })

  it('別アカウントの読込待ち中も前の地点を表示しない', async () => {
    const loading = deferred<{ data: ReturnType<typeof spot>[]; error: null }>()
    const { result, rerender } = renderHook(({ userId }) => usePrivateSpots(userId), {
      initialProps: { userId: 'user-1' as string | null },
    })
    await waitFor(() => expect(result.current.spots).toHaveLength(1))
    selectOwnMock.mockReturnValueOnce(loading.promise)
    rerender({ userId: 'user-2' })
    expect(result.current.spots).toEqual([])
    await act(async () => { loading.resolve({ data: [spot('b')], error: null }) })
    expect(result.current.spots.map((s) => s.id)).toEqual(['b'])
  })

  it.each([null, 'user-2'])('flush待ちで %s へ切り替えても旧利用者の地点を復活させない', async (nextUser) => {
    const sending = deferred<ReturnType<typeof spot>>()
    enqueuePendingSpot({ userId: 'user-1', ...input, recordedAt: '2026-09-25T00:00:00Z' })
    enqueuePendingSpot({ userId: 'user-1', ...input, recordedAt: '2026-09-25T01:00:00Z' })
    insertMock.mockReturnValueOnce(sending.promise)
    selectOwnMock.mockResolvedValue({ data: [], error: null })
    const { result, rerender } = renderHook(({ userId }) => usePrivateSpots(userId), {
      initialProps: { userId: 'user-1' as string | null },
    })
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    rerender({ userId: nextUser })
    await act(async () => { sending.resolve(spot('old-account')) })
    expect(result.current.spots).toEqual([])
    expect(result.current.pending).toEqual([])
    // The acknowledged item is removed, but no next request uses the old identity.
    expect(insertMock).toHaveBeenCalledTimes(1)
    expect(readPendingSpots()).toHaveLength(1)
  })

  it('保存応答がA→B→Aの切替後に届いても新しいセッションへ混ぜない', async () => {
    const sending = deferred<ReturnType<typeof spot>>()
    insertMock.mockReturnValueOnce(sending.promise)
    selectOwnMock.mockResolvedValue({ data: [], error: null })
    const { result, rerender } = renderHook(({ userId }) => usePrivateSpots(userId), {
      initialProps: { userId: 'user-1' },
    })
    let saving!: ReturnType<typeof result.current.save>
    act(() => { saving = result.current.save(input) })
    rerender({ userId: 'user-2' })
    rerender({ userId: 'user-1' })
    await act(async () => { sending.resolve(spot('stale')); await saving })
    expect(await saving).toEqual({ status: 'error', reason: 'login' })
    expect(result.current.spots).toEqual([])
  })

  it.each([false, true])('A→B→Aで送信中のキューを二重送信しない (remount=%s)', async (remount) => {
    const sending = deferred<ReturnType<typeof spot>>()
    enqueuePendingSpot({ userId: 'user-1', ...input, recordedAt: '2026-09-25T00:00:00Z' })
    insertMock.mockReturnValue(sending.promise)
    selectOwnMock.mockResolvedValue({ data: [], error: null })
    const initial = renderHook(({ userId }) => usePrivateSpots(userId), {
      initialProps: { userId: 'user-1' },
    })
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    initial.rerender({ userId: 'user-2' })
    let current = initial.result
    if (remount) {
      initial.unmount()
      current = renderHook(() => usePrivateSpots('user-1')).result
    } else {
      initial.rerender({ userId: 'user-1' })
    }
    await act(async () => { await Promise.resolve() })
    const sendsBeforeAcknowledgment = insertMock.mock.calls.length
    await act(async () => { sending.resolve(spot('queued-once')) })
    expect(sendsBeforeAcknowledgment).toBe(1)
    expect(current.current.spots.map((s) => s.id)).toEqual(['queued-once'])
    expect(readPendingSpots()).toEqual([])
    expect(current.current.pending).toEqual([])
  })

  it('ログアウト後の通信失敗を旧利用者のキューへ追加しない', async () => {
    const sending = deferred<ReturnType<typeof spot>>()
    insertMock.mockReturnValueOnce(sending.promise)
    const { result, rerender } = renderHook(({ userId }) => usePrivateSpots(userId), {
      initialProps: { userId: 'user-1' as string | null },
    })
    let saving!: ReturnType<typeof result.current.save>
    act(() => { saving = result.current.save(input) })
    rerender({ userId: null })
    await act(async () => { sending.reject(new TypeError('Failed to fetch')); await saving })
    expect(await saving).toEqual({ status: 'error', reason: 'login' })
    expect(result.current.pending).toEqual([])
    expect(readPendingSpots()).toEqual([])
  })

  it('失敗した共有送信を保持せず、onlineで未送信項目を再試行できる', async () => {
    enqueuePendingSpot({ userId: 'user-1', ...input, recordedAt: '2026-09-25T00:00:00Z' })
    insertMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    selectOwnMock.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1))
    expect(readPendingSpots()).toHaveLength(1)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(insertMock).toHaveBeenCalledTimes(2)
    expect(result.current.spots).toHaveLength(1)
    expect(result.current.pending).toEqual([])
    expect(readPendingSpots()).toEqual([])
  })

  it('他の利用者の未送信項目は削除できない', async () => {
    const other = enqueuePendingSpot({ userId: 'user-2', ...input, recordedAt: '2026-09-25T00:00:00Z' })!
    const { result } = renderHook(() => usePrivateSpots('user-1'))
    await waitFor(() => expect(result.current.spots).toHaveLength(1))
    act(() => result.current.removePending(other.localId))
    expect(readPendingSpots().map((s) => s.localId)).toEqual([other.localId])
  })
})
