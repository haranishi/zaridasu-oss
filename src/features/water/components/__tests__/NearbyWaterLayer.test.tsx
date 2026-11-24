import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import L from 'leaflet'
import { useEffect, type ComponentProps } from 'react'
import type { FieldworkRequest } from '@/features/fieldwork/lib/bridge'
import { NEARBY_WATER_CONFIG } from '@/lib/constants'
import ja from '@/locales/ja/translation.json'
import NearbyWaterLayer from '../NearbyWaterLayer'

const m = vi.hoisted(() => ({
  user: null as { id: string } | null,
  map: {} as Record<string, unknown>,
  events: {} as Record<string, (event: { latlng: { lat: number; lng: number }; originalEvent: MouseEvent }) => void>,
  publicRead: vi.fn(), communityRead: vi.fn(), addToPlan: vi.fn(), fetch: vi.fn(),
  selectFirst: null as (() => void) | null,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => {
  const value = key.split('.').reduce<unknown>((current, part) => current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, ja)
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? '')) : key
} }) }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: m.user }) }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('react-leaflet', () => ({ useMap: () => m.map, useMapEvents: (events: typeof m.events) => { m.events = events; return m.map } }))
vi.mock('@/features/fieldwork/lib/bridge', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/fieldwork/lib/bridge')>()
  return { ...original, requestFieldwork: (request: FieldworkRequest) => { m.addToPlan(request); original.requestFieldwork(request) } }
})
vi.mock('../../data/publicData', () => ({ loadPublicWaterSurveyPoints: m.publicRead, loadCommunityWaterBodies: m.communityRead }))
vi.mock('next/dynamic', async () => {
  const React = await import('react')
  const { default: Panel } = await import('../NearbyWaterPanel')
  function MockNearbyWaterPanel(props: ComponentProps<typeof Panel>) {
    m.selectFirst = () => props.candidates[0] && props.onSelect(props.candidates[0])
    return <Panel {...props} />
  }
  function MockWaterReportSheet({ userId, position, onClose, onSubmitted }: { userId: string; position: { lat: number; lng: number }; onClose: () => void; onSubmitted: () => void }) {
    const focusRef = React.useRef<HTMLButtonElement | null>(null)
    React.useEffect(() => { focusRef.current?.focus() }, [])
    return <div role="dialog" aria-label="水域情報提供" data-user={userId} data-position={JSON.stringify(position)}><button ref={focusRef}>フォーム入力</button><button onClick={onClose}>閉じる</button><button onClick={onSubmitted}>送信成功</button></div>
  }
  function MockAuthModal({ onClose }: { onClose: () => void }) {
    const focusRef = React.useRef<HTMLButtonElement | null>(null)
    React.useEffect(() => { focusRef.current?.focus() }, [])
    return <div role="dialog" aria-label="ログイン"><button ref={focusRef}>メールアドレス</button><button onClick={onClose}>閉じる</button></div>
  }
  return { default: (loader: () => Promise<unknown>) => {
    if (String(loader).includes('NearbyWaterPanel')) return MockNearbyWaterPanel
    if (String(loader).includes('WaterReportSheet')) return MockWaterReportSheet
    return MockAuthModal
  } }
})

const near = { type: 'Feature', id: 'near', properties: { name: '近い池' }, geometry: { type: 'Polygon', coordinates: [[[140.001, 39], [140.002, 39], [140.002, 39.001], [140.001, 39.001], [140.001, 39]]] } }
const far = { type: 'Feature', id: 'far', properties: { name: '遠い池' }, geometry: { type: 'Polygon', coordinates: [[[140.01, 39.01], [140.011, 39.01], [140.011, 39.011], [140.01, 39.011], [140.01, 39.01]]] } }
let layer: { addTo: ReturnType<typeof vi.fn> }
let removeLayer: ReturnType<typeof vi.fn>
const find = () => fireEvent.click(screen.getByRole('button', { name: ja.map.nearbyWater.button }))
const openList = () => fireEvent.click(screen.getByRole('button', { name: ja.water.openList }))
const addToPlanName = (name: string) => `${name}: ${ja.water.addToPlan}`

