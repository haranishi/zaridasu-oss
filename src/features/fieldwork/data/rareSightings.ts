// REQ-330: 希少種の記録（rare_sightings）の読み書き。
//
// 公開の経路（地図・一覧・公開データ・集計 RPC）には構造的に届かない別表。見えるのは本人と管理者だけ。
// 種は形式だけ DB が検査し、一覧は ../constants.ts の RARE_SPECIES に置く。「その他」は名前が必須。
// client_id（端末で作る uuid）で二重登録を DB が弾く。送信待ちの再送で同じ client_id が届いたら、
// 入っている行を返して増やさない。user_id / client_id / created_at は UPDATE してもトリガーが旧値に戻す。
// 写真のパスは自分のフォルダ（<user_id>/ファイル名）のものだけ付けられる（トリガーが 42501 で拒否）。
// UPDATE / DELETE は `.select(...)` で行数を見て、0 行なら投げる（RLS 拒否も 0 行の成功で返るため）。

import { boxAround, isNearAny, RARE_PROTECT_RADIUS_M, type LatLngBox } from '../lib/rareProximity'
import type { LatLngLite } from '../lib/positionRule'
import {
  assertAffected,
  isUniqueViolation,
  type FieldworkClient,
  type FieldworkTables,
} from './shared'

type RareRow = FieldworkTables['rare_sightings']['Row']

export type RareLocationSource = RareRow['location_source']

export type RareSighting = Pick<
  RareRow,
  | 'id'
  | 'client_id'
  | 'stop_id'
  | 'species_key'
  | 'species_label'
  | 'count'
  | 'note'
  | 'lat'
  | 'lng'
  | 'accuracy'
  | 'location_source'
  | 'observed_at'
  | 'photo_paths'
  | 'created_at'
>

export type AdminRareSighting = RareSighting & { user_id: string }

const RARE_COLUMNS =
  'id, client_id, stop_id, species_key, species_label, count, note, lat, lng, accuracy, location_source, observed_at, photo_paths, created_at'

/** 自分の一覧に出す件数の上限。DB の 1 人 5000 件とは別に、画面を軽く保つための線。 */
export const OWN_RARE_SIGHTINGS_LIMIT = 500

export interface NewRareSighting {
  userId: string
  /** 端末で作った uuid。送信待ちの再送でも同じ値を使う。 */
  clientId: string
  stopId?: string | null
  speciesKey: string
  /** 「その他」のときだけ必須（1〜60 字）。 */
  speciesLabel?: string | null
  count?: number | null
  note?: string | null
  lat: number
  lng: number
  accuracy?: number | null
  locationSource: RareLocationSource
  /** 観察した端末の時刻（ISO）。DB は「今から 1 日後」より未来を拒否する。 */
  observedAt: string
  /** rare-photos 内のパス（3 つまで）。rarePhotos.ts の uploadRarePhoto の戻り値を入れる。 */
  photoPaths?: string[]
}

/** 本人の記録（観察の新しい順）。 */
export function selectOwnRareSightings(
  client: FieldworkClient,
  userId: string,
  limit = OWN_RARE_SIGHTINGS_LIMIT
) {
  return client
    .from('rare_sightings')
    .select(RARE_COLUMNS)
    .eq('user_id', userId)
    .order('observed_at', { ascending: false })
    .limit(limit)
}

/** 保護の判定に使う、記録の位置だけの形。 */
export type RarePoint = Pick<RareRow, 'id' | 'stop_id' | 'lat' | 'lng'>

/**
 * 地点に付いた記録（その地点から作る投稿の位置を非公開にする判定に使う）。
 * 本人の画面では自分の記録だけが返る。場所での判定は selectOwnRarePointsInBox と合わせて行う。
 */
export function selectRareSightingsForStops(client: FieldworkClient, stopIds: readonly string[]) {
  return client
    .from('rare_sightings')
    .select('id, stop_id, lat, lng')
    .in('stop_id', [...stopIds])
}

/** 範囲検索で取る上限。これだけ返ったら取りこぼしがありうるので、呼び出し側は伏せる側に倒す。 */
export const RARE_POINTS_LIMIT = 1000

/** 範囲（緯度経度）の中にある自分の記録の位置（新しい順）。距離は呼び出し側で測り直す。 */
export function selectOwnRarePointsInBox(client: FieldworkClient, userId: string, box: LatLngBox) {
  return client
    .from('rare_sightings')
    .select('id, stop_id, lat, lng')
    .eq('user_id', userId)
    .gte('lat', box.minLat)
    .lte('lat', box.maxLat)
    .gte('lng', box.minLng)
    .lte('lng', box.maxLng)
    .order('observed_at', { ascending: false })
    .limit(RARE_POINTS_LIMIT)
}

/**
 * その位置から 300 m 以内か、その地点に付いた自分の希少種の記録があるか（DB で確かめる）。
 * 投稿（いた・いなかった）を作る直前に呼び、あれば位置を非公開にする。失敗は投げる。
 */
