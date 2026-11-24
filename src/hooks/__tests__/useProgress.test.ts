import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useProgress } from '../useProfile'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('@/lib/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}))

describe('useProgress（REQ-248 貢献レベル/XP）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('userId が無ければ RPC を呼ばず loading 終了', async () => {
    const { result } = renderHook(() => useProgress(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.current.progress).toBeNull()
  })

  it('成功時は RETURNS TABLE の先頭行を progress に設定する', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ xp: 70, level: 2, xp_into_level: 20, xp_for_next_level: 100, approved_count: 2 }],
      error: null,
    })
    const { result } = renderHook(() => useProgress('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(rpcMock).toHaveBeenCalledWith('get_user_progress', { p_user_id: 'u1' })
    expect(result.current.progress).toEqual({
      xp: 70, level: 2, xp_into_level: 20, xp_for_next_level: 100, approved_count: 2,
    })
    expect(result.current.error).toBeNull()
  })

  it('非公開プロフィール等で 0 行なら progress は null', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    const { result } = renderHook(() => useProgress('other'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.progress).toBeNull()
  })

  it('RPC エラー時は error を立て、空配列に握りつぶさない', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const { result } = renderHook(() => useProgress('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.progress).toBeNull()
  })
})
