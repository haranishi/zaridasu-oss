import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const signOutMock = vi.fn().mockResolvedValue(undefined)
const routerPushMock = vi.fn()
const toastInfoMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { signOut: () => signOutMock() },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ info: toastInfoMock, success: vi.fn(), error: vi.fn() }),
}))

// テスト対象
import { useAdminSessionTimeout } from '../useAdminSessionTimeout'

beforeEach(() => {
  signOutMock.mockClear()
  routerPushMock.mockClear()
  toastInfoMock.mockClear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAdminSessionTimeout', () => {
  it('30 分無操作で signOut → /admin/login へリダイレクトする', async () => {
    renderHook(() => useAdminSessionTimeout())

    await act(async () => {
      vi.advanceTimersByTime(30 * 60 * 1000)
      await Promise.resolve()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(routerPushMock).toHaveBeenCalledWith('/admin/login')
  })

  it('25 分で警告トーストが出て、30 分到達まで signOut は起きない', async () => {
    renderHook(() => useAdminSessionTimeout())

    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 1000)
    })

    expect(toastInfoMock).toHaveBeenCalledWith('admin.session.timeoutWarning', 10000)
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('unmount 後は setTimeout が発火しない（リークなし）', async () => {
    const { unmount } = renderHook(() => useAdminSessionTimeout())
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000)
    })

    expect(signOutMock).not.toHaveBeenCalled()
    expect(toastInfoMock).not.toHaveBeenCalled()
  })
})
