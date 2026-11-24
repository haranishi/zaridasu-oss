import { describe, expect, it } from 'vitest'

import type { PostsClient } from '../posts'
import { ACTIVITY_STATUSES, selectMyActivityRows } from '../posts-own'

/** 組み立てたクエリの中身を記録するだけの偽クライアント。 */
function recordingClient() {
  const calls = {
    table: '',
    select: '',
    eq: [] as [string, unknown][],
    in: [] as [string, unknown][],
    gte: [] as [string, unknown][],
    order: [] as [string, unknown][],
  }
  const builder = {
    select(select: string) { calls.select = select; return builder },
    eq(column: string, value: unknown) { calls.eq.push([column, value]); return builder },
    in(column: string, values: unknown) { calls.in.push([column, values]); return builder },
    gte(column: string, value: unknown) { calls.gte.push([column, value]); return builder },
    order(column: string, options: unknown) { calls.order.push([column, options]); return builder },
  }
  const client = { from(table: string) { calls.table = table; return builder } }
  return { client: client as unknown as PostsClient, calls }
}

describe('selectMyActivityRows（マイページの「活動の記録」の材料）', () => {
  it('本人の、審査待ち・承認済みの記録だけを、投稿が新しい順に、指定の日時以降で取る', () => {
    const { client, calls } = recordingClient()
    selectMyActivityRows(client, 'user-1', '2025-10-19T15:00:00.000Z')
    expect(calls.table).toBe('posts')
    expect(calls.eq).toEqual([['user_id', 'user-1']])
    expect(calls.in).toEqual([['status', ['pending', 'approved']]])
    expect(calls.gte).toEqual([['created_at', '2025-10-19T15:00:00.000Z']])
    expect(calls.order).toEqual([['created_at', { ascending: false }]])
  })

  it('却下は数えない（状態に rejected を含めない）', () => {
    expect(ACTIVITY_STATUSES).not.toContain('rejected')
  })

  it('使う列は、観察日・投稿日・種類・状態だけ。座標・コメント・写真は取らない', () => {
    const { client, calls } = recordingClient()
    selectMyActivityRows(client, 'user-1', '2025-10-19T15:00:00.000Z')
    expect(calls.select.split(',').map(column => column.trim())).toEqual(['observed_at', 'created_at', 'info_type', 'status'])
    expect(calls.select).not.toMatch(/lat|lng|comment|photos|municipality|user_id/)
  })
})
