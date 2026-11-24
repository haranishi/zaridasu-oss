import { describe, it, expect } from 'vitest'

import {
  OWN_RARE_SIGHTINGS_LIMIT,
  deleteRareSighting,
  hasOwnRareNear,
  insertRareKeepingRecord,
  insertRareSighting,
  selectOwnRarePointsInBox,
  selectOwnRareSightings,
  selectRareSightingsForAdmin,
  selectRareSightingsForStops,
  updateRareSighting,
  type NewRareSighting,
} from '../rareSightings'
import { argOf, fakeClient } from './fakeClient'

const ROW = {
  id: 'r1',
  client_id: 'c1',
  stop_id: null,
  species_key: 'medaka',
  species_label: null,
  count: 3,
  note: null,
  lat: 39.7,
  lng: 140.1,
  accuracy: 8,
  location_source: 'gps',
  observed_at: '2026-10-01T09:00:00Z',
  photo_paths: [],
  created_at: 't',
}

const NEW: NewRareSighting = {
  userId: 'user-1',
  clientId: 'c1',
  speciesKey: 'medaka',
  count: 3,
  lat: 39.7,
  lng: 140.1,
  accuracy: 8,
  locationSource: 'gps',
  observedAt: '2026-10-01T09:00:00Z',
}

describe('rare_sightings の読み取り (REQ-330)', () => {
  it('自分の記録を観察の新しい順・上限付きで取る', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectOwnRareSightings(client, 'user-1')
    expect(calls[0]?.table).toBe('rare_sightings')
    expect(calls[0]?.ops).toContainEqual(['eq', ['user_id', 'user-1']])
    expect(calls[0]?.ops).toContainEqual(['order', ['observed_at', { ascending: false }]])
    expect(calls[0]?.ops).toContainEqual(['limit', [OWN_RARE_SIGHTINGS_LIMIT]])
  })

  it('地点に付いた記録は地点 id で絞る（「希少種あり」の印と位置を伏せる判定用）', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectRareSightingsForStops(client, ['s1'])
    expect(calls[0]?.ops).toContainEqual(['in', ['stop_id', ['s1']]])
  })

  it('管理画面は利用者 ID まで取る（メールは取らない）', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectRareSightingsForAdmin(client)
    const select = argOf(calls[0], 'select') as string
    expect(select).toContain('user_id')
    expect(select).not.toContain('email')
  })
})

describe('rare_sightings の書き込み (REQ-330)', () => {
  it('記録するときは本人の user_id・端末の client_id を送り、写真が無ければ空の配列にする', async () => {
    const { client, calls } = fakeClient({ data: ROW, error: null })
    await expect(insertRareSighting(client, NEW)).resolves.toEqual({ sighting: ROW, duplicate: false })
    expect(argOf(calls[0], 'insert')).toEqual({
      user_id: 'user-1',
      client_id: 'c1',
      stop_id: null,
      species_key: 'medaka',
      species_label: null,
      count: 3,
      note: null,
      lat: 39.7,
      lng: 140.1,
      accuracy: 8,
      location_source: 'gps',
      observed_at: '2026-10-01T09:00:00Z',
      photo_paths: [],
    })
  })

  it('同じ client_id がもう入っていれば（再送）、入っている行を返して増やさない', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
      { data: ROW, error: null },
    ])
    await expect(insertRareSighting(client, NEW)).resolves.toEqual({ sighting: ROW, duplicate: true })
    expect(calls).toHaveLength(2)
    expect(calls[1]?.ops).toContainEqual(['eq', ['user_id', 'user-1']])
    expect(calls[1]?.ops).toContainEqual(['eq', ['client_id', 'c1']])
    expect(calls[1]?.ops.some(([op]) => op === 'insert')).toBe(false)
  })

  it('上限（P0001）や他人の写真パス（42501）はそのまま投げ、読み直さない', async () => {
    const limit = fakeClient({ data: null, error: { code: 'P0001', message: '上限' } })
    await expect(insertRareSighting(limit.client, NEW)).rejects.toMatchObject({ code: 'P0001' })
    expect(limit.calls).toHaveLength(1)
    const photo = fakeClient({ data: null, error: { code: '42501', message: '写真は自分のフォルダ' } })
    await expect(insertRareSighting(photo.client, { ...NEW, photoPaths: ['other/p.jpg'] })).rejects.toMatchObject({ code: '42501' })
  })

  it('重複のあとの読み直しが失敗したらその失敗を投げる', async () => {
    const { client } = fakeClient([
      { data: null, error: { code: '23505' } },
      { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    ])
    await expect(insertRareSighting(client, NEW)).rejects.toMatchObject({ code: 'PGRST116' })
  })

  it('変更は列名に直して送り、所有者と client_id は送らない。0 行なら投げる', async () => {
    const ok = fakeClient({ data: [{ id: 'r1' }], error: null })
    await updateRareSighting(ok.client, 'r1', { note: 'メモ', count: 0, photoPaths: ['user-1/a.jpg'], stopId: null })
    expect(argOf(ok.calls[0], 'update')).toEqual({ note: 'メモ', count: 0, photo_paths: ['user-1/a.jpg'], stop_id: null })
    await expect(updateRareSighting(fakeClient({ data: [], error: null }).client, 'r1', { note: 'x' })).rejects.toThrow()
    await expect(updateRareSighting(ok.client, 'r1', {})).rejects.toThrow()
  })

  it('削除は写真のパスを返し（実体を消すため）、0 行なら投げる', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'r1', photo_paths: ['user-1/a.jpg'] }], error: null })
    await expect(deleteRareSighting(client, 'r1')).resolves.toEqual({ photoPaths: ['user-1/a.jpg'] })
    expect(argOf(calls[0], 'select')).toBe('id, photo_paths')
    await expect(deleteRareSighting(fakeClient({ data: [], error: null }).client, 'r1')).rejects.toThrow()
  })
})

