import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import IntroPrompt from '../IntroPrompt'
import OnboardingHost from '../OnboardingHost'
import {
  acquireIntroOverlay,
  INTRO_LATER_SESSION_KEY,
  INTRO_OPTOUT_KEY,
  INTRO_READ_AT_KEY,
  getIntroStoryRequest,
  requestIntroStory,
  resetIntroOverlayForTest,
} from '@/lib/introStorage'

const { routerPush, hostState } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  hostState: {
    pathname: '/',
    user: null as null | { id: string },
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => hostState.pathname,
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: hostState.user }),
}))

// t はキーをそのまま返すエコー実装（他のコンポーネントテストと同方針）。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja' },
  }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

const trackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

// ストーリー本体は OnboardingHost が dynamic import する。中身は OnboardingFlow 側のテストで検証する。
vi.mock('@/components/onboarding/OnboardingFlow', () => ({
  default: ({ onPostClick, onMapClick }: { onPostClick?: () => void; onMapClick?: () => void }) => (
    <div data-testid="intro-story-stub">
      <button type="button" onClick={onPostClick}>post</button>
      <button type="button" onClick={onMapClick}>map</button>
    </div>
  ),
}))

const PROMPT_DELAY_MS = 5000

function advancePastDelay() {
  act(() => { vi.advanceTimersByTime(PROMPT_DELAY_MS) })
}

