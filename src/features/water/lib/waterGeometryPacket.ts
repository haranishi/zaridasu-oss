import { isWaterPosition, waterCandidateRows } from './candidates'
import { WATER_SURVEY_BUFFER_M } from '../constants'
import type { WaterCandidate, WaterPosition } from '../types'

export const WATER_GEOMETRY_ABI = 1
export const MAX_GEOMETRY_VALUES = 1_000_000
export const GEOMETRY_RESULT_STRIDE = 8
export type CandidateRow = ReturnType<typeof waterCandidateRows>[number]

function polygons(row: CandidateRow) {
  const geometry = row.feature.geometry
  return geometry.type === 'Point' ? [] : geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
}

/** Includes packing work when deciding whether worker dispatch is worthwhile. */
export function waterGeometryWork(rows: CandidateRow[], points: number): number {
  let vertices = 0
  for (const row of rows) {
    if (row.feature.geometry.type === 'Point') vertices++
    else for (const polygon of polygons(row)) for (const ring of polygon) vertices += ring.length
  }
  return vertices * (points + 1)
}

export function packWaterGeometry(rows: CandidateRow[], center: WaterPosition, publicPoints: WaterPosition[], complete: boolean): Float64Array<ArrayBuffer> {
  const points = complete ? publicPoints.filter(isWaterPosition) : []
  if (rows.length > 512 || points.length > 1000 || !isWaterPosition(center)) throw new Error('geometry limits')
  let length = 7 + points.length * 2
  for (const row of rows) {
    length++
    if (row.feature.geometry.type === 'Point') length += 2
    else for (const polygon of polygons(row)) {
      length++
      for (const ring of polygon) length += 1 + ring.length * 2
    }
  }
  if (length > MAX_GEOMETRY_VALUES) throw new Error('geometry size')
  const input = new Float64Array(length)
  input.set([WATER_GEOMETRY_ABI, rows.length, points.length, center.lng, center.lat, WATER_SURVEY_BUFFER_M, Number(complete)])
  let offset = 7
  for (const row of rows) {
    const geometry = row.feature.geometry
    const areas = polygons(row)
    input[offset++] = areas.length
    if (geometry.type === 'Point') {
      input[offset++] = geometry.coordinates[0]!
      input[offset++] = geometry.coordinates[1]!
    } else for (const polygon of areas) {
      input[offset++] = polygon.length
      for (const ring of polygon) {
        input[offset++] = ring.length
        for (const position of ring) {
          input[offset++] = position[0]!
          input[offset++] = position[1]!
        }
      }
    }
  }
  for (const point of points) { input[offset++] = point.lng; input[offset++] = point.lat }
  return input
}

export function unpackWaterGeometry(rows: CandidateRow[], output: Float64Array, complete: boolean, pointCount: number): WaterCandidate[] {
  if (output.length !== rows.length * GEOMETRY_RESULT_STRIDE || !output.every(Number.isFinite)) throw new Error('geometry result')
  return rows.map(({ feature, source, id }, index) => {
    const offset = index * GEOMETRY_RESULT_STRIDE
    const bounds = { minLat: output[offset]!, maxLat: output[offset + 1]!, minLng: output[offset + 2]!, maxLng: output[offset + 3]! }
    const position = { lat: output[offset + 4]!, lng: output[offset + 5]! }
    const distanceM = output[offset + 6]!
    const count = output[offset + 7]!
    if (!isWaterPosition(position) || bounds.minLat > bounds.maxLat || bounds.minLng > bounds.maxLng
      || distanceM < 0 || (complete ? !Number.isInteger(count) || count < 0 || count > pointCount : count !== -1)) throw new Error('geometry result')
    return { id, name: feature.properties.name ?? null, source, feature, bounds, position, distanceM, publicRecordCount: complete ? count : null }
  }).sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
}
