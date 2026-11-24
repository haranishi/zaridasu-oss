// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))

const fetchMock = vi.fn()
const water = {
  type: 'way', id: 1, tags: { natural: 'water', name: 'テスト池' },
  geometry: [{ lat: 39, lon: 140 }, { lat: 40, lon: 140 }, { lat: 40, lon: 141 }, { lat: 39, lon: 140 }],
}
const request = () => new NextRequest('https://zaridasu.test/api/nearby-water?lat=39.7&lng=140.1&radius=1500')
const success = () => Response.json({ elements: [water] })

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('GET nearby-water', () => {
  it('水域を返し、次の同地点検索はキャッシュから取得する', async () => {
    fetchMock.mockResolvedValue(success())
    const { GET } = await import('../route')
    const first = await GET(request())
    expect((await first.json()).meta).toMatchObject({ ok: true, count: 1, cached: false })
    const second = await GET(request())
    expect((await second.json()).meta).toMatchObject({ ok: true, count: 1, cached: true, source: 'cache' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.headers.get('cache-control')).toContain('s-maxage=300')
  })

  it('正常な0件は0件として返し、ミラーを無駄に呼ばない', async () => {
    fetchMock.mockResolvedValue(Response.json({ elements: [] }))
    const { GET } = await import('../route')
    const res = await GET(request())
    expect((await res.json()).meta).toMatchObject({ ok: true, degraded: false, count: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['HTTP 503', () => Response.json({}, { status: 503 })],
    ['HTTP 200 の runtime error', () => Response.json({ elements: [], remark: 'runtime error: Query timed out' })],
    ['elements が欠落した JSON', () => Response.json({ error: 'upstream failed' })],
  ])('%s は別の公開ミラーで取得し直す', async (_name, response) => {
    fetchMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(success())
    const { GET } = await import('../route')
    const res = await GET(request())
    expect((await res.json()).meta).toMatchObject({ ok: true, degraded: false, count: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]![0]).not.toBe(fetchMock.mock.calls[1]![0])
  })

  it('タイムアウト後はミラーで再取得し、各リクエストの待機時間を制限する', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError')).mockResolvedValueOnce(success())
    const { GET } = await import('../route')
    const res = await GET(request())
    expect((await res.json()).meta).toMatchObject({ ok: true, count: 1 })
    expect(timeout.mock.calls).toEqual([[12_000], [12_000]])
    timeout.mockRestore()
  })

  it('全ての取得先が失敗した場合は0件成功と区別し、失敗をキャッシュしない', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(Response.json({ elements: [], remark: 'runtime error: Query timed out' })))
    const { GET } = await import('../route')
    const res = await GET(request())
    expect((await res.json()).meta).toMatchObject({ ok: false, degraded: true, count: 0, source: 'unavailable' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    await GET(request())
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('同地点の同時検索は1件の上流リクエストにまとめる', async () => {
    fetchMock.mockResolvedValue(success())
    const { GET } = await import('../route')
    const responses = await Promise.all([GET(request()), GET(request())])
    expect(await Promise.all(responses.map(async res => (await res.json()).meta.count))).toEqual([1, 1])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('日本の範囲外では上流を呼ばない', async () => {
    const { GET } = await import('../route')
    const res = await GET(new NextRequest('https://zaridasu.test/api/nearby-water?lat=0&lng=0'))
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('キャッシュ満杯時の同時検索でも古い結果を余分に消さない', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(success()))
    const { GET } = await import('../route')
    const at = (lng: number) => new NextRequest(`https://zaridasu.test/api/nearby-water?lat=39.7&lng=${lng}&radius=1500`)
    for (let i = 0; i < 128; i++) await GET(at(140 + i / 1000))
    await Promise.all([GET(at(140.5)), GET(at(140.5))])
    expect(fetchMock).toHaveBeenCalledTimes(129)
    const secondOldest = await GET(at(140.001))
    expect((await secondOldest.json()).meta.cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(129)
  })
})
