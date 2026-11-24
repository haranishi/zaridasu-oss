import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/experiments', () => ({ getMyExperimentVariants: () => Promise.resolve({}) }))
vi.mock('@/lib/reverseGeocodeMunicipality', () => ({ lookupMunicipality: () => Promise.resolve('秋田市') }))

import { sendQueuedItem } from '../sendQueued'
import { argOf, fakeClient } from './fakeClient'

// REQ-330 AC-07: 送信待ちは電波が戻ると 1 回だけ送られる。どの種類も送り直して増えない形で送る。

const base = { userId: 'user-1', at: '2026-10-01T05:00:00.000Z' }

describe('sendQueuedItem', () => {
  it('飛ばす（理由つき）: メモを書いてから状態を変える。時刻は押したときのもの', async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: 's1' }], error: null },
      { data: [{ id: 's1' }], error: null },
    ])
    await sendQueuedItem(client, { ...base, type: 'status', clientId: 'c1', stopId: 's1', status: 'skipped', note: '増水' }, vi.fn())
    expect(argOf(calls[0], 'update')).toEqual({ note: '増水' })
    expect(argOf(calls[1], 'update')).toEqual({ status: 'skipped', visited_at: base.at })
  })

  it('元に戻す: 状態だけ（visited_at は空）', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 's1' }], error: null })
    await sendQueuedItem(client, { ...base, type: 'status', clientId: 'c2', stopId: 's1', status: 'pending' }, vi.fn())
    expect(calls).toHaveLength(1)
    expect(argOf(calls[0], 'update')).toEqual({ status: 'pending', visited_at: null })
  })

  const rareItem = {
    ...base,
    type: 'rare' as const,
    clientId: 'cid-1',
    stopId: 's1',
    speciesKey: 'medaka',
    speciesLabel: null,
    count: 3,
    note: null,
    lat: 39.7,
    lng: 140.1,
    accuracy: 8,
    locationSource: 'gps' as const,
    observedAt: '2026-10-01T04:55:00.000Z',
  }

  it('希少種: 端末の client_id のまま記録し（DB が二重登録を弾く）、地点を「済み」にし、近くの地点の投稿を非公開にする（B3）', async () => {
    const row = { id: 'r1', client_id: 'cid-1', species_key: 'medaka', stop_id: 's1', lat: 39.7, lng: 140.1 }
    const { client, calls } = fakeClient([
      { data: row, error: null },
      { data: [{ id: 's1' }], error: null },
      // 記録の周りの自分の地点: s1 は記録の場所、s-far は約 11 km 先
      { data: [{ id: 's1', lat: 39.7, lng: 140.1 }, { id: 's-far', lat: 39.8, lng: 140.1 }], error: null },
      { data: [{ stop_id: 's1', post_id: 'post-9', kind: 'sighting', created_at: '' }], error: null },
      { data: [{ id: 'post-9', location_disclosure: 'hidden' }], error: null },
    ])
    await sendQueuedItem(client, rareItem, vi.fn())
    expect(calls.map((c) => c.table)).toEqual(['rare_sightings', 'survey_plan_stops', 'survey_plan_stops', 'survey_stop_posts', 'posts'])
    expect(argOf(calls[0], 'insert')).toMatchObject({ client_id: 'cid-1', user_id: 'user-1', stop_id: 's1', photo_paths: [] })
    expect(argOf(calls[3], 'in')).toBe('stop_id')
    expect(calls[3]!.ops).toEqual(expect.arrayContaining([['in', ['stop_id', ['s1']]]]))
    expect(argOf(calls[4], 'update')).toEqual({ location_disclosure: 'hidden' })
    expect(calls[4]!.ops).toEqual(expect.arrayContaining([['eq', ['id', 'post-9']]]))
  })

  it('希少種: 地点が自分のものでないと拒否されたら、地点を外して記録し（記録は失わない）、地点の状態は変えない（B7）', async () => {
    const row = { id: 'r1', client_id: 'cid-1', species_key: 'medaka', stop_id: null, lat: 39.7, lng: 140.1 }
    const { client, calls } = fakeClient([
      { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } },
      { data: row, error: null },
      { data: [], error: null },
    ])
    await sendQueuedItem(client, rareItem, vi.fn())
    expect(argOf(calls[1], 'insert')).toMatchObject({ client_id: 'cid-1', stop_id: null })
    // 状態の更新（survey_plan_stops の update）はしない。続くのは近くの地点の問い合わせだけ
    expect(calls.slice(2).map((c) => c.table)).toEqual(['survey_plan_stops'])
    expect(argOf(calls[2], 'update')).toBeUndefined()
  })

  it('非公開化の続き（protect）: 記録の近くの地点につながる自分の投稿を非公開にする', async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: 's7', lat: 39.7001, lng: 140.1 }], error: null },
      { data: [{ stop_id: 's7', post_id: 'post-1', kind: 'absence', created_at: '' }], error: null },
      { data: [{ id: 'post-1', location_disclosure: 'hidden' }], error: null },
    ])
    await sendQueuedItem(client, { ...base, type: 'protect', clientId: 'pr1', lat: 39.7, lng: 140.1, rareStopId: null }, vi.fn())
    expect(calls.map((c) => c.table)).toEqual(['survey_plan_stops', 'survey_stop_posts', 'posts'])
    expect(argOf(calls[2], 'update')).toEqual({ location_disclosure: 'hidden' })
  })

  it('いなかった: 作れた投稿の id を途中経過として書き残す', async () => {
    const { client } = fakeClient([
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 's1' }], error: null },
    ])
    const save = vi.fn()
    await sendQueuedItem(
      client,
      {
        ...base,
        type: 'absence',
        clientId: 'abs',
        stopId: 's1',
        species: ['american'],
        surveyDurationMinutes: null,
        lat: 39.7,
        lng: 140.1,
        accuracy: null,
        locationSource: 'manual',
        locationPrivate: true,
        observedOn: '2026-10-01',
      },
      save
    )
    expect(save).toHaveBeenCalledWith({ postIds: { american: 'post-a' } })
  })

  it('つながり: 地点と投稿をつないで「済み」にする', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: null },
      { data: [{ id: 's1' }], error: null },
    ])
    await sendQueuedItem(client, { ...base, type: 'link', clientId: 'l1', stopId: 's1', postId: 'p9', kind: 'sighting' }, vi.fn())
    expect(argOf(calls[0], 'insert')).toEqual({ stop_id: 's1', post_id: 'p9', user_id: 'user-1', kind: 'sighting' })
  })
})
