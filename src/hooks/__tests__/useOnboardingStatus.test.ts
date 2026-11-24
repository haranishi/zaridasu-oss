import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ONBOARDING_COMPLETED_EVENT } from '@/lib/onboarding'
import { AKITA_FIT_BOUNDS } from '@/lib/constants'
import { ONBOARDING_STATUS_TIMEOUT_MS, useOnboardingMapBounds, useOnboardingStatus } from '../useOnboardingStatus'

const { from, select, eq, abortSignal, maybeSingle } = vi.hoisted(() => ({
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ supabase: { from } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  from.mockReturnValue({ select })
  select.mockReturnValue({ eq })
  eq.mockReturnValue({ abortSignal })
  abortSignal.mockReturnValue({ maybeSingle })
  maybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('useOnboardingStatus', () => {
  it('未ログインは問い合わせない', () => {
    const { result } = renderHook(() => useOnboardingStatus(undefined))
    expect(result.current).toEqual({ loading: false, done: false, region: null, error: null })
    expect(from).not.toHaveBeenCalled()
  })
  it('本人の行を1回取得し再描画で再取得しない', async () => {
    maybeSingle.mockResolvedValue({ data: { region: 'north' }, error: null })
    const { result, rerender } = renderHook(() => useOnboardingStatus('u1'))
    await waitFor(() => expect(result.current.done).toBe(true))
    expect(result.current.region).toBe('north')
    expect(from).toHaveBeenCalledWith('user_onboarding')
    expect(select).toHaveBeenCalledWith('region')
    expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    rerender()
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })
  it('行なしは未完了', async () => {
    const { result } = renderHook(() => useOnboardingStatus('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.done).toBe(false)
    expect(result.current.error).toBeNull()
  })
  it('オフラインは未完了・loading終了・エラーを返す', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const { result } = renderHook(() => useOnboardingStatus('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.done).toBe(false)
    expect(result.current.error).toBe('offline')
    expect(from).not.toHaveBeenCalled()
  })
  it.each(['returned', 'rejected'])('取得失敗(%s)は完了扱いしない', async kind => {
    if (kind === 'returned') maybeSingle.mockResolvedValue({ data: null, error: { message: 'failed' } })
    else maybeSingle.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useOnboardingStatus('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.done).toBe(false)
    expect(result.current.region).toBeNull()
    expect(result.current.error).toBeTruthy()
  })
  it('ユーザー切替後に古い応答が来ても反映しない', async () => {
    let resolve!: (value: unknown) => void
    maybeSingle.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const { result, rerender } = renderHook(({ id }) => useOnboardingStatus(id), { initialProps: { id: 'u1' } })
    rerender({ id: 'u2' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { resolve({ data: { region: 'north' }, error: null }) })
    expect(result.current.done).toBe(false)
    expect(result.current.region).toBeNull()
    expect(abortSignal.mock.calls[0]![0].aborted).toBe(true)
  })
  it('ログアウトで回答を消し同じIDの再ログインでも取得し直す', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { region: 'north' }, error: null })
    const { result, rerender } = renderHook(({ id }: { id: string | undefined }) => useOnboardingStatus(id), { initialProps: { id: 'u1' as string | undefined } })
    await waitFor(() => expect(result.current.done).toBe(true))
    rerender({ id: undefined })
    expect(result.current.done).toBe(false)
    expect(result.current.region).toBeNull()
    rerender({ id: 'u1' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.done).toBe(false)
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })
  it('アンマウントでリクエストを中断する', () => {
    maybeSingle.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderHook(() => useOnboardingStatus('u1'))
    const signal = abortSignal.mock.calls[0]![0]
    unmount()
    expect(signal.aborted).toBe(true)
  })
})

it('完了通知で同じユーザーの状態を更新し、遅れてきたSELECTで巻き戻さない', async () => {
  let resolve!: (value: unknown) => void
  maybeSingle.mockReturnValue(new Promise(r => { resolve = r }))
  const { result } = renderHook(() => useOnboardingStatus('u1'))
  act(() => window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { userId: 'u2', region: 'south' } })))
  expect(result.current.loading).toBe(true)
  act(() => window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { userId: 'u1', region: 'north' } })))
  expect(result.current).toMatchObject({ loading: false, done: true, region: 'north' })
  await act(async () => resolve({ data: null, error: null }))
  expect(result.current).toMatchObject({ done: true, region: 'north' })
})

afterEach(() => vi.useRealTimers())

it('SELECTが保留したままでも8秒で中断しloadingを終了する', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  maybeSingle.mockReturnValue(new Promise(r => { resolve = r }))
  const { result } = renderHook(() => useOnboardingStatus('u1'))
  await act(async () => vi.advanceTimersByTimeAsync(ONBOARDING_STATUS_TIMEOUT_MS - 1))
  expect(result.current.loading).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(abortSignal.mock.calls[0]![0].aborted).toBe(true)
  expect(result.current).toEqual({ loading: false, done: false, region: null, error: 'timeout' })
  await act(async () => resolve({ data: { region: 'north' }, error: null }))
  expect(result.current.error).toBe('timeout')
  expect(result.current.region).toBeNull()
})

it('地図用SELECTが保留したままでも期限後は県全域のboundsを返す', async () => {
  vi.useFakeTimers()
  maybeSingle.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useOnboardingMapBounds('u1'))
  expect(result.current.loading).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(ONBOARDING_STATUS_TIMEOUT_MS))
  expect(result.current).toEqual({ loading: false, initialBounds: AKITA_FIT_BOUNDS })
})

it('SELECT保留中の完了イベントで期限タイマーを解除する', async () => {
  vi.useFakeTimers()
  maybeSingle.mockReturnValue(new Promise(() => {}))
  const { result } = renderHook(() => useOnboardingStatus('u1'))
  expect(vi.getTimerCount()).toBe(1)
  act(() => window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { userId: 'u1', region: 'north' } })))
  expect(vi.getTimerCount()).toBe(0)
  await act(async () => vi.advanceTimersByTimeAsync(ONBOARDING_STATUS_TIMEOUT_MS))
  expect(result.current).toEqual({ loading: false, done: true, region: 'north', error: null })
})
