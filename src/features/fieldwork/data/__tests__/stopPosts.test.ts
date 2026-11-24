import { describe, it, expect } from 'vitest'

import { linkStopPost, selectStopPosts, unlinkStopPost } from '../stopPosts'
import { argOf, fakeClient } from './fakeClient'

describe('survey_stop_posts (REQ-330)', () => {
  it('地点に付いたつながりを取る', () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    void selectStopPosts(client, ['s1', 's2'])
    expect(calls[0]?.table).toBe('survey_stop_posts')
    expect(calls[0]?.ops).toContainEqual(['in', ['stop_id', ['s1', 's2']]])
  })

  it('つなぐときは本人の user_id と種類を送る', async () => {
    const { client, calls } = fakeClient({ data: null, error: null })
    await expect(
      linkStopPost(client, { userId: 'user-1', stopId: 's1', postId: 'post-1', kind: 'absence' })
    ).resolves.toBe('created')
    expect(argOf(calls[0], 'insert')).toEqual({ stop_id: 's1', post_id: 'post-1', user_id: 'user-1', kind: 'absence' })
  })

  it('同じつながりがもう入っていれば（再送）成功として "existing" を返す', async () => {
    const { client } = fakeClient({ data: null, error: { code: '23505', message: 'duplicate key' } })
    await expect(
      linkStopPost(client, { userId: 'u', stopId: 's1', postId: 'post-1', kind: 'sighting' })
    ).resolves.toBe('existing')
  })

  it('他人の地点・他人の投稿（42501）は投げる', async () => {
    const { client } = fakeClient({ data: null, error: { code: '42501', message: 'row-level security' } })
    await expect(
      linkStopPost(client, { userId: 'u', stopId: 's1', postId: 'post-x', kind: 'sighting' })
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('外すときは地点と投稿の両方で絞り、0 行なら投げる', async () => {
    const ok = fakeClient({ data: [{ stop_id: 's1' }], error: null })
    await unlinkStopPost(ok.client, 's1', 'post-1')
    expect(ok.calls[0]?.ops).toContainEqual(['eq', ['stop_id', 's1']])
    expect(ok.calls[0]?.ops).toContainEqual(['eq', ['post_id', 'post-1']])
    await expect(unlinkStopPost(fakeClient({ data: [], error: null }).client, 's1', 'post-1')).rejects.toThrow()
  })
})
