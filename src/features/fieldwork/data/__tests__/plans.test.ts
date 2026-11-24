import { describe, it, expect } from 'vitest'

import {
  OWN_PLANS_LIMIT,
  deletePlan,
  duplicatePlan,
  insertPlan,
  selectOwnPlans,
  selectPlan,
  selectPlansForAdmin,
  updatePlan,
} from '../plans'
import { argOf, fakeClient } from './fakeClient'

const PLAN = {
  id: 'p1',
  title: '朝の調査',
  planned_on: '2026-10-01',
  status: 'active',
  note: null,
  created_at: 't',
  updated_at: 't',
}

describe('survey_plans の読み取り (REQ-330)', () => {
  it('自分の計画を予定日の新しい順・上限付きで取り、片付けた計画は既定で除く', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectOwnPlans(client, 'user-1')
    expect(calls[0]?.table).toBe('survey_plans')
    expect(calls[0]?.ops).toContainEqual(['eq', ['user_id', 'user-1']])
    expect(calls[0]?.ops).toContainEqual(['neq', ['status', 'archived']])
    expect(calls[0]?.ops).toContainEqual(['order', ['planned_on', { ascending: false }]])
    expect(calls[0]?.ops).toContainEqual(['limit', [OWN_PLANS_LIMIT]])
  })

  it('includeArchived なら片付けた計画も取る', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectOwnPlans(client, 'user-1', { includeArchived: true })
    expect(calls[0]?.ops.some(([op]) => op === 'neq')).toBe(false)
  })

  it('1 件取得は id で絞って maybeSingle（見えなければ null）', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    const res = await selectPlan(client, 'p1')
    expect(res.data).toBeNull()
    expect(calls[0]?.ops).toContainEqual(['eq', ['id', 'p1']])
  })

  it('管理画面は利用者 ID まで取る（メールは取らない）', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectPlansForAdmin(client)
    const select = argOf(calls[0], 'select') as string
    expect(select).toContain('user_id')
    expect(select).not.toContain('email')
  })
})

describe('survey_plans の書き込み (REQ-330)', () => {
  it('作るときは本人の user_id を送り、予定日を省けば DB の既定（日本時間の今日）に任せる', async () => {
    const { client, calls } = fakeClient({ data: PLAN, error: null })
    const saved = await insertPlan(client, { userId: 'user-1', title: '朝の調査' })
    expect(saved).toEqual(PLAN)
    const payload = argOf(calls[0], 'insert') as Record<string, unknown>
    expect(payload).toEqual({ user_id: 'user-1', title: '朝の調査', note: null })
  })

  it('予定日を渡せば planned_on に入れる', async () => {
    const { client, calls } = fakeClient({ data: PLAN, error: null })
    await insertPlan(client, { userId: 'user-1', title: 'x', plannedOn: '2026-10-02', note: 'メモ' })
    expect(argOf(calls[0], 'insert')).toMatchObject({ planned_on: '2026-10-02', note: 'メモ' })
  })

  it('作れなかったとき（上限 P0001 など）はそのまま投げる', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'P0001', message: '上限' } })
    await expect(insertPlan(client, { userId: 'u', title: 'x' })).rejects.toMatchObject({ code: 'P0001' })
  })

  it('変更は列名に直して送り、所有者は送らない。0 行（他人の計画・RLS 拒否）なら投げる', async () => {
    const ok = fakeClient({ data: [{ id: 'p1' }], error: null })
    await updatePlan(ok.client, 'p1', { title: '夕方', plannedOn: '2026-10-03', status: 'done', note: null })
    expect(argOf(ok.calls[0], 'update')).toEqual({ title: '夕方', planned_on: '2026-10-03', status: 'done', note: null })
    expect(ok.calls[0]?.ops).toContainEqual(['select', ['id']])

    await expect(updatePlan(fakeClient({ data: [], error: null }).client, 'p1', { title: 'y' })).rejects.toThrow()
    await expect(updatePlan(fakeClient({ data: [{ id: 'p1' }], error: null }).client, 'p1', {})).rejects.toThrow()
  })

  it('削除は 0 行なら投げ、1 行なら成功', async () => {
    await expect(deletePlan(fakeClient({ data: [], error: null }).client, 'p1')).rejects.toThrow()
    await expect(deletePlan(fakeClient({ data: [{ id: 'p1' }], error: null }).client, 'p1')).resolves.toBeUndefined()
  })
})

describe('この計画をもう一度使う (REQ-330)', () => {
  const stops = [
    { id: 's1', plan_id: 'old', sort_order: 3, name: '北の池', note: null, lat: 39.7, lng: 140.1, source: 'pin', source_id: null, status: 'done', visited_at: 't', created_at: 't' },
    { id: 's2', plan_id: 'old', sort_order: 7, name: null, note: 'メモ', lat: 39.8, lng: 140.2, source: 'private_spot', source_id: 'spot-1', status: 'skipped', visited_at: 't', created_at: 't' },
  ]

  it('同じ地点を同じ順番で、状態は未（送らない＝DB の既定）として新しい計画に入れる', async () => {
    const { client, calls } = fakeClient([
      { data: stops, error: null },
      { data: { ...PLAN, id: 'new' }, error: null },
      { data: [], error: null },
    ])
    const plan = await duplicatePlan(client, { userId: 'user-1', sourcePlanId: 'old', title: '再調査' })
    expect(plan.id).toBe('new')
    expect(calls.map((c) => c.table)).toEqual(['survey_plan_stops', 'survey_plans', 'survey_plan_stops'])
    expect(calls[0]?.ops).toContainEqual(['eq', ['plan_id', 'old']])
    const rows = argOf(calls[2], 'insert') as Record<string, unknown>[]
    expect(rows).toEqual([
      { plan_id: 'new', user_id: 'user-1', sort_order: 0, name: '北の池', note: null, lat: 39.7, lng: 140.1, source: 'pin', source_id: null },
      { plan_id: 'new', user_id: 'user-1', sort_order: 1, name: null, note: 'メモ', lat: 39.8, lng: 140.2, source: 'private_spot', source_id: 'spot-1' },
    ])
  })

  it('地点を保存できなければ、作った計画を消してから元のエラーを投げる', async () => {
    const { client, calls } = fakeClient([
      { data: stops, error: null },
      { data: { ...PLAN, id: 'new' }, error: null },
      { data: null, error: { code: 'P0001', message: '上限' } },
      { data: null, error: null },
    ])
    await expect(
      duplicatePlan(client, { userId: 'user-1', sourcePlanId: 'old', title: '再調査' })
    ).rejects.toMatchObject({ code: 'P0001' })
    expect(calls[3]?.table).toBe('survey_plans')
    expect(calls[3]?.ops.map(([op]) => op)).toContain('delete')
    expect(calls[3]?.ops).toContainEqual(['eq', ['id', 'new']])
  })
})
