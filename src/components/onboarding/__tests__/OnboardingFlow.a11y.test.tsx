import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import OnboardingFlow from '../OnboardingFlow'
import english from '@/locales/en/translation.json'
import { resetIntroOverlayForTest } from '@/lib/introStorage'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], english)
  return String(value ?? key).replace(/{{(\w+)}}/g, (_, name) => String(options?.[name] ?? name))
} }) }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))
vi.mock('@/lib/onboarding/complete', () => ({ completeOnboarding: vi.fn() }))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
beforeEach(() => resetIntroOverlayForTest())
it.each(['optional', 'required'] as const)('%sの全4画面にaxe違反がない', async (mode) => {
  const { container } = render(<OnboardingFlow mode={mode} onClose={vi.fn()} />)
  for (let step = 1; step <= 4; step++) {
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(await axe(container)).toHaveNoViolations()
    if (step === 1) fireEvent.click(screen.getByTestId('onboarding-option-north'))
    if (step === 2) fireEvent.click(screen.getByTestId('onboarding-option-yes'))
    if (step < 4) fireEvent.click(screen.getByTestId('onboarding-continue'))
  }
})
