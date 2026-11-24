import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import MapView from '../MapView'

const m = vi.hoisted(() => ({
  map: {} as Record<string, unknown>,
  showHeatmap: false,
  heatLayer: vi.fn(),
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/features/water/components/NearbyWaterLayer', () => ({ default: () => null }))
vi.mock('@/context/MapSettingsContext', () => ({ useMapSettings: () => ({ showHeatmap: m.showHeatmap, activeLayerId: 'osm' }) }))
vi.mock('next/dynamic', () => ({ default: () => ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ position }: { position: [number, number] }) => <div data-testid="marker" data-position={JSON.stringify(position)} />,
  Popup: () => null,
  useMap: () => m.map,
  useMapEvents: () => m.map,
}))
vi.mock('leaflet.heat', async () => {
  const { default: leaflet } = await import('leaflet')
  leaflet.heatLayer = m.heatLayer
  return {}
})
vi.mock('../PersonalMapLayer', () => ({ default: () => null }))
vi.mock('@/features/fieldwork/components/FieldworkLayer', () => ({ default: () => null }))
vi.mock('../MapTopSlot', () => ({ MapTopSlot: () => null, MapTopSlotProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('../MapActionStack', () => ({
  MapAction: () => null,
  MapActionStack: () => null,
  MapActionStackProvider: ({ children }: { children: ReactNode }) => children,
  MAP_ACTION_ORDER: { locate: 1 },
}))

type MapPost = ComponentProps<typeof MapView>['posts'][number]
const validCoordinates = [[39.72, 140.1], [0, 0], [0, 140], [39, 0], [-90, -180], [90, 180]]
const invalidCoordinates: [unknown, unknown][] = [
  [null, null], [null, 140], [39, null], [undefined, 140], [39, undefined],
  [NaN, 140], [39, NaN], [Infinity, 140], [39, -Infinity],
  [90.1, 140], [-90.1, 140], [39, 180.1], [39, -180.1],
  ['39.72', '140.1'], ['', 140], [false, 140], [[], 140], [{}, 140],
]
const posts = [...validCoordinates, ...invalidCoordinates].map(([lat, lng], index) => ({
  id: String(index), lat, lng, species: 'american', info_type: 'sighting', created_at: '2026-10-08T00:00:00Z',
} as unknown as MapPost))

beforeEach(() => {
  m.showHeatmap = false
  m.heatLayer.mockReset().mockReturnValue({ addTo: vi.fn() })
  m.map = {
    // 実Leafletのcontainsを通し、NULL入り配列が渡ると起きる本番の例外を再現する。
    getBounds: () => L.latLngBounds([[-90, -180], [90, 180]]),
    getContainer: () => document.createElement('div'),
    getSize: () => L.point(1024, 768),
    getBoundsZoom: () => 8,
    project: () => L.point(0, 0),
    setView: vi.fn(),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn(),
  }
})

describe('MapViewの公開座標', () => {
  it('非公開・不正座標を範囲判定とマーカーから除外し、0と境界の座標は描画する', () => {
    render(<MapView posts={posts} boundsFilterEnabled={false} boundsFilterCount={0} />)
    expect(screen.getAllByTestId('marker').map((marker) => JSON.parse(marker.dataset.position!))).toEqual(validCoordinates)
  })

  it('ヒートマップも非公開・不正座標を除外し、0と境界の座標を渡す', async () => {
    m.showHeatmap = true
    render(<MapView posts={posts} boundsFilterEnabled={false} boundsFilterCount={0} />)
    await waitFor(() => expect(m.heatLayer).toHaveBeenCalledTimes(1))
    const points = m.heatLayer.mock.calls[0]![0] as [number, number, number][]
    expect(points.map(([lat, lng]) => [lat, lng])).toEqual(validCoordinates)
    expect(screen.queryByTestId('marker')).not.toBeInTheDocument()
  })
})
