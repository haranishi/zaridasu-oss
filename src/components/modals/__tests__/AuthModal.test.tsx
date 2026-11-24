import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthModal from '../AuthModal'

// ── モック ───────────────────────────────────────────────────────────────
const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
const mockResetPasswordForEmail = vi.fn()
const mockResend = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      resend: (...args: unknown[]) => mockResend(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/lib/constants', () => ({
  RESEND_COOLDOWN_MS: 60000,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockResolvedValue({ data: false })
})

// ── テスト ───────────────────────────────────────────────────────────────
describe('AuthModal', () => {
  const onClose = vi.fn()

  describe('タブ切り替え', () => {
    it('デフォルトでログインタブが表示される', () => {
      render(<AuthModal onClose={onClose} />)
      expect(screen.getByRole('button', { name: 'auth.submitLogin' })).toBeInTheDocument()
    })

    it('defaultTab=signup でサインアップが表示される', () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)
      expect(screen.getByRole('button', { name: 'auth.submitSignup' })).toBeInTheDocument()
    })

    it('サインアップタブに切り替えるとパスワード確認欄が表示', async () => {
      render(<AuthModal onClose={onClose} />)
      const signupTab = screen.getByText('auth.tabs.signup')
      await userEvent.click(signupTab)
      expect(screen.getByPlaceholderText('auth.passwordConfirmPlaceholder')).toBeInTheDocument()
    })

    it('タブは「ログイン」と「新規登録」の2つで、パスワード再設定はタブに並べない', () => {
      render(<AuthModal onClose={onClose} />)
      expect(screen.getAllByRole('tab').map(el => el.textContent)).toEqual(['auth.tabs.login', 'auth.tabs.signup'])
    })

    it('パスワード再設定は、ログインの「忘れた方」から入る。開いている間だけタブが出て、パスワード欄は非表示', async () => {
      render(<AuthModal onClose={onClose} />)
      await userEvent.click(screen.getByRole('button', { name: 'auth.forgotPasswordLink' }))
      expect(screen.getByRole('tab', { name: 'auth.tabs.reset' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('button', { name: 'auth.submitReset' })).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
    })
  })

  // 2026-10-19: 「記録をはじめる」の次に開く画面なので、何のための登録かを先頭で伝え、規約への道を置く
  describe('新規登録の案内', () => {
    it('先頭に「記録するには登録が必要」と書き、特典は市民に関わる3つ（記録を送れる・自分の記録を見返せる・コメント）', () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)
      const tabpanel = screen.getByRole('tabpanel')
      expect(within(tabpanel).getByText('auth.signupRequired')).toBeInTheDocument()
      const benefits = within(tabpanel).getAllByText(/^auth\.signupBenefits\./).map(el => el.textContent)
      expect(benefits).toEqual(['auth.signupBenefits.post', 'auth.signupBenefits.dashboard', 'auth.signupBenefits.comment'])
    })

    it('同意文は登録ボタンの上にある（縦に長い小窓で、ボタンの下は読まれないまま押されないように）', () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)
      const consent = screen.getByRole('link', { name: 'footer.terms' })
      const submit = screen.getByRole('button', { name: 'auth.submitSignup' })
      expect(consent.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('利用規約とプライバシーへのリンクを、別タブで開く形で置く', () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)
      expect(screen.getByRole('link', { name: 'footer.terms' })).toHaveAttribute('href', '/terms')
      expect(screen.getByRole('link', { name: 'footer.privacy' })).toHaveAttribute('href', '/privacy')
      expect(screen.getByRole('link', { name: 'footer.terms' })).toHaveAttribute('target', '_blank')
      expect(screen.getByRole('link', { name: 'footer.terms' })).toHaveAttribute('rel', expect.stringContaining('noopener'))
    })

    it('見出しは絵文字ではなくブランドのロゴと「ザリダス」', () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)
      const title = screen.getByRole('heading', { name: 'ザリダス' })
      expect(title.textContent).not.toContain('🦞')
      expect(title.querySelector('svg')).not.toBeNull()
    })

    it('ログインタブには規約の案内を出さない', () => {
      render(<AuthModal onClose={onClose} />)
      expect(screen.queryByRole('link', { name: 'footer.terms' })).not.toBeInTheDocument()
    })
  })

  describe('ログイン', () => {
    it('成功時に onClose が呼ばれる', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null })
      render(<AuthModal onClose={onClose} />)

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'test@test.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitLogin' }))

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1)
      })
    })

    it('失敗時にエラーが表示される', async () => {
      mockSignInWithPassword.mockResolvedValue({
        error: Object.assign(new Error('Invalid login credentials'), { name: 'AuthApiError', status: 400 }),
      })
      render(<AuthModal onClose={onClose} />)

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'test@test.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'wrong')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitLogin' }))

      await waitFor(() => {
        expect(screen.getByText('auth.errors.invalidCredentials')).toBeInTheDocument()
      })
    })
  })

  describe('サインアップ', () => {
    it('パスワード不一致時にエラーが表示される', async () => {
      render(<AuthModal onClose={onClose} defaultTab="signup" />)

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'new@test.com')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordMinLength'), 'pass123')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordConfirmPlaceholder'), 'pass456')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitSignup' }))

      await waitFor(() => {
        expect(screen.getByText('auth.errors.passwordMismatch')).toBeInTheDocument()
      })
    })

    // REQ-292 FR-292-05(a): 送信前の check_email_exists RPC を廃止したため、重複判定は
    // signUp 後の identities 空判定（Supabase Auth の統一エラー）に一本化されている。
    it('既存メール時にエラーとログイン/リセットリンクが表示される（signUp の identities 空判定経由）', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { identities: [] } }, error: null })
      render(<AuthModal onClose={onClose} defaultTab="signup" />)

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'exists@test.com')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordMinLength'), 'password1')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordConfirmPlaceholder'), 'password1')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitSignup' }))

      await waitFor(() => {
        expect(screen.getByText('auth.errors.alreadyRegistered')).toBeInTheDocument()
        expect(screen.getByText('auth.goToLogin')).toBeInTheDocument()
        expect(screen.getByText('auth.goToReset')).toBeInTheDocument()
      })
    })

    // REQ-292 AC-01/AC-06: check_email_exists は anon から REVOKE 済み。フロントからも呼ばない
    // （呼び続けると 42501 で失敗し続けるだけでなく、メール存在確認オラクルを再び開くことになる）。
    it('サインアップで check_email_exists RPC を呼ばない（REQ-292: 列挙オラクルの閉塞）', async () => {
      mockSignUp.mockResolvedValue({ data: { user: { identities: [{ id: 'i1' }] } }, error: null })
      render(<AuthModal onClose={onClose} defaultTab="signup" />)

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'new@test.com')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordMinLength'), 'password1')
      await userEvent.type(screen.getByPlaceholderText('auth.passwordConfirmPlaceholder'), 'password1')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitSignup' }))

      await waitFor(() => expect(mockSignUp).toHaveBeenCalled())
      expect(mockRpc).not.toHaveBeenCalledWith('check_email_exists', expect.anything())
    })
  })

  describe('モーダル操作', () => {
    it('Escape キーで onClose が呼ばれる', () => {
      render(<AuthModal onClose={onClose} />)
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('背景クリックで onClose が呼ばれる', () => {
      render(<AuthModal onClose={onClose} />)
      fireEvent.click(screen.getByRole('dialog'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('CAPTCHA 未設定（NEXT_PUBLIC_TURNSTILE_SITE_KEY なし）', () => {
    it('captchaToken を付けずにログインでき、widget も描画しない（fail-open）', async () => {
      mockSignInWithPassword.mockResolvedValue({ error: null })
      render(<AuthModal onClose={onClose} />)
      // site key 未設定なので Turnstile コンテナは存在しない
      expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()

      await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'test@test.com')
      await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123')
      fireEvent.submit(screen.getByRole('button', { name: 'auth.submitLogin' }))

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
      // options は空オブジェクト（captchaToken なし）で渡る
      const arg = mockSignInWithPassword.mock.calls[0]?.[0] as { options?: Record<string, unknown> } | undefined
      expect(arg?.options?.captchaToken).toBeUndefined()
    })
  })
})

// ── CAPTCHA 有効時の挙動（site key を設定して別モジュールとして再 import）─────────────
describe('AuthModal: CAPTCHA 有効時', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: false })
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    window.turnstile = undefined
    document.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((s) => s.remove())
  })

  it('token 未取得ではサーバーへ送らず captchaRequired を表示する（AC-04）', async () => {
    // turnstile.render はコールバックを呼ばない＝token 未取得のまま（bot が widget 未解決のケース）
    const renderSpy = vi.fn().mockReturnValue('wid-1')
    window.turnstile = { render: renderSpy, reset: vi.fn(), remove: vi.fn() }

    vi.resetModules()
    const { default: FreshAuthModal } = await import('../AuthModal')
    const onClose = vi.fn()
    render(<FreshAuthModal onClose={onClose} />)

    // widget 描画が試みられる
    await waitFor(() => expect(renderSpy).toHaveBeenCalled())

    await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'test@test.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123')
    // submit ボタンは captcha 未準備で disabled のため、フォーム submit を直接発火させる
    fireEvent.submit(screen.getByRole('button', { name: 'auth.submitLogin' }))

    await waitFor(() => {
      expect(screen.getByText('auth.errors.captchaRequired')).toBeInTheDocument()
    })
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('token 取得後はログインでき captchaToken が送られる', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    // render 時にコールバックを即時呼んで token を確定させる
    const renderSpy = vi.fn().mockImplementation((_el: HTMLElement, opts: { callback?: (t: string) => void }) => {
      opts.callback?.('tok-123')
      return 'wid-1'
    })
    const resetSpy = vi.fn()
    window.turnstile = { render: renderSpy, reset: resetSpy, remove: vi.fn() }

    vi.resetModules()
    const { default: FreshAuthModal } = await import('../AuthModal')
    const onClose = vi.fn()
    render(<FreshAuthModal onClose={onClose} />)

    await waitFor(() => expect(renderSpy).toHaveBeenCalled())

    await userEvent.type(screen.getByPlaceholderText('example@email.com'), 'test@test.com')
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'password123')
    fireEvent.submit(screen.getByRole('button', { name: 'auth.submitLogin' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    const arg = mockSignInWithPassword.mock.calls[0]?.[0] as { options?: { captchaToken?: string } } | undefined
    expect(arg?.options?.captchaToken).toBe('tok-123')
    // 単回使用 token は送信後にリセットされる
    expect(resetSpy).toHaveBeenCalled()
  })
})
