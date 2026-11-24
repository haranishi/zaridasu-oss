import type { Feature, MultiPolygon, Point, Polygon } from 'geojson'

export interface WaterPosition { lat: number; lng: number }
export interface WaterBounds { minLat: number; maxLat: number; minLng: number; maxLng: number }
export type WaterFeature = Feature<Polygon | MultiPolygon | Point, { name?: string | null; id?: string | number }>

export interface WaterCandidate {
  id: string
  name: string | null
  source: 'osm' | 'community'
  feature: WaterFeature
  bounds: WaterBounds
  /** Selected shore or reported location, retained when the map moves. */
  position: WaterPosition
  distanceM: number
  /** null means that the public records could not be checked completely. */
  publicRecordCount: number | null
}

export interface CommunityWaterBody extends WaterPosition {
  id: string
  name: string
  created_at: string
}

export type WaterReportStatus = 'pending' | 'accepted' | 'rejected'
export interface WaterReport extends WaterPosition {
  id: string
  user_id: string
  client_id: string
  name: string
  note: string | null
  public_name?: string | null
  photo_paths: string[]
  status: WaterReportStatus
  published_water_body_id: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
}
