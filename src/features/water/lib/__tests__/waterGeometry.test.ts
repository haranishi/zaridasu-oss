import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createWaterCandidates, waterCandidateRows } from '../candidates'
import { geometryFixture } from '../__fixtures__/geometry'
import { instantiateWaterGeometry } from '../waterGeometryKernel'
import { packWaterGeometry, unpackWaterGeometry } from '../waterGeometryPacket'
import type { WaterFeature, WaterPosition } from '../../types'

let kernel: Awaited<ReturnType<typeof instantiateWaterGeometry>>
beforeAll(async () => {
  const manifest = JSON.parse(readFileSync(resolve('rust/water-geometry/artifact.json'), 'utf8')) as { url: string }
  kernel = await instantiateWaterGeometry(Uint8Array.from(readFileSync(resolve(`public${manifest.url}`))).buffer)
})

function compare(features: WaterFeature[], center: WaterPosition, points: WaterPosition[], complete = true) {
  const community = [{ id: 'synthetic-community', name: 'Community point', lat: center.lat + 0.001, lng: center.lng, created_at: '2026-10-11' }]
  const rows = waterCandidateRows(features, community)
  const actual = unpackWaterGeometry(rows, kernel.calculate(packWaterGeometry(rows, center, points, complete)), complete, points.length)
  const expected = createWaterCandidates(features, community, center, points, complete)
  expect(actual.map(row => row.id)).toEqual(expected.map(row => row.id))
  for (let index = 0; index < actual.length; index++) {
    const a = actual[index]!, e = expected[index]!
    expect(a.publicRecordCount).toBe(e.publicRecordCount)
    expect(a.bounds).toEqual(e.bounds)
    expect(a.position.lat).toBeCloseTo(e.position.lat, 10)
    expect(a.position.lng).toBeCloseTo(e.position.lng, 10)
    expect(a.distanceM).toBeCloseTo(e.distanceM, 7)
    expect(a.name).toBe(e.name)
    expect(a.source).toBe(e.source)
  }
  return actual
}

describe('compiled Rust water geometry', () => {
  it('matches the existing implementation on irregular polygons and many public points', () => {
    const fixture = geometryFixture(60, 96, 1000)
    compare(fixture.features, fixture.center, fixture.points)
  })

  it('preserves islands, disconnected polygons, retained shores and unknown counts', () => {
    const square = (lng: number, lat: number, size: number) => [[lng - size, lat - size], [lng + size, lat - size], [lng + size, lat + size], [lng - size, lat + size], [lng - size, lat - size]]
    const center = { lng: 140, lat: 39 }
    const island: WaterFeature = { type: 'Feature', id: 'island', properties: { name: 'Island' }, geometry: { type: 'Polygon', coordinates: [square(140, 39, 0.01), square(140, 39, 0.004)] } }
    const multi: WaterFeature = { type: 'Feature', id: 'multi', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[square(140.1, 39.1, 0.002)], [square(141, 40, 0.002)]] } }
    const points = [center, { lng: 140, lat: 39.008 }, { lng: 140.1, lat: 39.1 }]
    compare([island, multi], center, points)
    expect(compare([island, multi], center, points, false).every(row => row.publicRecordCount === null)).toBe(true)
  })

  it('keeps points just inside/outside the 150m boundary distinct at northern latitudes', () => {
    for (const lat of [34, 39.72, 43]) {
      const point: WaterFeature = { type: 'Feature', id: 'point', properties: {}, geometry: { type: 'Point', coordinates: [140, lat] } }
      const points = [149.99999, 150.00001].map(meters => ({ lng: 140, lat: lat + meters / 6_371_000 * 180 / Math.PI }))
      expect(compare([point], { lng: 140, lat }, points).find(row => row.id === 'osm:point')!.publicRecordCount).toBe(1)
    }
  })

  it('rejects truncated, non-finite, oversized and mismatched-version packets and then recovers', () => {
    const fixture = geometryFixture(2, 8, 3)
    const packet = packWaterGeometry(waterCandidateRows(fixture.features, []), fixture.center, fixture.points, true)
    for (const invalid of [packet.slice(0, -1), new Float64Array(1_000_001), new Float64Array([2, ...packet.slice(1)])]) expect(() => kernel.calculate(invalid)).toThrow()
    const invalid = packet.slice()
    invalid[3] = NaN
    expect(() => kernel.calculate(invalid)).toThrow()
    compare(fixture.features, fixture.center, fixture.points)
  })

  it('falls back if worker creation fails and rejects a cancelled search', async () => {
    vi.stubGlobal('Worker', class { constructor() { throw new Error('worker disabled') } })
    const { createWaterCandidatesAsync } = await import('../acceleratedCandidates')
    const fixture = geometryFixture(30, 64, 300)
    expect(await createWaterCandidatesAsync(fixture.features, [], fixture.center, fixture.points, true))
      .toEqual(createWaterCandidates(fixture.features, [], fixture.center, fixture.points, true))
    const controller = new AbortController()
    controller.abort()
    await expect(createWaterCandidatesAsync(fixture.features, [], fixture.center, fixture.points, true, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    vi.unstubAllGlobals()
  })
})
