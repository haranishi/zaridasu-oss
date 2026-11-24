import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstallBanner from '../InstallBanner'
import { INSTALL_BANNER_OPTOUT_KEY } from '@/lib/introStorage'

const DISMISS_KEY = 'install_banner_dismissed_at'
const SHOW_DELAY_MS = 15_000
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

const originalUserAgent = window.navigator.userAgent

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

/**
 * iOS では beforeinstallprompt が来ないため、UA を iPhone にすると
 * 遅延だけでバナーが出る（= 表示条件を最小化できる）。
 */
function stubIOS() {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  })
}

function advancePastShowDelay() {
  act(() => vi.advanceTimersByTime(SHOW_DELAY_MS))
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  stubIOS()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: originalUserAgent,
  })
})

describe('REQ-284 AC-07 InstallBanner の恒久「今後表示しない」', () => {
  it('［今後表示しない］を押すと opt-out キーが保存され、7日を過ぎても再表示されない', () => {
    const t0 = new Date('2026-08-05T09:00:00Z').getTime()
    vi.setSystemTime(t0)

    render(<InstallBanner />)
    advancePastShowDelay()
    fireEvent.click(screen.getByTestId('install-banner-never'))

    expect(window.localStorage.getItem(INSTALL_BANNER_OPTOUT_KEY)).toBe('1')

    // 期限付きスヌーズ（7日）なら復活するはずの時点まで進めて再マウントする。
    cleanup()
    vi.setSystemTime(t0 + DISMISS_DURATION_MS + 60_000)

    render(<InstallBanner />)
    advancePastShowDelay()

    expect(screen.queryByTestId('install-banner-never')).not.toBeInTheDocument()
  })

  it('opt-out 済みなら、スヌーズ期限が切れていても最初から出さない', () => {
    const now = new Date('2026-08-05T09:00:00Z').getTime()
    vi.setSystemTime(now)
    window.localStorage.setItem(DISMISS_KEY, String(now - DISMISS_DURATION_MS - 60_000))
    window.localStorage.setItem(INSTALL_BANNER_OPTOUT_KEY, '1')

    render(<InstallBanner />)
    advancePastShowDelay()

    expect(screen.queryByTestId('install-banner-never')).not.toBeInTheDocument()
  })
})
