import { useEffect, type ComponentProps, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import L from 'leaflet'
import { format } from 'date-fns'
import MapView from '../MapView'

const m = vi.hoisted(() => ({
  map: {} as Record<string, unknown>,
  bounds: null as unknown as L.LatLngBounds,
  events: {} as Record<string, () => void>,
  positionUpdate: vi.fn(),
}))
vi.mock('date-fns', async importActual => ({ ...await importActual<typeof import('date-fns')>(), format: vi.fn(() => '10/11') }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/features/water/components/NearbyWaterLayer', () => ({ default: () => null }))
vi.mock('@/context/MapSettingsContext', () => ({ useMapSettings: () => ({ showHeatmap: false, activeLayerId: 'osm' }) }))
vi.mock('next/dynamic', () => ({ default: () => ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: function Marker({ children, position, eventHandlers }: { children: ReactNode; position: L.LatLngTuple; eventHandlers: Record<string, () => void> }) {
    // react-leafletはpositionの参照が変わるとsetLatLngする。その更新を記録する。
    useEffect(() => { m.positionUpdate(position) }, [position])
    return (
      <div data-testid="marker" data-position={JSON.stringify(position)}>
        <button onClick={eventHandlers.popupopen}>Open</button>
        <button onClick={eventHandlers.popupclose}>Close</button>
        {children}
      </div>
    )
  },
  // 実際のPopupも閉じている間にportalを保つため、常にchildrenを描画する。
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => m.map,
  useMapEvents: (events: Record<string, () => void>) => { m.events = events; return m.map },
}))
vi.mock('../PersonalMapLayer', () => ({ default: () => null }))
vi.mock('@/features/fieldwork/components/FieldworkLayer', () => ({ default: () => null }))
vi.mock('../MapTopSlot', () => ({ MapTopSlot: () => null, MapTopSlotProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock('../MapActionStack', () => ({
  MapAction: () => null, MapActionStack: () => null,
  MapActionStackProvider: ({ children }: { children: ReactNode }) => children,
  MAP_ACTION_ORDER: { locate: 1 },
}))

type Props = ComponentProps<typeof MapView>
const post: Props['posts'][number] = {
  id: 'public-post', lat: 39.72, lng: 140.1, species: 'american', info_type: 'capture',
  municipality: '秋田市', comment: '公開された観察', locality: 'テスト地区', water_body: 'テスト川', created_at: '2026-10-11T00:00:00Z',
}
const request: NonNullable<Props['surveyRequests']>[number] = {
  id: 'public-request', lat: '39.73', lng: '140.11', reason: '公開された調査依頼', municipality: '秋田市', created_at: post.created_at,
}
const props: Props = { posts: [post], surveyRequests: [request], boundsFilterEnabled: false, boundsFilterCount: 0 }

beforeEach(() => {
  vi.mocked(format).mockClear()
  m.positionUpdate.mockClear()
  m.bounds = L.latLngBounds([[39.5, 139.9], [40, 140.4]])
  m.map = {
    getBounds: () => m.bounds, getContainer: () => document.createElement('div'),
    getSize: () => L.point(1024, 768), getBoundsZoom: () => 8, project: () => L.point(0, 0),
    setView: vi.fn(), invalidateSize: vi.fn(), removeLayer: vi.fn(),
  }
})

describe('地図の描画とポップアップ', () => {
  it('閉じた投稿・調査依頼の詳細は作らず、開閉に合わせて内容と経路を表示・解放する', () => {
    render(<MapView {...props} />)
    expect(format).not.toHaveBeenCalled()
    expect(screen.queryByTestId('route-links')).not.toBeInTheDocument()
    const [postMarker, requestMarker] = screen.getAllByTestId('marker')
    fireEvent.click(within(postMarker!).getByText('Open'))
    expect(screen.getByText(post.comment!)).toBeInTheDocument()
    expect(screen.getByText('💧 テスト川')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'postCard.detail →' })).toHaveAttribute('href', '/post/public-post')
    expect(screen.getByTestId('route-links').querySelector('a')).toHaveAttribute('href', expect.stringContaining('39.72'))
    fireEvent.click(within(postMarker!).getByText('Close'))
    expect(screen.queryByText(post.comment!)).not.toBeInTheDocument()
    expect(screen.queryByTestId('route-links')).not.toBeInTheDocument()
    fireEvent.click(within(requestMarker!).getByText('Open'))
    expect(screen.getByText(request.reason!)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'survey.viewDetail →' })).toHaveAttribute('href', '/request/public-request')
    expect(screen.getByTestId('route-links').querySelector('a')).toHaveAttribute('href', expect.stringContaining('39.73'))
    fireEvent.click(within(requestMarker!).getByText('Close'))
    expect(screen.queryByTestId('route-links')).not.toBeInTheDocument()
  })

  it('パンで残ったマーカーの座標と開いた内容を作り直さず、画面外の投稿は除外する', () => {
    render(<MapView {...props} posts={[post, { ...post, id: 'outside', lat: 39.9 }]} />)
    fireEvent.click(within(screen.getAllByTestId('marker')[0]!).getByText('Open'))
    m.positionUpdate.mockClear()
    vi.mocked(format).mockClear()
    act(() => {
      m.bounds = L.latLngBounds([[39.7, 140], [39.75, 140.2]])
      m.events.moveend!()
    })
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
    expect(m.positionUpdate).not.toHaveBeenCalled()
    expect(format).not.toHaveBeenCalled()
    expect(screen.getByText(post.comment!)).toBeInTheDocument()
  })

  it('開いている投稿が更新されたら詳細と公開座標も更新し、閉じて再度開ける', () => {
    const view = render(<MapView {...props} />)
    const marker = screen.getAllByTestId('marker')[0]!
    fireEvent.click(within(marker).getByText('Open'))
    view.rerender(<MapView {...props} posts={[{ ...post, comment: '更新した観察', lat: 39.721 }]} />)
    expect(screen.getByText('更新した観察')).toBeInTheDocument()
    expect(screen.getByTestId('route-links').querySelector('a')).toHaveAttribute('href', expect.stringContaining('39.721'))
    fireEvent.click(within(marker).getByText('Close'))
    fireEvent.click(within(marker).getByText('Open'))
    expect(screen.getByText('更新した観察')).toBeInTheDocument()
  })
})
