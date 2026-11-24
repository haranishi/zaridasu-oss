import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  enqueue,
  flushQueue,
  MAX_QUEUE_ITEMS,
  patchQueued,
  queueStorageKey,
  readQueue,
  type QueueItem,
  type QueuedStatus,
} from '../queue'

// REQ-330 §3 圏外のとき / AC-07 / AC-08:
//   - 送信待ちは利用者ごとに分け、別の人がログインしても送らない
//   - 同じ client_id を二重に積まない・二重に送らない
//   - 圏外なら途中でやめ、電波が戻ったら残りを送る

const A = '00000000-0000-0000-0000-00000000aaaa'
const B = '00000000-0000-0000-0000-00000000bbbb'

function status(userId: string, clientId: string, stopId = 'stop-1'): QueuedStatus {
  return { type: 'status', clientId, userId, at: '2026-10-01T05:00:00.000Z', stopId, status: 'skipped' }
}

const networkError = (err: unknown) => err instanceof TypeError

beforeEach(() => localStorage.clear())

describe('送信待ちの保存', () => {
  it('利用者ごとに別のキーに入り、他人の分は読めない', () => {
    expect(enqueue(status(A, 'c1'))).toBe(true)
    expect(enqueue(status(B, 'c2'))).toBe(true)
    expect(queueStorageKey(A)).not.toBe(queueStorageKey(B))
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['c1'])
    expect(readQueue(B).map((i) => i.clientId)).toEqual(['c2'])
  })

  it('自分のキーに他人名義の項目が紛れ込んでいても返さない（書き換えへの備え）', () => {
    localStorage.setItem(queueStorageKey(A), JSON.stringify([status(A, 'c1'), status(B, 'c-forged')]))
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['c1'])
  })

  it('同じ client_id は 1 回しか積まない', () => {
    expect(enqueue(status(A, 'same'))).toBe(true)
    expect(enqueue(status(A, 'same'))).toBe(true)
    expect(readQueue(A)).toHaveLength(1)
  })

  it(`上限（${MAX_QUEUE_ITEMS} 件）を超えたら積まない（古いものを黙って捨てない）`, () => {
    for (let i = 0; i < MAX_QUEUE_ITEMS; i++) enqueue(status(A, `c${i}`))
    expect(enqueue(status(A, 'over'))).toBe(false)
    expect(readQueue(A)).toHaveLength(MAX_QUEUE_ITEMS)
    expect(readQueue(A)[0]!.clientId).toBe('c0')
  })

  it('壊れた保存内容・形の崩れた項目は読まない', () => {
    localStorage.setItem(queueStorageKey(A), '{not json')
    expect(readQueue(A)).toEqual([])
    localStorage.setItem(queueStorageKey(A), JSON.stringify([{ type: 'status', clientId: 'x', userId: A }, status(A, 'ok')]))
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['ok'])
  })

  it('送信の途中経過（作れた投稿の id）を書き残せる', () => {
    enqueue({
      type: 'absence',
      clientId: 'abs',
      userId: A,
      at: '2026-10-01T05:00:00.000Z',
      stopId: 's1',
      species: ['american', 'bullfrog'],
      surveyDurationMinutes: null,
      lat: 39.7,
      lng: 140.1,
      accuracy: null,
      locationSource: 'manual',
      locationPrivate: false,
      observedOn: '2026-10-01',
    })
    patchQueued(A, 'abs', { postIds: { american: 'post-1' } })
    const item = readQueue(A)[0]
    expect(item?.type === 'absence' && item.postIds).toEqual({ american: 'post-1' })
  })
})

