import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useProfile, useRanking, useBadgeDefinitions } from '../useProfile'

const {
  rpcMock,
  fromMock,
  updateMock,
  eqMock,
  selectMock,
  orderMock,
  abortSignalMock,
} = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  selectMock: vi.fn(),
  orderMock: vi.fn(),
  abortSignalMock: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
  },
}))

describe('useProfile hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })

    eqMock.mockResolvedValue({ error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    // REQ-164: badge クエリは .order(...).abortSignal(signal).then(...) の順で呼ばれる
    abortSignalMock.mockResolvedValue({ data: [{ id: 'b1', name: 'badge', sort_order: 1 }], error: null })
    orderMock.mockReturnValue({ abortSignal: abortSignalMock })
    selectMock.mockReturnValue({ order: orderMock })
    fromMock.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return { update: updateMock }
      }
      return { select: selectMock }
    })
  })

  it('ユーザーIDなしの場合はロード終了する', async () => {
    const { result } = renderHook(() => useProfile(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toBeNull()
  })

  it('プロフィール取得成功時に profile が設定される', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'u1', display_name: 'Taro' }, error: null })
    const { result } = renderHook(() => useProfile('u1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile?.display_name).toBe('Taro')
    expect(result.current.error).toBeNull()
  })

  it('updateProfile は更新後に再取得する', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { id: 'u1', display_name: 'before' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'u1', display_name: 'after' }, error: null })

    const { result } = renderHook(() => useProfile('u1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateProfile({ display_name: 'after' })
    })

    expect(fromMock).toHaveBeenCalledWith('user_profiles')
    expect(updateMock).toHaveBeenCalledWith({ display_name: 'after' })
    expect(eqMock).toHaveBeenCalledWith('id', 'u1')
    expect(rpcMock).toHaveBeenCalledTimes(2)
  })

  it('ランキングはオンライン時にRPC結果を反映する', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ user_id: 'u1', post_count: 3, rank: 1 }], error: null })
    const { result } = renderHook(() => useRanking({ period: 'all', limit: 10 }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ranking).toHaveLength(1)
  })

  it('バッジ定義はテーブルから読み込まれる', async () => {
    const { result } = renderHook(() => useBadgeDefinitions())

    await waitFor(() => expect(result.current.length).toBe(1))
    expect(fromMock).toHaveBeenCalledWith('badge_definitions')
    // REQ-103: select('*') から必要列のみの明示指定に変更
    expect(selectMock).toHaveBeenCalledWith('id, name, description, icon, sort_order')
    expect(orderMock).toHaveBeenCalledWith('sort_order')
  })
})
