import { describe, expect, it } from 'vitest'

import { hideLinkedPostsNear } from '../protect'
import { fakeClient } from './fakeClient'

// REQ-330 点検 B3 と 2 周目 C8: 後から希少種を記録したら、記録の地点と 300 m 以内の自分の地点につながる
// 自分の投稿を非公開にする。範囲検索が上限まで返ったら、返った地点（範囲の中）を全部対象にする（伏せる側）。

const A = '00000000-0000-0000-0000-00000000aaaa'
const point = { lat: 39.72, lng: 140.1 }

describe('hideLinkedPostsNear', () => {
  it('300 m 以内の地点（と記録の地点）につながる投稿だけを非公開にする', async () => {
    const { client, calls } = fakeClient([
      { data: [{ id: 'near', lat: 39.7205, lng: 140.1 }, { id: 'far', lat: 39.73, lng: 140.1 }], error: null },
      { data: [{ stop_id: 'near', post_id: 'p1', kind: 'sighting', created_at: '' }], error: null },
      { data: [{ id: 'p1', location_disclosure: 'hidden' }], error: null },
    ])
    await expect(hideLinkedPostsNear(client, A, point, 'own-stop')).resolves.toBe(1)
    const inArg = calls[1]!.ops.find(([op]) => op === 'in')![1] as [string, string[]]
    expect(inArg[1].sort()).toEqual(['near', 'own-stop'])
    // 範囲検索は新しい順
    expect(calls[0]!.ops).toEqual(expect.arrayContaining([['order', ['created_at', { ascending: false }]]]))
  })

  it('C8: 範囲検索が上限（1000 件）まで返ったら、取りこぼしに備えて返った地点を全部対象にする', async () => {
    const stops = Array.from({ length: 1000 }, (_, i) => ({ id: `s${i}`, lat: 39.723, lng: 140.1 + i / 1e6 }))
    const { client, calls } = fakeClient([
      { data: stops, error: null },
      { data: [], error: null },
    ])
    await hideLinkedPostsNear(client, A, point, null)
    const inArg = calls[1]!.ops.find(([op]) => op === 'in')![1] as [string, string[]]
    expect(inArg[1]).toHaveLength(1000)
  })

  it('消えた投稿（0 行）は飛ばして続ける。通信の失敗は投げる（呼び手が送信待ちに積む）', async () => {
    const skipped = fakeClient([
      { data: [], error: null },
      { data: [{ stop_id: 'own', post_id: 'gone', kind: 'sighting', created_at: '' }, { stop_id: 'own', post_id: 'p2', kind: 'absence', created_at: '' }], error: null },
      { data: [], error: null },
      { data: [{ id: 'p2', location_disclosure: 'hidden' }], error: null },
    ])
    await expect(hideLinkedPostsNear(skipped.client, A, point, 'own')).resolves.toBe(1)
    const offline = fakeClient([{ data: null, error: { message: 'TypeError: Failed to fetch' } }])
    await expect(hideLinkedPostsNear(offline.client, A, point, 'own')).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' })
  })
})
