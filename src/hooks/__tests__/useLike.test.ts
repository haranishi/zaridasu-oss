import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLike } from '../useLike'

// ── モック（vi.hoisted で vi.mock ホイスティングに対応）──
const {
  selectMock,
  deleteMock,
  deleteEqUserMock,
  insertMock,
  mockUseAuth,
} = vi.hoisted(() => {
  const deleteEqUserMock = vi.fn()
  const deleteEqMock = vi.fn(() => ({ eq: deleteEqUserMock }))
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }))
  const insertMock = vi.fn()
  const selectMock = vi.fn()
  const mockUseAuth = vi.fn()

  return {
    selectMock,
    deleteMock,
    deleteEqUserMock,
    insertMock,
    mockUseAuth,
  }
})

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: selectMock,
      delete: deleteMock,
      insert: insertMock,
    })),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: mockUseAuth,
}))

const POST_ID = 'test-post-123'
const USER_ID = 'user-abc'

function setupDefaultMocks() {
  // fetchLikes: count query
  selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.head) {
      // count query for likes
      return {
        eq: vi.fn().mockResolvedValue({ count: 3 }),
      }
    }
    // user-specific like check
    return {
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        })),
      })),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ user: { id: USER_ID }, isEmailConfirmed: true })
  setupDefaultMocks()
})

// ── テスト ───────────────────────────────────────────────────────────────
describe('useLike', () => {
  it('初期ロード時にいいね数とユーザーのlike状態を取得する', async () => {
    // count query returns 5
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 5 }) }
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'like-1' } }),
          })),
        })),
      }
    })

    const { result } = renderHook(() => useLike(POST_ID))

    await waitFor(() => {
      expect(result.current.likeCount).toBe(5)
      expect(result.current.liked).toBe(true)
    })
  })

  it('未ログインユーザーがtoggleLikeを呼ぶとonRequireAuthが呼ばれる', async () => {
    mockUseAuth.mockReturnValue({ user: null, isEmailConfirmed: false })

    const { result } = renderHook(() => useLike(POST_ID))
    const onRequireAuth = vi.fn()

    await act(async () => {
      await result.current.toggleLike(onRequireAuth)
    })

    expect(onRequireAuth).toHaveBeenCalledTimes(1)
  })

  it('メール未確認ユーザーがtoggleLikeを呼ぶとemailNoticeがtrueになる', async () => {
    mockUseAuth.mockReturnValue({ user: { id: USER_ID }, isEmailConfirmed: false })

    const { result } = renderHook(() => useLike(POST_ID))

    await act(async () => {
      await result.current.toggleLike()
    })

    expect(result.current.emailNotice).toBe(true)
  })

  it('いいね追加: insert成功時にliked=true, likeCount+1になる', async () => {
    // Initial: not liked, count=2
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 2 }) }
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      }
    })
    insertMock.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useLike(POST_ID))

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.likeCount).toBe(2)
      expect(result.current.liked).toBe(false)
    })

    await act(async () => {
      await result.current.toggleLike()
    })

    expect(result.current.liked).toBe(true)
    expect(result.current.likeCount).toBe(3)
  })

  it('いいね削除: delete成功時にliked=false, likeCount-1になる', async () => {
    // Initial: liked, count=5
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 5 }) }
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'like-1' } }),
          })),
        })),
      }
    })
    deleteEqUserMock.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useLike(POST_ID))

    await waitFor(() => {
      expect(result.current.liked).toBe(true)
      expect(result.current.likeCount).toBe(5)
    })

    await act(async () => {
      await result.current.toggleLike()
    })

    expect(result.current.liked).toBe(false)
    expect(result.current.likeCount).toBe(4)
  })

  it('toggleLike中はlikeLoadingがtrueになり、完了後にfalseになる', async () => {
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 0 }) }
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      }
    })

    let resolveInsert!: (value: unknown) => void
    insertMock.mockReturnValue(new Promise((res) => { resolveInsert = res }))

    const { result } = renderHook(() => useLike(POST_ID))

    await waitFor(() => {
      expect(result.current.likeCount).toBe(0)
    })

    // Start toggle - should set loading
    act(() => {
      result.current.toggleLike()
    })

    expect(result.current.likeLoading).toBe(true)

    // Resolve insert
    await act(async () => {
      resolveInsert({ error: null })
    })

    expect(result.current.likeLoading).toBe(false)
  })

  it('insert失敗時にエラーリカバリ（再fetch）が行われる', async () => {
    // Initial: not liked, count=2
    let callCount = 0
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 2 }) }
      }
      callCount++
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      }
    })
    insertMock.mockResolvedValue({ error: { message: 'duplicate' } })

    const { result } = renderHook(() => useLike(POST_ID))

    await waitFor(() => {
      expect(result.current.likeCount).toBe(2)
    })

    const selectCallsBefore = callCount

    await act(async () => {
      await result.current.toggleLike()
    })

    // After error, the catch block should have re-fetched (called select again)
    // The likeLoading should be false after the finally block
    expect(result.current.likeLoading).toBe(false)
    // select should have been called again in catch for error recovery
    expect(callCount).toBeGreaterThan(selectCallsBefore)
  })

  it('連続クリック排他制御: togglingRef.currentがtrueの間は2回目が無視される', async () => {
    selectMock.mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: vi.fn().mockResolvedValue({ count: 0 }) }
      }
      return {
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          })),
        })),
      }
    })

    let resolveInsert!: (value: unknown) => void
    insertMock.mockReturnValue(new Promise((res) => { resolveInsert = res }))

    const { result } = renderHook(() => useLike(POST_ID))

    await waitFor(() => {
      expect(result.current.likeCount).toBe(0)
    })

    // First click - starts the toggle
    act(() => {
      result.current.toggleLike()
    })

    // Second click while first is in progress - should be ignored
    await act(async () => {
      await result.current.toggleLike()
    })

    // insert should only have been called once
    expect(insertMock).toHaveBeenCalledTimes(1)

    // Cleanup: resolve the pending promise
    await act(async () => {
      resolveInsert({ error: null })
    })
  })
})
