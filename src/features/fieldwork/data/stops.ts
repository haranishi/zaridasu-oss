// REQ-330: 計画の地点（survey_plan_stops）の読み書き。
//
// 見えるのは本人と管理者だけ（RLS）。足せるのは自分の計画にだけで、管理者も他人の計画には足せない。
// plan_id / user_id / created_at は UPDATE してもトリガーが旧値に戻す（計画の付け替えはできない）。
// 座標は複製して持つ。元の非公開スポットを消しても地点は残る（source_id は参考の印で、外部キーではない）。
// UPDATE / DELETE は `.select('id')` で行数を見て、0 行なら投げる（RLS 拒否も 0 行の成功で返るため）。

import type { LatLngBox } from '../lib/rareProximity'
import { assertAffected, type FieldworkClient, type FieldworkTables } from './shared'

type StopRow = FieldworkTables['survey_plan_stops']['Row']

export type StopStatus = StopRow['status']
export type StopSource = StopRow['source']

export type SurveyPlanStop = Pick<
  StopRow,
  | 'id'
  | 'plan_id'
  | 'sort_order'
  | 'name'
  | 'note'
  | 'lat'
  | 'lng'
  | 'source'
  | 'source_id'
  | 'status'
  | 'visited_at'
  | 'created_at'
>

const STOP_COLUMNS =
  'id, plan_id, sort_order, name, note, lat, lng, source, source_id, status, visited_at, created_at'

/** DB の CHECK（sort_order BETWEEN 0 AND 9999）と同じ上限。 */
const SORT_ORDER_MAX = 9999

/**
 * 1 計画の地点を取る件数の線。1 計画 100 か所の上限は管理者に効かないので 100 では切らない
 * （並べ替えと「もう一度使う」は計画の地点を全部そろえる必要がある）。
 */
const STOPS_FETCH_LIMIT = 1000

export interface NewSurveyPlanStop {
  lat: number
  lng: number
  source: StopSource
  /** 非公開スポット・調査依頼から足すときの元の id。ピン・現在地では渡さない（DB の CHECK で弾く）。 */
  sourceId?: string | null
  name?: string | null
  note?: string | null
  /**
   * 省略すると insertStops の firstSortOrder から渡した順に振る。既存の計画の末尾に足すときは
   * nextSortOrder(既存の地点) を渡す（insertStop は省略時 0）。
   */
  sortOrder?: number
}

/** 計画の地点（順番どおり）。 */
export function selectStops(client: FieldworkClient, planId: string) {
  return client
    .from('survey_plan_stops')
    .select(STOP_COLUMNS)
    .eq('plan_id', planId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(STOPS_FETCH_LIMIT)
}

/** 範囲検索で取る上限。これだけ返ったら取りこぼしがありうる。 */
export const STOPS_IN_BOX_LIMIT = 1000

/** 範囲（緯度経度）の中にある自分の地点（どの計画のものでも・新しい順）。希少種の場所の近くの地点を探すのに使う。 */
export function selectOwnStopsInBox(client: FieldworkClient, userId: string, box: LatLngBox) {
  return client
    .from('survey_plan_stops')
    .select('id, lat, lng')
    .eq('user_id', userId)
    .gte('lat', box.minLat)
    .lte('lat', box.maxLat)
    .gte('lng', box.minLng)
    .lte('lng', box.maxLng)
    .order('created_at', { ascending: false })
    .limit(STOPS_IN_BOX_LIMIT)
}

/** 既存の地点の次の順番。空なら 0。DB の上限 9999 を超えない。 */
export function nextSortOrder(stops: readonly Pick<SurveyPlanStop, 'sort_order'>[]): number {
  if (stops.length === 0) return 0
  return Math.min(SORT_ORDER_MAX, Math.max(...stops.map((s) => s.sort_order)) + 1)
}

/**
 * 地点をまとめて足す（1 回の INSERT）。sortOrder を省いた地点には `firstSortOrder` から順に振る。
 * 失敗は例外（1 計画 100 か所・1 時間 300 件の上限は P0001、他人の計画は 42501）。
 */
export async function insertStops(
  client: FieldworkClient,
  userId: string,
  planId: string,
  stops: readonly NewSurveyPlanStop[],
  firstSortOrder = 0
): Promise<SurveyPlanStop[]> {
  if (stops.length === 0) return []
  const rows = stops.map((stop, i) => ({
    plan_id: planId,
    user_id: userId,
    sort_order: stop.sortOrder ?? Math.min(SORT_ORDER_MAX, firstSortOrder + i),
    name: stop.name ?? null,
    note: stop.note ?? null,
    lat: stop.lat,
    lng: stop.lng,
    source: stop.source,
    source_id: stop.sourceId ?? null,
  }))
  const { data, error } = await client.from('survey_plan_stops').insert(rows).select(STOP_COLUMNS)
  if (error) throw error
  return data ?? []
}

/** 地点を 1 つ足す。 */
export async function insertStop(
  client: FieldworkClient,
  userId: string,
  planId: string,
  stop: NewSurveyPlanStop
): Promise<SurveyPlanStop> {
  const [row] = await insertStops(client, userId, planId, [stop], stop.sortOrder ?? 0)
  if (!row) throw new Error('地点を保存できませんでした')
  return row
}

/** 名前・メモ・座標を変える。0 行なら投げる。 */
export async function updateStop(
  client: FieldworkClient,
  stopId: string,
  fields: { name?: string | null; note?: string | null; lat?: number; lng?: number }
): Promise<void> {
  if (Object.keys(fields).length === 0) throw new Error('変える項目がありません')
  const { data, error } = await client.from('survey_plan_stops').update(fields).eq('id', stopId).select('id')
  if (error) throw error
  assertAffected(data, '地点の変更')
}

/**
 * 済み・飛ばし・未（元に戻す）にする。`at` は端末の時刻（ISO）。圏外で溜めて後から送っても、
 * 実際に記録した時刻が残る。未に戻すと visited_at は空にする（作った投稿や記録は消さない）。
 */
export async function setStopStatus(
  client: FieldworkClient,
  stopId: string,
  status: StopStatus,
  at: string
): Promise<void> {
  const { data, error } = await client
    .from('survey_plan_stops')
    .update({ status, visited_at: status === 'pending' ? null : at })
    .eq('id', stopId)
    .select('id')
  if (error) throw error
  assertAffected(data, '地点の状態の変更')
}

/** 地点を外す。つながりは一緒に消え、希少種の記録は残る（地点の参照だけ外れる）。0 行なら投げる。 */
export async function deleteStop(client: FieldworkClient, stopId: string): Promise<void> {
  const { data, error } = await client.from('survey_plan_stops').delete().eq('id', stopId).select('id')
  if (error) throw error
  assertAffected(data, '地点の削除')
}

/**
 * 計画の地点を渡した順に並べ直す（RPC。1 回の取引で 0 から振り直す）。
 * **計画の地点を全部**渡す。一部だけ・重複・他人の計画は DB が拒否する。
 */
export async function reorderStops(
  client: FieldworkClient,
  planId: string,
  orderedStopIds: readonly string[]
): Promise<void> {
  const { error } = await client.rpc('reorder_survey_plan_stops', {
    p_plan_id: planId,
    p_stop_ids: [...orderedStopIds],
  })
  if (error) throw error
}
