import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type L from 'leaflet'
import { usePostList } from '../usePostList'
import { PAGE_SIZE, QUERY_LIMITS } from '@/lib/constants'

const {
  rangeMock,
  abortSignalMock,
  selectMock,
  eqMock,
  orderMock,
  gteMock,
  lteMock,
  orMock,
  fromMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  rangeMock: vi.fn(),
  abortSignalMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  orderMock: vi.fn(),
  gteMock: vi.fn(),
  lteMock: vi.fn(),
  orMock: vi.fn(),
  fromMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

const builder = {
  select: selectMock,
  eq: eqMock,
  order: orderMock,
  gte: gteMock,
  lte: lteMock,
  or: orMock,
  range: rangeMock,
  // REQ-274: fetchPosts/fetchMore は range().abortSignal(signal) を await する。
  abortSignal: abortSignalMock,
}

vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ error: toastErrorMock }),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}))

describe('usePostList', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    selectMock.mockReturnValue(builder)
    eqMock.mockReturnValue(builder)
    orderMock.mockReturnValue(builder)
    gteMock.mockReturnValue(builder)
    lteMock.mockReturnValue(builder)
    orMock.mockReturnValue(builder)
    fromMock.mockReturnValue(builder)
    rangeMock.mockReturnValue(builder)
    abortSignalMock.mockResolvedValue({ data: [], error: null })

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  it('境界フィルタOFFでは通常ページサイズで取得する', async () => {
    const filters = {
      period: '0' as const,
      municipality: '',
      species: '' as const,
      infoType: '' as const,
      search: '',
      sort: 'newest' as const,
    }

    const { result } = renderHook(() => usePostList(filters, { boundsFilterEnabled: false, mapBounds: null }))

    await act(async () => {
      await result.current.fetchPosts()
    })

    expect(rangeMock).toHaveBeenCalledWith(0, PAGE_SIZE - 1)
  })

  it('境界フィルタONでは bounds をクエリに含め、上限まで一括取得する', async () => {
    const filters = {
      period: '0' as const,
      municipality: '',
      species: '' as const,
      infoType: '' as const,
      search: '',
      sort: 'newest' as const,
    }
    const mapBounds = {
      getSouth: () => 39.6,
      getNorth: () => 40.1,
      getWest: () => 140.0,
      getEast: () => 140.5,
    }

    const { result } = renderHook(() => usePostList(filters, { boundsFilterEnabled: true, mapBounds: mapBounds as unknown as L.LatLngBounds }))

    await act(async () => {
      await result.current.fetchPosts()
    })

    // REQ-243: 生 lat/lng は列 GRANT 剥奪で範囲フィルタにも使えないため、粗化列 display_lat/lng で絞る。
    expect(gteMock).toHaveBeenCalledWith('display_lat', 39.6)
    expect(lteMock).toHaveBeenCalledWith('display_lat', 40.1)
    expect(gteMock).toHaveBeenCalledWith('display_lng', 140.0)
    expect(lteMock).toHaveBeenCalledWith('display_lng', 140.5)
    expect(rangeMock).toHaveBeenCalledWith(0, QUERY_LIMITS.posts - 1)
    expect(result.current.hasMore).toBe(false)
  })

  it('境界フィルタONでは fetchMore を実行しない', async () => {
    const filters = {
      period: '0' as const,
      municipality: '',
      species: '' as const,
      infoType: '' as const,
      search: '',
      sort: 'newest' as const,
    }

    const { result } = renderHook(() => usePostList(filters, { boundsFilterEnabled: true, mapBounds: {} as unknown as L.LatLngBounds }))

    await act(async () => {
      await result.current.fetchMore()
    })

    expect(rangeMock).not.toHaveBeenCalled()
  })

  it('REQ-274: 遅く解決した古い要求が新しい結果を上書きしない（中断ガード）', async () => {
    const filters = {
      period: '0' as const,
      municipality: '',
      species: '' as const,
      infoType: '' as const,
      search: '',
      sort: 'newest' as const,
    }

    // 1回目の要求は保留（後から解決させる）。2回目は即時に「新しい結果」を返す。
    let resolveFirst!: (v: { data: unknown[]; error: null }) => void
    abortSignalMock
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res }))
      .mockResolvedValueOnce({ data: [{ id: 'new' }], error: null })

    const { result } = renderHook(() => usePostList(filters, { boundsFilterEnabled: false, mapBounds: null }))

    let firstCall!: Promise<void>
    await act(async () => {
      firstCall = result.current.fetchPosts() // 1回目: in-flight のまま
    })
    await act(async () => {
      await result.current.fetchPosts() // 2回目: 1回目を abort して完了
    })
    await act(async () => {
      // 古い要求が後から解決しても、中断ガードにより setPosts されない。
      resolveFirst({ data: [{ id: 'old' }], error: null })
      await firstCall
    })

    expect((result.current.posts as unknown as { id: string }[]).map((p) => p.id)).toEqual(['new'])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBe(false)
  })
})
