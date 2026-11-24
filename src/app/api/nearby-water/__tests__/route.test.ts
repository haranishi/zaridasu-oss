import { describe, it, expect } from 'vitest'
import {
  parseNearbyWaterParams,
  buildOverpassQuery,
  elementsToFeatures,
  MIN_RADIUS_M,
  MAX_RADIUS_M,
  DEFAULT_RADIUS_M,
} from '../route'

const sp = (obj: Record<string, string>) => new URLSearchParams(obj)

describe('parseNearbyWaterParams', () => {
  it('有効な lat/lng/radius をそのまま返す（秋田県内）', () => {
    const r = parseNearbyWaterParams(sp({ lat: '39.7186', lng: '140.1023', radius: '1200' }))
    expect(r).toEqual({ ok: true, params: { lat: 39.7186, lng: 140.1023, radius: 1200 } })
  })

  it('radius > 3000 は MAX_RADIUS_M にクランプ（Overpass 負荷抑制）', () => {
    const r = parseNearbyWaterParams(sp({ lat: '39.7', lng: '140.1', radius: '999999' }))
    expect(r.ok && r.params.radius).toBe(MAX_RADIUS_M)
  })

  it('radius が小さすぎる場合は MIN_RADIUS_M にクランプ', () => {
    const r = parseNearbyWaterParams(sp({ lat: '39.7', lng: '140.1', radius: '5' }))
    expect(r.ok && r.params.radius).toBe(MIN_RADIUS_M)
  })

  it('radius 未指定/不正は DEFAULT_RADIUS_M', () => {
    const missing = parseNearbyWaterParams(sp({ lat: '39.7', lng: '140.1' }))
    expect(missing.ok && missing.params.radius).toBe(DEFAULT_RADIUS_M)
    const nan = parseNearbyWaterParams(sp({ lat: '39.7', lng: '140.1', radius: 'abc' }))
    expect(nan.ok && nan.params.radius).toBe(DEFAULT_RADIUS_M)
  })

  it('lat/lng が非数値なら invalid_params', () => {
    const r = parseNearbyWaterParams(sp({ lat: 'x', lng: '140.1' }))
    expect(r).toEqual({ ok: false, error: 'invalid_params' })
  })

  it('日本 bbox の外（グローバル悪用）は out_of_area で弾く', () => {
    const r = parseNearbyWaterParams(sp({ lat: '0', lng: '0' }))
    expect(r).toEqual({ ok: false, error: 'out_of_area' })
  })
})

describe('buildOverpassQuery', () => {
  it('around・natural=water・timeout を含む', () => {
    const q = buildOverpassQuery({ lat: 39.7, lng: 140.1, radius: 1500 })
    expect(q).toContain('(around:1500,39.7,140.1)')
    expect(q).toContain('"natural"="water"')
    expect(q).toContain('[timeout:')
    expect(q).toContain('out geom')
  })

  it('旧形式のため池と、岸が半径外でも検索中心を含む水域を取得する', () => {
    const q = buildOverpassQuery({ lat: 39.7287, lng: 140.6617, radius: 1500 })
    expect(q).toContain('"landuse"="reservoir"')
    expect(q).toContain('is_in(39.7287,140.6617)->.containing')
    expect(q).toContain('way.containing["natural"="water"]')
    expect(q).toContain('relation(pivot.containing)["natural"="water"]')
    expect(q).toContain('(around:1500,39.7287,140.6617)')
    expect(q).toContain('out geom 200')
  })
})

