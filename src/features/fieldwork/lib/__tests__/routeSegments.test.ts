import { describe, expect, it } from 'vitest'

import { buildGoogleDirectionsUrl } from '@/lib/maps/routeLinks'

import { buildGoogleRouteSegments, GOOGLE_MAPS_URL_MAX, STOPS_PER_SEGMENT } from '../routeSegments'

// REQ-330 AC-04: 未完了が 6 地点なら Google マップの URL が 2 本（4 地点と 2 地点）。
// どれも 2,048 字以内・経由地は 3 か所以内・座標以外の文字を含まない。

function points(n: number) {
  return Array.from({ length: n }, (_, i) => ({ lat: 39.7 + i * 0.01, lng: 140.1 + i * 0.01 }))
}

const COORD = /^-?\d{1,3}\.\d{6},-?\d{1,3}\.\d{6}$/

/** URL を読み、座標だけでできているかを確かめて、出発地・目的地・経由地を返す。 */
function parse(url: string) {
  const u = new URL(url)
  expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/')
  const keys = [...u.searchParams.keys()]
  expect(keys.every((k) => ['api', 'origin', 'destination', 'travelmode', 'waypoints'].includes(k))).toBe(true)
  expect(u.searchParams.get('api')).toBe('1')
  expect(u.searchParams.get('travelmode')).toBe('driving')
  const origin = u.searchParams.get('origin')
  const destination = u.searchParams.get('destination') ?? ''
  const waypoints = u.searchParams.get('waypoints')?.split('|') ?? []
  for (const c of [origin, destination, ...waypoints].filter((v): v is string => v !== null)) {
    expect(c).toMatch(COORD)
  }
  return { origin, destination, waypoints }
}

describe('buildGoogleRouteSegments (REQ-330)', () => {
  it('6 地点 → 2 本（4 地点と 2 地点）。2 本目は 1 本目の最後の地点から出る', () => {
    const segs = buildGoogleRouteSegments(points(6))
    expect(segs).toHaveLength(2)
    expect(segs[0]!.indexes).toEqual([0, 1, 2, 3])
    expect(segs[0]!.originIndex).toBeNull()
    expect(segs[1]!.indexes).toEqual([4, 5])
    expect(segs[1]!.originIndex).toBe(3)

    const first = parse(segs[0]!.url)
    expect(first.origin).toBeNull()
    expect(first.waypoints).toEqual(['39.700000,140.100000', '39.710000,140.110000', '39.720000,140.120000'])
    expect(first.destination).toBe('39.730000,140.130000')

    const second = parse(segs[1]!.url)
    expect(second.origin).toBe('39.730000,140.130000')
    expect(second.waypoints).toEqual(['39.740000,140.140000'])
    expect(second.destination).toBe('39.750000,140.150000')
  })

  it('どの URL も 2,048 字以内・経由地 3 か所以内（100 地点でも）', () => {
    const segs = buildGoogleRouteSegments(points(100))
    expect(segs).toHaveLength(25)
    for (const s of segs) {
      expect(s.url.length).toBeLessThanOrEqual(GOOGLE_MAPS_URL_MAX)
      expect(parse(s.url).waypoints.length).toBeLessThanOrEqual(STOPS_PER_SEGMENT - 1)
    }
  })

  it('経由地は %7C 区切りで、座標以外（地点名など）は URL に載らない', () => {
    const named = points(3).map((p, i) => ({ ...p, name: `〇〇沼のメダカ${i}` }))
    const [seg] = buildGoogleRouteSegments(named)
    expect(seg!.url).toContain('%7C')
    expect(seg!.url).not.toMatch(/%E3|name|メダカ/)
    expect(seg!.url).toMatch(/^[A-Za-z0-9:/?=&.%_-]+$/)
  })

  it('1 地点なら目的地だけ。座標の桁は既存の経路ボタン（routeLinks）と同じ', () => {
    const [seg] = buildGoogleRouteSegments([{ lat: 39.123456789, lng: 140.987654321 }])
    expect(seg!.url).toBe(buildGoogleDirectionsUrl(39.123456789, 140.987654321))
  })

  it('5 地点なら 2 本目は経由地なし（目的地だけ）', () => {
    const segs = buildGoogleRouteSegments(points(5))
    expect(segs).toHaveLength(2)
    expect(parse(segs[1]!.url).waypoints).toEqual([])
  })

  it('空なら 0 本。不正な座標は飛ばし、残りの位置（indexes）は元の配列のまま', () => {
    expect(buildGoogleRouteSegments([])).toEqual([])
    const segs = buildGoogleRouteSegments([{ lat: Number.NaN, lng: 140 }, ...points(2)])
    expect(segs).toHaveLength(1)
    expect(segs[0]!.indexes).toEqual([1, 2])
  })
})