export async function hasOwnRareNear(
  client: FieldworkClient,
  userId: string,
  point: LatLngLite,
  stopId?: string | null
): Promise<boolean> {
  const box = boxAround([point], RARE_PROTECT_RADIUS_M)
  if (box) {
    const { data, error } = await selectOwnRarePointsInBox(client, userId, box)
    if (error) throw error
    if (isNearAny(point, data ?? [])) return true
    // 上限まで返った＝取りこぼしがありうる。確かめ切れないので伏せる側に倒す
    if ((data ?? []).length >= RARE_POINTS_LIMIT) return true
  }
  if (!stopId) return false
  const { data, error } = await client
    .from('rare_sightings')
    .select('id')
    .eq('user_id', userId)
    .eq('stop_id', stopId)
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

/** 管理画面の一覧（全利用者・観察の新しい順）。管理者以外が呼んでも RLS で自分の分しか返らない。 */
export function selectRareSightingsForAdmin(client: FieldworkClient, limit = 1000) {
  return client
    .from('rare_sightings')
    .select(`user_id, ${RARE_COLUMNS}`)
    .order('observed_at', { ascending: false })
    .limit(limit)
}

/**
 * 記録する。`duplicate: true` は同じ client_id の記録がもう入っていた（前の送信が届いていた）ことを示し、
 * そのとき返すのは入っていた行。上限（1 時間 60 件・1 人 5000 件）は P0001、写真のパスの違反は 42501 の例外。
 */
export async function insertRareSighting(
  client: FieldworkClient,
  sighting: NewRareSighting
): Promise<{ sighting: RareSighting; duplicate: boolean }> {
  const { data, error } = await client
    .from('rare_sightings')
    .insert({
      user_id: sighting.userId,
      client_id: sighting.clientId,
      stop_id: sighting.stopId ?? null,
      species_key: sighting.speciesKey,
      species_label: sighting.speciesLabel ?? null,
      count: sighting.count ?? null,
      note: sighting.note ?? null,
      lat: sighting.lat,
      lng: sighting.lng,
      accuracy: sighting.accuracy ?? null,
      location_source: sighting.locationSource,
      observed_at: sighting.observedAt,
      photo_paths: sighting.photoPaths ?? [],
    })
    .select(RARE_COLUMNS)
    .single()
  if (!error) return { sighting: data, duplicate: false }
  if (!isUniqueViolation(error)) throw error

  const existing = await client
    .from('rare_sightings')
    .select(RARE_COLUMNS)
    .eq('user_id', sighting.userId)
    .eq('client_id', sighting.clientId)
    .single()
  if (existing.error) throw existing.error
  return { sighting: existing.data, duplicate: true }
}

/** 地点が消えた・自分の地点でない（RLS の WITH CHECK・外部キー）ときの失敗か。 */
function isStopRejected(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return code === '42501' || code === '23503'
}

/**
 * 記録する。付けた地点が自分の地点でない・もう無いと拒否されたら、地点を外して入れ直す（記録は失わない）。
 * 地点を外したかどうか（stopDropped）も返す。
 */
export async function insertRareKeepingRecord(
  client: FieldworkClient,
  sighting: NewRareSighting
): Promise<{ sighting: RareSighting; duplicate: boolean; stopDropped: boolean }> {
  try {
    return { ...(await insertRareSighting(client, sighting)), stopDropped: false }
  } catch (err) {
    if (!sighting.stopId || !isStopRejected(err)) throw err
    return { ...(await insertRareSighting(client, { ...sighting, stopId: null })), stopDropped: true }
  }
}

/** 種・数・メモ・写真などを変える。0 行なら投げる。 */
export async function updateRareSighting(
  client: FieldworkClient,
  id: string,
  fields: {
    stopId?: string | null
    speciesKey?: string
    speciesLabel?: string | null
    count?: number | null
    note?: string | null
    observedAt?: string
    photoPaths?: string[]
  }
): Promise<void> {
  const update: FieldworkTables['rare_sightings']['Update'] = {}
  if (fields.stopId !== undefined) update.stop_id = fields.stopId
  if (fields.speciesKey !== undefined) update.species_key = fields.speciesKey
  if (fields.speciesLabel !== undefined) update.species_label = fields.speciesLabel
  if (fields.count !== undefined) update.count = fields.count
  if (fields.note !== undefined) update.note = fields.note
  if (fields.observedAt !== undefined) update.observed_at = fields.observedAt
  if (fields.photoPaths !== undefined) update.photo_paths = fields.photoPaths
  if (Object.keys(update).length === 0) throw new Error('変える項目がありません')
  const { data, error } = await client.from('rare_sightings').update(update).eq('id', id).select('id')
  if (error) throw error
  assertAffected(data, '希少種の記録の変更')
}

/**
 * 記録を消す。0 行なら投げる。写真の実体は消えないので、戻り値のパスを
 * rarePhotos.ts の removeRarePhotos に渡して消す（置き去りにしない）。
 */
export async function deleteRareSighting(
  client: FieldworkClient,
  id: string
): Promise<{ photoPaths: string[] }> {
  const { data, error } = await client.from('rare_sightings').delete().eq('id', id).select('id, photo_paths')
  if (error) throw error
  assertAffected(data, '希少種の記録の削除')
  return { photoPaths: data?.[0]?.photo_paths ?? [] }
}
