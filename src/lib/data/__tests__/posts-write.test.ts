import { describe, it, expect, vi } from 'vitest'
import { hideOwnPostLocation, type PostsWriteClient } from '../posts-write'

function fakeClient(result: { data: unknown; error: unknown }) {
  const update = vi.fn()
  const builder = {
    update: vi.fn((fields: unknown) => { update(fields); return builder }),
    eq: vi.fn(() => builder),
    select: vi.fn(() => Promise.resolve(result)),
  }
  const client = { from: vi.fn(() => builder) }
  return { client: client as unknown as PostsWriteClient, update }
}

describe('hideOwnPostLocation (REQ-329)', () => {
  it('location_disclosure を hidden にする UPDATE を送る', async () => {
    const { client, update } = fakeClient({ data: [{ id: 'p1', location_disclosure: 'hidden' }], error: null })
    await expect(hideOwnPostLocation(client, 'p1')).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledWith({ location_disclosure: 'hidden' })
  })

  it('0 行（他人の投稿・存在しない）なら投げる', async () => {
    const { client } = fakeClient({ data: [], error: null })
    await expect(hideOwnPostLocation(client, 'p1')).rejects.toThrow()
  })

  it('DB が値を戻した（hidden にならなかった）ら投げる', async () => {
    const { client } = fakeClient({ data: [{ id: 'p1', location_disclosure: 'coarsened' }], error: null })
    await expect(hideOwnPostLocation(client, 'p1')).rejects.toThrow()
  })

  it('エラーはそのまま投げる', async () => {
    const { client } = fakeClient({ data: null, error: new Error('boom') })
    await expect(hideOwnPostLocation(client, 'p1')).rejects.toThrow('boom')
  })
})