describe('flushQueue', () => {
  it('積んだ順に送り、送れたものを消す', async () => {
    enqueue(status(A, 'c1'))
    enqueue(status(A, 'c2'))
    const sent: string[] = []
    const result = await flushQueue(A, async (item) => void sent.push(item.clientId), networkError)
    expect(sent).toEqual(['c1', 'c2'])
    expect(result.sent).toEqual(['c1', 'c2'])
    expect(readQueue(A)).toEqual([])
  })

  it('別の人の送信待ちは送らない', async () => {
    enqueue(status(A, 'mine-a'))
    enqueue(status(B, 'mine-b'))
    const send = vi.fn(async () => {})
    await flushQueue(B, send, networkError)
    expect(send).toHaveBeenCalledTimes(1)
    expect((send.mock.calls[0] as unknown as [QueueItem])[0].clientId).toBe('mine-b')
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['mine-a'])
  })

  it('同じ画面で 2 回同時に送り始めても、同じ client_id は 1 回しか送らない', async () => {
    enqueue(status(A, 'c1'))
    enqueue(status(A, 'c2'))
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const send = vi.fn(async () => {
      await gate
    })
    const first = flushQueue(A, send, networkError)
    const second = flushQueue(A, send, networkError)
    release()
    await Promise.all([first, second])
    const ids = (send.mock.calls as unknown as [QueueItem][]).map(([item]) => item.clientId)
    expect(ids.filter((id) => id === 'c1')).toHaveLength(1)
    expect(ids.filter((id) => id === 'c2')).toHaveLength(1)
    expect(readQueue(A)).toEqual([])
  })

  it('圏外（通信エラー）なら途中でやめ、残りは次に送る', async () => {
    enqueue(status(A, 'c1'))
    enqueue(status(A, 'c2'))
    const send = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await flushQueue(A, send, networkError)
    expect(result.interrupted).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(readQueue(A).map((i) => i.clientId)).toEqual(['c1', 'c2'])
  })

  it('送り直しても通らない失敗は理由を書き残して残し、次の項目へ進む', async () => {
    enqueue(status(A, 'bad'))
    enqueue(status(A, 'good'))
    const send = vi.fn(async (item: QueueItem) => {
      if (item.clientId === 'bad') throw Object.assign(new Error('rls'), { code: '42501' })
    })
    const result = await flushQueue(A, send, networkError)
    expect(result.sent).toEqual(['good'])
    expect(result.failed.map((f) => f.clientId)).toEqual(['bad'])
    expect(readQueue(A)).toMatchObject([{ clientId: 'bad', lastError: '42501' }])
  })

  it('B8: Web Locks の無い端末で、2 本目（別のタブ）が先に終わっても、送り終えた項目は送り直さない（送る直前に読み直す）', async () => {
    enqueue(status(A, 'c1'))
    enqueue(status(A, 'c2'))
    // 別のタブ＝送信中の印（inFlight）を共有しない、もう 1 つの部品の読み込み
    vi.resetModules()
    const otherTab = await import('../queue')
    expect(otherTab.flushQueue).not.toBe(flushQueue)
    let releaseFirst!: () => void
    const firstGate = new Promise<void>((r) => (releaseFirst = r))
    const sent: string[] = []
    // 1 本目: 一覧を読み、c1 を送っている途中で止まる
    const first = flushQueue(
      A,
      async (item) => {
        sent.push(`first:${item.clientId}`)
        if (item.clientId === 'c1') await firstGate
      },
      networkError
    )
    // 2 本目: 先に全部送り終える
    await otherTab.flushQueue(
      A,
      async (item) => {
        sent.push(`second:${item.clientId}`)
      },
      networkError
    )
    expect(readQueue(A)).toEqual([])
    releaseFirst()
    await first
    // c2 は 2 本目が送り終えていた。1 本目が読んだときの写しで送り直さない
    expect(sent.filter((s) => s.endsWith(':c2'))).toEqual(['second:c2'])
    expect(readQueue(A)).toEqual([])
  })

  it('送る関数に途中経過の保存口を渡す', async () => {
    enqueue(status(A, 'c1'))
    let seen: QueueItem[] = []
    await flushQueue(
      A,
      async (_item, save) => {
        save({ lastError: 'progress' })
        seen = readQueue(A)
        throw Object.assign(new Error('stop'), { code: 'P0001' })
      },
      networkError
    )
    expect(seen[0]).toMatchObject({ clientId: 'c1', lastError: 'progress' })
  })
})
