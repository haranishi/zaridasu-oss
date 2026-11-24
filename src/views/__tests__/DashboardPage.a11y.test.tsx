import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import DashboardPage from '../DashboardPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
    loading: false,
    deleteAccount: vi.fn(),
    isEmailConfirmed: true,
  }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/hooks/useStats', () => ({
  useStats: () => ({
    stats: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({
    profile: {
      avatar_emoji: '🦞',
      display_name: 'テストユーザー',
      bio: '自己紹介',
      post_count: 1,
      comment_count: 2,
      municipality_count: 3,
      badges: [],
    },
    loading: false,
    updateProfile: vi.fn(),
  }),
  useBadgeDefinitions: () => [],
}))

vi.mock('@/components/layout/Header', () => ({
  default: () => <header>header</header>,
}))
vi.mock('@/components/layout/BottomNav', () => ({
  default: () => <nav aria-label="bottom navigation" />,
}))
vi.mock('@/components/layout/Footer', () => ({
  default: () => <footer>footer</footer>,
}))
vi.mock('@/components/features/dashboard/KPISection', () => ({ default: () => <section>KPI</section> }))
vi.mock('@/components/features/dashboard/ProgressJourney', () => ({ default: () => <section>progress</section> }))
vi.mock('@/components/features/dashboard/ActivityGrass', () => ({ default: () => <section>activity</section> }))
vi.mock('@/components/features/dashboard/CSVExportSection', () => ({ default: () => <section>CSV</section> }))
vi.mock('@/components/features/dashboard/MyPostsSection', () => ({ default: () => <section>posts</section> }))
vi.mock('@/components/features/dashboard/PendingPostsSection', () => ({ default: () => <section>drafts</section> }))
vi.mock('@/components/features/dashboard/EmailVerificationBanner', () => ({ default: () => <section>email</section> }))
vi.mock('@/components/modals/EditProfileModal', () => ({ default: () => <div role="dialog" aria-label="profile editor" /> }))

describe('DashboardPage a11y', () => {
  it('プロフィール編集のアイコンボタンに翻訳済みの名前があり、重大な違反がない', async () => {
    const { container } = render(<DashboardPage />)

    const editButton = screen.getByRole('button', { name: 'profilePage.editTitle' })
    expect(editButton).toHaveAttribute('aria-label', 'profilePage.editTitle')
    expect(container.querySelector('h1')).toBeNull()

    const results = await axe(container)
    expect(
      results.violations.filter((violation) =>
        violation.impact === 'critical' || violation.impact === 'serious'
      )
    ).toEqual([])
  })
})
