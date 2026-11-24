import { StrictMode, useCallback } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { PostFilter } from '@/types'
import { useAuth } from '@/context/AuthContext'
import { ONBOARDING_COMPLETED_EVENT, regionBounds } from '@/lib/onboarding'
import HomePage from '@/views/HomePage'

// ── モック ───────────────────────────────────────────────────────────────
const { fetchPosts } = vi.hoisted(() => ({ fetchPosts: vi.fn() }))
vi.mock('@/hooks/posts/usePostList', () => ({
  usePostList: vi.fn((filters: PostFilter) => ({
    posts: [],
    loading: false,
    hasMore: false,
    loadingMore: false,
    fetchPosts: useCallback(() => fetchPosts(filters), [filters]),
    fetchMore: vi.fn(),
  })),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle }) }) }) }) } }))

beforeEach(() => {
  fetchPosts.mockClear()
  localStorage.clear()
  vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as ReturnType<typeof useAuth>)
  maybeSingle.mockResolvedValue({ data: null, error: null })
})
afterEach(() => vi.useRealTimers())

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // ErrorBoundary 経由で src/lib/i18n.ts が評価され initReactI18next を参照するため、
  // i18next プラグイン形のスタブを供給して unhandled rejection を防ぐ。
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/components/ui/PageSEO', () => ({
  default: () => null,
}))

vi.mock('@/components/layout/Header', () => ({
  default: ({ onPostClick, onLoginClick }: { onPostClick: () => void; onLoginClick: () => void }) => (
    <header data-testid="header">
      <button data-testid="post-btn" onClick={onPostClick}>Post</button>
      <button data-testid="login-btn" onClick={() => onLoginClick()}>Login</button>
    </header>
  ),
}))

vi.mock('@/components/features/dashboard/FilterBar', () => ({
  default: ({ filters, onChange }: { filters: PostFilter; onChange: (filters: PostFilter) => void }) => (
    <div data-testid="filter-bar">
      <input aria-label="Search" value={filters.search} onChange={event => onChange({ ...filters, search: event.target.value })} />
    </div>
  ),
}))

vi.mock('@/components/features/dashboard/StatsBar', () => ({
  default: () => <div data-testid="stats-bar" />,
}))

vi.mock('@/components/ui/HowToSection', () => ({
  default: () => null,
}))

vi.mock('@/components/features/map/MapViewWrapper', () => ({
  default: ({ initialBounds }: { initialBounds: unknown }) => <div data-testid="map-view" data-bounds={JSON.stringify(initialBounds)} />,
}))

vi.mock('@/components/features/posts/PostList', () => ({
  default: () => <div data-testid="post-list" />,
}))

vi.mock('@/components/features/posts/PostForm', () => ({
  default: () => <div data-testid="post-form" />,
}))

vi.mock('@/components/modals/AuthModal', () => ({
  default: () => <div data-testid="auth-modal" />,
}))

vi.mock('@/components/features/auth/SignupBanner', () => ({
  default: () => <div data-testid="signup-banner" />,
}))

// REQ-284 (FR-284-01): 誘いポップアップ。dynamic(ssr:false) でマウントされるため、
// 実体（localStorage 判定・5秒タイマー）は IntroPrompt 側のテストで検証し、ここでは差し替える。
vi.mock('@/components/ui/IntroPrompt', () => ({
  default: () => <div data-testid="intro-prompt" />,
}))

vi.mock('@/hooks/survey/useSurveyRequests', () => ({
  useSurveyRequests: () => ({ requests: [], fetchRequests: vi.fn() }),
}))

function renderHomePage() {
  return render(<HomePage />)
}

// ── テスト ───────────────────────────────────────────────────────────────
describe('HomePage', () => {
  it('初回の取得は300ms待たず開始し、StrictModeでも重複しない', async () => {
    vi.useFakeTimers()
    render(<StrictMode><HomePage /></StrictMode>)
    await act(async () => vi.advanceTimersByTime(0))
    expect(fetchPosts).toHaveBeenCalledTimes(1)
    expect(fetchPosts).toHaveBeenLastCalledWith(expect.objectContaining({ search: '' }))
  })

  it('初回の取得後の検索は連続入力をまとめ、最新の条件だけ取得する', async () => {
    vi.useFakeTimers()
    renderHomePage()
    await act(async () => vi.advanceTimersByTime(0))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: '秋' } })
    await act(async () => vi.advanceTimersByTime(150))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: '秋田' } })
    await act(async () => vi.advanceTimersByTime(299))
    expect(fetchPosts).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(1))
    expect(fetchPosts).toHaveBeenCalledTimes(2)
    expect(fetchPosts).toHaveBeenLastCalledWith(expect.objectContaining({ search: '秋田' }))
  })

  it('ページを離れた後は予約した取得を開始しない', async () => {
    vi.useFakeTimers()
    const view = renderHomePage()
    await act(async () => vi.advanceTimersByTime(0))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: '秋田' } })
    view.unmount()
    await act(async () => vi.advanceTimersByTime(300))
    expect(fetchPosts).toHaveBeenCalledTimes(1)
  })

  it('Header と FilterBar が表示される', () => {
    renderHomePage()
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('MapView が描画される（全サイズ共通ページャー）', () => {
    renderHomePage()
    expect(screen.getByTestId('map-view')).toBeInTheDocument()
  })

  it('未認証ユーザーに SignupBanner が表示される', async () => {
    renderHomePage()
    expect(await screen.findByTestId('signup-banner')).toBeInTheDocument()
  })

  it('ページャーの切替「写真」ボタンが存在する', () => {
    renderHomePage()
    // REQ-183 / REQ-180 a11y(label-content-name-mismatch): aria-label は
    // 可視テキスト t('home.photos') を先頭に内包する `${photos} — ${openGallery}` へ変更した
    // （axe ルール「可視テキスト ⊆ アクセシブル名」を全ロケールで満たすため）。
    // 本テストは useTranslation を t:(key)=>key でモックしているため、解決後の値＝キー連結で検証する。
    expect(
      screen.getByRole('button', { name: 'home.photos — home.openGallery' })
    ).toBeInTheDocument()
  })
})

it.each(['north', 'other', 'invalid'])('未ログインの初期範囲はlocalStorageの%sから決める', (region) => {
  localStorage.setItem('zaridasu_onboarding_region_v1', region)
  renderHomePage()
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-bounds', JSON.stringify(regionBounds(region)))
})
it('ログイン中は地域取得を待ってから本人の範囲で地図をマウントする', async () => {
  localStorage.setItem('zaridasu_onboarding_region_v1', 'south')
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' }, loading: false } as ReturnType<typeof useAuth>)
  let resolve!: (value: unknown) => void
  maybeSingle.mockReturnValue(new Promise(r => { resolve = r }))
  renderHomePage()
  expect(screen.queryByTestId('map-view')).not.toBeInTheDocument()
  await act(async () => resolve({ data: { region: 'north' }, error: null }))
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-bounds', JSON.stringify(regionBounds('north')))
  expect(screen.queryByTestId('intro-prompt')).not.toBeInTheDocument()
})

it('任意モード完了後、リロードせず選んだ地域を地図へ渡す', () => {
  renderHomePage()
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-bounds', JSON.stringify(regionBounds(null)))
  act(() => {
    localStorage.setItem('zaridasu_onboarding_region_v1', 'north')
    window.dispatchEvent(new CustomEvent(ONBOARDING_COMPLETED_EVENT, { detail: { region: 'north' } }))
  })
  expect(screen.getByTestId('map-view')).toHaveAttribute('data-bounds', JSON.stringify(regionBounds('north')))
})
