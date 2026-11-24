import { describe, expect, it, vi } from 'vitest'
import { candidatesBounds, countPublicRecords, createWaterCandidates, distanceToWater, parseWaterFeatures, shorePosition } from '../candidates'
import { WATER_SURVEY_BUFFER_M } from '../../constants'
import type { WaterPosition } from '../../types'
import type { WaterFeature } from '../../types'

const polygon = (coordinates: number[][][], id = 'lake'): WaterFeature => ({ type: 'Feature', id, properties: { name: '池' }, geometry: { type: 'Polygon', coordinates } })
const lake = polygon([[[140, 39], [140.02, 39], [140.02, 39.02], [140, 39.02], [140, 39]]])
const center = { lat: 39.01, lng: 140.01 }

describe('水域候補の位置と公開記録', () => {
  it('外接矩形外の公開点では重い距離計算を呼ばず、矩形内だけ厳密判定する', () => {
    const nearby = [{ lat: 39.0005, lng: 140.0005 }, { lat: 39.0015, lng: 140.0005 }]
    const farAway = Array.from({ length: 100 }, (_, index) => ({ lat: 30 + index * 0.001, lng: 130 }))
    const calculateDistance = vi.fn((feature: WaterFeature, point: WaterPosition) => distanceToWater(feature, point))
    expect(countPublicRecords(lake, [...nearby, ...farAway], calculateDistance)).toBe(2)
    expect(calculateDistance).toHaveBeenCalledTimes(2)
  })

  it('ランダムなPolygon・穴・MultiPolygonと150m境界で全点厳密判定と件数が一致する', () => {
    let seed = 0x5eed1234
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x1_0000_0000
    }
    const square = (lng: number, lat: number, size: number) => [[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]]
    const referenceCount = (feature: WaterFeature, points: WaterPosition[]) => points.filter(point => distanceToWater(feature, point) <= WATER_SURVEY_BUFFER_M).length

    for (let index = 0; index < 40; index++) {
      const lat = 34 + random() * 8
      const lng = 135 + random() * 8
      const size = 0.001 + random() * 0.003
      const outer = square(lng, lat, size)
      const feature: WaterFeature = index % 3 === 0
        ? polygon([outer, square(lng, lat, size / 3)], `hole-${index}`)
        : index % 3 === 1
          ? { ...polygon([outer], `multi-${index}`), geometry: { type: 'MultiPolygon', coordinates: [[outer], [square(lng + size * 4, lat + size * 4, size / 2)]] } }
          : polygon([outer], `polygon-${index}`)
      const points = Array.from({ length: 80 }, () => ({ lat: lat + (random() - 0.5) * 0.2, lng: lng + (random() - 0.5) * 0.2 }))
      let low = size, high = size + 0.01
      for (let step = 0; step < 60; step++) {
        const middle = (low + high) / 2
        if (distanceToWater(feature, { lat: lat + middle, lng }) < WATER_SURVEY_BUFFER_M) low = middle
        else high = middle
      }
      points.push({ lat: lat + low, lng }, { lat: lat + high, lng })
      for (const direction of [-1, 1]) {
        let inside = size, outside = size + 0.01
        for (let step = 0; step < 60; step++) {
          const middle = (inside + outside) / 2
          if (distanceToWater(feature, { lat, lng: lng + direction * middle }) < WATER_SURVEY_BUFFER_M) inside = middle
          else outside = middle
        }
        points.push({ lat, lng: lng + direction * inside }, { lat, lng: lng + direction * outside })
      }
      expect(createWaterCandidates([feature], [], { lat, lng }, points, true)[0]!.publicRecordCount)
        .toBe(referenceCount(feature, points))
    }
  })

  it('北緯43度の水域で東西南北それぞれ150mの内側だけを公開記録に数える', () => {
    const lat = 43
    const lng = 141
    const size = 0.001
    const hokkaido = polygon([[[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]]], 'hokkaido')
    const latOffset = (meters: number) => meters / 111_195
    const lngOffset = (meters: number) => meters / (111_195 * Math.cos(lat * Math.PI / 180))
    const points = [149, 151].flatMap(meters => [
      { lat: lat + size + latOffset(meters), lng },
      { lat: lat - size - latOffset(meters), lng },
      { lat, lng: lng + size + lngOffset(meters) },
      { lat, lng: lng - size - lngOffset(meters) },
    ])
    expect(countPublicRecords(hokkaido, points)).toBe(4)
  })

  it('湖の内側は距離0だが、計画に渡す位置は水面中央ではなく岸に保つ', () => {
    expect(distanceToWater(lake, center)).toBe(0)
    const position = shorePosition(lake, center)
    expect(position).not.toEqual(center)
    expect(position.lng === 140 || position.lng === 140.02 || position.lat === 39 || position.lat === 39.02).toBe(true)
    const candidate = createWaterCandidates([lake], [], center, [], true)[0]!
    expect(candidate.distanceM).toBe(0)
    expect(candidate.position).toEqual(position)
  })

  it('Polygonの穴は水面に数えず、島の中心の記録を水域の公開記録に誤算入しない', () => {
    const withIsland = polygon([
      lake.geometry.type === 'Polygon' ? lake.geometry.coordinates[0]! : [],
      [[140.005, 39.005], [140.015, 39.005], [140.015, 39.015], [140.005, 39.015], [140.005, 39.005]],
    ])
    expect(distanceToWater(withIsland, center)).toBeGreaterThan(150)
    expect(createWaterCandidates([withIsland], [], center, [center], true)[0]!.publicRecordCount).toBe(0)
    expect(createWaterCandidates([withIsland], [], center, [{ lat: 39.002, lng: 140.01 }], true)[0]!.publicRecordCount).toBe(1)
  })

  it('離れたMultiPolygonの中間を水域とせず、近い構成部分の岸を選ぶ', () => {
    const multi: WaterFeature = { ...lake, geometry: { type: 'MultiPolygon', coordinates: [
      [[[140, 39], [140.001, 39], [140.001, 39.001], [140, 39.001], [140, 39]]],
      [[[141, 40], [141.001, 40], [141.001, 40.001], [141, 40.001], [141, 40]]],
    ] } }
    const position = shorePosition(multi, { lat: 40.0015, lng: 141.0005 })
    expect(position.lat).toBeCloseTo(40.001)
    expect(position.lng).toBeCloseTo(141.0005)
    expect(distanceToWater(multi, { lat: 39.5, lng: 140.5 })).toBeGreaterThan(10_000)
  })

  it('公開位置の150mバッファを適用し、遠い記録は数えない', () => {
    const point: WaterFeature = { type: 'Feature', id: 'point', properties: { name: '小池' }, geometry: { type: 'Point', coordinates: [140, 39] } }
    const records = [{ lat: 39 + 140 / 111_195, lng: 140 }, { lat: 39 + 160 / 111_195, lng: 140 }]
    expect(createWaterCandidates([point], [], center, records, true)[0]!.publicRecordCount).toBe(1)
  })

  it('不完全な公開記録は0件候補にせず、距離順はcommunity Pointを含めて揃える', () => {
    const community = [{ id: 'report', name: '情報提供の池', lat: 39.0101, lng: 140.0101, created_at: '2026-10-08' }]
    const distant: WaterFeature = { type: 'Feature', id: 'distant', properties: { name: '遠い池' }, geometry: { type: 'Point', coordinates: [141, 40] } }
    const rows = createWaterCandidates([distant], community, center, [], false)
    expect(rows.map(row => row.source)).toEqual(['community', 'osm'])
    expect(rows.every(row => row.publicRecordCount === null)).toBe(true)
    expect(rows[0]!.position).toEqual({ lat: 39.0101, lng: 140.0101 })
  })

  it('NULL・文字列・無限値・閉じないリングなど不正なAPI座標を補完せず除外する', () => {
    const invalid = [null, { type: 'Feature', geometry: null },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [null, 39] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: ['140', 39] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [140, Infinity] } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [181, 39] } },
      polygon([[[140, 39], [140, 40], [141, 40], [141, 39]]]),
      polygon([[[140, 39], [140, 39], [140, 39], [140, 39]]]),
    ]
    expect(parseWaterFeatures([...invalid, lake])).toEqual([lake])
  })

  it('大きい湖の全域と150mバッファを公開記録検索へ渡す', () => {
    const bounds = candidatesBounds([lake], { minLat: 39.009, maxLat: 39.011, minLng: 140.009, maxLng: 140.011 })
    expect(bounds.minLat).toBeLessThan(39)
    expect(bounds.maxLat).toBeGreaterThan(39.02)
    expect(bounds.minLng).toBeLessThan(140)
    expect(bounds.maxLng).toBeGreaterThan(140.02)
  })
})
