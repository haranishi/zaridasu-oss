import { act, fireEvent, render, screen } from '@testing-library/react'
import L from 'leaflet'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLLOW, LOCATE_HINT, LOCATE_TOAST_MS } from '@/lib/maps/locationFollow'
import LocateControl from '../LocateControl'

// 地図は本物のLeafletを使う。movestart・zoomstart・moveend の出る順序こそが、この部品の核心だから。
const h = vi.hoisted(() => ({
  map: null as unknown as import('leaflet').Map,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('react-leaflet', () => ({
  useMap: () => h.map,
  Circle: ({ center, radius, interactive }: { center: [number, number]; radius: number; interactive?: boolean }) => (
    <div data-testid="accuracy-circle" data-lat={center[0]} data-lng={center[1]} data-radius={radius} data-interactive={String(interactive)} />
  ),
  CircleMarker: ({ center, radius, pathOptions, interactive, children }: { center: [number, number]; radius?: number; pathOptions?: { weight?: number }; interactive?: boolean; children?: ReactNode }) => (
    // 押せない（interactive: false）CircleMarker は、点の縁取り。点そのものと見分ける
    <div data-testid={interactive === false ? 'dot-halo' : 'dot'} data-lat={center[0]} data-lng={center[1]} data-radius={radius} data-weight={pathOptions?.weight}>{children}</div>
  ),
  Popup: ({ children }: { children?: ReactNode }) => <div data-testid="dot-popup">{children}</div>,
  Pane: ({ name, style, children }: { name: string; style?: { zIndex?: number }; children?: ReactNode }) => (
    <div data-testid="pane" data-pane={name} data-z={style?.zIndex}>{children}</div>
  ),
}))
vi.mock('@/components/features/map/MapActionStack', () => ({
  MapAction: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  MAP_ACTION_ORDER: { locate: 90 },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => h.toast }))

const watches: { ok: (p: GeolocationPosition) => void; ng: (e: GeolocationPositionError) => void }[] = []
const geolocation = {
  watchPosition: vi.fn((ok: (p: GeolocationPosition) => void, ng: (e: GeolocationPositionError) => void, _options?: PositionOptions) => {
    watches.push({ ok, ng })
    return watches.length
  }),
  clearWatch: vi.fn(),
}
const emit = (lat: number, lng: number, accuracy = 20) =>
  act(() => { watches.at(-1)!.ok({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition) })
const fail = (code: number) => act(() => { watches.at(-1)!.ng({ code } as GeolocationPositionError) })

const A: [number, number] = [39.72, 140.1]
const button = () => screen.getByRole('button', { name: 'map.locate' })
const press = () => fireEvent.click(button())
const dot = () => screen.queryByTestId('dot')
// 地図は整数ピクセル単位で動くので、メートルでなく「画面の中心から何ピクセルか」で比べる（2px未満＝中心に付いている）
const pxFromCenter = (lat: number, lng: number) => h.map.latLngToContainerPoint([lat, lng]).distanceTo(h.map.getSize().divideBy(2))

let container: HTMLDivElement

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}
const size = { width: 800, height: 600 }

function mockMotionPreference(reduce: boolean) {
  // 共通の初期設定（vitest.setup.ts）は matchMedia を再定義できない形で作っている。代入で差し替える
  window.matchMedia = vi.fn((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function createMap(zoom: number) {
  container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { configurable: true, get: () => size.width })
  Object.defineProperty(container, 'clientHeight', { configurable: true, get: () => size.height })
  document.body.appendChild(container)
  h.map = L.map(container, { center: [39.7, 140.1], zoom, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false })
}

/** 地図を作り、押して、最初の位置 A まで進める（追従中になる）。 */
function startFollowing(zoom = 10) {
  createMap(zoom)
  render(<LocateControl />)
  press()
  emit(...A)
}

beforeEach(() => {
  watches.length = 0
  size.width = 800
  size.height = 600
  geolocation.watchPosition.mockClear()
  geolocation.clearWatch.mockClear()
  h.toast.error.mockClear()
  h.toast.info.mockClear()
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
  Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
  mockMotionPreference(true) // 既定は動きを減らす＝同期で動く。滑らかな動きは専用の試験で確かめる
})

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  h.map?.remove()
  container?.remove()
})

describe('停止・開始', () => {
  it('開いただけでは位置を取らず、点も出さない。名前は従来のまま', () => {
    createMap(10)
    render(<LocateControl />)
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(button()).toHaveAttribute('title', 'map.locate')
    expect(dot()).toBeNull()
  })

  it('押すと、車の追従に必要な設定で取得を始め、取得中であることを伝える', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(geolocation.watchPosition.mock.calls[0]![2]).toEqual(FOLLOW.geolocation)
    expect(button()).toHaveAttribute('aria-busy', 'true')
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    expect(button()).toHaveAttribute('title', 'map.locateCancel')
    // 取得中は、矢印が脈動する（最初の位置が来ると止まる）
    expect(button().querySelector('svg')).toHaveClass('animate-pulse')
    // 「視覚効果を減らす」では脈動しない。取得中は矢印が輪郭（追従は塗りつぶし）なので、形で区別でき、情報は失われない
    expect(button().querySelector('svg')).toHaveClass('motion-reduce:animate-none')
    emit(...A)
    expect(button().querySelector('svg')).not.toHaveClass('animate-pulse')
  })

  it('取得中と追従は、動きを減らす設定でも見分けられる（取得中は輪郭の矢印、追従は塗りつぶし）', () => {
    createMap(10)
    render(<LocateControl />)
    expect(button().querySelector('svg')).toHaveAttribute('fill', 'none')
    press()
    expect(button()).toHaveAttribute('data-follow-mode', 'locating')
    // 脈動（動き）だけに頼らない。静止画や「視覚効果を減らす」でも、形で追従と区別できる（輪郭の矢印・点線の縁）
    expect(button().querySelector('svg')).toHaveAttribute('fill', 'none')
    // 内側の点線の輪（outline は使えない。Leaflet が、地図の中の mousedown のたびに outline を消すため、押した直後に見えなくなる）
    expect(screen.getByTestId('locate-searching-ring')).toBeInTheDocument()
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(button().querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    expect(screen.queryByTestId('locate-searching-ring')).toBeNull()
  })

  it('最初の位置で、地図をそこへ寄せてズーム14にし、点と精度の円を置く', () => {
    startFollowing(10)
    expect(pxFromCenter(...A)).toBeLessThan(2)
    expect(h.map.getZoom()).toBe(14)
    expect(dot()).toHaveAttribute('data-lat', String(A[0]))
    expect(screen.getByTestId('accuracy-circle')).toHaveAttribute('data-radius', '20')
    expect(button()).toHaveAttribute('aria-busy', 'false')
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('点は、投稿のまとまり（約34px）の隣でも埋もれない大きさと、白い縁を持つ', () => {
    startFollowing(10)
    // 評価者3人が「小さく、まとまりに埋もれる」と指摘した（半径8・縁2px→半径9・縁3px）
    expect(Number(dot()!.getAttribute('data-radius'))).toBeGreaterThanOrEqual(9)
    expect(Number(dot()!.getAttribute('data-weight'))).toBeGreaterThanOrEqual(3)
  })

  it('点の下に、押せない暗い半透明の縁取りを置く（白い縁が明るい地図で溶けず、赤いまとまりに乗っても別の物と分かる）', () => {
    startFollowing(10)
    const halo = screen.getByTestId('dot-halo')
    expect(Number(halo.getAttribute('data-radius'))).toBeGreaterThan(Number(dot()!.getAttribute('data-radius')) + Number(dot()!.getAttribute('data-weight')) / 2)
    // 点と同じ位置で、同じ層（点より上のマーカーでなく、点と一緒に動く）。点より前に描かれる＝点の下になる
    expect(halo).toHaveAttribute('data-lat', String(A[0]))
    expect(halo.parentElement).toBe(dot()!.parentElement)
    expect(halo.compareDocumentPosition(dot()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('すでに拡大しているときは、ズームを下げない', () => {
    startFollowing(17)
    expect(h.map.getZoom()).toBe(17)
    expect(pxFromCenter(...A)).toBeLessThan(2)
  })

  it('吹き出しに「現在地（誤差 約Nm）」を出す', () => {
    startFollowing()
    expect(screen.getByTestId('dot-popup')).toHaveTextContent('map.currentLocationAccuracy:{"meters":20}')
  })

  it('青い点は、投稿のマーカーやまとまり（層の高さ600）より上に描く。近くの記録の下に隠れない。精度の円は下の層のまま', () => {
    startFollowing()
    const pane = dot()!.closest('[data-testid="pane"]')!
    expect(pane).toBeTruthy()
    const z = Number(pane.getAttribute('data-z'))
    expect(z).toBeGreaterThan(600) // markerPane（投稿のマーカー・まとまり）
    expect(z).toBeLessThan(650) // tooltipPane・popupPane（700）の下
    expect(screen.getByTestId('accuracy-circle').closest('[data-testid="pane"]')).toBeNull()
  })

  it('精度の円は押せない（地図のクリック・長押し・ピン立てを妨げない）', () => {
    startFollowing()
    expect(screen.getByTestId('accuracy-circle')).toHaveAttribute('data-interactive', 'false')
  })

  it('秋田県の外でも、点を出して追従する', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    emit(35.68, 139.76)
    expect(dot()).toHaveAttribute('data-lat', '35.68')
    expect(pxFromCenter(35.68, 139.76)).toBeLessThan(2)
  })

  it('追従中に押すと、取得を止めて点と円を消す', () => {
    startFollowing()
    press()
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1)
    expect(dot()).toBeNull()
    expect(screen.queryByTestId('accuracy-circle')).toBeNull()
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(button()).toHaveAttribute('title', 'map.locate')
  })

  it('取得中に押すと、取りやめる', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    press()
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('追従', () => {
  it('位置が動くたびに、点を動かし、地図の中心を現在地に保つ（ズームは変えない）', () => {
    startFollowing()
    emit(39.73, 140.11)
    expect(dot()).toHaveAttribute('data-lat', '39.73')
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
    expect(h.map.getZoom()).toBe(14)
    // 自分で地図を動かしたのを、利用者が動かしたと取り違えて一時停止にしない
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    emit(39.74, 140.12)
    expect(pxFromCenter(39.74, 140.12)).toBeLessThan(2)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('中心から8px未満の動きでは、地図を動かさない（点は動かす）', () => {
    startFollowing()
    const panTo = vi.spyOn(h.map, 'panTo')
    const center = h.map.getSize().divideBy(2)
    const near = h.map.containerPointToLatLng(center.add([0, FOLLOW.deadZonePx - 3]))
    emit(near.lat, near.lng)
    expect(dot()).toHaveAttribute('data-lat', String(near.lat))
    expect(panTo).not.toHaveBeenCalled()
    const far = h.map.containerPointToLatLng(center.add([0, FOLLOW.deadZonePx + 3]))
    emit(far.lat, far.lng)
    expect(panTo).toHaveBeenCalledTimes(1)
  })

  it('「視覚効果を減らす」では滑らせず、そうでなければ1秒かけて滑らせる', () => {
    startFollowing()
    const panTo = vi.spyOn(h.map, 'panTo')
    emit(39.73, 140.11)
    expect(panTo.mock.calls[0]![1]).toMatchObject({ animate: false })
    mockMotionPreference(false)
    emit(39.74, 140.12)
    expect(panTo.mock.calls[1]![1]).toMatchObject({ animate: true, duration: FOLLOW.panSeconds, easeLinearity: 1 })
  })

  it('現在地が画面1つ分より遠いときは、滑らせずに一気に動かす（大きく滑らせるとタイルが崩れる）', () => {
    startFollowing()
    mockMotionPreference(false)
    const panTo = vi.spyOn(h.map, 'panTo')
    emit(40.2, 140.1) // 約50km北
    expect(panTo.mock.calls[0]![1]).toMatchObject({ animate: false })
    expect(pxFromCenter(40.2, 140.1)).toBeLessThan(2)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('ズームしても追従は止まらず、そのズームのまま付いてくる', () => {
    startFollowing()
    act(() => { h.map.setZoom(16, { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    emit(39.73, 140.11)
    expect(h.map.getZoom()).toBe(16)
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
  })

  it('位置が届いても、親（地図）は再描画されない。再描画されるのはこの部品だけ', () => {
    createMap(10)
    let parentRenders = 0
    function Parent() {
      parentRenders += 1
      return <LocateControl />
    }
    render(<Parent />)
    press()
    emit(...A)
    emit(39.73, 140.11)
    emit(39.74, 140.12)
    expect(parentRenders).toBe(1)
    expect(pxFromCenter(39.74, 140.12)).toBeLessThan(2)
  })

  it('画面サイズが変わっても（MapResizer の invalidateSize）追従は止まらない', () => {
    startFollowing()
    size.width = 500
    act(() => { h.map.invalidateSize() })
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('滑らかに動いている最中の移動も、動きが終わったあとの利用者の操作も、取り違えない', async () => {
    mockMotionPreference(false)
    startFollowing()
    emit(39.73, 140.11) // 1秒かけて滑らせる
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, FOLLOW.panSeconds * 1000 + 300)) })
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })
})

describe('追従：動きの重なりと、ズームの最中', () => {
  const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })

  it('滑らかに動いている最中に次の位置が届いても、一時停止にならず、付いてくる（前の動きを止めるときの moveend で印が先に消える不具合）', async () => {
    mockMotionPreference(false)
    startFollowing()
    emit(39.73, 140.11) // 1秒かけて滑らせ始める
    await wait(300)
    emit(39.74, 140.12) // 動きの最中に次の位置（前の動きを止めて、新しい動きを始める）
    await wait(300)
    emit(39.75, 140.13)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    await wait(FOLLOW.panSeconds * 1000 + 300)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(pxFromCenter(39.75, 140.13)).toBeLessThan(2)
  })

  it('自分で地図を寄せるとき、movestart を出さない（利用者の操作と区別するため）', () => {
    startFollowing()
    const started = vi.fn()
    h.map.on('movestart', started)
    emit(39.73, 140.11)
    expect(started).not.toHaveBeenCalled()
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
  })

  it('利用者のズームの最中に最初の位置が届いたら、ズームが終わってから現在地へ寄せる（Leafletはズーム中の移動を受け付けない）', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { h.map.fire('zoomstart') })
    emit(...A)
    expect(h.map.getZoom()).toBe(10) // まだ寄せていない（寄せると 14 になる）
    expect(dot()).toHaveAttribute('data-lat', String(A[0])) // 点は置く
    act(() => { h.map.fire('zoomend') })
    expect(pxFromCenter(...A)).toBeLessThan(2)
    expect(h.map.getZoom()).toBe(14)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('ズームの開始だけ届いて終わりが来なくても（途中で止められた移動）、次の移動の終わりで元に戻る', () => {
    startFollowing()
    act(() => { h.map.fire('zoomstart') })
    act(() => { h.map.fire('moveend') })
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })
})

// 体験評価で見つかった不具合：位置を待つ間に地図を動かしても、最初の位置が届いた瞬間に引き戻されていた
describe('取得中に地図を動かしたとき', () => {
  it('位置が届いても地図を引き戻さず、一時停止にして点だけ出す。押すと現在地へ寄せて追従する', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'locating')
    const center = h.map.getCenter()
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(h.map.getCenter().equals(center)).toBe(true)
    expect(h.map.getZoom()).toBe(10)
    expect(dot()).toHaveAttribute('data-lat', String(A[0]))
    // 再開は「最初の寄せ」。広い縮尺のままでは点が小さすぎるので、ズーム14にする
    press()
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(pxFromCenter(...A)).toBeLessThan(2)
    expect(h.map.getZoom()).toBe(14)
  })

  it('ドラッグ（dragstart）でも同じ', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { h.map.fire('dragstart') })
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })

  it('ズームだけなら、動かしたことにならない。最初の位置で追従になる', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { h.map.setZoom(11, { animate: false }) })
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(pxFromCenter(...A)).toBeLessThan(2)
    expect(h.map.getZoom()).toBe(14)
  })

  it('動かしたあとで取りやめて押し直したら、次は最初の位置で追従になる', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    press() // 取りやめ
    press() // もう一度
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(pxFromCenter(...A)).toBeLessThan(2)
  })
})

describe('一時停止と再開', () => {
  it('一時停止は、停止の矢印と別の形（現在地に戻る十字）になり、枠が太い。再開すると矢印に戻る', () => {
    startFollowing()
    expect(button().querySelector('svg')).not.toHaveClass('lucide-locate-fixed')
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(button().querySelector('svg')).toHaveClass('lucide-locate-fixed')
    expect(button().className).toContain('ring-[3px]')
    press()
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(button().querySelector('svg')).not.toHaveClass('lucide-locate-fixed')
  })

  it('利用者が地図を動かしたら追従だけを止め、点は動かし続ける', () => {
    startFollowing()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(button()).toHaveAttribute('title', 'map.locateResume')
    const before = h.map.getCenter()
    emit(39.73, 140.11)
    expect(dot()).toHaveAttribute('data-lat', '39.73')
    expect(h.map.getCenter().equals(before)).toBe(true)
  })

  it('矢印キーで地図を動かしたら、追従だけを止める（キーボード操作）', async () => {
    startFollowing()
    // Leaflet のキーボード操作は、地図にフォーカスがあるときだけ効く
    act(() => { h.map.getContainer().focus() })
    act(() => { fireEvent.keyDown(document, { keyCode: 39 }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)) }) // 矢印キーの動き（0.25秒）が終わるまで待つ
  })

  it('ページが隠れたら取得を止め、見える状態に戻ったら取り直す。追従・一時停止の状態は保つ', () => {
    startFollowing()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    setVisibility('hidden')
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    setVisibility('visible')
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    emit(39.73, 140.11) // 取り直した監視からの位置も、追従に反映される
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
    // 一時停止も保つ
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    setVisibility('hidden')
    setVisibility('visible')
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })

  it('ほかの部品が地図を動かしたときも、追従を止める（見ている場所へ戻さない）', () => {
    startFollowing()
    act(() => { h.map.setView([40.2, 140.5], 12, { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })

  it('ズームしながら中心が大きくずれたとき（遠くをダブルタップで拡大など）は、別の場所を見に行ったとみなして止める', () => {
    startFollowing()
    act(() => { h.map.setZoomAround(L.point(700, 300), 15, { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })

  it('ズームの最中に始まったドラッグも、取りこぼさず止める', () => {
    startFollowing()
    // 実際の順序: ズームの開始 → 移動の開始（ズーム中なので、その場では判定しない）→ ドラッグの開始
    act(() => { h.map.fire('zoomstart'); h.map.fire('movestart'); h.map.fire('dragstart') })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
  })

  it('中心の近くで拡大しても（ピンチやボタン）、追従は止まらない', () => {
    startFollowing()
    act(() => { h.map.setZoomAround(L.point(410, 300), 15, { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
  })

  it('押すと、現在地へ寄せて追従を再開する', () => {
    startFollowing()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    emit(39.73, 140.11)
    press()
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    expect(pxFromCenter(39.73, 140.11)).toBeLessThan(2)
    // 再開後は、また付いてくる
    emit(39.74, 140.12)
    expect(pxFromCenter(39.74, 140.12)).toBeLessThan(2)
  })

  it('再開は取得をやり直さない（監視は 1 本のまま）', () => {
    startFollowing()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    press()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(geolocation.clearWatch).not.toHaveBeenCalled()
  })
})

// 体験評価・視覚評価の4人全員が指摘：位置を待つ間（GPSが遅い端末）、ボタンの明滅だけでは何が起きているか分からない。
// 第2周では、追従中の止め方が画面から分からないという指摘が続いた
describe('状態の説明（札）', () => {
  const hintBox = () => screen.getByRole('status')
  /** 追従・一時停止の「最初の1回の札」を、出し終わるまで進める */
  const finishHint = () => act(() => { vi.advanceTimersByTime(LOCATE_HINT.shownMs) })

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('読み上げに使える領域として、何も出ていないときも残してある', () => {
    createMap(10)
    render(<LocateControl />)
    expect(hintBox()).toHaveAttribute('aria-live', 'polite')
    expect(hintBox()).toHaveTextContent('')
  })

  it('札は、文ごとの改行（翻訳の \\n）を生かして出す。語の途中で折れないようにするため', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.verySlowMs) })
    expect(hintBox().className).toContain('whitespace-pre-line')
  })

  it('取得中は、3秒たっても位置が来ないときに「取得しています」を出し、10秒たつと「時間がかかっています」に変える', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.slowMs - 1) })
    expect(hintBox()).toHaveTextContent('')
    act(() => { vi.advanceTimersByTime(1) })
    expect(hintBox()).toHaveTextContent('map.locateHint.locating')
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.verySlowMs - LOCATE_HINT.slowMs) })
    expect(hintBox()).toHaveTextContent('map.locateHint.locatingSlow')
  })

  it('位置が3秒以内に届けば、取得中の札は一度も出ない（出るのは追従の札）', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.slowMs - 1) })
    expect(hintBox()).toHaveTextContent('')
    emit(...A)
    expect(hintBox()).not.toHaveTextContent('map.locateHint.locating')
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
  })

  it('位置が届いたら、出ていた取得中の札は消え、追従の札に変わる', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.slowMs) })
    expect(hintBox()).toHaveTextContent('map.locateHint.locating')
    emit(...A)
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
  })

  it('取りやめたら札は消え、押し直したら0秒から数え直す', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.verySlowMs) })
    expect(hintBox()).toHaveTextContent('map.locateHint.locatingSlow')
    press() // 取りやめ
    expect(hintBox()).toHaveTextContent('')
    press() // もう一度
    expect(hintBox()).toHaveTextContent('')
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.slowMs) })
    expect(hintBox()).toHaveTextContent('map.locateHint.locating')
  })

  it('追従を始めた最初の1回だけ、止め方（もう一度押す）の札を出し、数秒で消す。次に追従になっても出さない', () => {
    startFollowing()
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
    act(() => { vi.advanceTimersByTime(LOCATE_HINT.shownMs - 1) })
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
    act(() => { vi.advanceTimersByTime(1) })
    expect(hintBox()).toHaveTextContent('')
    // 止めて、もう一度始めても、出さない
    press() // 停止
    press() // 取得中
    emit(...A)
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(hintBox()).toHaveTextContent('')
  })

  it('追従の札は、出し終える前に一時停止になったら消え、再開したらもう一度出る（まだ読み終えていないので）', () => {
    startFollowing()
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(hintBox()).not.toHaveTextContent('map.locateHint.following')
    press() // 再開
    expect(hintBox()).toHaveTextContent('map.locateHint.following')
  })

  it('一時停止になったら、最初の1回だけ戻り方の札を出し、数秒で消す。次に止まっても出さない', () => {
    startFollowing()
    finishHint()
    expect(hintBox()).toHaveTextContent('')
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(hintBox()).toHaveTextContent('map.locateHint.paused')
    finishHint()
    expect(hintBox()).toHaveTextContent('')
    press() // 戻る
    act(() => { h.map.panBy([-120, 0], { animate: false }) })
    expect(button()).toHaveAttribute('data-follow-mode', 'paused')
    expect(hintBox()).toHaveTextContent('')
  })

  it('一時停止の札は、再開したら（数秒たたなくても）消える', () => {
    startFollowing()
    finishHint()
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    expect(hintBox()).toHaveTextContent('map.locateHint.paused')
    press()
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(hintBox()).toHaveTextContent('')
  })
})

