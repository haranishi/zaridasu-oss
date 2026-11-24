import { COMMUNITY_WATER_LIMIT, PUBLIC_WATER_POINT_LIMIT } from '../constants'
import type { CommunityWaterBody, WaterBounds, WaterPosition } from '../types'
import type { WaterClient } from './reports'

// Keep these local so the water chunk does not turn posts.ts constants into runtime exports
// in the home chunk. The parity test locks them to the canonical public-post definition.
export const PUBLIC_WATER_POST_STATUS = 'approved' as const
export const PUBLIC_WATER_COORD_COLUMN = { lat: 'display_lat', lng: 'display_lng' } as const

function validateBounds(bounds: WaterBounds) {
  if (!Object.values(bounds).every(Number.isFinite)
    || bounds.minLat > bounds.maxLat || bounds.minLng > bounds.maxLng
    || bounds.minLat < -90 || bounds.maxLat > 90 || bounds.minLng < -180 || bounds.maxLng > 180) {
    throw new Error('Invalid water search bounds')
  }
}

function validPosition(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** Water discovery checks all approved public positions, independently of homepage filters. */
function selectPublicWaterSurveyPoints(client: WaterClient, bounds: WaterBounds) {
  return client.from('posts').select('display_lat, display_lng', { count: 'exact' })
    .eq('status', PUBLIC_WATER_POST_STATUS)
    .gte(PUBLIC_WATER_COORD_COLUMN.lat, bounds.minLat).lte(PUBLIC_WATER_COORD_COLUMN.lat, bounds.maxLat)
    .gte(PUBLIC_WATER_COORD_COLUMN.lng, bounds.minLng).lte(PUBLIC_WATER_COORD_COLUMN.lng, bounds.maxLng)
}

/** No homepage filters or private coordinates. Incomplete data never proves absence. */
export async function loadPublicWaterSurveyPoints(
  client: WaterClient,
  bounds: WaterBounds,
  signal?: AbortSignal
): Promise<{ points: WaterPosition[]; complete: boolean }> {
  validateBounds(bounds)
  let query = selectPublicWaterSurveyPoints(client, bounds).limit(PUBLIC_WATER_POINT_LIMIT)
  if (signal) query = query.abortSignal(signal)
  const { data, error, count } = await query
  if (error) throw error
  const rows = data ?? []
  const points: WaterPosition[] = []
  for (const row of rows) {
    if (validPosition(row.display_lat, row.display_lng)) {
      points.push({ lat: row.display_lat, lng: row.display_lng! })
    }
  }
  return {
    points,
    complete: data !== null && count !== null && count === rows.length && points.length === rows.length,
  }
}

/** This table contains only the reviewed name and coarse location, including for admin callers. */
export async function loadCommunityWaterBodies(
  client: WaterClient,
  bounds: WaterBounds,
  signal?: AbortSignal
): Promise<CommunityWaterBody[]> {
  validateBounds(bounds)
  let query = client.from('community_water_bodies').select('id, name, lat, lng, created_at')
    .gte('lat', bounds.minLat).lte('lat', bounds.maxLat)
    .gte('lng', bounds.minLng).lte('lng', bounds.maxLng)
    .order('created_at', { ascending: false }).limit(COMMUNITY_WATER_LIMIT)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).filter((row) => validPosition(row.lat, row.lng))
}
