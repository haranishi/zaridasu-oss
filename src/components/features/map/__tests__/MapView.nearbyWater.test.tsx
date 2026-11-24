import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import ja from '@/locales/ja/translation.json'
import MapView from '../MapView'

const m = vi.hoisted(() => ({ map: {} as Record<string, unknown> }))

// 翻訳関数とLeafletの境界だけを置き換え、検索・再試行・表示状態は実MapViewを操作する。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const value = key.split('.').reduce<unknown>((current, part) => {
        return current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined
      }, ja)
      return typeof value === 'string'
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? ''))
        : key
    },
    i18n: { language: 'ja' },
  }),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/features/water/data/publicData', () => ({
  loadPublicWaterSurveyPoints: vi.fn().mockResolvedValue({ points: [], complete: false }),
  loadCommunityWaterBodies: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/context/MapSettingsContext', () => ({ useMapSettings: () => ({ showHeatmap: false, activeLayerId: 'osm' }) }))
vi.mock('next/dynamic', () => ({ default: () => ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  useMap: () => m.map,
  useMapEvents: () => m.map,
}))
vi.mock('../PersonalMapLayer', () => ({ default: () => null }))
vi.mock('@/features/fieldwork/components/FieldworkLayer', () => ({ default: () => null }))
vi.mock('../MapTopSlot', () => ({ MapTopSlot: () => null, MapTopSlotProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('../MapActionStack', () => ({
  MapAction: () => null,
  MapActionStack: () => null,
  MapActionStackProvider: ({ children }: { children: ReactNode }) => children,
  MAP_ACTION_ORDER: { locate: 1 },
}))

const waterFeatures = [
  { type: 'Feature', properties: { name: 'ため池' }, geometry: { type: 'Polygon', coordinates: [[[140.09, 39.72], [140.11, 39.72], [140.10, 39.73], [140.09, 39.72]]] } },
  { type: 'Feature', properties: { name: '川' }, geometry: { type: 'Polygon', coordinates: [[[140.10, 39.71], [140.11, 39.71], [140.11, 39.73], [140.10, 39.71]]] } },
]
const center = { lat: 39.720123, lng: 140.100987 }
const fetchMock = vi.fn<typeof fetch>()
let layer: { addTo: ReturnType<typeof vi.fn> }
let circle: { addTo: ReturnType<typeof vi.fn>; getBounds: () => L.LatLngBounds }
let circleSpy: MockInstance<typeof L.circle>
let geoJsonSpy: MockInstance<typeof L.geoJSON>

function response(features: unknown[], degraded = false) {
  return new Response(JSON.stringify({ type: 'FeatureCollection', features, meta: { count: features.length, degraded } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function renderMap() {
  return render(<MapView posts={[]} boundsFilterEnabled={false} boundsFilterCount={0} />)
}

function findWater() {
  fireEvent.click(screen.getByRole('button', { name: '近くの水域を探す' }))
}

async function expectWaterShown() {
  await waitFor(() => expect(screen.getByRole('button', { name: /非表示.*2 件/ })).toHaveAttribute('aria-pressed', 'true'))
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  layer = { addTo: vi.fn().mockReturnThis() }
  circle = { addTo: vi.fn().mockReturnThis(), getBounds: () => L.latLng(center).toBounds(3000) }
  geoJsonSpy = vi.spyOn(L, 'geoJSON').mockImplementation(() => layer as unknown as L.GeoJSON)
  circleSpy = vi.spyOn(L, 'circle').mockImplementation(() => circle as unknown as L.Circle)
  m.map = {
    getCenter: vi.fn(() => center),
    getBounds: () => L.latLngBounds([[-90, -180], [90, 180]]),
    getContainer: () => document.createElement('div'),
    getSize: () => L.point(1024, 768),
    getBoundsZoom: () => 8,
    project: () => L.point(0, 0),
    setView: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('近くの水域の検索操作', () => {
  it('ボタンを押した地図中心の1.5kmを検索し、件数・検索範囲と水域を見える位置に表示する', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    renderMap()
    expect(fetchMock).not.toHaveBeenCalled()

    findWater()
    expect(screen.getByRole('button', { name: '近くの水域を探す' })).toBeDisabled()
    expect(screen.getByText('水域を検索中…')).toBeInTheDocument()
    const requestUrl = new URL(String(fetchMock.mock.calls[0]![0]), 'https://zaridasu.com')
    expect(requestUrl.pathname).toBe('/api/nearby-water')
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({ lat: '39.72012', lng: '140.10099', radius: '1500' })

    await act(async () => pending.resolve(response(waterFeatures)))
    await expectWaterShown()
    expect(screen.getByRole('button', { name: '近くの水域を探す' })).toBeEnabled()
    expect(screen.getByText(/地図.*中心.*1\.5\s*km/)).toBeInTheDocument()
    expect(geoJsonSpy.mock.calls[0]![0]).toMatchObject({ type: 'FeatureCollection', features: waterFeatures })
    expect(layer.addTo).toHaveBeenCalledWith(m.map)
    expect(circleSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ radius: 1500 }))
    expect(circle.addTo).toHaveBeenCalledWith(m.map)
    expect(m.map.fitBounds).toHaveBeenCalledWith(expect.any(L.LatLngBounds), expect.objectContaining({ maxZoom: 14, padding: [24, 24] }))
    const bounds = (m.map.fitBounds as ReturnType<typeof vi.fn>).mock.calls[0]![0] as L.LatLngBounds
    expect(bounds.contains(center)).toBe(true)
  })

  it('表示を切り替えると水域と検索範囲を一緒に隠し、再取得せずに戻す', async () => {
    fetchMock.mockResolvedValue(response(waterFeatures))
    const { unmount } = renderMap()
    findWater()
    await expectWaterShown()

    fireEvent.click(screen.getByRole('button', { name: /非表示.*2 件/ }))
    expect(screen.getByRole('button', { name: /表示.*2 件/ })).toHaveAttribute('aria-pressed', 'false')
    expect(m.map.removeLayer).toHaveBeenCalledWith(layer)
    expect(m.map.removeLayer).toHaveBeenCalledWith(circle)

    fireEvent.click(screen.getByRole('button', { name: /表示.*2 件/ }))
    await expectWaterShown()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(layer.addTo).toHaveBeenCalledTimes(2)
    expect(circle.addTo).toHaveBeenCalledTimes(2)

    const removeLayer = m.map.removeLayer as ReturnType<typeof vi.fn>
    removeLayer.mockClear()
    unmount()
    expect(removeLayer).toHaveBeenCalledWith(layer)
    expect(removeLayer).toHaveBeenCalledWith(circle)
  })

  it('0件でも検索した範囲を表示し、広い県全体を検索済みと誤解させない', async () => {
    fetchMock.mockResolvedValue(response([]))
    renderMap()
    findWater()
    await waitFor(() => expect(screen.getByText('この範囲には登録された水域が見つかりませんでした')).toBeInTheDocument())
    expect(screen.getByText(/地図.*中心.*1\.5\s*km/)).toBeInTheDocument()
    expect(circle.addTo).toHaveBeenCalledWith(m.map)
    expect(m.map.fitBounds).toHaveBeenCalledTimes(1)
    expect(geoJsonSpy).not.toHaveBeenCalled()
  })

  it('初回の取得エラーに再試行の導線があり、移動後の地図中心で検索をやり直せる', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response(waterFeatures))
    renderMap()
    findWater()
    await waitFor(() => expect(screen.getByText(ja.map.nearbyWater.error)).toBeInTheDocument())
    const getCenter = m.map.getCenter as ReturnType<typeof vi.fn>
    getCenter.mockReturnValue({ lat: 39.75, lng: 140.15 })

    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await expectWaterShown()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const requestUrl = new URL(String(fetchMock.mock.calls[1]![0]), 'https://zaridasu.com')
    expect(requestUrl.searchParams.get('lat')).toBe('39.75000')
    expect(requestUrl.searchParams.get('lng')).toBe('140.15000')
    expect(screen.queryByText(ja.map.nearbyWater.error)).not.toBeInTheDocument()
  })

  it.each([
    ['上流の一時的な失敗', () => Promise.resolve(response([], true))],
    ['通信の切断', () => Promise.reject(new Error('offline'))],
  ])('%sでも前回の水域・件数・表示切り替えを失わない', async (_, failure) => {
    fetchMock.mockResolvedValueOnce(response(waterFeatures)).mockImplementationOnce(failure)
    renderMap()
    findWater()
    await expectWaterShown()
    fireEvent.click(screen.getByRole('button', { name: /非表示.*2 件/ }))
    const removeLayer = m.map.removeLayer as ReturnType<typeof vi.fn>
    removeLayer.mockClear()

    findWater()
    await waitFor(() => expect(screen.getByText(ja.map.nearbyWater.error)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /表示.*2 件/ })).toHaveAttribute('aria-pressed', 'false')
    expect(removeLayer).not.toHaveBeenCalledWith(layer)
    expect(removeLayer).not.toHaveBeenCalledWith(circle)
    fireEvent.click(screen.getByRole('button', { name: /表示.*2 件/ }))
    await expectWaterShown()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(geoJsonSpy).toHaveBeenCalledTimes(1)
  })

  it('検索中に地図を閉じたら通信を中断し、遅れた応答から水域を追加しない', async () => {
    const pending = deferred<Response>()
    fetchMock.mockReturnValue(pending.promise)
    const { unmount } = renderMap()
    findWater()
    const options = fetchMock.mock.calls[0]![1]
    const signal = options?.signal as AbortSignal
    expect(signal.aborted).toBe(false)
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(response(waterFeatures)))
    expect(geoJsonSpy).not.toHaveBeenCalled()
    expect(circleSpy).not.toHaveBeenCalled()
    expect(m.map.fitBounds).not.toHaveBeenCalled()
  })

  it('応答が長時間止まっても検索中のままにせず、通信を中断して再試行できる', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }))
      renderMap()
      findWater()
      expect(screen.getByText('水域を検索中…')).toBeInTheDocument()
      await act(async () => vi.advanceTimersByTimeAsync(35_000))
      expect((fetchMock.mock.calls[0]![1]?.signal as AbortSignal).aborted).toBe(true)
      expect(screen.getByText(ja.map.nearbyWater.error)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '再試行' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '近くの水域を探す' })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
