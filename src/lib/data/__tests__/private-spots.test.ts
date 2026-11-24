import { describe, it, expect, vi } from 'vitest'
import {
  OWN_SPOTS_LIMIT,
  deletePrivateSpot,
  insertPrivateSpot,
  renamePrivateSpot,
  selectOwnPrivateSpots,
  selectPrivateSpotsForAdmin,
  type PrivateSpotsClient,
} from '../private-spots'

/** 組み立てたクエリを記録し、終端（await / single）で決めた結果を返す偽クライアント。 */
function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; ops: [string, unknown[]][] } = { ops: [] }
  const builder: Record<string, unknown> = {}
  for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']) {
    builder[op] = vi.fn((...args: unknown[]) => {
      calls.ops.push([op, args])
      return builder
    })
  }
  builder.single = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  const client = {
    from: vi.fn((table: string) => {
      calls.table = table
      return builder
    }),
  }
  return { client: client as unknown as PrivateSpotsClient, calls }
}

describe('private_spots の読み取り (REQ-329)', () => {
  it('自分の分だけを新しい順・上限付きで取る', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectOwnPrivateSpots(client, 'user-1')
    expect(calls.table).toBe('private_spots')
    expect(calls.ops).toContainEqual(['eq', ['user_id', 'user-1']])
    expect(calls.ops).toContainEqual(['order', ['recorded_at', { ascending: false }]])
    expect(calls.ops).toContainEqual(['limit', [OWN_SPOTS_LIMIT]])
  })

  it('管理画面は利用者 ID まで取る（メールは取らない）', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectPrivateSpotsForAdmin(client)
    const select = calls.ops.find(([op]) => op === 'select')?.[1][0] as string
    expect(select).toContain('user_id')
    expect(select).not.toContain('email')
  })
})

describe('private_spots の書き込み (REQ-329)', () => {
  it('保存は本人の user_id と記録時刻を送る', async () => {
    const row = { id: 's1', name: 'x', note: null, lat: 39.7, lng: 140.1, accuracy: null, recorded_at: 't', created_at: 't' }
    const { client, calls } = fakeClient({ data: row, error: null })
    const saved = await insertPrivateSpot(client, {
      userId: 'user-1', name: 'x', note: null, lat: 39.7, lng: 140.1, accuracy: null, recordedAt: '2026-09-26T00:00:00Z',
    })
    expect(saved).toEqual(row)
    const payload = calls.ops.find(([op]) => op === 'insert')?.[1][0] as Record<string, unknown>
    expect(payload).toMatchObject({ user_id: 'user-1', recorded_at: '2026-09-26T00:00:00Z' })
  })

  it('保存のエラーはそのまま投げる', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'P0001', message: '上限' } })
    await expect(
      insertPrivateSpot(client, { userId: 'u', name: 'x', note: null, lat: 1, lng: 1, accuracy: null, recordedAt: 't' })
    ).rejects.toMatchObject({ code: 'P0001' })
  })

  it('名前変更・削除は 0 行（RLS 拒否・他人のスポット）なら投げる', async () => {
    await expect(renamePrivateSpot(fakeClient({ data: [], error: null }).client, 's1', { name: 'y' })).rejects.toThrow()
    await expect(deletePrivateSpot(fakeClient({ data: [], error: null }).client, 's1')).rejects.toThrow()
  })

  it('1 行でも影響があれば成功', async () => {
    await expect(renamePrivateSpot(fakeClient({ data: [{ id: 's1' }], error: null }).client, 's1', { name: 'y' })).resolves.toBeUndefined()
    await expect(deletePrivateSpot(fakeClient({ data: [{ id: 's1' }], error: null }).client, 's1')).resolves.toBeUndefined()
  })
})
