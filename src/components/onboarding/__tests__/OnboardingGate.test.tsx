import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OnboardingGate from '../OnboardingGate'
import { useAuth } from '@/context/AuthContext'
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus'
import { isIntroOverlayOpen, resetIntroOverlayForTest } from '@/lib/introStorage'

let mockPathname = '/'
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => mockPathname }))
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/hooks/useOnboardingStatus', () => ({ useOnboardingStatus: vi.fn() }))
vi.mock('next/dynamic', () => ({ default: () => ({ mode, onClose, onMapClick, onPostClick }: {
  mode: string; onClose: () => void; onMapClick: () => void; onPostClick: () => void
}) => <div>
  <button data-testid="onboarding" data-mode={mode} onClick={onClose}>Close</button>
  <button onClick={() => { onClose(); onMapClick() }}>Map</button>
  <button onClick={() => { onClose(); onPostClick() }}>Post</button>
</div> }))
beforeEach(() => {
  vi.clearAllMocks()
  mockPathname = '/'
  sessionStorage.clear()
  resetIntroOverlayForTest()
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as ReturnType<typeof useAuth>)
  vi.mocked(useOnboardingStatus).mockReturnValue({ loading: false, done: false, region: null, error: null })
})
it('user無しでは出ない', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>)
  render(<OnboardingGate />)
  expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  expect(useOnboardingStatus).not.toHaveBeenCalled()
})
it.each([{ loading: true }, { done: true }, { error: 'offline' }])('%jでは画面をブロックしない', (status) => {
  vi.mocked(useOnboardingStatus).mockReturnValue({ loading: false, done: false, region: null, error: null, ...status })
  render(<OnboardingGate />)
  expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
})
it('未完了ならrequired。閉じたらロックを解き、再ログインでまた出る', async () => {
  const { rerender } = render(<OnboardingGate />)
  expect(screen.getByTestId('onboarding')).toHaveAttribute('data-mode', 'required')
  expect(isIntroOverlayOpen()).toBe(true)
  fireEvent.click(screen.getByTestId('onboarding'))
  expect(mockPush).not.toHaveBeenCalled()
  await waitFor(() => expect(isIntroOverlayOpen()).toBe(false))
  expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>)
  rerender(<OnboardingGate />)
  vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1' } } as ReturnType<typeof useAuth>)
  rerender(<OnboardingGate />)
  expect(screen.getByTestId('onboarding')).toBeInTheDocument()
})

it.each(['/auth', '/auth/callback', '/auth/reset-password'])('認証手続き %s を遮らず、完了後に案内する', (path) => {
  mockPathname = path
  const { rerender } = render(<OnboardingGate />)
  expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  expect(useOnboardingStatus).not.toHaveBeenCalled()
  mockPathname = '/dashboard'
  rerender(<OnboardingGate />)
  expect(screen.getByTestId('onboarding')).toHaveAttribute('data-mode', 'required')
})

it('地図の完了操作はダッシュボードから地図へ移動し、投稿を開かない', () => {
  mockPathname = '/dashboard'
  render(<OnboardingGate />)
  fireEvent.click(screen.getByRole('button', { name: 'Map' }))
  expect(mockPush).toHaveBeenCalledExactlyOnceWith('/map')
  expect(sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBeNull()
  expect(isIntroOverlayOpen()).toBe(false)
})

it('投稿の完了操作は地図へ移動し、投稿開始を引き継ぐ', () => {
  mockPathname = '/dashboard'
  render(<OnboardingGate />)
  fireEvent.click(screen.getByRole('button', { name: 'Post' }))
  expect(mockPush).toHaveBeenCalledExactlyOnceWith('/map?post=1')
  expect(sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBeNull()
  expect(isIntroOverlayOpen()).toBe(false)
})

it('管理画面（/admin 配下）では未完了でも出さない', () => {
  mockPathname = '/admin/posts'
  try {
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
    vi.mocked(useOnboardingStatus).mockReturnValue({ loading: false, done: false, region: null, error: null })
    render(<OnboardingGate />)
    expect(screen.queryByTestId('onboarding')).not.toBeInTheDocument()
  } finally { mockPathname = '/' }
})

it('地図にいるときの投稿は同じルートへの遷移に頼らず、その場へ要求する', () => {
  mockPathname = '/map'
  const onPost = vi.fn()
  window.addEventListener('zaridasu:onboarding-post', onPost)
  render(<OnboardingGate />)
  fireEvent.click(screen.getByRole('button', { name: 'Post' }))
  expect(onPost).toHaveBeenCalledOnce()
  expect(sessionStorage.getItem('zaridasu_onboarding_post_v1')).toBe('1')
  expect(mockPush).not.toHaveBeenCalled()
  window.removeEventListener('zaridasu:onboarding-post', onPost)
})
