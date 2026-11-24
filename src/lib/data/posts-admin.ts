// 管理画面から posts を読み書きする層。公開読み取りは posts.ts、こちらは審査・削除。
//
// ここに集める理由は 2 つあって、どちらも「書き忘れると静かに壊れる」たぐいのもの。
//
// **1. 審査スタンプ。** 承認・却下は status だけでなく `reviewed_at` と `reviewed_by` を必ず
// 一緒に書く。3 箇所（単発承認・単発却下・一括承認）に同じ組み立てが写されていた。
//
// **2. 影響行の確認。** UPDATE / DELETE が RLS で拒否されても **エラーにはならず 0 行更新で
// 成功として返る**。`.select('id')` を付けて返り row を数えない限り、権限が無いのに
// 「承認しました」と出る。移行前は一括操作にだけ付いていて、**単発の承認・却下には
// 付いていなかった**（＝単発はサイレント失敗しうる穴があった）。この層を通せば全部に付く。
//
// 読み取りの列は `lib/admin/columns.ts` の ADMIN_POSTS_LIST_COLUMNS が正。ここでは持たない。

import type { SupabaseClient } from '@supabase/supabase-js'

import { ADMIN_POSTS_CSV_COLUMNS, ADMIN_POSTS_LIST_COLUMNS } from '@/lib/admin/columns'
import type { Database } from '@/types/database.types'

export type AdminPostsClient = SupabaseClient<Database>

/** 審査で遷移しうる status。管理フィルタのタブと同じ並び。 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected'

/** 審査スタンプ。承認・却下のどちらでも同じものを押す。 */
function reviewStamp(reviewerId: string) {
  return { reviewed_at: new Date().toISOString(), reviewed_by: reviewerId }
}

/**
 * 書き込みの結果を検証する。**0 行なら失敗として投げる。**
 *
 * RLS 拒否も対象なしも `error` にはならず 0 行で返るため、行数を見ない限り区別がつかない。
 */
function assertAffected(rows: { id: string }[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`${what}権限がないか、対象が既に存在しません (RLS deny or not found)`)
  }
}

/** status ごとの件数（行は転送しない）。審査待ちバッジが使う。 */
export function countPostsByStatus(client: AdminPostsClient, status: ReviewStatus) {
  return client.from('posts').select('id', { count: 'exact', head: true }).eq('status', status)
}

/**
 * 管理一覧のクエリ。絞り込み・並べ替え・ページングは呼び出し側が続けて足す。
 *
 * ADMIN_POSTS_LIST_COLUMNS は実行時の string 定数なので supabase-js は行形状を推論できない
 * （移行前と同じ。呼び出し側の `as unknown as AdminPost[]` もそのまま）。
 */
export function selectAdminPosts(client: AdminPostsClient) {
  return client.from('posts').select(ADMIN_POSTS_LIST_COLUMNS, { count: 'exact' })
}

/**
 * CSV 書き出しのクエリ。列は `lib/admin/columns.ts` の ADMIN_POSTS_CSV_COLUMNS が正
 * （REQ-103 / REQ-142: 出力する列だけを取り、PII 列の漏れと egress を抑える）。
 * 絞り込みと並べ替えは呼び出し側が足す。
 */
export function selectAdminPostsForCsv(client: AdminPostsClient) {
  return client.from('posts').select(ADMIN_POSTS_CSV_COLUMNS)
}

/** 公式フラグを切り替える。0 行なら投げる。 */
export async function setPostOfficial(
  client: AdminPostsClient,
  postId: string,
  isOfficial: boolean
): Promise<void> {
  const { data, error } = await client
    .from('posts')
    .update({ is_official: isOfficial })
    .eq('id', postId)
    .select('id')
  if (error) throw error
  assertAffected(data, '公式フラグの変更')
}

/** 承認する。0 行なら投げる。 */
export async function approvePost(
  client: AdminPostsClient,
  postId: string,
  reviewerId: string
): Promise<void> {
  const { data, error } = await client
    .from('posts')
    .update({ status: 'approved', ...reviewStamp(reviewerId) })
    .eq('id', postId)
    .select('id')
  if (error) throw error
  assertAffected(data, '承認')
}

/** 却下する。理由は必須、本人向けメッセージは任意。0 行なら投げる。 */
export async function rejectPost(
  client: AdminPostsClient,
  postId: string,
  reviewerId: string,
  { reason, message }: { reason: string; message: string | null }
): Promise<void> {
  const { data, error } = await client
    .from('posts')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      rejection_message: message,
      ...reviewStamp(reviewerId),
    })
    .eq('id', postId)
    .select('id')
  if (error) throw error
  assertAffected(data, '却下')
}

/** 削除する。0 行なら投げる。写真の実体は呼び出し側が Storage から消す。 */
export async function deletePost(client: AdminPostsClient, postId: string): Promise<void> {
  const { data, error } = await client.from('posts').delete().eq('id', postId).select('id')
  if (error) throw error
  assertAffected(data, '削除')
}
