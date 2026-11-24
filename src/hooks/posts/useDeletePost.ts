import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { deleteOwnPost } from '@/lib/data/posts-write'
import { removePostMedia } from '@/lib/postMedia'
import { logError } from '@/lib/errorHandler'
import type { Post, UseDeletePostResult } from '@/types'

/**
 * 投稿削除フック
 * @param post - 削除対象の投稿
 * @param options.onDeleted - 削除完了後のコールバック
 */
export function useDeletePost(
  post: Post | null,
  { onDeleted }: { onDeleted?: () => void } = {}
): UseDeletePostResult {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete(): Promise<void> {
    if (!post) return
    setDeleting(true)
    setError('')
    try {
      // 写真・AI 用の縮小版・音声の実体を先に消す。消せなければ投稿の削除を中止する（実体だけが残るのを防ぐ）
      await removePostMedia(post)
      await deleteOwnPost(supabase, post.id)
      onDeleted?.()
    } catch (err) {
      logError(err as Error, 'handleDelete')
      const message = err instanceof Error && err.message === 'storage_remove_failed'
        ? '写真や音声の削除に失敗したため、投稿の削除を中止しました。時間をおいて再試行してください。'
        : '削除に失敗しました。もう一度お試しください。'
      setError(message)
    } finally {
      setDeleting(false)
    }
  }

  return { deleting, error, handleDelete }
}
