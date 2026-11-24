// REQ-330: 後から希少種を記録したとき、その場所の近くの地点につながる自分の投稿の位置を非公開にする。
//
// 先に「いた」「いなかった」で公開の投稿を作り、あとで同じ場所で希少種を見つけると、公開の投稿の位置から
// 希少種の池を推測されうる。記録できたら、その記録の地点と、記録から 300 m 以内の自分の地点（どの計画でも）に
// つながる自分の投稿を hidden にする。非公開化は一方向で、本人は公開に戻せない（DB のトリガーが保証）。
// 投稿の書き換えは posts-write.ts の hideOwnPostLocation だけを通す。

import { hideOwnPostLocation } from '@/lib/data/posts-write'
import { isNetworkError } from '@/lib/privateSpots'

import { boxAround, isNearAny, RARE_PROTECT_RADIUS_M } from '../lib/rareProximity'
import type { LatLngLite } from '../lib/positionRule'
import { selectStopPosts } from './stopPosts'
import { selectOwnStopsInBox, STOPS_IN_BOX_LIMIT } from './stops'
import type { FieldworkClient } from './shared'

/**
 * 近くの地点につながる自分の投稿を非公開にし、非公開にした投稿の数を返す。
 * 投稿が消えている（0 行）ものは飛ばす。通信の失敗は投げる（呼び出し側が送信待ちに積む）。
 */
export async function hideLinkedPostsNear(
  client: FieldworkClient,
  userId: string,
  point: LatLngLite,
  stopId: string | null
): Promise<number> {
  const stopIds = new Set<string>(stopId ? [stopId] : [])
  const box = boxAround([point], RARE_PROTECT_RADIUS_M)
  if (box) {
    const { data, error } = await selectOwnStopsInBox(client, userId, box)
    if (error) throw error
    // 上限まで返った＝取りこぼしがありうる。返った地点は範囲の中（約 420 m 以内）なので、伏せる側に倒して全部を対象にする
    const saturated = (data ?? []).length >= STOPS_IN_BOX_LIMIT
    for (const s of data ?? []) {
      if (saturated || isNearAny(s, [point])) stopIds.add(s.id)
    }
  }
  if (stopIds.size === 0) return 0
  const { data: links, error } = await selectStopPosts(client, [...stopIds])
  if (error) throw error
  const postIds = [...new Set((links ?? []).map((l) => l.post_id))]
  let hidden = 0
  for (const postId of postIds) {
    try {
      await hideOwnPostLocation(client, postId)
      hidden += 1
    } catch (err) {
      if (isNetworkError(err)) throw err
      // 消えた投稿・自分のものでない投稿（0 行）は飛ばす。ほかの投稿は続けて非公開にする
    }
  }
  return hidden
}
