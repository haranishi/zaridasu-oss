import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { updateOwnPost } from '@/lib/data/posts-write'
import { useAuth } from '@/context/AuthContext'
import { deletePhotos, uploadPhoto } from '@/lib/storage'
import { validatePost } from '@/lib/postValidation'
import { logError } from '@/lib/errorHandler'
import type { Database } from '@/types/database.types'

interface PostLike {
  id: string
  species: string
  photos: string[] | null
}

interface SaveEditParams {
  species: string
  info_type: string
  municipality: string | null
  comment: string | null
  count: number | null
  observed_at: string | null
  deletedPhotoUrls: string[]
  newPhotoFiles: File[]
}

interface UseEditPostOptions {
  onSuccess?: (fields: Record<string, unknown>) => void
}

interface UseEditPostResult {
  saving: boolean
  error: string | null
  clearError: () => void
  saveEdit: (params: SaveEditParams) => Promise<void>
}

/**
 * 投稿編集ロジック（DetailPage・PostCard で共有）
 */
export function useEditPost(post: PostLike | null, { onSuccess }: UseEditPostOptions = {}): UseEditPostResult {
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function clearError() {
    setError(null)
  }

  async function saveEdit({ species, info_type, municipality, comment, count, observed_at, deletedPhotoUrls, newPhotoFiles }: SaveEditParams) {
    if (!post) return
    setSaving(true)
    setError(null)

    // FR-005: バリデーション
    const validation = validatePost({ comment, count, species, info_type })
    if (!validation.valid) {
      setError(validation.error)
      setSaving(false)
      return
    }

    // REQ-243 FR-243-04: 追加写真は所有者のストレージプレフィックス（auth.uid()/）へ保存する。
    // 編集は所有者限定フローのため user は非 null。念のため無い場合は保存を中断する。
    if (newPhotoFiles.length > 0 && !user) {
      setError('保存に失敗しました')
      setSaving(false)
      return
    }

    try {
      // 追加の写真を先に上げる。1 枚でも上げられなかったら（変換に失敗して原本のままの写真を含む）、
      // 何も消さず・更新せず中断する。これまでは失敗した写真を黙って落として保存していた。
      const uploadedUrls = user
        ? await Promise.all(newPhotoFiles.map(f => uploadPhoto(user.id, f)))
        : []
      const newUrls = uploadedUrls.filter((url): url is string => !!url)
      if (newUrls.length !== newPhotoFiles.length) {
        // 上がった分も、どの投稿にも結び付かないまま公開の保管先に残さない
        if (newUrls.length) await deletePhotos(newUrls).catch(() => undefined)
        throw new Error('写真を保存できませんでした。写真を選び直して、もう一度お試しください。')
      }

      await deletePhotos(deletedPhotoUrls)

      const remainingPhotos = (post.photos || []).filter(url => !deletedPhotoUrls.includes(url))
      const updatedPhotos = [...remainingPhotos, ...newUrls]

      // 種類または写真が変更されたか判定
      const speciesChanged = species !== post.species
      const photosChanged = newPhotoFiles.length > 0 || deletedPhotoUrls.length > 0
      const needsReanalysis = (speciesChanged || photosChanged) && updatedPhotos.length > 0

      const fields: Record<string, unknown> = {
        species,
        info_type,
        municipality: municipality || null,
        comment: comment || null,
        count: count != null ? count : null,
        observed_at: observed_at || null,
        photos: updatedPhotos,
      }

      // 再分析が必要な場合は ai_result をリセット（表示を「判定中」に戻す）
      if (needsReanalysis) {
        fields.ai_result = null
      }

      // supabase-js 2.110 の RejectExcessProperties により、index signature を持つ
      // Record<string, unknown> は .update() へ直接渡せない。fields は onSuccess と
      // 再分析スプレッド（下）で共有するため Record のまま保持し、書き込み時のみ
      // posts の Update 型へ明示キャストする（ランタイム挙動は不変・型のみの整合）。
      await updateOwnPost(supabase, post.id, fields as Database['public']['Tables']['posts']['Update'])

      // AI 再分析をトリガー（fire-and-forget: UI をブロックしない）
      if (needsReanalysis) {
        supabase.functions.invoke('analyze-image', {
          body: {
            record: { ...post, ...fields, id: post.id },
            reanalysis: true,
          },
          // REQ-273 FR-273-06: 恒常失敗しても検知不能で ai_result が「判定中」のまま残留する
          // ため、無言破棄ではなく Sentry へ記録する（CommentSection の notify-comment と同方針）。
        }).catch((err) => { logError(err as Error, 'useEditPost:reanalyze') })
      }

      onSuccess?.(fields)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存に失敗しました'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, clearError, saveEdit }
}
