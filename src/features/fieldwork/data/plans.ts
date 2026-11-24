// REQ-330: 調査計画（survey_plans）の読み書き。
//
// 見えるのは本人と管理者だけ（RLS）。anon には GRANT 自体が無い。書けるのは本人だけで、
// 管理者も他人の計画は書き換えられない（読む・消すだけ）。user_id / created_at は UPDATE しても
// トリガーが旧値に戻す。上限は 1 日 30 件・1 人 1000 件（DB が P0001 で止める。管理者は対象外）。
// UPDATE / DELETE は `.select('id')` で行数を見て、0 行なら投げる（RLS 拒否も 0 行の成功で返るため）。

import { assertAffected, type FieldworkClient, type FieldworkTables } from './shared'
import { insertStops, selectStops } from './stops'

type PlanRow = FieldworkTables['survey_plans']['Row']

export type PlanStatus = PlanRow['status']

export type SurveyPlan = Pick<
  PlanRow,
  'id' | 'title' | 'planned_on' | 'status' | 'note' | 'created_at' | 'updated_at'
>

export type AdminSurveyPlan = SurveyPlan & { user_id: string }

const PLAN_COLUMNS = 'id, title, planned_on, status, note, created_at, updated_at'

/** 一覧に出す件数の上限。DB の 1 人 1000 件とは別に、画面を軽く保つための線。 */
export const OWN_PLANS_LIMIT = 100

export interface NewSurveyPlan {
  userId: string
  title: string
  /** YYYY-MM-DD。省くと DB が日本時間の今日を入れる。 */
  plannedOn?: string
  note?: string | null
}

/** 本人の計画（予定日の新しい順）。片付けた計画（archived）は既定で除く。 */
export function selectOwnPlans(
  client: FieldworkClient,
  userId: string,
  options: { includeArchived?: boolean } = {}
) {
  let query = client.from('survey_plans').select(PLAN_COLUMNS).eq('user_id', userId)
  if (!options.includeArchived) query = query.neq('status', 'archived')
  return query
    .order('planned_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(OWN_PLANS_LIMIT)
}

/** 計画を 1 件。見えなければ data は null（他人の計画・消えた計画）。 */
export function selectPlan(client: FieldworkClient, planId: string) {
  return client.from('survey_plans').select(PLAN_COLUMNS).eq('id', planId).maybeSingle()
}

/** 管理画面・集計用（全利用者・新しい順）。管理者以外が呼んでも RLS で自分の分しか返らない。 */
export function selectPlansForAdmin(client: FieldworkClient, limit = 1000) {
  return client
    .from('survey_plans')
    .select(`user_id, ${PLAN_COLUMNS}`)
    .order('planned_on', { ascending: false })
    .limit(limit)
}

/** 計画を作る。失敗は例外（`.single()` なので 0 行も例外）。 */
export async function insertPlan(client: FieldworkClient, plan: NewSurveyPlan): Promise<SurveyPlan> {
  const { data, error } = await client
    .from('survey_plans')
    .insert({
      user_id: plan.userId,
      title: plan.title,
      note: plan.note ?? null,
      ...(plan.plannedOn ? { planned_on: plan.plannedOn } : {}),
    })
    .select(PLAN_COLUMNS)
    .single()
  if (error) throw error
  return data
}

/** 題名・予定日・状態・メモを変える。0 行なら投げる。 */
export async function updatePlan(
  client: FieldworkClient,
  planId: string,
  fields: { title?: string; plannedOn?: string; status?: PlanStatus; note?: string | null }
): Promise<void> {
  const update: FieldworkTables['survey_plans']['Update'] = {}
  if (fields.title !== undefined) update.title = fields.title
  if (fields.plannedOn !== undefined) update.planned_on = fields.plannedOn
  if (fields.status !== undefined) update.status = fields.status
  if (fields.note !== undefined) update.note = fields.note
  if (Object.keys(update).length === 0) throw new Error('変える項目がありません')
  const { data, error } = await client.from('survey_plans').update(update).eq('id', planId).select('id')
  if (error) throw error
  assertAffected(data, '計画の変更')
}

/** 計画を消す。地点とつながりも消える。希少種の記録と投稿は残る。0 行なら投げる。 */
export async function deletePlan(client: FieldworkClient, planId: string): Promise<void> {
  const { data, error } = await client.from('survey_plans').delete().eq('id', planId).select('id')
  if (error) throw error
  assertAffected(data, '計画の削除')
}

/**
 * 「この計画をもう一度使う」: 同じ地点（同じ順番・状態は未）で新しい計画を作る。
 * 地点だけ保存できなかったときは、空の計画を残さないよう作った計画を消してから元の例外を投げる。
 */
export async function duplicatePlan(
  client: FieldworkClient,
  input: { userId: string; sourcePlanId: string; title: string; plannedOn?: string }
): Promise<SurveyPlan> {
  const { data: stops, error } = await selectStops(client, input.sourcePlanId)
  if (error) throw error
  const plan = await insertPlan(client, { userId: input.userId, title: input.title, plannedOn: input.plannedOn })
  try {
    await insertStops(
      client,
      input.userId,
      plan.id,
      (stops ?? []).map((s, i) => ({
        name: s.name,
        note: s.note,
        lat: s.lat,
        lng: s.lng,
        source: s.source,
        sourceId: s.source_id,
        sortOrder: i,
      }))
    )
  } catch (stopsError) {
    await client.from('survey_plans').delete().eq('id', plan.id)
    throw stopsError
  }
  return plan
}