describe('elementsToFeatures', () => {
  it('閉じた way を Polygon に変換し name 以外のタグを落とす', () => {
    const features = elementsToFeatures([
      {
        type: 'way',
        id: 1,
        geometry: [
          { lat: 39.7, lon: 140.1 },
          { lat: 39.71, lon: 140.1 },
          { lat: 39.71, lon: 140.11 },
          { lat: 39.7, lon: 140.1 },
        ],
        tags: { name: 'テスト池', natural: 'water', foo: 'bar' },
      },
    ])
    expect(features).toHaveLength(1)
    expect(features[0]!.id).toBe('way/1')
    expect(features[0]!.geometry.type).toBe('Polygon')
    // GeoJSON は [lng, lat] 順
    expect(features[0]!.geometry.coordinates[0]![0]).toEqual([140.1, 39.7])
    expect(features[0]!.properties).toEqual({ name: 'テスト池' })
  })

  it('開いた way（頂点不足）はスキップする', () => {
    const features = elementsToFeatures([
      { type: 'way', id: 2, geometry: [{ lat: 39.7, lon: 140.1 }, { lat: 39.71, lon: 140.1 }] },
    ])
    expect(features).toHaveLength(0)
  })

  it('relation は inner（島などの陸地）を水面から除外する', () => {
    const features = elementsToFeatures([
      {
        type: 'relation',
        id: 3,
        tags: { 'name:ja': '大池' },
        members: [
          {
            type: 'way',
            role: 'outer',
            geometry: [
              { lat: 39.0, lon: 140.0 },
              { lat: 39.1, lon: 140.0 },
              { lat: 39.1, lon: 140.1 },
              { lat: 39.0, lon: 140.0 },
            ],
          },
          {
            type: 'way',
            role: 'inner',
            geometry: [
              { lat: 39.04, lon: 140.02 },
              { lat: 39.05, lon: 140.02 },
              { lat: 39.05, lon: 140.03 },
              { lat: 39.04, lon: 140.02 },
            ],
          },
        ],
      },
    ])
    expect(features).toHaveLength(1)
    // outer が 1 つ → Polygon、島の inner は穴として保持する。
    expect(features[0]!.geometry.type).toBe('Polygon')
    expect(features[0]!.geometry.coordinates).toHaveLength(2)
    expect(features[0]!.properties.name).toBe('大池')
  })

  it('分割された relation outer をつなぎ、断片ごとの架空の三角形を作らない', () => {
    const features = elementsToFeatures([
      {
        type: 'relation', id: 5,
        members: [
          { type: 'way', role: 'outer', geometry: [{ lat: 39, lon: 140 }, { lat: 40, lon: 140 }] },
          { type: 'way', role: 'outer', geometry: [{ lat: 39, lon: 141 }, { lat: 40, lon: 141 }, { lat: 40, lon: 140 }] },
          { type: 'way', role: 'outer', geometry: [{ lat: 39, lon: 141 }, { lat: 39, lon: 140 }] },
        ],
      },
    ])
    expect(features).toHaveLength(1)
    expect(features[0]!.geometry).toEqual({
      type: 'Polygon', coordinates: [[[140, 39], [140, 40], [141, 40], [141, 39], [140, 39]]],
    })
  })

  it('閉じていない水域や壊れた要素を水面として塗らない', () => {
    expect(elementsToFeatures([
      null,
      { type: 'way', id: 6, geometry: [{ lat: 39, lon: 140 }, { lat: 40, lon: 140 }, { lat: 40, lon: 141 }] },
      { type: 'way', id: 7, geometry: [{ lat: 39, lon: 140 }, null, { lat: 40, lon: 141 }, { lat: 39, lon: 140 }] },
      { type: 'relation', id: 8, members: [{ type: 'way', role: 'outer', geometry: [{ lat: 39, lon: 140 }, { lat: 40, lon: 140 }, { lat: 40, lon: 141 }] }] },
    ])).toEqual([])
  })

  it('name タグが無い water は name:null で返す（重いタグは落とす）', () => {
    const features = elementsToFeatures([
      {
        type: 'way',
        id: 4,
        geometry: [
          { lat: 39.7, lon: 140.1 },
          { lat: 39.72, lon: 140.1 },
          { lat: 39.72, lon: 140.12 },
          { lat: 39.7, lon: 140.1 },
        ],
        tags: { natural: 'water' },
      },
    ])
    expect(features[0]!.properties.name).toBeNull()
  })
})
