import { distanceM } from '@/features/fieldwork/lib/positionRule'
import { WATER_SURVEY_BUFFER_M } from '../constants'
import type { CommunityWaterBody, WaterBounds, WaterCandidate, WaterFeature, WaterPosition } from '../types'

type Position = [number, number]
type Ring = Position[]

export function isWaterPosition(value: unknown): value is WaterPosition {
  if (!value || typeof value !== 'object') return false
  const p = value as WaterPosition
  return typeof p.lat === 'number' && typeof p.lng === 'number'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && isWaterPosition({ lat: value[1], lng: value[0] })
}

function isRing(value: unknown): value is Ring {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false
  const first = value[0]!
  const last = value[value.length - 1]!
  return first[0] === last[0] && first[1] === last[1]
    && new Set(value.map(p => `${p[0]},${p[1]}`)).size >= 3
}

/** APIと公開投影の境界で検証。座標をNumber()で補完してNULLを0度にしない。 */
export function parseWaterFeatures(raw: unknown): WaterFeature[] {
  if (!Array.isArray(raw)) return []
  const features: WaterFeature[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const g = f.geometry as { type?: unknown; coordinates?: unknown } | null
    if (f.type !== 'Feature' || !g) continue
    const valid = g.type === 'Point' ? isPosition(g.coordinates)
      : g.type === 'Polygon' ? Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(isRing)
        : g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length > 0
          && g.coordinates.every(p => Array.isArray(p) && p.length > 0 && p.every(isRing))
    if (!valid) continue
    const props = f.properties && typeof f.properties === 'object' ? f.properties as Record<string, unknown> : {}
    features.push({
      type: 'Feature',
      id: typeof f.id === 'string' || typeof f.id === 'number' ? f.id : `water-${features.length}`,
      geometry: g as WaterFeature['geometry'],
      properties: { name: typeof props.name === 'string' && props.name.trim() ? props.name.trim() : null },
    })
    if (features.length === 200) break
  }
  return features
}

function polygons(feature: WaterFeature): Ring[][] {
  if (feature.geometry.type === 'Point') return []
  return (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Ring[][]
}

function pointInRing(point: WaterPosition, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if ((a[1] > point.lat) !== (b[1] > point.lat)
      && point.lng < (b[0] - a[0]) * (point.lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

function closestOnSegment(point: WaterPosition, a: Position, b: Position): WaterPosition {
  const xScale = Math.max(0.000001, Math.cos(point.lat * Math.PI / 180))
  const ax = (a[0] - point.lng) * xScale, ay = a[1] - point.lat
  const bx = (b[0] - point.lng) * xScale, by = b[1] - point.lat
  const dx = bx - ax, dy = by - ay
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length))
  return { lat: a[1] + (b[1] - a[1]) * t, lng: a[0] + (b[0] - a[0]) * t }
}

/** 中心や重心は湖の中になるため、最も近い岸の目安を計画に保持する。 */
export function shorePosition(feature: WaterFeature, point: WaterPosition): WaterPosition {
  if (feature.geometry.type === 'Point') return { lat: feature.geometry.coordinates[1]!, lng: feature.geometry.coordinates[0]! }
  let closest: WaterPosition | null = null
  let best = Infinity
  for (const polygon of polygons(feature)) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const candidate = closestOnSegment(point, ring[i - 1]!, ring[i]!)
        const distance = distanceM(point, candidate)
        if (distance < best) { best = distance; closest = candidate }
      }
    }
  }
  // 検証済みPolygonは必ず閉じたリングを持つ。
  return closest!
}

export function distanceToWater(feature: WaterFeature, point: WaterPosition): number {
  if (polygons(feature).some(p => pointInRing(point, p[0]!) && !p.slice(1).some(ring => pointInRing(point, ring)))) return 0
  return distanceM(point, shorePosition(feature, point))
}

export function featureBounds(feature: WaterFeature): WaterBounds {
  const coords = feature.geometry.type === 'Point' ? [feature.geometry.coordinates as Position] : polygons(feature).flat(2)
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const [lng, lat] of coords) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
  }
  return { minLat, maxLat, minLng, maxLng }
}

export function expandWaterBounds(bounds: WaterBounds, meters = WATER_SURVEY_BUFFER_M): WaterBounds {
  const latDelta = meters / 111_000
  const lngDelta = latDelta / Math.max(0.000001, Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180))
  return { minLat: Math.max(-90, bounds.minLat - latDelta), maxLat: Math.min(90, bounds.maxLat + latDelta), minLng: Math.max(-180, bounds.minLng - lngDelta), maxLng: Math.min(180, bounds.maxLng + lngDelta) }
}

export function candidatesBounds(features: WaterFeature[], fallback: WaterBounds): WaterBounds {
  const bounds = features.reduce((acc, feature) => {
    const b = featureBounds(feature)
    return { minLat: Math.min(acc.minLat, b.minLat), maxLat: Math.max(acc.maxLat, b.maxLat), minLng: Math.min(acc.minLng, b.minLng), maxLng: Math.max(acc.maxLng, b.maxLng) }
  }, fallback)
  return expandWaterBounds(bounds)
}

export function countPublicRecords(
  feature: WaterFeature,
  publicPoints: WaterPosition[],
  calculateDistance: (feature: WaterFeature, point: WaterPosition) => number = distanceToWater
): number {
  // 事前の外接矩形判定は、日本の水域程度に図形の緯度幅が小さく、取得範囲が日付変更線をまたがない前提。
  const nearbyBounds = expandWaterBounds(featureBounds(feature), WATER_SURVEY_BUFFER_M * 1.25)
  return publicPoints.filter(point => isWaterPosition(point)
    && point.lat >= nearbyBounds.minLat && point.lat <= nearbyBounds.maxLat
    && point.lng >= nearbyBounds.minLng && point.lng <= nearbyBounds.maxLng
    && calculateDistance(feature, point) <= WATER_SURVEY_BUFFER_M).length
}

export function waterCandidateRows(features: WaterFeature[], community: CommunityWaterBody[]) {
  const rows: { feature: WaterFeature; source: WaterCandidate['source']; id: string }[] = features.map(feature => ({ feature, source: 'osm', id: `osm:${feature.id}` }))
  for (const water of community) {
    if (!isWaterPosition(water)) continue
    rows.push({ feature: { type: 'Feature', id: water.id, geometry: { type: 'Point', coordinates: [water.lng, water.lat] }, properties: { name: water.name } }, source: 'community', id: `community:${water.id}` })
  }
  return rows
}

export function createWaterCandidates(features: WaterFeature[], community: CommunityWaterBody[], center: WaterPosition, publicPoints: WaterPosition[], complete: boolean): WaterCandidate[] {
  return waterCandidateRows(features, community).map(({ feature, source, id }) => ({
    id, name: feature.properties.name ?? null, source, feature,
    bounds: featureBounds(feature), position: shorePosition(feature, center), distanceM: distanceToWater(feature, center),
    publicRecordCount: complete ? countPublicRecords(feature, publicPoints) : null,
  })).sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
}

export function formatWaterDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10}m` : `${(meters / 1000).toFixed(1)}km`
}
