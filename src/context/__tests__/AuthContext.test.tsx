import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

// ── モック ───────────────────────────────────────────────────────────────
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()
const mockOnAuthStateChange = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}))

vi.mock('@/lib/errorHandler', () => ({
  logError: vi.fn(),
}))

// テスト用のコンシューマコンポーネント
function TestConsumer() {
  const { user, loading, isAdmin, isEmailConfirmed, signOut } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.email : 'null'}</span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
      <span data-testid="isEmailConfirmed">{String(isEmailConfirmed)}</span>
      <button data-testid="signout" onClick={signOut}>Sign Out</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  )
}

// ── テスト ───────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks()
  mockSignOut.mockResolvedValue({ error: null })
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

describe('AuthContext', () => {
  it('初期化時に getSession を呼んでユーザーをセットする', async () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      app_metadata: {},
      email_confirmed_at: '2024-01-01',
    }
    mockGetSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    })

    renderWithProvider()

    // 初期は loading=true
    expect(screen.getByTestId('loading').textContent).toBe('true')

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('user').textContent).toBe('test@example.com')
  })

  it('セッションが無い場合は user が null', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })
    expect(screen.getByTestId('user').textContent).toBe('null')
  })

  it('isAdmin は app_metadata.role が admin の場合 true', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'admin-1',
            email: 'admin@example.com',
            app_metadata: { role: 'admin' },
            email_confirmed_at: '2024-01-01',
          },
        },
      },
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('isAdmin').textContent).toBe('true')
    })
  })

  it('isEmailConfirmed は email_confirmed_at がある場合 true', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'u1',
            email: 'a@b.com',
            app_metadata: {},
            email_confirmed_at: '2024-01-01',
          },
        },
      },
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('isEmailConfirmed').textContent).toBe('true')
    })
  })

  it('isEmailConfirmed は email_confirmed_at が無い場合 false', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'u2',
            email: 'b@c.com',
            app_metadata: {},
            email_confirmed_at: null,
          },
        },
      },
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('isEmailConfirmed').textContent).toBe('false')
    })
  })

  it('signOut が supabase.auth.signOut を呼ぶ', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false')
    })

    await act(async () => {
      screen.getByTestId('signout').click()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('onAuthStateChange で user が更新される', async () => {
    let authCallback: (event: string, session: unknown) => void
    mockOnAuthStateChange.mockImplementation((cb: typeof authCallback) => {
      authCallback = cb
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('null')
    })

    // onAuthStateChange コールバックを発火
    await act(async () => {
      authCallback('SIGNED_IN', {
        user: { id: 'u3', email: 'new@example.com', app_metadata: {} },
      })
    })

    expect(screen.getByTestId('user').textContent).toBe('new@example.com')
  })
})
