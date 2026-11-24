import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminLayout from '../AdminLayout'

const routerPush = vi.fn()
const routerReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
  usePathname: () => '/admin',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const authState: {
  user: { email?: string } | null
  isAdmin: boolean
  loading: boolean
  isEmailConfirmed: boolean | null
  // REQ-330: signOut は「やめる」・送り切れない・ログアウトに失敗したときに false を返す（実物と同じ戻り値）
  signOut: ReturnType<typeof vi.fn<() => Promise<boolean>>>
} = {
  user: null,
  isAdmin: false,
  loading: false,
  isEmailConfirmed: true,
  signOut: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
}

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => authState,
}))

beforeEach(() => {
  routerPush.mockClear()
  routerReplace.mockClear()
  authState.user = null
  authState.isAdmin = false
  authState.loading = false
  authState.signOut.mockReset().mockResolvedValue(true)
})

describe('AdminLayout', () => {
  it('未認証ユーザーを /admin/login にリダイレクトする', () => {
    authState.user = null
    authState.isAdmin = false
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    expect(routerPush).toHaveBeenCalledWith('/admin/login')
    expect(screen.queryByTestId('child')).toBeNull()
  })

  it('非 admin ユーザーを / にリダイレクトする', () => {
    authState.user = { email: 'user@example.com' }
    authState.isAdmin = false
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    expect(routerPush).toHaveBeenCalledWith('/')
  })

  it('loading 中はリダイレクトせず認証チェック表示を出す', () => {
    authState.loading = true
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    expect(routerPush).not.toHaveBeenCalled()
    expect(screen.getByText('admin.nav.authChecking')).toBeInTheDocument()
  })

  it('admin ユーザーは children を描画する', () => {
    authState.user = { email: 'admin@example.com' }
    authState.isAdmin = true
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('REQ-330: ログアウトできたら /admin/login へ移る', async () => {
    authState.user = { email: 'admin@example.com' }
    authState.isAdmin = true
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    fireEvent.click(screen.getAllByRole('button', { name: /admin\.nav\.signOut/ })[0]!)
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/admin/login'))
  })

  it('REQ-330: 確認で「やめる」を選んだ・ログアウトに失敗した（false）ときは画面を移らない', async () => {
    authState.user = { email: 'admin@example.com' }
    authState.isAdmin = true
    authState.signOut.mockResolvedValueOnce(false)
    render(<AdminLayout><div data-testid="child">child</div></AdminLayout>)
    fireEvent.click(screen.getAllByRole('button', { name: /admin\.nav\.signOut/ })[0]!)
    await waitFor(() => expect(authState.signOut).toHaveBeenCalled())
    await Promise.resolve()
    expect(routerPush).not.toHaveBeenCalledWith('/admin/login')
  })
})
