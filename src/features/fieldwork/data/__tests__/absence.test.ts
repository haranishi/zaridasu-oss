import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildPostInsertRow } from '@/lib/data/posts-write'

vi.mock('@/lib/experiments', () => ({ getMyExperimentVariants: () => Promise.resolve({ ai_feedback: 'control' }) }))
const geo = vi.hoisted(() => ({ lookupMunicipality: vi.fn() }))
vi.mock('@/lib/reverseGeocodeMunicipality', () => ({ lookupMunicipality: geo.lookupMunicipality }))

import { absencePost, recordAbsence, type AbsenceInput } from '../absence'
import { argOf, fakeClient } from './fakeClient'

// REQ-330 AC-05: 「いなかった」は種ごとに不在の投稿（structured）になり、地点とつながって「済み」になる。
// 承認は DB が決める（管理者以外は protect_post_insert_columns が pending に戻す）。
// 希少種の記録の近く（300 m 以内・場所で判定）では location_disclosure が hidden。画面の判定が外れていても
// 作る直前に DB で確かめる（点検 B1）。投稿の行は posts-write の buildPostInsertRow だけが作る。
// 市区町村は投稿フォームと同じ逆ジオコーディングで入れる（点検 B11）。

const input: AbsenceInput = {
  userId: 'user-1',
  stopId: 'stop-1',
  species: ['american', 'bullfrog'],
  surveyDurationMinutes: 30,
  lat: 39.72,
  lng: 140.1,
  accuracy: 12,
  locationSource: 'gps',
  locationPrivate: false,
  observedOn: '2026-10-01',
  at: '2026-10-01T05:00:00.000Z',
}

/** 作る直前の確かめ（範囲の問い合わせ → 地点に付いた記録の問い合わせ）が「無い」と返す分。 */
const NO_RARE = [
  { data: [], error: null },
  { data: [], error: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  geo.lookupMunicipality.mockResolvedValue('秋田市')
})

describe('absencePost', () => {
  it('不在・structured・写真なしの行になり、非公開でなければ位置の公開範囲は DB の既定に任せる（承認は DB が決める）', () => {
    const row = buildPostInsertRow(absencePost(input, 'american', {}))
    expect(row).toMatchObject({
      user_id: 'user-1',
      species: 'american',
      info_type: 'absence',
      status: 'approved',
      survey_method: 'structured',
      survey_duration_minutes: 30,
      accuracy: 12,
      location_source: 'gps',
      photos: null,
      comment: null,
    })
    expect(row).not.toHaveProperty('location_disclosure')
  })

  it('希少種のある地点（locationPrivate）なら hidden で送る', () => {
    const row = buildPostInsertRow(absencePost({ ...input, locationPrivate: true }, 'american', {}))
    expect(row.location_disclosure).toBe('hidden')
  })

  it('地点の座標を使ったとき（manual）は誤差を送らない', () => {
    const row = buildPostInsertRow(absencePost({ ...input, locationSource: 'manual', accuracy: 80 }, 'bullfrog', {}))
    expect(row).toMatchObject({ location_source: 'manual', accuracy: null })
  })
})

