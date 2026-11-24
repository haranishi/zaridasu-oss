// REQ-330: 地点と投稿のつながり（survey_stop_posts）。
//
// posts に列を足すと anon から見える（posts の全列に列単位の GRANT が付いている）ので、別表に置く。
// 見えるのは本人と管理者だけ。つなげられるのは「自分の地点」と「自分の投稿」だけで、管理者も同じ。
// 作るか消すかだけ（UPDATE の権限が無い）。主キーが（地点, 投稿）なので、送信待ちの再送で
// 同じつながりが 2 回届いても増えない（2 回目は一意制約違反＝もう入っている）。

import { assertAffected, isUniqueViolation, type FieldworkClient, type FieldworkTables } from './shared'

type LinkRow = FieldworkTables['survey_stop_posts']['Row']

export type StopPostKind = LinkRow['kind']

export type SurveyStopPost = Pick<LinkRow, 'stop_id' | 'post_id' | 'kind' | 'created_at'>

/** 地点に付いた投稿のつながり。 */
export function selectStopPosts(client: FieldworkClient, stopIds: readonly string[]) {
  return client
    .from('survey_stop_posts')
    .select('stop_id, post_id, kind, created_at')
    .in('stop_id', [...stopIds])
    .order('created_at', { ascending: true })
}

/**
 * 地点と投稿をつなぐ。`'existing'` は「もう入っていた」（前の送信が届いていた）。
 * 他人の地点・他人の投稿は 42501 の例外。
 */
export async function linkStopPost(
  client: FieldworkClient,
  link: { userId: string; stopId: string; postId: string; kind: StopPostKind }
): Promise<'created' | 'existing'> {
  const { error } = await client.from('survey_stop_posts').insert({
    stop_id: link.stopId,
    post_id: link.postId,
    user_id: link.userId,
    kind: link.kind,
  })
  if (!error) return 'created'
  if (isUniqueViolation(error)) return 'existing'
  throw error
}

/** つながりを外す。0 行なら投げる。 */
export async function unlinkStopPost(client: FieldworkClient, stopId: string, postId: string): Promise<void> {
  const { data, error } = await client
    .from('survey_stop_posts')
    .delete()
    .eq('stop_id', stopId)
    .eq('post_id', postId)
    .select('stop_id')
  if (error) throw error
  assertAffected(data, 'つながりの削除')
}
