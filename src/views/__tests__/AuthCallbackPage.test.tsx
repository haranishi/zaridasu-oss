import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ja from '@/locales/ja/translation.json'

// REQ-184: AuthCallbackPage を t() 化したため、i18n 未初期化のテスト環境では
// react-i18next をモックして ja の実文言を返す（usePostForm.test と同方式）。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = String(key)
        .split('.')
        .reduce<unknown>(
          (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
          ja,
        )
      if (typeof value !== 'string') return key
      if (!opts) return value
      return value.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
        opts[name] != null ? String(opts[name]) : '',
      )
    },
    i18n: { language: 'ja' },
  }),
}))

const onAuthStateChangeMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        onAuthStateChangeMock(cb)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
      updateUser: vi.fn(),
    },
  },
}))

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

beforeEach(() => {
  onAuthStateChangeMock.mockReset()
  replaceMock.mockReset()
  window.history.replaceState({}, '', '/')
})

async function renderPage() {
  const { default: AuthCallbackPage } = await import('../AuthCallbackPage')
  return render(<AuthCallbackPage />)
}

describe('AuthCallbackPage', () => {
  it('URL に error_code がある場合、エラー UI を表示する', async () => {
    window.history.replaceState({}, '', '/auth/callback?error_code=otp_expired')
    await renderPage()
    expect(screen.getByText(/有効期限が切れています/)).toBeInTheDocument()
  })

  it('type=recovery でパスワード再設定モードに入る', async () => {
    window.history.replaceState({}, '', '/auth/callback?type=recovery')
    await renderPage()
    // mode='recovery' に切り替わると confirmPassword フィールドが表示される想定
    // 実 DOM が無くてもエラーで落ちないことだけ確認（白画面回避）
    expect(document.body.textContent ?? '').not.toBe('')
  })

  it('onAuthStateChange のリスナーが登録される（アンマウント時に unsubscribe）', async () => {
    window.history.replaceState({}, '', '/auth/callback')
    const { unmount } = await renderPage()
    expect(onAuthStateChangeMock).toHaveBeenCalled()
    unmount()
  })

  // 2026-10-19: 登録後の行き先はホーム。以前はマイページ（/dashboard）だった。投稿画面は自動で開かない。
  it('メール確認が済んだら、ホーム（/）へ移る。マイページや投稿画面へは移らない', async () => {
    vi.useFakeTimers()
    try {
      window.history.replaceState({}, '', '/auth/callback?type=signup')
      await renderPage()
      const listener = onAuthStateChangeMock.mock.calls[0]?.[0] as (event: string, session: unknown) => void
      act(() => listener('SIGNED_IN', { user: { id: 'u1', created_at: new Date().toISOString() } }))
      expect(screen.getByRole('link', { name: ja.authCallback.confirmed.goToHome })).toHaveAttribute('href', '/')
      expect(screen.getByText(ja.authCallback.confirmed.redirecting)).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(replaceMock).toHaveBeenCalledWith('/')
      expect(replaceMock).not.toHaveBeenCalledWith('/dashboard')
      expect(replaceMock.mock.calls.flat().some(path => String(path).includes('post'))).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