describe('REQ-284 IntroPrompt（初回訪問の誘いポップアップ）', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetIntroOverlayForTest()
    trackEvent.mockClear()
    routerPush.mockClear()
    hostState.pathname = '/'
    hostState.user = null
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('FR-284-01/03 AC-01: localStorage が空なら 5 秒後に表示される（それ以前は出ない）', () => {
    render(<IntroPrompt />)
    expect(screen.queryByTestId('intro-prompt')).toBeNull()

    act(() => { vi.advanceTimersByTime(PROMPT_DELAY_MS - 1) })
    expect(screen.queryByTestId('intro-prompt')).toBeNull()

    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.getByTestId('intro-prompt')).toBeInTheDocument()
    expect(screen.getByText('intro.prompt.kicker')).toBeInTheDocument()
    expect(screen.getByText('intro.prompt.title')).toBeInTheDocument()
    // FR-284-16: 表示イベント
    expect(trackEvent).toHaveBeenCalledWith('intro_prompt_shown')
  })

  it('FR-284-04 AC-02: ［今後表示しない］で恒久 opt-out キーが保存され、以後は表示されない', () => {
    const { unmount } = render(<IntroPrompt />)
    advancePastDelay()

    fireEvent.click(screen.getByTestId('intro-prompt-never'))
    expect(window.localStorage.getItem(INTRO_OPTOUT_KEY)).toBe('1')
    expect(screen.queryByTestId('intro-prompt')).toBeNull()
    expect(trackEvent).toHaveBeenCalledWith('intro_optout', { source: 'prompt' })

    // 再訪（リロード相当）でも出ない
    unmount()
    render(<IntroPrompt />)
    advancePastDelay()
    expect(screen.queryByTestId('intro-prompt')).toBeNull()
  })

  it('FR-284-04 AC-03: ［あとで］は sessionStorage に記録され、同一セッション中は再表示されない', () => {
    const { unmount } = render(<IntroPrompt />)
    advancePastDelay()

    fireEvent.click(screen.getByTestId('intro-prompt-later'))
    expect(window.sessionStorage.getItem(INTRO_LATER_SESSION_KEY)).toBe('1')
    // localStorage には恒久フラグを書かない（新しいセッションでは再表示される）
    expect(window.localStorage.getItem(INTRO_OPTOUT_KEY)).toBeNull()

    unmount()
    render(<IntroPrompt />)
    advancePastDelay()
    expect(screen.queryByTestId('intro-prompt')).toBeNull()

    // 新しいセッション（sessionStorage クリア）では再び出る
    window.sessionStorage.clear()
    render(<IntroPrompt />)
    advancePastDelay()
    expect(screen.getAllByTestId('intro-prompt').length).toBeGreaterThan(0)
  })

  it('FR-284-02 AC-04: 読了済み（zaridasu_intro_read_at あり）なら表示されない', () => {
    window.localStorage.setItem(INTRO_READ_AT_KEY, String(Date.now()))
    render(<IntroPrompt />)
    advancePastDelay()
    expect(screen.queryByTestId('intro-prompt')).toBeNull()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('FR-284-05/16: ［読んでみる］でストーリー起動を要求し、intro_open を送る', () => {
    const onPostClick = vi.fn()
    render(<IntroPrompt onPostClick={onPostClick} />)
    advancePastDelay()

    fireEvent.click(screen.getByTestId('intro-prompt-read'))
    expect(screen.queryByTestId('intro-prompt')).toBeNull()
    expect(trackEvent).toHaveBeenCalledWith('intro_open', { source: 'prompt' })

    // AC-18: 本体の dynamic import はホスト（OnboardingHost）1 箇所に集約しているため、
    // IntroPrompt はストアへ要求を出すだけ。投稿導線もそのまま引き渡す。
    const request = getIntroStoryRequest()
    expect(request).not.toBeNull()
    request?.onPostClick?.()
    expect(onPostClick).toHaveBeenCalledTimes(1)
  })

  it('FR-284-10 AC-05: ホームでは既存の投稿コールバックを保ち、地図は/mapへ遷移する', async () => {
    render(<OnboardingHost />)
    expect(screen.queryByTestId('intro-story-stub')).toBeNull()

    const onPostClick = vi.fn()
    act(() => { requestIntroStory({ onPostClick }) })

    // dynamic import の解決は実タイマーで待つ
    vi.useRealTimers()
    const stub = await screen.findByTestId('intro-story-stub')
    expect(stub).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'post' }))
    expect(onPostClick).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'map' }))
    expect(routerPush).toHaveBeenCalledWith('/map')
  })

  it('非ホームの地図導線は回答や認証状態にかかわらず/mapへ遷移する', async () => {
    hostState.pathname = '/about'
    hostState.user = { id: 'user-1' }
    render(<OnboardingHost />)
    act(() => { requestIntroStory() })

    vi.useRealTimers()
    await screen.findByTestId('intro-story-stub')
    fireEvent.click(screen.getByRole('button', { name: 'map' }))

    expect(routerPush).toHaveBeenCalledWith('/map')
    expect(window.sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBeNull()
  })

  it('非ホームのゲスト投稿は地図に投稿意図を引き継ぎ、認証を待つ', async () => {
    hostState.pathname = '/about'
    render(<OnboardingHost />)
    act(() => { requestIntroStory() })

    vi.useRealTimers()
    await screen.findByTestId('intro-story-stub')
    fireEvent.click(screen.getByRole('button', { name: 'post' }))

    expect(routerPush).toHaveBeenCalledWith('/map?post=1')
    expect(window.sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBeNull()
  })

  it('非ホームのログイン済み投稿は地図に投稿意図を引き継ぐ', async () => {
    hostState.pathname = '/about'
    hostState.user = { id: 'user-1' }
    render(<OnboardingHost />)
    act(() => { requestIntroStory() })

    vi.useRealTimers()
    await screen.findByTestId('intro-story-stub')
    fireEvent.click(screen.getByRole('button', { name: 'post' }))

    expect(window.sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBeNull()
    expect(routerPush).toHaveBeenCalledWith('/map?post=1')
  })

  it('必須モードが始まると表示中の入口を隠す', () => {
    render(<IntroPrompt />)
    advancePastDelay()
    expect(screen.getByTestId('intro-prompt')).toBeInTheDocument()
    let release!: () => void
    act(() => { release = acquireIntroOverlay(true) })
    expect(screen.queryByTestId('intro-prompt')).toBeNull()
    act(() => release())
  })

  it('FR-284-15 AC-08: localStorage が例外を投げる環境でも UI が壊れない', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })

    expect(() => {
      render(<IntroPrompt />)
      advancePastDelay()
    }).not.toThrow()

    // 読み取り不可＝「未設定」とみなして表示し、書き込み不可でも操作は通る
    expect(screen.getByTestId('intro-prompt')).toBeInTheDocument()
    expect(() => fireEvent.click(screen.getByTestId('intro-prompt-never'))).not.toThrow()
    expect(screen.queryByTestId('intro-prompt')).toBeNull()

    getItem.mockRestore()
    setItem.mockRestore()
  })
})