describe('記録を失わない保存 (REQ-330 点検 B7)', () => {
  it('付けた地点が自分の地点でない（42501）・もう無い（23503）と拒否されたら、地点を外して入れ直す', async () => {
    for (const code of ['42501', '23503']) {
      const { client, calls } = fakeClient([
        { data: null, error: { code, message: 'stop rejected' } },
        { data: { ...ROW, stop_id: null }, error: null },
      ])
      await expect(insertRareKeepingRecord(client, { ...NEW, stopId: 'stop-x' })).resolves.toMatchObject({
        stopDropped: true,
        duplicate: false,
      })
      expect(argOf(calls[0], 'insert')).toMatchObject({ stop_id: 'stop-x', client_id: 'c1' })
      // 同じ client_id のまま（記録は 1 件）
      expect(argOf(calls[1], 'insert')).toMatchObject({ stop_id: null, client_id: 'c1' })
    }
  })

  it('地点を付けていない記録や、上限（P0001）の失敗はそのまま投げる', async () => {
    const noStop = fakeClient({ data: null, error: { code: '42501', message: 'photo path' } })
    await expect(insertRareKeepingRecord(noStop.client, NEW)).rejects.toMatchObject({ code: '42501' })
    expect(noStop.calls).toHaveLength(1)
    const limit = fakeClient({ data: null, error: { code: 'P0001', message: '上限' } })
    await expect(insertRareKeepingRecord(limit.client, { ...NEW, stopId: 'stop-x' })).rejects.toMatchObject({ code: 'P0001' })
    expect(limit.calls).toHaveLength(1)
  })

  it('入れ直さずに済んだときは stopDropped: false', async () => {
    const { client } = fakeClient({ data: ROW, error: null })
    await expect(insertRareKeepingRecord(client, { ...NEW, stopId: 'stop-1' })).resolves.toMatchObject({ stopDropped: false })
  })
})

describe('場所での判定 (REQ-330 点検 B1)', () => {
  it('範囲の問い合わせは自分の記録だけを緯度経度の範囲で絞る', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectOwnRarePointsInBox(client, 'user-1', { minLat: 39.7, maxLat: 39.8, minLng: 140.0, maxLng: 140.2 })
    expect(calls[0]!.ops).toEqual(
      expect.arrayContaining([
        ['select', ['id, stop_id, lat, lng']],
        ['eq', ['user_id', 'user-1']],
        ['gte', ['lat', 39.7]],
        ['lte', ['lat', 39.8]],
        ['gte', ['lng', 140.0]],
        ['lte', ['lng', 140.2]],
      ])
    )
  })

  it('300 m 以内に自分の記録があれば true（地点の id は見ない）', async () => {
    const { client, calls } = fakeClient({ data: [{ id: 'r1', stop_id: 'old', lat: 39.7202, lng: 140.1 }], error: null })
    await expect(hasOwnRareNear(client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-new')).resolves.toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('近くに無ければ、その地点に付いた記録を確かめる。どちらも無ければ false', async () => {
    const yes = fakeClient([
      { data: [{ id: 'r1', stop_id: 'old', lat: 39.75, lng: 140.1 }], error: null },
      { data: [{ id: 'r2' }], error: null },
    ])
    await expect(hasOwnRareNear(yes.client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-1')).resolves.toBe(true)
    expect(yes.calls[1]!.ops).toEqual(expect.arrayContaining([['eq', ['stop_id', 'stop-1']]]))
    const no = fakeClient([
      { data: [], error: null },
      { data: [], error: null },
    ])
    await expect(hasOwnRareNear(no.client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-1')).resolves.toBe(false)
    const noStop = fakeClient({ data: [], error: null })
    await expect(hasOwnRareNear(noStop.client, 'user-1', { lat: 39.72, lng: 140.1 })).resolves.toBe(false)
    expect(noStop.calls).toHaveLength(1)
  })

  it('C8: 範囲検索が上限（1000 件）まで返ったら、取りこぼしがありうるので伏せる側に倒す（近いものが無くても true）', async () => {
    const far = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}`, stop_id: null, lat: 39.723 + i / 1e7, lng: 140.1 }))
    // 2 つ目の問い合わせ（その地点に付いた記録）は 0 件。それでも上限まで返ったので伏せる
    const { client, calls } = fakeClient([
      { data: far, error: null },
      { data: [], error: null },
    ])
    await expect(hasOwnRareNear(client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-1')).resolves.toBe(true)
    // 999 件（上限より少ない）なら、近くもその地点にも無いので false
    const under = fakeClient([
      { data: far.slice(1), error: null },
      { data: [], error: null },
    ])
    await expect(hasOwnRareNear(under.client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-1')).resolves.toBe(false)
    // 範囲検索は新しい順に並べて取る
    expect(calls[0]!.ops).toEqual(expect.arrayContaining([['order', ['observed_at', { ascending: false }]], ['limit', [1000]]]))
  })

  it('問い合わせの失敗は投げる（呼び出し側が伏せる側に倒す）', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(hasOwnRareNear(client, 'user-1', { lat: 39.72, lng: 140.1 }, 'stop-1')).rejects.toMatchObject({ code: '42501' })
  })
})