beforeEach(() => {
  m.user = { id: 'user-one' }
  m.fetch.mockReset().mockImplementation(() => Promise.resolve(Response.json({ features: [far, near], meta: { degraded: false } })))
  vi.stubGlobal('fetch', m.fetch)
  m.publicRead.mockReset().mockResolvedValue({ points: [{ lat: 39.0005, lng: 140.0015 }], complete: true })
  m.communityRead.mockReset().mockResolvedValue([])
  m.addToPlan.mockReset()
  m.selectFirst = null
  layer = { addTo: vi.fn().mockReturnThis() }
  removeLayer = vi.fn()
  vi.spyOn(L, 'geoJSON').mockReturnValue(layer as unknown as L.GeoJSON)
  vi.spyOn(L, 'circle').mockImplementation((position) => ({
    addTo: vi.fn().mockReturnThis(),
    getBounds: () => L.latLng(position as L.LatLngExpression).toBounds(3000),
  }) as unknown as L.Circle)
  const container = document.createElement('div')
  m.map = { getCenter: vi.fn(() => ({ lat: 39, lng: 140 })), getContainer: () => container, fitBounds: vi.fn(), removeLayer, closePopup: vi.fn() }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('水域から選択・調査・情報提供', () => {
  it('Leaflet操作列の子からwheelを外へ伝播させない', () => {
    const view = render(<NearbyWaterLayer />)
    const outsideWheel = vi.fn()
    view.container.addEventListener('wheel', outsideWheel)
    fireEvent.wheel(screen.getByRole('button', { name: ja.water.reportButton }))
    expect(outsideWheel).not.toHaveBeenCalled()
  })

  it('一覧をLeaflet操作列の通常フローに置く', async () => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(screen.getByRole('button', { name: ja.water.openList })).toBeInTheDocument())
    openList()
    const panelContainer = document.querySelector<HTMLElement>('[data-water-panel]')
    expect(panelContainer).not.toBeNull()
    expect(panelContainer!.closest('.leaflet-control')).not.toBeNull()
    expect(panelContainer).not.toHaveClass('absolute')
  })

  it('水域の表示切替にレイヤー色の見本と44pxのタップ領域を保つ', async () => {
    render(<NearbyWaterLayer />)
    find()
    const toggle = await screen.findByRole('button', { name: /非表示.*2 件/ })
    expect(toggle).toHaveClass('min-h-11')
    const swatch = toggle.querySelector<HTMLElement>('[aria-hidden="true"]')
    expect(swatch).not.toBeNull()
    expect(swatch).toHaveStyle({
      backgroundColor: NEARBY_WATER_CONFIG.style.fillColor,
      borderColor: NEARBY_WATER_CONFIG.style.color,
    })
    // 計算後の枠線の幅は、jsdom 31 以降はブラウザと同じくデバイスピクセルへ丸められる（1.5px → 1px）。
    // 宣言した幅は、丸められないインラインの値で確かめる。
    expect(swatch!.style.borderWidth).toBe('1.5px')
  })

  it('一覧を開くと見出しへ、閉じると開いたボタンへフォーカスを移す', async () => {
    render(<NearbyWaterLayer />)
    find()
    const opener = await screen.findByRole('button', { name: ja.water.openList })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(screen.getByRole('heading', { name: ja.water.listTitle })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: ja.water.closeList }))
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('一覧外にフォーカスがあるまま一覧を閉じてもフォーカスを動かさない', async () => {
    render(<NearbyWaterLayer />)
    find()
    await screen.findByRole('button', { name: ja.water.openList })
    openList()
    const outside = screen.getAllByRole('button', { name: ja.water.reportButton })[0]!
    outside.focus()
    fireEvent.click(screen.getByRole('button', { name: ja.water.closeList }))
    expect(outside).toHaveFocus()
  })

  it('匿名の計画操作で、初回も再表示時もログインダイアログ内へフォーカスを保つ', async () => {
    m.user = null
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    const openAndAdd = async () => {
      openList()
      const item = (await screen.findByText('近い池')).closest('li')!
      fireEvent.click(within(item).getByRole('button', { name: addToPlanName('近い池') }))
      await act(async () => { await Promise.resolve() })
      const dialog = screen.getByRole('dialog', { name: 'ログイン' })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
      fireEvent.click(within(dialog).getByRole('button', { name: '閉じる' }))
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    }
    await openAndAdd()
    await openAndAdd()
  })

  it('一覧の開閉とアンマウントに合わせて地図コンテナの水域一覧状態を更新する', async () => {
    const view = render(<NearbyWaterLayer />)
    find()
    await screen.findByRole('button', { name: ja.water.openList })
    const container = (m.map.getContainer as () => HTMLElement)()
    openList()
    expect(container.dataset.waterList).toBe('open')
    expect(container.dataset.waterPanel).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: ja.water.closeList }))
    expect(container.dataset.waterList).toBeUndefined()
    openList()
    expect(container.dataset.waterList).toBe('open')
    view.unmount()
    expect(container.dataset.waterList).toBeUndefined()
  })

  it('位置選び中に一覧を開いたまま地図の空き地を選ぶと情報提供を開く', async () => {
    render(<NearbyWaterLayer />)
    find()
    await screen.findByRole('button', { name: ja.water.openList })
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    openList()
    const container = (m.map.getContainer as () => HTMLElement)()
    const emptyMapArea = document.createElement('div')
    container.appendChild(emptyMapArea)
    const originalEvent = new MouseEvent('click')
    Object.defineProperty(originalEvent, 'target', { value: emptyMapArea })

    act(() => m.events.click!({ latlng: { lat: 39.72, lng: 140.11 }, originalEvent }))

    expect(screen.getByRole('dialog', { name: '水域情報提供' })).toHaveAttribute('data-position', JSON.stringify({ lat: 39.72, lng: 140.11 }))
  })

  it('距離順の一覧を任意に開き、公開記録なし候補を選択して拡大する', async () => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: ja.water.openList })).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: ja.water.listTitle })).not.toBeInTheDocument()
    openList()
    await waitFor(() => expect(screen.getByText(ja.water.noPublicRecords)).toBeInTheDocument())
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem').map(row => within(row).getByRole('button', { name: /池.*地図中心/ }).textContent)).toEqual([
      expect.stringContaining('近い池'), expect.stringContaining('遠い池'),
    ])
    fireEvent.click(screen.getByRole('checkbox', { name: ja.water.onlyNoRecords }))
    expect(screen.queryByText('近い池')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ja.water.chooseNoRecord }))
    expect(screen.getByRole('button', { name: /遠い池.*地図中心/ })).toHaveAttribute('aria-pressed', 'true')
    const fit = m.map.fitBounds as ReturnType<typeof vi.fn>
    const selectedBounds = fit.mock.calls.at(-1)![0] as L.LatLngBounds
    expect(selectedBounds.contains([39.0105, 140.0105])).toBe(true)
    expect(selectedBounds.contains([39, 140])).toBe(false)
  })

  it.each([
    [390, 844, { left: 12, right: 332, top: 374, bottom: 844, width: 320, height: 470 }, 'paddingBottomRight', 1, 470],
    [768, 1000, { left: 12, right: 332, top: 374, bottom: 844, width: 320, height: 470 }, 'paddingTopLeft', 0, 332],
  ] as const)('幅%dでは一覧を避ける余白で選んだ候補へ拡大する', async (width, height, panel, side, index, minimum) => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const container = (m.map.getContainer as () => HTMLElement)()
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) })
    const panelElement = document.querySelector<HTMLElement>('[data-water-panel]')!
    vi.spyOn(panelElement, 'getBoundingClientRect').mockReturnValue({ x: panel.left, y: panel.top, ...panel, toJSON: () => ({}) })
    fireEvent.click(screen.getByRole('button', { name: ja.water.chooseNoRecord }))
    const options = (m.map.fitBounds as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1] as Record<string, [number, number]>
    expect(options[side]![index]).toBeGreaterThanOrEqual(minimum)
  })

  it.each([
    [220, 222],
    [500, 230],
  ] as const)('狭い幅で操作列右端が%dpxなら候補の左余白を%dpxにする', async (controlRight, expectedPadding) => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const container = (m.map.getContainer as () => HTMLElement)()
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 0, left: 10, top: 0, right: 400, bottom: 844, width: 390, height: 844, toJSON: () => ({}) })
    const panelElement = document.querySelector<HTMLElement>('[data-water-panel]')!
    vi.spyOn(panelElement, 'getBoundingClientRect').mockReturnValue({ x: 12, y: 374, left: 12, right: 332, top: 374, bottom: 844, width: 320, height: 470, toJSON: () => ({}) })
    for (const child of Array.from(panelElement.parentElement!.children)) {
      if (child !== panelElement) vi.spyOn(child, 'getBoundingClientRect').mockReturnValue({ x: 12, y: 112, left: 12, right: controlRight, top: 112, bottom: 270, width: controlRight - 12, height: 158, toJSON: () => ({}) })
    }

    fireEvent.click(screen.getByRole('button', { name: ja.water.chooseNoRecord }))

    const options = (m.map.fitBounds as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]
    expect(options).toMatchObject({ paddingTopLeft: [expectedPadding, 24] })
  })

  it('広い幅では一覧の右端だけを使う従来の左余白を保つ', async () => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const container = (m.map.getContainer as () => HTMLElement)()
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 768, bottom: 1000, width: 768, height: 1000, toJSON: () => ({}) })
    const panelElement = document.querySelector<HTMLElement>('[data-water-panel]')!
    vi.spyOn(panelElement, 'getBoundingClientRect').mockReturnValue({ x: 12, y: 374, left: 12, right: 332, top: 374, bottom: 844, width: 320, height: 470, toJSON: () => ({}) })

    fireEvent.click(screen.getByRole('button', { name: ja.water.chooseNoRecord }))

    const options = (m.map.fitBounds as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]
    expect(options).toMatchObject({ paddingTopLeft: [356, 24], paddingBottomRight: [24, 24] })
  })

  it('一覧が無いときの候補選択は従来の24px余白を使う', async () => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    fireEvent.click(screen.getByRole('button', { name: ja.water.closeList }))
    act(() => m.selectFirst?.())
    const options = (m.map.fitBounds as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]
    expect(options).toMatchObject({ paddingTopLeft: [24, 24], paddingBottomRight: [24, 24] })
  })

  it('選んだ岸位置を、地図を動かした後もそのまま計画へ渡して一覧を畳む', async () => {
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const row = await screen.findByText('近い池')
    const item = row.closest('li')!
    fireEvent.click(within(item).getByRole('button', { name: /近い池.*地図中心/ }))
    const getCenter = m.map.getCenter as ReturnType<typeof vi.fn>
    getCenter.mockReturnValue({ lat: 41, lng: 142 })
    fireEvent.click(within(item).getByRole('button', { name: addToPlanName('近い池') }))
    expect(m.addToPlan).toHaveBeenCalledOnce()
    expect(m.addToPlan).toHaveBeenCalledWith({ action: 'addStop', source: 'pin', name: '近い池', lat: 39, lng: 140.001 })
    expect(screen.queryByRole('region', { name: ja.water.listTitle })).not.toBeInTheDocument()
  })

  it('公開記録の不完全取得とcommunity取得失敗を0件扱いせず、OSM表示を維持する', async () => {
    m.publicRead.mockResolvedValue({ points: [], complete: false })
    m.communityRead.mockRejectedValue(new Error('unavailable'))
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(screen.getByText(ja.water.publicReadFailed)).toBeInTheDocument())
    expect(layer.addTo).toHaveBeenCalledOnce()
    expect(screen.queryByText(ja.map.nearbyWater.error)).not.toBeInTheDocument()
    openList()
    expect(screen.getAllByText(ja.water.publicRecordUnknown)).toHaveLength(2)
    expect(screen.getByRole('button', { name: ja.water.chooseNoRecord })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: ja.water.onlyNoRecords }))
    expect(screen.getByText(ja.water.noCandidates)).toBeInTheDocument()
  })

  it('0件や取得エラーでも位置を選んで報告でき、Escapeで位置選択を取消せる', async () => {
    m.fetch.mockResolvedValue(new Response(null, { status: 503 }))
    render(<NearbyWaterLayer />)
    find()
    await screen.findByText(ja.map.nearbyWater.error)
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    expect(screen.getByText(ja.water.pickReportHint)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText(ja.water.pickReportHint)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    act(() => m.events.click!({ latlng: { lat: 39.72, lng: 140.11 }, originalEvent: new MouseEvent('click') }))
    const report = screen.getByRole('dialog', { name: '水域情報提供' })
    expect(JSON.parse(report.dataset.position!)).toEqual({ lat: 39.72, lng: 140.11 })
    expect(m.addToPlan).not.toHaveBeenCalled()
  })

  it('送信せず閉じた位置のカードは一覧中だけ隠し、送信成功後は戻さない', async () => {
    render(<NearbyWaterLayer />)
    find()
    await screen.findByRole('button', { name: ja.water.openList })
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    act(() => m.events.click!({ latlng: { lat: 39.72, lng: 140.11 }, originalEvent: new MouseEvent('click') }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '水域情報提供' })).getByRole('button', { name: '閉じる' }))
    expect(screen.getByText(/選んだ位置:/)).toBeInTheDocument()
    openList()
    expect(screen.queryByText(/選んだ位置:/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ja.water.closeList }))
    expect(screen.getByText(/選んだ位置:/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: ja.water.pickReportConfirm }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '水域情報提供' })).getByRole('button', { name: '送信成功' }))
    expect(screen.queryByText(/選んだ位置:/)).not.toBeInTheDocument()
  })
  it('OSMが0件でもcommunity読込失敗を完全な水域なしと表示しない', async () => {
    m.fetch.mockResolvedValue(Response.json({ features: [], meta: { degraded: false } }))
    m.communityRead.mockRejectedValue(new Error('unavailable'))
    render(<NearbyWaterLayer />)
    find()
    await screen.findByText(ja.water.communityReadFailed)
    expect(screen.queryByText(ja.map.nearbyWater.empty)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: ja.water.reportButton })).toBeEnabled()
  })
  it('公開水域の外接矩形の角にある半径外の点を検索候補へ混ぜない', async () => {
    m.communityRead.mockResolvedValue([
      { id: 'inside', name: '範囲内の池', lat: 39.003, lng: 140.003, created_at: '' },
      { id: 'outside', name: '範囲外の池', lat: 39.014, lng: 140.018, created_at: '' },
    ])
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    await screen.findByText('範囲内の池')
    expect(screen.queryByText('範囲外の池')).not.toBeInTheDocument()
  })

  it('匿名時に選んだ報告位置をログイン後も保ち、地図中心の移動で書き換えない', async () => {
    m.user = null
    const view = render(<NearbyWaterLayer />)
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    act(() => m.events.click!({ latlng: { lat: 39.72, lng: 140.11 }, originalEvent: new MouseEvent('click') }))
    expect(screen.getByRole('dialog', { name: 'ログイン' })).toBeInTheDocument()
    const getCenter = m.map.getCenter as ReturnType<typeof vi.fn>
    getCenter.mockReturnValue({ lat: 42, lng: 144 })
    m.user = { id: 'logged-in' }
    view.rerender(<NearbyWaterLayer />)
    await waitFor(() => expect(screen.getByRole('dialog', { name: '水域情報提供' })).toHaveAttribute('data-user', 'logged-in'))
    expect(JSON.parse(screen.getByRole('dialog', { name: '水域情報提供' }).dataset.position!)).toEqual({ lat: 39.72, lng: 140.11 })
  })

  it('匿名時に選んだ水域をログイン後、一度だけ同じ岸位置で計画へ渡す', async () => {
    const received: { userId: string; request: FieldworkRequest }[] = []
    function LaterFieldworkListener({ userId }: { userId: string | null }) {
      useEffect(() => {
        if (!userId) return
        const receive = (event: Event) => received.push({ userId, request: (event as CustomEvent<FieldworkRequest>).detail })
        window.addEventListener('zaridasu:fieldwork-request', receive)
        return () => window.removeEventListener('zaridasu:fieldwork-request', receive)
      }, [userId])
      return null
    }
    function TestMap() {
      // 実MapView同様、Authでkeyが替わる購読側は水域レイヤーより後ろの兄弟。
      return <><NearbyWaterLayer /><LaterFieldworkListener key={m.user?.id ?? 'signed-out'} userId={m.user?.id ?? null} /></>
    }
    m.user = null
    const view = render(<TestMap />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const item = (await screen.findByText('近い池')).closest('li')!
    fireEvent.click(within(item).getByRole('button', { name: addToPlanName('近い池') }))
    expect(m.addToPlan).not.toHaveBeenCalled()
    const getCenter = m.map.getCenter as ReturnType<typeof vi.fn>
    getCenter.mockReturnValue({ lat: 42, lng: 144 })
    m.user = { id: 'logged-in' }
    view.rerender(<TestMap />)
    await waitFor(() => expect(m.addToPlan).toHaveBeenCalledOnce())
    expect(m.addToPlan).toHaveBeenCalledWith({ action: 'addStop', source: 'pin', name: '近い池', lat: 39, lng: 140.001 })
    expect(received).toEqual([{ userId: 'logged-in', request: { action: 'addStop', source: 'pin', name: '近い池', lat: 39, lng: 140.001 } }])
    view.rerender(<TestMap />)
    expect(m.addToPlan).toHaveBeenCalledOnce()
  })

  it('情報提供フォームを別アカウントへ持ち越さない', () => {
    const view = render(<NearbyWaterLayer />)
    fireEvent.click(screen.getByRole('button', { name: ja.water.reportButton }))
    act(() => m.events.click!({ latlng: { lat: 39.72, lng: 140.11 }, originalEvent: new MouseEvent('click') }))
    expect(screen.getByRole('dialog', { name: '水域情報提供' })).toHaveAttribute('data-user', 'user-one')
    m.user = { id: 'user-two' }
    view.rerender(<NearbyWaterLayer />)
    expect(screen.queryByRole('dialog', { name: '水域情報提供' })).not.toBeInTheDocument()
  })

  it('ログインを取消した依頼は後から別のログインで自動追加しない', async () => {
    m.user = null
    const view = render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(m.publicRead).toHaveBeenCalled())
    openList()
    const item = (await screen.findByText('近い池')).closest('li')!
    fireEvent.click(within(item).getByRole('button', { name: addToPlanName('近い池') }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'ログイン' })).getByRole('button', { name: '閉じる' }))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    m.user = { id: 'later-login' }
    view.rerender(<NearbyWaterLayer />)
    expect(m.addToPlan).not.toHaveBeenCalled()
  })

  it('表示を隠した後にcommunity取得が完了しても、地図へ勝手に再表示しない', async () => {
    let resolveCommunity!: (value: { id: string; name: string; lat: number; lng: number; created_at: string }[]) => void
    m.communityRead.mockReturnValue(new Promise(resolve => { resolveCommunity = resolve }))
    render(<NearbyWaterLayer />)
    find()
    await waitFor(() => expect(screen.getByRole('button', { name: /非表示.*2 件/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /非表示.*2 件/ }))
    await act(async () => resolveCommunity([{ id: 'community', name: '地域の池', lat: 39.002, lng: 140.002, created_at: '2026-10-08' }]))
    await waitFor(() => expect(screen.getByRole('button', { name: /表示.*3 件/ })).toHaveAttribute('aria-pressed', 'false'))
    expect(layer.addTo).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /表示.*3 件/ }))
    expect(layer.addTo).toHaveBeenCalledTimes(2)
    expect(m.fetch).toHaveBeenCalledOnce()
  })
})
