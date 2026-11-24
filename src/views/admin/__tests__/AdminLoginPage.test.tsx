import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import AdminLoginPage from '../AdminLoginPage'

const signInMock = vi.fn()
const routerPushMock = vi.fn()
const routerRefreshMock = vi.fn()
// REQ-149 / REQ-292: 監査記録 RPC のモック。
// REQ-292 で admin_login_check（ロック判定）と admin_login_record(p_success:false) の
// フロント呼び出しは廃止した（anon から REVOKE 済み）。残るのは成功時の
// admin_login_record(p_success:true)＝authenticated による本人の login_success 自己申告のみ。
const rpcMock = vi.fn(
  (_fn: string, _args?: unknown): Promise<{ data: unknown; error: { message: string } | null }> =>
    Promise.resolve({ data: { locked: false }, error: null }),
)

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: { email: string; password: string }) => signInMock(args),
    },
    rpc: (fn: string, args?: unknown) => rpcMock(fn, args),
  },
}))

// 監査記録失敗を握り潰さないことを assert するため logError をモックする。
const logErrorMock = vi.fn()
vi.mock('@/lib/errorHandler', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, refresh: routerRefreshMock }),
  // REQ-137: AdminLoginPage が ?reason=auth_unavailable を読み取るために useSearchParams を使う
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => `${key}${params ? `:${JSON.stringify(params)}` : ''}` }),
}))

beforeEach(() => {
  signInMock.mockReset()
  routerPushMock.mockReset()
  routerRefreshMock.mockReset()
  logErrorMock.mockReset()
  // 既定の RPC 挙動に戻す（個別テストで上書きするため）。
  rpcMock.mockImplementation(() => Promise.resolve({ data: { locked: false }, error: null }))
  sessionStorage.clear()
})

describe('AdminLoginPage', () => {
  it('正常ログインで /admin にリダイレクトする', async () => {
    signInMock.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<AdminLoginPage />)

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(emailInput, 'a@b.com')
    await user.type(passwordInput, 'pw1234')
    await user.click(screen.getByRole('button', { name: /admin.login.submit/ }))

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/admin'))
    expect(signInMock).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw1234' })
  })

  it('成功時 admin_login_record(success) を await して呼ぶ（fire-and-forget でない）', async () => {
    signInMock.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(<AdminLoginPage />)

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(emailInput, 'a@b.com')
    await user.type(passwordInput, 'pw1234')
    await user.click(screen.getByRole('button', { name: /admin.login.submit/ }))

    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/admin'))
    expect(rpcMock).toHaveBeenCalledWith('admin_login_record', { p_email: 'a@b.com', p_success: true })
    expect(logErrorMock).not.toHaveBeenCalled()
  })

  it('監査記録(admin_login_record success)が失敗しても logError し、ログインは成功させる', async () => {
    signInMock.mockResolvedValue({ error: null })
    rpcMock.mockImplementation((fn: string, args?: unknown) => {
      const a = args as { p_success?: boolean } | undefined
      if (fn === 'admin_login_record' && a?.p_success === true)
        return Promise.resolve({ data: null, error: { message: 'audit insert failed' } })
      return Promise.resolve({ data: { locked: false }, error: null })
    })
    const user = userEvent.setup()
    render(<AdminLoginPage />)

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(emailInput, 'a@b.com')
    await user.type(passwordInput, 'pw1234')
    await user.click(screen.getByRole('button', { name: /admin.login.submit/ }))

    // 監査失敗は握り潰さず記録する。
    await waitFor(() => expect(logErrorMock).toHaveBeenCalledTimes(1))
    expect(logErrorMock.mock.calls[0]?.[1]).toBe('AdminLoginPage:admin_login_record')
    // ログイン自体は成功させる（リダイレクトされる）。
    expect(routerPushMock).toHaveBeenCalledWith('/admin')
  })

  it('認証失敗時にエラーメッセージが表示される', async () => {
    signInMock.mockResolvedValue({ error: { message: 'invalid' } })
    const user = userEvent.setup()
    render(<AdminLoginPage />)

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(emailInput, 'a@b.com')
    await user.type(passwordInput, 'wrong')
    await user.click(screen.getByRole('button', { name: /admin.login.submit/ }))

    await waitFor(() => expect(screen.getByText(/admin.login.error/)).toBeInTheDocument())
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  // REQ-292 FR-292-02: anon から呼べる RPC を廃止したことの回帰ガード。
  // admin_login_check は「任意メールのロック状態問い合わせ」＝管理者メールの当て推量に使えたため剥奪、
  // admin_login_record(p_success:false) は任意 email_hash / attempt_count の login_failed 行を
  // audit_logs（append-only＝管理者にも消せない）へ無制限に注入できたため剥奪した。
  it('ログイン前の admin_login_check と失敗時の admin_login_record(false) を呼ばない', async () => {
    signInMock.mockResolvedValue({ error: { message: 'invalid' } })
    const user = userEvent.setup()
    render(<AdminLoginPage />)

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement
    await user.type(emailInput, 'a@b.com')
    await user.type(passwordInput, 'wrong')
    await user.click(screen.getByRole('button', { name: /admin.login.submit/ }))

    await waitFor(() => expect(signInMock).toHaveBeenCalled())
    expect(rpcMock).not.toHaveBeenCalledWith('admin_login_check', expect.anything())
    expect(rpcMock).not.toHaveBeenCalledWith('admin_login_record', { p_email: 'a@b.com', p_success: false })
  })

  it('メールとパスワードにラベルがあり、重大な a11y 違反がない', async () => {
    const { container } = render(<AdminLoginPage />)

    expect(screen.getByRole('textbox', { name: 'admin.login.email' })).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByLabelText('admin.login.password')).toHaveAttribute('autocomplete', 'current-password')
    expect(await axe(container)).toHaveNoViolations()
  })
})
