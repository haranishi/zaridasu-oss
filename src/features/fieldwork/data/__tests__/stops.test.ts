import { describe, it, expect } from 'vitest'

import {
  deleteStop,
  insertStop,
  insertStops,
  nextSortOrder,
  reorderStops,
  selectStops,
  setStopStatus,
  updateStop,
} from '../stops'
import { argOf, fakeClient } from './fakeClient'

const STOP = {
  id: 's1',
  plan_id: 'p1',
  sort_order: 0,
  name: null,
  note: null,
  lat: 39.7,
  lng: 140.1,
  source: 'pin',
  source_id: null,
  status: 'pending',
  visited_at: null,
  created_at: 't',
}

describe('survey_plan_stops の読み取りと順番 (REQ-330)', () => {
  it('計画の地点を順番どおりに取る（同じ順番なら作った順）', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectStops(client, 'p1')
    expect(calls[0]?.table).toBe('survey_plan_stops')
    expect(calls[0]?.ops).toContainEqual(['eq', ['plan_id', 'p1']])
    const orders = calls[0]?.ops.filter(([op]) => op === 'order').map(([, args]) => args[0])
    expect(orders).toEqual(['sort_order', 'created_at'])
    // 1 計画 100 か所の上限は管理者に効かないので、100 では切らない（並べ替えは全地点が要る）
    const limit = calls[0]?.ops.find(([op]) => op === 'limit')?.[1][0] as number
    expect(limit).toBeGreaterThan(100)
  })

  it('次の順番は最大＋1（空なら 0・DB の上限 9999 を超えない）', () => {
    expect(nextSortOrder([])).toBe(0)
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 3 }, { sort_order: 1 }])).toBe(4)
    expect(nextSortOrder([{ sort_order: 9999 }])).toBe(9999)
  })

  it('並べ替えは RPC に計画と全地点の順番を渡す', async () => {
    const { client, rpcCalls } = fakeClient({ data: null, error: null })
    await reorderStops(client, 'p1', ['s2', 's1'])
    expect(rpcCalls).toEqual([['reorder_survey_plan_stops', { p_plan_id: 'p1', p_stop_ids: ['s2', 's1'] }]])
  })

  it('並べ替えを DB が拒否したら投げる（一部だけ・他人の計画）', async () => {
    const { client } = fakeClient({ data: null, error: null }, { data: null, error: { code: 'P0001', message: '変わっています' } })
    await expect(reorderStops(client, 'p1', ['s1'])).rejects.toMatchObject({ code: 'P0001' })
  })
})

describe('survey_plan_stops の書き込み (REQ-330)', () => {
  it('まとめて足すときは本人の user_id と計画を付け、順番を振る', async () => {
    const { client, calls } = fakeClient({ data: [STOP, { ...STOP, id: 's2' }], error: null })
    const rows = await insertStops(
      client,
      'user-1',
      'p1',
      [
        { lat: 39.7, lng: 140.1, source: 'pin' },
        { lat: 39.8, lng: 140.2, source: 'private_spot', sourceId: 'spot-1', name: 'メダカの池' },
      ],
      5
    )
    expect(rows).toHaveLength(2)
    expect(argOf(calls[0], 'insert')).toEqual([
      { plan_id: 'p1', user_id: 'user-1', sort_order: 5, name: null, note: null, lat: 39.7, lng: 140.1, source: 'pin', source_id: null },
      { plan_id: 'p1', user_id: 'user-1', sort_order: 6, name: 'メダカの池', note: null, lat: 39.8, lng: 140.2, source: 'private_spot', source_id: 'spot-1' },
    ])
  })

  it('空なら DB に行かない', async () => {
    const { client } = fakeClient({ data: [], error: null })
    await expect(insertStops(client, 'u', 'p1', [])).resolves.toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it('1 つ足すときは保存した行を返し、他人の計画（42501）や上限（P0001）は投げる', async () => {
    await expect(
      insertStop(fakeClient({ data: [STOP], error: null }).client, 'u', 'p1', { lat: 1, lng: 1, source: 'pin', sortOrder: 2 })
    ).resolves.toEqual(STOP)
    await expect(
      insertStop(fakeClient({ data: null, error: { code: '42501' } }).client, 'u', 'p1', { lat: 1, lng: 1, source: 'pin' })
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('済み・飛ばしは端末の時刻を残し、未に戻すと時刻を空にする', async () => {
    const done = fakeClient({ data: [{ id: 's1' }], error: null })
    await setStopStatus(done.client, 's1', 'done', '2026-10-01T09:00:00Z')
    expect(argOf(done.calls[0], 'update')).toEqual({ status: 'done', visited_at: '2026-10-01T09:00:00Z' })

    const undo = fakeClient({ data: [{ id: 's1' }], error: null })
    await setStopStatus(undo.client, 's1', 'pending', '2026-10-01T09:05:00Z')
    expect(argOf(undo.calls[0], 'update')).toEqual({ status: 'pending', visited_at: null })
  })

  it('変更・状態・削除は 0 行（他人の地点・RLS 拒否）なら投げる', async () => {
    const zero = () => fakeClient({ data: [], error: null }).client
    await expect(updateStop(zero(), 's1', { name: 'x' })).rejects.toThrow()
    await expect(setStopStatus(zero(), 's1', 'skipped', 't')).rejects.toThrow()
    await expect(deleteStop(zero(), 's1')).rejects.toThrow()
    await expect(updateStop(fakeClient({ data: [{ id: 's1' }], error: null }).client, 's1', {})).rejects.toThrow()
  })

  it('1 行でも影響があれば成功', async () => {
    const one = () => fakeClient({ data: [{ id: 's1' }], error: null }).client
    await expect(updateStop(one(), 's1', { note: 'メモ' })).resolves.toBeUndefined()
    await expect(deleteStop(one(), 's1')).resolves.toBeUndefined()
  })
})
