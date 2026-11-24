import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLLOW } from '@/lib/maps/locationFollow'
import { useLocationWatch } from '../useLocationWatch'

type Ok = (position: GeolocationPosition) => void
type Ng = (error: GeolocationPositionError) => void

const watches: { ok: Ok; ng: Ng; options: PositionOptions | undefined; id: number }[] = []
const watchPosition = vi.fn((ok: Ok, ng: Ng, options?: PositionOptions) => {
  const id = watches.length + 1
  watches.push({ ok, ng, options, id })
  return id
})
const clearWatch = vi.fn()

const position = (latitude: number, longitude: number, accuracy = 10) =>
  ({ coords: { latitude, longitude, accuracy } }) as GeolocationPosition
const failure = (code: number) => ({ code }) as GeolocationPositionError

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

function setup(enabled = true) {
  const onFix = vi.fn()
  const onError = vi.fn()
  const view = renderHook((props: { enabled: boolean; onFix: typeof onFix; onError: typeof onError }) => useLocationWatch(props), {
    initialProps: { enabled, onFix, onError },
  })
  return { onFix, onError, view }
}

beforeEach(() => {
  watches.length = 0
  watchPosition.mockClear()
  clearWatch.mockClear()
  Object.defineProperty(navigator, 'geolocation', { value: { watchPosition, clearWatch }, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('useLocationWatch', () => {
  it('有効にするまで位置を取らない（許可を求めない）', () => {
    setup(false)
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('有効にすると、車の追従に必要な設定で 1 回だけ取得を始める', () => {
    setup()
    expect(watchPosition).toHaveBeenCalledTimes(1)
    expect(watches[0]!.options).toEqual(FOLLOW.geolocation)
  })

  it('届いた位置を Fix にして渡す。座標が数でない位置は捨てる', () => {
    const { onFix } = setup()
    act(() => { watches[0]!.ok(position(39.72, 140.1, 12)) })
    expect(onFix).toHaveBeenCalledWith({ lat: 39.72, lng: 140.1, accuracy: 12 })
    act(() => { watches[0]!.ok(position(Number.NaN, 140.1)) })
    expect(onFix).toHaveBeenCalledTimes(1)
  })

  it('エラーのコードを分類して渡す', () => {
    const { onError } = setup()
    act(() => { for (const code of [1, 2, 3]) watches[0]!.ng(failure(code)) })
    expect(onError.mock.calls.map(([kind]) => kind)).toEqual(['denied', 'unavailable', 'timeout'])
  })

  it('無効にすると取得を止める', () => {
    const { view, onFix, onError } = setup()
    view.rerender({ enabled: false, onFix, onError })
    expect(clearWatch).toHaveBeenCalledWith(1)
  })

  it('画面から外れる（アンマウント）と取得を止める', () => {
    const { view } = setup()
    view.unmount()
    expect(clearWatch).toHaveBeenCalledWith(1)
  })

  it('ページが隠れたら止め、見える状態に戻ったら取り直す', () => {
    setup()
    setVisibility('hidden')
    expect(clearWatch).toHaveBeenCalledTimes(1)
    expect(watchPosition).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    expect(watchPosition).toHaveBeenCalledTimes(2)
    expect(watches[1]!.options).toEqual(FOLLOW.geolocation)
  })

  it('隠れている間にアンマウントしても、二重に止めない', () => {
    const { view } = setup()
    setVisibility('hidden')
    view.unmount()
    expect(clearWatch).toHaveBeenCalledTimes(1)
  })

  it('見えているときに visibilitychange が続けて来ても、取得を重ねない', () => {
    setup()
    setVisibility('visible')
    setVisibility('visible')
    expect(watchPosition).toHaveBeenCalledTimes(1)
  })

  it('コールバックが変わっても取り直さず、最新のものを呼ぶ', () => {
    const { view, onFix } = setup()
    const next = vi.fn()
    view.rerender({ enabled: true, onFix: next, onError: vi.fn() })
    expect(watchPosition).toHaveBeenCalledTimes(1)
    act(() => { watches[0]!.ok(position(39.7, 140.1)) })
    expect(next).toHaveBeenCalledTimes(1)
    expect(onFix).not.toHaveBeenCalled()
  })

  it('位置情報APIが無い環境でも落ちず、取得も始めない', () => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
    expect(() => setup()).not.toThrow()
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('停止後に届いたコールバックは渡さない', () => {
    const { view, onFix, onError } = setup()
    const stale = watches[0]!
    view.rerender({ enabled: false, onFix, onError })
    act(() => { stale.ok(position(39.7, 140.1)); stale.ng(failure(3)) })
    expect(onFix).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
