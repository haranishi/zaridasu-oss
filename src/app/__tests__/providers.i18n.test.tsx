import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { Providers } from '../providers'

const m = vi.hoisted(() => ({ restore: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/i18n', () => ({ restoreClientLanguage: m.restore }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ user: null }),
}))
vi.mock('@/context/ThemeContext', () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/context/ToastContext', () => ({ ToastProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/context/MapSettingsContext', () => ({ MapSettingsProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/ui/ErrorBoundary', () => ({ default: ({ children }: { children: ReactNode }) => children }))
vi.mock('@/components/ui/LoadingScreen', () => ({ default: () => null }))
vi.mock('@/components/ui/InstallBanner', () => ({ default: () => null }))
vi.mock('@/components/ui/OnboardingHost', () => ({ default: () => null }))
vi.mock('@/components/onboarding/OnboardingGate', () => ({ default: () => null }))
vi.mock('@/components/ui/WebVitalsReporter', () => ({ default: () => null }))
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))

afterEach(() => vi.unstubAllGlobals())

it('ProvidersはSSR中に言語検出せず、client mount effectから復元する', () => {
  m.restore.mockClear()
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const content = <Providers><span>最初の表示</span></Providers>
  expect(renderToString(content)).toContain('最初の表示')
  expect(m.restore).not.toHaveBeenCalled()
  render(content)
  expect(m.restore).toHaveBeenCalledTimes(1)
})
