// REQ-329: 非公開スポット（private_spots）の読み書きを集める層。
//
// 見えるのは本人と管理者だけ（RLS）。anon には GRANT 自体が無い。
// 書き込みの約束は posts-write.ts と同じで、**UPDATE / DELETE は RLS 拒否でも 0 行の成功として返る**ため、
// `.select('id')` で行数を見て 0 行なら投げる。

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

export type PrivateSpotsClient = SupabaseClient<Database>

export type PrivateSpot = Pick<
  Database['public']['Tables']['private_spots']['Row'],
  'id' | 'name' | 'note' | 'lat' | 'lng' | 'accuracy' | 'recorded_at' | 'created_at'
>

export type AdminPrivateSpot = PrivateSpot & { user_id: string }

export interface NewPrivateSpot {
  userId: string
  name: string
  note: string | null
  lat: number
  lng: number
  accuracy: number | null
  /** 記録した端末時刻（ISO）。オフラインで溜めて後から送る場合に created_at と区別する。 */
  recordedAt: string
}

/** 自分の地図に出す件数の上限。DB 側の 1 人 2000 件とは別に、描画を軽く保つための線。 */
export const OWN_SPOTS_LIMIT = 300

/** 本人の非公開スポット（新しい順）。 */
export function selectOwnPrivateSpots(client: PrivateSpotsClient, userId: string) {
  return client
    .from('private_spots')
    .select('id, name, note, lat, lng, accuracy, recorded_at, created_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(OWN_SPOTS_LIMIT)
}

/** 管理画面の一覧（全利用者・新しい順）。管理者以外が呼んでも RLS で自分の分しか返らない。 */
export function selectPrivateSpotsForAdmin(client: PrivateSpotsClient, limit = 1000) {
  return client
    .from('private_spots')
    .select('id, user_id, name, note, lat, lng, accuracy, recorded_at, created_at')
    .order('recorded_at', { ascending: false })
    .limit(limit)
}

/** 保存する。失敗は例外（`.single()` なので 0 行も例外になる）。 */
export async function insertPrivateSpot(
  client: PrivateSpotsClient,
  spot: NewPrivateSpot
): Promise<PrivateSpot> {
  const { data, error } = await client
    .from('private_spots')
    .insert({
      user_id: spot.userId,
      name: spot.name,
      note: spot.note,
      lat: spot.lat,
      lng: spot.lng,
      accuracy: spot.accuracy,
      recorded_at: spot.recordedAt,
    })
    .select('id, name, note, lat, lng, accuracy, recorded_at, created_at')
    .single()
  if (error) throw error
  return data
}

function assertAffected(rows: { id: string }[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}権限がないか、対象が既に存在しません (RLS deny or not found)`)
  }
}

/** 名前（とメモ）を変える。0 行なら投げる。 */
export async function renamePrivateSpot(
  client: PrivateSpotsClient,
  spotId: string,
  fields: { name: string; note?: string | null }
): Promise<void> {
  const { data, error } = await client
    .from('private_spots')
    .update(fields)
    .eq('id', spotId)
    .select('id')
  if (error) throw error
  assertAffected(data, '変更')
}

/** 消す。0 行なら投げる。 */
export async function deletePrivateSpot(client: PrivateSpotsClient, spotId: string): Promise<void> {
  const { data, error } = await client.from('private_spots').delete().eq('id', spotId).select('id')
  if (error) throw error
  assertAffected(data, '削除')
}
