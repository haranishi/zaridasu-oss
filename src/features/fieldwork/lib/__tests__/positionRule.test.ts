import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  decidePosition,
  distanceM,
  freePosition,
  getCurrentFix,
  POSITION_RULE,
  postLocationSource,
} from '../positionRule'

// REQ-330 §3 位置の規則: 現在地を最大 8 秒。誤差 100 m 以内かつ地点から 300 m 以内なら gps、
// それ以外は地点の座標（map）。

const stop = { lat: 39.72, lng: 140.1 }
/** 北へ m メートル動かした点（緯度 1 度 ≒ 111.2 km）。 */
const north = (m: number) => ({ lat: stop.lat + m / 111_195, lng: stop.lng })

describe('distanceM', () => {
  it('緯度 0.001 度は約 111 m', () => {
    expect(distanceM(stop, { lat: stop.lat + 0.001, lng: stop.lng })).toBeGreaterThan(110)
    expect(distanceM(stop, { lat: stop.lat + 0.001, lng: stop.lng })).toBeLessThan(112)
  })
})

describe('decidePosition', () => {
  it('誤差 100 m 以内・地点から 300 m 以内なら現在地（gps・誤差は整数）', () => {
    const p = decidePosition(stop, { ...north(120), accuracy: 12.6 })
    expect(p).toMatchObject({ source: 'gps', accuracy: 13 })
    expect(p.lat).toBeCloseTo(north(120).lat, 8)
  })

  it('境目: 誤差ちょうど 100 m・距離 299 m は現在地、距離 301 m は地点の座標', () => {
    expect(decidePosition(stop, { ...north(299), accuracy: POSITION_RULE.maxAccuracyM }).source).toBe('gps')
    expect(decidePosition(stop, { ...north(301), accuracy: 10 })).toMatchObject({ source: 'map', reason: 'far', lat: stop.lat, lng: stop.lng, accuracy: null })
  })

  it('誤差が 100 m を超える・誤差が分からないときは地点の座標', () => {
    expect(decidePosition(stop, { ...north(10), accuracy: 101 })).toMatchObject({ source: 'map', reason: 'inaccurate' })
    expect(decidePosition(stop, { ...north(10), accuracy: null })).toMatchObject({ source: 'map', reason: 'inaccurate' })
  })

  it('現在地が取れなければ地点の座標（noFix）', () => {
    expect(decidePosition(stop, null)).toEqual({ source: 'map', lat: stop.lat, lng: stop.lng, accuracy: null, reason: 'noFix', distanceM: null })
  })
})

describe('freePosition / postLocationSource', () => {
  it('計画の外では現在地をそのまま使い、取れなければ null', () => {
    expect(freePosition({ lat: 39, lng: 140, accuracy: 250.4 })).toMatchObject({ source: 'gps', accuracy: 250 })
    expect(freePosition(null)).toBeNull()
  })

  it('投稿の取り方: gps はそのまま、地点の座標は手動（manual）', () => {
    expect(postLocationSource(decidePosition(stop, { ...north(5), accuracy: 5 }))).toBe('gps')
    expect(postLocationSource(decidePosition(stop, null))).toBe('manual')
  })
})

describe('getCurrentFix', () => {
  afterEach(() => vi.useRealTimers())

  it('高精度・8 秒で取りにいき、取れた位置と誤差を返す', async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback, _ng?: PositionErrorCallback, _opts?: PositionOptions) =>
      ok({ coords: { latitude: 39.7, longitude: 140.1, accuracy: 9 } } as GeolocationPosition)
    )
    await expect(getCurrentFix(8000, { getCurrentPosition } as unknown as Geolocation)).resolves.toEqual({ lat: 39.7, lng: 140.1, accuracy: 9 })
    expect(getCurrentPosition.mock.calls[0]![2]).toMatchObject({ enableHighAccuracy: true, timeout: 8000 })
  })

  it('拒否・エラーは null', async () => {
    const geo = { getCurrentPosition: (_ok: PositionCallback, ng: PositionErrorCallback) => ng({ code: 1 } as GeolocationPositionError) }
    await expect(getCurrentFix(8000, geo as unknown as Geolocation)).resolves.toBeNull()
  })

  it('端末が返事をしなくても、8 秒を少し過ぎたら null で打ち切る', async () => {
    vi.useFakeTimers()
    const promise = getCurrentFix(8000, { getCurrentPosition: () => {} } as unknown as Geolocation)
    await vi.advanceTimersByTimeAsync(8600)
    await expect(promise).resolves.toBeNull()
  })

  it('位置情報の無い端末は null', async () => {
    await expect(getCurrentFix(8000, undefined)).resolves.toBeNull()
  })
})
