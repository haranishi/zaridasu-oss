import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ONBOARDING_COMPLETED_EVENT } from './index'
import { completeOnboarding, ONBOARDING_SAVE_TIMEOUT_MS } from './complete'

const { getUser, from, upsert, trackEvent } = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), upsert: vi.fn(), trackEvent: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ supabase: { auth: { getUser }, from } }))
vi.mock('@/lib/analytics', () => ({ trackEvent }))

beforeEach(() => {
  vi.resetAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'own-id' } }, error: null })
  from.mockReturnValue({ upsert })
  upsert.mockResolvedValue({ error: null })
})

afterEach(() => vi.useRealTimers())

describe('completeOnboarding', () => {
  it('認証の本人IDでupsertし成功後だけイベントを送る', async () => {
    await completeOnboarding({ region: 'north', seen: 'maybe' })
    expect(from).toHaveBeenCalledWith('user_onboarding')
    expect(upsert).toHaveBeenCalledWith({ user_id: 'own-id', region: 'north', seen_crayfish: 'maybe' }, { onConflict: 'user_id' })
    expect(trackEvent).toHaveBeenCalledWith('onboarding_completed', { mode: 'required', region: 'north', seen: 'maybe' })
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(trackEvent.mock.invocationCallOrder[0]!)
  })
  it('指定modeをイベントへ渡す', async () => {
    await completeOnboarding({ region: 'other', seen: 'yes', mode: 'optional' })
    expect(trackEvent).toHaveBeenCalledWith('onboarding_completed', { mode: 'optional', region: 'other', seen: 'yes' })
  })
  it.each(['returned', 'rejected'])('保存失敗(%s)は伝播し、再試行できる', async kind => {
    const error = new Error('save failed')
    if (kind === 'returned') upsert.mockResolvedValueOnce({ error })
    else upsert.mockRejectedValueOnce(error)
    await expect(completeOnboarding({ region: 'south', seen: 'no' })).rejects.toThrow('save failed')
    expect(trackEvent).not.toHaveBeenCalled()
    await completeOnboarding({ region: 'south', seen: 'no' })
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })
  it('未ログインは保存しない', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(completeOnboarding({ region: 'central', seen: 'no' })).rejects.toThrow('Authentication required')
    expect(upsert).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
  it('認証失敗は保存・計測しない', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error('auth failed') })
    await expect(completeOnboarding({ region: 'north', seen: 'yes' })).rejects.toThrow('auth failed')
    expect(upsert).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
  it('実行時の不正値を拒否する', async () => {
    // @ts-expect-error 外部データの不正値
    await expect(completeOnboarding({ region: 'invalid', seen: 'yes' })).rejects.toThrow('Invalid onboarding answers')
    expect(getUser).not.toHaveBeenCalled()
  })
})

it.each(['auth', 'upsert'])('%sが保留したままでも10秒で保存をタイムアウトする', async stage => {
  vi.useFakeTimers()
  const pending = new Promise(() => {})
  if (stage === 'auth') getUser.mockReturnValue(pending)
  else upsert.mockReturnValue(pending)
  const saving = completeOnboarding({ region: 'north', seen: 'yes' })
  const rejected = expect(saving).rejects.toThrow('onboarding_save_timeout')
  await vi.advanceTimersByTimeAsync(ONBOARDING_SAVE_TIMEOUT_MS - 1)
  expect(trackEvent).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(1)
  await vi.advanceTimersByTimeAsync(1)
  await rejected
  expect(trackEvent).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('認証取得とupsertの合計を10秒に制限し、期限後の保存応答を通知しない', async () => {
  vi.useFakeTimers()
  let resolveAuth!: (value: unknown) => void
  let resolveSave!: (value: unknown) => void
  getUser.mockReturnValue(new Promise(r => { resolveAuth = r }))
  upsert.mockReturnValue(new Promise(r => { resolveSave = r }))
  const completed = vi.fn()
  window.addEventListener(ONBOARDING_COMPLETED_EVENT, completed)
  try {
    const rejected = expect(completeOnboarding({ region: 'north', seen: 'yes' })).rejects.toThrow('onboarding_save_timeout')
    await vi.advanceTimersByTimeAsync(6_000)
    resolveAuth({ data: { user: { id: 'own-id' } }, error: null })
    await vi.advanceTimersByTimeAsync(ONBOARDING_SAVE_TIMEOUT_MS - 6_000)
    await rejected
    resolveSave({ error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(trackEvent).not.toHaveBeenCalled()
    expect(completed).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener(ONBOARDING_COMPLETED_EVENT, completed)
  }
})
