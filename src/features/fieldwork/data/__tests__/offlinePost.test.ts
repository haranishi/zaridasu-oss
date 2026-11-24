import { beforeEach, describe, expect, it } from 'vitest'

import { linkOfflinePost, mustHideOfflinePost } from '../offlinePost'
import { readQueue } from '../../lib/queue'
import { argOf, fakeClient } from './fakeClient'

// REQ-330（2 周目の点検 🔴1）: 圏外で下書きに入った「いた」を送るときの保護と地点とのつなぎ。
// 送る直前に近くの希少種を DB で確かめ（確かめられなければ伏せる）、送れたら地点とつなぐ。

const A = '00000000-0000-0000-0000-00000000aaaa'
const point = { lat: 39.72, lng: 140.1 }

beforeEach(() => localStorage.clear())

describe('mustHideOfflinePost', () => {
  it('300 m 以内に自分の記録があれば非公開にする', async () => {
    const { client } = fakeClient({ data: [{ id: 'r1', stop_id: null, lat: 39.7202, lng: 140.1 }], error: null })
    await expect(mustHideOfflinePost(client, A, point, 'stop-1')).resolves.toBe(true)
  })

  it('近くにもその地点にも無ければ公開のまま', async () => {
    const { client } = fakeClient([
      { data: [], error: null },
      { data: [], error: null },
    ])
    await expect(mustHideOfflinePost(client, A, point, 'stop-1')).resolves.toBe(false)
  })

  it('確かめられなかった（通信以外の失敗）ときは伏せる側に倒す', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'denied' } })
    await expect(mustHideOfflinePost(client, A, point, 'stop-1')).resolves.toBe(true)
  })

  it('通信の失敗は投げる（送らずに残し、あとで送り直す）', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(mustHideOfflinePost(client, A, point, 'stop-1')).rejects.toMatchObject({ message: 'TypeError: Failed to fetch' })
  })
})

describe('linkOfflinePost', () => {
  it('地点とつなぎ（sighting）、地点を「済み」にする', async () => {
    const { client, calls } = fakeClient([
      { data: null, error: null },
      { data: [{ id: 'stop-1' }], error: null },
    ])
    await expect(linkOfflinePost(client, A, 'stop-1', 'post-9', '2026-10-02T01:00:00.000Z')).resolves.toBe('linked')
    expect(argOf(calls[0], 'insert')).toEqual({ stop_id: 'stop-1', post_id: 'post-9', user_id: A, kind: 'sighting' })
    expect(argOf(calls[1], 'update')).toEqual({ status: 'done', visited_at: '2026-10-02T01:00:00.000Z' })
  })

  it('通信が切れたら調査の送信待ち（link）に積んで続きを任せる', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    await expect(linkOfflinePost(client, A, 'stop-1', 'post-9')).resolves.toBe('queued')
    expect(readQueue(A)).toMatchObject([{ type: 'link', userId: A, stopId: 'stop-1', postId: 'post-9', kind: 'sighting' }])
  })

  it('地点が消えた・自分の地点でないときは、つながずに終える（投稿はできている）', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23503', message: 'foreign key' } })
    await expect(linkOfflinePost(client, A, 'stop-gone', 'post-9')).resolves.toBe('skipped')
    expect(readQueue(A)).toEqual([])
  })
})
