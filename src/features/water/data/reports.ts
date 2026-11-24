import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

import { WATER_REPORT_LIMITS } from '../constants'
import type { WaterReport, WaterReportStatus } from '../types'

export type WaterClient = SupabaseClient<Database>

const REPORT_COLUMNS = 'id, user_id, client_id, name, note, lat, lng, photo_paths, status, public_name, published_water_body_id, reviewed_at, reviewed_by, created_at'

export interface NewWaterReport {
  userId: string
  clientId: string
  name: string
  note?: string | null
  lat: number
  lng: number
  photoPaths: string[]
}

export function selectOwnWaterReports(client: WaterClient, userId: string) {
  return client.from('water_reports').select(REPORT_COLUMNS)
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(WATER_REPORT_LIMITS.perUser)
}

/** RLS remains the authority; an ordinary caller can only receive their own reports. */
export function selectWaterReportsForAdmin(client: WaterClient, status: WaterReportStatus | 'all' = 'all') {
  const query = client.from('water_reports').select(REPORT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false }).limit(WATER_REPORT_LIMITS.perUser)
  return status === 'all' ? query : query.eq('status', status)
}

/** A retry uses the same client UUID and returns the accepted row instead of adding another. */
export async function insertWaterReport(
  client: WaterClient,
  report: NewWaterReport
): Promise<{ report: WaterReport; duplicate: boolean }> {
  const { data, error } = await client.from('water_reports').insert({
    user_id: report.userId,
    client_id: report.clientId,
    name: report.name.trim(),
    note: report.note?.trim() || null,
    lat: report.lat,
    lng: report.lng,
    photo_paths: report.photoPaths,
  }).select(REPORT_COLUMNS).single()
  if (!error) {
    if (!data) throw new Error('Water report was not returned')
    return { report: data, duplicate: false }
  }
  if (error.code !== '23505') throw error
  const existing = await client.from('water_reports').select(REPORT_COLUMNS)
    .eq('user_id', report.userId).eq('client_id', report.clientId).single()
  if (existing.error) throw existing.error
  if (!existing.data) throw new Error('Existing water report was not returned')
  return { report: existing.data, duplicate: true }
}

/** Review, public projection and audit commit together in the admin-only DB RPC. */
export async function reviewWaterReport(
  client: WaterClient,
  id: string,
  status: 'accepted' | 'rejected',
  publicName?: string
): Promise<void> {
  const { data, error } = await client.rpc('review_water_report', {
    p_id: id,
    p_status: status,
    p_public_name: status === 'accepted' ? publicName?.trim() ?? null : null,
  })
  if (error) throw error
  if (data !== true) throw new Error('Water report was not found or could not be reviewed')
}
