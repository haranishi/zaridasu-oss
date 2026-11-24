import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'
import InstallBanner from '../InstallBanner'

const originalUserAgent = window.navigator.userAgent

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: originalUserAgent,
  })
})

describe('InstallBanner iOS guide a11y', () => {
  it('ガイドに名前と初期フォーカスがあり、開いた直後の Escape で閉じる', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    })

    const { container } = render(<InstallBanner />)
    act(() => vi.advanceTimersByTime(15_000))
    fireEvent.click(screen.getByRole('button', { name: 'install.seeHow' }))

    const dialog = screen.getByRole('dialog', { name: 'install.iosTitle' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'install-ios-guide-title')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    vi.useRealTimers()
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