describe('エラー', () => {
  it('許可されていないときは、取得を止めて通知する', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    fail(1)
    expect(h.toast.error).toHaveBeenCalledWith('map.locateError.denied', LOCATE_TOAST_MS.error)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(geolocation.clearWatch).toHaveBeenCalledTimes(1)
  })

  it('最初の位置が取れないときは、止めて通知する', () => {
    createMap(10)
    render(<LocateControl />)
    press()
    fail(3)
    expect(h.toast.error).toHaveBeenCalledWith('map.locateError.timeout', LOCATE_TOAST_MS.error)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
  })

  it('追従中の一時的な失敗は、通知せず待ち、最後の位置を残す', () => {
    startFollowing()
    fail(3)
    fail(2)
    expect(h.toast.error).not.toHaveBeenCalled()
    expect(button()).toHaveAttribute('data-follow-mode', 'following')
    expect(dot()).toHaveAttribute('data-lat', String(A[0]))
  })

  // 体験評価で見つかった不具合：拒否のあと押し直すと、同じ通知が押した回数だけ積み重なり、画面の上半分を覆った
  it('同じ失敗が通知の出ている間に続いても、通知は重ねない', () => {
    createMap(10)
    render(<LocateControl />)
    press(); fail(1)
    press(); fail(1)
    press(); fail(1)
    expect(h.toast.error).toHaveBeenCalledTimes(1)
  })

  it('通知が消えるころに押し直したら、もう一度通知する', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      createMap(10)
      render(<LocateControl />)
      press(); fail(1)
      vi.advanceTimersByTime(LOCATE_TOAST_MS.error - 1)
      press(); fail(1)
      expect(h.toast.error).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      press(); fail(1)
      expect(h.toast.error).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('種類が違う失敗は、続けて通知する', () => {
    createMap(10)
    render(<LocateControl />)
    press(); fail(1)
    press(); fail(3)
    expect(h.toast.error).toHaveBeenNthCalledWith(1, 'map.locateError.denied', LOCATE_TOAST_MS.error)
    expect(h.toast.error).toHaveBeenNthCalledWith(2, 'map.locateError.timeout', LOCATE_TOAST_MS.error)
  })

  it('位置情報に対応していない端末では、通知して何も始めない', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    createMap(10)
    render(<LocateControl />)
    press()
    expect(h.toast.error).toHaveBeenCalledWith('map.locateError.unsupported', LOCATE_TOAST_MS.error)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(geolocation.watchPosition).not.toHaveBeenCalled()
  })
})

