import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignupBanner from '../SignupBanner'
import { SIGNUP_BANNER_OPTOUT_KEY } from '@/lib/introStorage'

const DISMISS_KEY = 'signup_banner_dismissed_at'
const SHOW_DELAY_MS = 3_000
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

/** 出現遅延（3秒）とスライド演出の rAF を進めて、バナーを描画しきる。 */
function advancePastShowDelay() {
  act(() => vi.advanceTimersByTime(SHOW_DELAY_MS))
}

function renderBanner() {
  return render(<SignupBanner onSignupClick={vi.fn()} onLoginClick={vi.fn()} />)
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('REQ-284 AC-07 SignupBanner の恒久「今後表示しない」', () => {
  it('［今後表示しない］を押すと opt-out キーが保存され、24時間を過ぎても再表示されない', () => {
    const t0 = new Date('2026-08-05T09:00:00Z').getTime()
    vi.setSystemTime(t0)

    renderBanner()
    advancePastShowDelay()
    fireEvent.click(screen.getByTestId('signup-banner-never'))

    expect(window.localStorage.getItem(SIGNUP_BANNER_OPTOUT_KEY)).toBe('1')

    // 期限付きスヌーズ（24時間）なら復活するはずの時点まで進めて再マウントする。
    cleanup()
    vi.setSystemTime(t0 + DISMISS_DURATION_MS + 60_000)

    renderBanner()
    advancePastShowDelay()

    expect(screen.queryByTestId('signup-banner-never')).not.toBeInTheDocument()
  })

  it('opt-out 済みなら、スヌーズ期限が切れていても最初から出さない', () => {
    // 25時間前に［×］でスヌーズした状態＝スヌーズ単体なら再表示される条件を作る。
    const now = new Date('2026-08-05T09:00:00Z').getTime()
    vi.setSystemTime(now)
    window.localStorage.setItem(DISMISS_KEY, String(now - DISMISS_DURATION_MS - 60_000))
    window.localStorage.setItem(SIGNUP_BANNER_OPTOUT_KEY, '1')

    renderBanner()
    advancePastShowDelay()

    expect(screen.queryByTestId('signup-banner-never')).not.toBeInTheDocument()
  })

  it('［×］は従来どおりの期限付きスヌーズで、恒久 opt-out にはしない', () => {
    const now = new Date('2026-08-05T09:00:00Z').getTime()
    vi.setSystemTime(now)

    renderBanner()
    advancePastShowDelay()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))

    // フェイクタイマーは出現遅延ぶん時計も進めるので、値そのものではなく
    // 「押した時点の時刻が記録されている」ことを確認する。
    expect(Number(window.localStorage.getItem(DISMISS_KEY))).toBeGreaterThanOrEqual(now)
    expect(window.localStorage.getItem(SIGNUP_BANNER_OPTOUT_KEY)).toBeNull()
  })
})
