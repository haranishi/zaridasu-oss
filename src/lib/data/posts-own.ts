// 本人の投稿の読み取り（RLS が、本人の行だけを返す）。公開の読み取りは posts.ts、書き込みは posts-write.ts。
//
// 座標・コメント・写真は、ここから出さない。マイページの「活動の記録（草）」は、いつ・どの種類を
// 記録したかだけを使うので、列はそれだけに絞る。

import { PUBLIC_POST_STATUS, type PostsClient } from './posts'

/** 草に数える状態。審査待ちも、投稿した日に数える。却下は数えない。 */
export const ACTIVITY_STATUSES: ('pending' | typeof PUBLIC_POST_STATUS)[] = ['pending', PUBLIC_POST_STATUS]

/**
 * マイページの「活動の記録」用。本人の審査待ち・承認済みの記録の、観察日・投稿日・種類・状態だけを新しい順に返す。
 * `sinceIso` 以降に投稿されたものに絞る（観察日は投稿日より前なので、過去1年に観察した記録は必ず含まれる）。
 * 呼び出し側で `.limit()` を続ける。
 */
export function selectMyActivityRows(client: PostsClient, userId: string, sinceIso: string) {
  return client
    .from('posts')
    .select('observed_at, created_at, info_type, status')
    .eq('user_id', userId)
    .in('status', ACTIVITY_STATUSES)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
}
