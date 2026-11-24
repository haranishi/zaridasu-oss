import { describe, expect, it } from 'vitest'

import { distanceM } from '../positionRule'
import { boxAround, isNearAny, RARE_PROTECT_RADIUS_M } from '../rareProximity'

// REQ-330 点検 B1: 希少種の保護は場所（300 m）で決める。DB は緯度経度の範囲で絞り、距離は端末で測り直す。

describe('rareProximity', () => {
  it('保護の距離は位置の規則と同じ 300 m', () => {
    expect(RARE_PROTECT_RADIUS_M).toBe(300)
  })

  it('範囲は点の周りを 300 m 以上広げ、範囲の端の点を取りこぼさない', () => {
    const p = { lat: 39.72, lng: 140.1 }
    const box = boxAround([p])!
    const north = { lat: box.maxLat, lng: p.lng }
    const east = { lat: p.lat, lng: box.maxLng }
    expect(distanceM(p, north)).toBeGreaterThanOrEqual(299)
    expect(distanceM(p, east)).toBeGreaterThanOrEqual(299)
    expect(box.minLat).toBeLessThan(p.lat)
    expect(box.minLng).toBeLessThan(p.lng)
  })

  it('複数の点は全部を含む範囲にする。座標の無い点は無視し、1 つも無ければ null', () => {
    const box = boxAround([
      { lat: 39.7, lng: 140.1 },
      { lat: 39.8, lng: 140.2 },
    ])!
    expect(box.minLat).toBeLessThan(39.7)
    expect(box.maxLat).toBeGreaterThan(39.8)
    expect(box.maxLng).toBeGreaterThan(140.2)
    expect(boxAround([])).toBeNull()
    expect(boxAround([{ lat: Number.NaN, lng: 140 }])).toBeNull()
  })

  it('300 m 以内なら近い・それより遠ければ近くない（文字列の座標も数として測る）', () => {
    const p = { lat: 39.72, lng: 140.1 }
    expect(isNearAny(p, [{ lat: 39.7225, lng: 140.1 }])).toBe(true) // 約 278 m
    expect(isNearAny(p, [{ lat: 39.7230, lng: 140.1 }])).toBe(false) // 約 334 m
    expect(isNearAny(p, [{ lat: '39.7201' as unknown as number, lng: '140.1' as unknown as number }])).toBe(true)
    expect(isNearAny(p, [])).toBe(false)
  })
})