describe('recordAbsence', () => {
  it('作る直前に希少種の記録を確かめ、種ごとに投稿を作り、地点とつなぎ、最後に地点を「済み」にする', async () => {
    const { client, calls } = fakeClient([
      ...NO_RARE,
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: { id: 'post-b' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    const onPosted = vi.fn()
    await expect(recordAbsence(client, input, { onPosted })).resolves.toEqual(['post-a', 'post-b'])
    expect(calls.map((c) => c.table)).toEqual([
      'rare_sightings',
      'rare_sightings',
      'posts',
      'survey_stop_posts',
      'posts',
      'survey_stop_posts',
      'survey_plan_stops',
    ])
    // 自分の記録だけを、位置の周りの範囲で絞って問い合わせる
    expect(calls[0]!.ops).toEqual(
      expect.arrayContaining([
        ['eq', ['user_id', 'user-1']],
        ['gte', ['lat', expect.any(Number)]],
        ['lte', ['lat', expect.any(Number)]],
      ])
    )
    expect(argOf(calls[2], 'insert')).toMatchObject({
      species: 'american',
      info_type: 'absence',
      municipality: '秋田市',
      experiment_assignments: { ai_feedback: 'control' },
    })
    expect(argOf(calls[2], 'insert')).not.toHaveProperty('location_disclosure')
    expect(argOf(calls[3], 'insert')).toEqual({ stop_id: 'stop-1', post_id: 'post-a', user_id: 'user-1', kind: 'absence' })
    expect(argOf(calls[6], 'update')).toEqual({ status: 'done', visited_at: input.at })
    expect(onPosted.mock.calls).toEqual([
      ['american', 'post-a'],
      ['bullfrog', 'post-b'],
    ])
    expect(geo.lookupMunicipality).toHaveBeenCalledWith(39.72, 140.1)
  })

  it('B1: 画面が「希少種なし」と判定していても、300 m 以内に自分の記録があれば hidden で作る（もう一度使った計画の新しい地点）', async () => {
    const { client, calls } = fakeClient([
      // 前の計画の地点（stop-old）に付いた記録。いまの地点 stop-1 の id とは別だが、約 60 m の距離
      { data: [{ id: 'r1', stop_id: 'stop-old', lat: 39.7205, lng: 140.1 }], error: null },
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'], locationPrivate: false })
    expect(calls.map((c) => c.table)).toEqual(['rare_sightings', 'posts', 'survey_stop_posts', 'survey_plan_stops'])
    expect(argOf(calls[1], 'insert')).toMatchObject({ location_disclosure: 'hidden' })
  })

  it('B1: 300 m より遠い記録しか無ければ公開のまま（距離は端末で測り直す）', async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: 'r1', stop_id: 'stop-old', lat: 39.73, lng: 140.1 }], error: null },
      { data: [], error: null },
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'] })
    expect(argOf(calls[2], 'insert')).not.toHaveProperty('location_disclosure')
  })

  it('B1: その地点に付いた記録があれば（座標が離れていても）hidden で作る', async () => {
    const { client, calls } = fakeClient([
      { data: [], error: null },
      { data: [{ id: 'r2' }], error: null },
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'] })
    expect(argOf(calls[1], 'eq')).toEqual('user_id')
    expect(calls[1]!.ops).toEqual(expect.arrayContaining([['eq', ['stop_id', 'stop-1']]]))
    expect(argOf(calls[2], 'insert')).toMatchObject({ location_disclosure: 'hidden' })
  })

  it('B1: 確かめられなかった（通信以外の失敗）ときは伏せる側に倒す', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: { code: '42501', message: 'permission denied' } },
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'] })
    expect(argOf(calls[1], 'insert')).toMatchObject({ location_disclosure: 'hidden' })
  })

  it('B1: 確かめる途中で通信が切れたら、投稿を作らずに投げる（送信待ちに積み直す）', async () => {
    const { client, calls } = fakeClient([{ data: null, error: { message: 'TypeError: Failed to fetch' } }])
    await expect(recordAbsence(client, input)).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' })
    expect(calls.map((c) => c.table)).toEqual(['rare_sightings'])
  })

  it('C5: 位置を非公開にする不在では、逆ジオコーディングに座標を小数 2 桁（約 1 km）に丸めて渡す', async () => {
    const { client } = fakeClient([
      { data: [{ id: 'r1', stop_id: 'old', lat: 39.72345, lng: 140.10123 }], error: null },
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'], lat: 39.72345, lng: 140.10123 })
    expect(geo.lookupMunicipality).toHaveBeenCalledWith(39.72, 140.1)
  })

  it('公開のままの不在は、そのままの座標で引く', async () => {
    const { client } = fakeClient([
      ...NO_RARE,
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'], lat: 39.72345, lng: 140.10123 })
    expect(geo.lookupMunicipality).toHaveBeenCalledWith(39.72345, 140.10123)
  })

  it('画面が非公開と決めているときは確かめずに hidden。市区町村が渡されていれば引き直さない', async () => {
    const { client, calls } = fakeClient([
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'], locationPrivate: true, municipality: '男鹿市' })
    expect(calls.map((c) => c.table)).toEqual(['posts', 'survey_stop_posts', 'survey_plan_stops'])
    expect(argOf(calls[0], 'insert')).toMatchObject({ location_disclosure: 'hidden', municipality: '男鹿市' })
    expect(geo.lookupMunicipality).not.toHaveBeenCalled()
  })

  it('市区町村を引けなければ空で作る（記録は止めない）', async () => {
    geo.lookupMunicipality.mockResolvedValueOnce(null)
    const { client, calls } = fakeClient([
      ...NO_RARE,
      { data: { id: 'post-a' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, { ...input, species: ['american'] })
    expect(argOf(calls[2], 'insert')).toMatchObject({ municipality: null })
  })

  it('前の送信で作れていた種の投稿は作り直さない（送信待ちの再送）', async () => {
    const { client, calls } = fakeClient([
      ...NO_RARE,
      { data: null, error: null },
      { data: { id: 'post-b' }, error: null },
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await recordAbsence(client, input, { postIds: { american: 'post-a' } })
    expect(calls.map((c) => c.table)).toEqual([
      'rare_sightings',
      'rare_sightings',
      'survey_stop_posts',
      'posts',
      'survey_stop_posts',
      'survey_plan_stops',
    ])
    expect(argOf(calls[2], 'insert')).toMatchObject({ post_id: 'post-a' })
  })

  it('投稿の上限（P0001）などの失敗は投げる', async () => {
    const { client } = fakeClient([...NO_RARE, { data: null, error: { code: 'P0001', message: '投稿上限に達しました' } }])
    await expect(recordAbsence(client, input)).rejects.toMatchObject({ code: 'P0001' })
  })

  it('種が空なら何も送らずに投げる', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    await expect(recordAbsence(client, { ...input, species: [] })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})
