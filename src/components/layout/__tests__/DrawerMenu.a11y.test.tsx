import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import DrawerMenu from '../DrawerMenu'

const { useProgressMock, authState, themeState } = vi.hoisted(() => ({
  useProgressMock: vi.fn(),
  authState: { user: null as { id: string; email: string } | null, isAdmin: false, signOut: vi.fn() },
  themeState: { dark: false, toggle: vi.fn() },
}))

vi.mock('@/context/AuthContext', () => ({ useAuth: () => authState }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => themeState }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ja', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@/context/MapSettingsContext', () => ({
  useMapSettings: () => ({
    showHeatmap: false,
    setShowHeatmap: vi.fn(),
    activeLayerId: 'osm',
    setActiveLayerId: vi.fn(),
    defaultLayerId: 'osm',
    setDefaultLayerId: vi.fn(),
  }),
}))

vi.mock('@/hooks/useProfile', () => ({
  useProgress: (userId: string | undefined) => useProgressMock(userId),
}))

vi.mock('@/hooks/useUnlocks', () => ({
  useUnlocks: () => ({
    isUnlocked: () => true,
    unlockLevelOf: () => 1,
  }),
}))

vi.mock('@/components/ui/UnlockTeaser', () => ({
  default: () => <span>unlock teaser</span>,
}))

const baseProps = {
  onClose: vi.fn(),
  onPostClick: vi.fn(),
  onLoginClick: vi.fn(),
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useProgressMock.mockReset()
  authState.user = null
  themeState.dark = false
  vi.clearAllMocks()
})

describe('DrawerMenu a11y', () => {
  it('現在のログイン状態とテーマを読み、ログアウトとテーマ切替を実行する', () => {
    authState.user = { id: 'map-settings-user', email: 'map-test@example.com' }
    themeState.dark = true
    useProgressMock.mockReturnValue({ progress: null })
    render(<DrawerMenu {...baseProps} open />)

    expect(screen.getByText('map-test@example.com')).toBeVisible()
    expect(useProgressMock).toHaveBeenCalledWith('map-settings-user')
    fireEvent.click(screen.getByRole('button', { name: /common\.lightMode/ }))
    expect(themeState.toggle).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /nav\.logout/ }))
    expect(authState.signOut).toHaveBeenCalledOnce()
    expect(baseProps.onClose).toHaveBeenCalledOnce()
  })

  it('閉状態をツリーから外し、開状態だけ modal として公開して300ms後にアンマウントする', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    useProgressMock.mockReturnValue({ progress: null })

    const { container, rerender } = render(
      <>
        <button type="button">メニュートリガー</button>
        <DrawerMenu {...baseProps} open={false} />
      </>
    )
    const trigger = screen.getByRole('button', { name: 'メニュートリガー' })
    trigger.focus()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-modal="true"]')).toBeNull()

    rerender(
      <>
        <button type="button">メニュートリガー</button>
        <DrawerMenu {...baseProps} open />
      </>
    )

    const dialog = await screen.findByRole('dialog', { name: 'drawer.settingsMenu' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).not.toHaveAttribute('inert')
    expect(await axe(container)).toHaveNoViolations()

    rerender(
      <>
        <button type="button">メニュートリガー</button>
        <DrawerMenu {...baseProps} open={false} />
      </>
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const closingDrawer = container.querySelector('[aria-label="drawer.settingsMenu"]')
    expect(closingDrawer).not.toHaveAttribute('aria-modal')
    expect(closingDrawer).toHaveAttribute('aria-hidden', 'true')
    expect(closingDrawer).toHaveAttribute('inert')
    expect(trigger).toHaveFocus()

    await waitFor(
      () => expect(container.querySelector('[aria-label="drawer.settingsMenu"]')).toBeNull(),
      { timeout: 500 }
    )
    expect(useProgressMock).toHaveBeenLastCalledWith(undefined)
  })
})