describe('「現在の地図範囲内のみ」との組み合わせ（地図の範囲がサーバーに届いて、移動の軌跡になるのを防ぐ）', () => {
  const setup = (boundsFilterEnabled: boolean) => {
    const onBoundsFilterOff = vi.fn()
    createMap(10)
    const view = render(<LocateControl boundsFilterEnabled={boundsFilterEnabled} onBoundsFilterOff={onBoundsFilterOff} />)
    return { onBoundsFilterOff, view }
  }

  it('オンのまま追従を始めたら、オフにして知らせる', () => {
    const { onBoundsFilterOff } = setup(true)
    expect(onBoundsFilterOff).not.toHaveBeenCalled()
    press()
    expect(onBoundsFilterOff).toHaveBeenCalledTimes(1)
    expect(h.toast.info).toHaveBeenCalledWith('map.locateFilterOff', LOCATE_TOAST_MS.filterOff)
  })

  it('追従中にオンにされたら、またオフにする', () => {
    const { onBoundsFilterOff, view } = setup(false)
    press()
    emit(...A)
    expect(onBoundsFilterOff).not.toHaveBeenCalled()
    view.rerender(<LocateControl boundsFilterEnabled onBoundsFilterOff={onBoundsFilterOff} />)
    expect(onBoundsFilterOff).toHaveBeenCalledTimes(1)
    // 自動でオフにしたときの文（「オフにしました。…」）ではなく、使えない理由と使える場面を伝える
    expect(h.toast.info).toHaveBeenCalledWith('map.locateFilterBusy', LOCATE_TOAST_MS.filterOff)
    expect(h.toast.info).not.toHaveBeenCalledWith('map.locateFilterOff', expect.anything())
  })

  it('一時停止から押して追従に戻ったとき、オンのままなら、自動でオフにした文を出す', () => {
    const { onBoundsFilterOff, view } = setup(false)
    press()
    emit(...A)
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    view.rerender(<LocateControl boundsFilterEnabled onBoundsFilterOff={onBoundsFilterOff} />)
    expect(onBoundsFilterOff).not.toHaveBeenCalled()
    press() // 再開
    expect(onBoundsFilterOff).toHaveBeenCalledTimes(1)
    expect(h.toast.info).toHaveBeenCalledWith('map.locateFilterOff', LOCATE_TOAST_MS.filterOff)
  })

  it('一時停止中は、利用者が見る場所を選んでいるので、オンにしてよい', () => {
    const { onBoundsFilterOff, view } = setup(false)
    press()
    emit(...A)
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    view.rerender(<LocateControl boundsFilterEnabled onBoundsFilterOff={onBoundsFilterOff} />)
    expect(onBoundsFilterOff).not.toHaveBeenCalled()
  })

  it('追従を始めても、もともとオフなら何もしない。停止中にオンにしても何もしない', () => {
    const { onBoundsFilterOff, view } = setup(false)
    press()
    emit(...A)
    press()
    view.rerender(<LocateControl boundsFilterEnabled onBoundsFilterOff={onBoundsFilterOff} />)
    expect(onBoundsFilterOff).not.toHaveBeenCalled()
    expect(h.toast.info).not.toHaveBeenCalled()
  })

  it('オフにする手段が渡されていないときは、知らせもしない（嘘の通知を出さない）', () => {
    createMap(10)
    render(<LocateControl boundsFilterEnabled />)
    press()
    expect(h.toast.info).not.toHaveBeenCalled()
  })
})

describe('画面を点けたままにする', () => {
  it('取得中から停止までのあいだ持ち、止めたら解放する', async () => {
    const sentinel = { released: false, release: vi.fn(async () => {}) }
    const request = vi.fn(async () => sentinel)
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    createMap(10)
    render(<LocateControl />)
    expect(request).not.toHaveBeenCalled()
    press()
    await act(async () => { await Promise.resolve() })
    expect(request).toHaveBeenCalledWith('screen')
    press()
    expect(sentinel.release).toHaveBeenCalledTimes(1)
  })
})

describe('位置の座標を、通信・計測・保存・ログに出さない', () => {
  it('取得から停止までの一通りで、通信・計測・保存・ログに何も書かない', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const cookie = vi.spyOn(document, 'cookie', 'set')
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}))
    const dataLayer: unknown[] = []
    Object.defineProperty(window, 'dataLayer', { value: dataLayer, configurable: true, writable: true })
    const indexedDbOpen = vi.fn()
    vi.stubGlobal('indexedDB', { open: indexedDbOpen })

    startFollowing()
    emit(39.723456, 140.134567)
    act(() => { h.map.panBy([120, 0], { animate: false }) })
    press()
    press()

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(cookie).not.toHaveBeenCalled()
    expect(indexedDbOpen).not.toHaveBeenCalled()
    expect(dataLayer).toEqual([])
    for (const log of logs) expect(log).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})
