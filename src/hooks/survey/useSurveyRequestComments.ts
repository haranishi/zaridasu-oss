// REQ-089 Phase 5: 調査依頼への直接コメント hook。

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { surveyRequestCommentInputSchema } from '@/lib/validation/schemas'

export interface SurveyRequestComment {
  id: string
  request_id: string
  user_id: string
  body: string
  created_at: string
  display_name: string | null
  avatar_emoji: string | null
}

interface Result {
  comments: SurveyRequestComment[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  postComment: (body: string) => Promise<void>
  deleteComment: (id: string) => Promise<void>
}

export function useSurveyRequestComments(requestId: string | undefined): Result {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [comments, setComments] = useState<SurveyRequestComment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!requestId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase
        .from('survey_request_comments')
        .select('id, request_id, user_id, body, created_at')
        .eq('request_id', requestId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200)
      if (e) throw e
      const rows = (data ?? []) as Omit<SurveyRequestComment, 'display_name' | 'avatar_emoji'>[]
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
      const profiles =
        userIds.length > 0
          ? (await supabase
              .from('user_profiles')
              .select('id, display_name, avatar_emoji')
              .in('id', userIds)).data
          : []
      const map = new Map<string, { display_name: string | null; avatar_emoji: string | null }>()
      ;(profiles ?? []).forEach((p) => map.set(p.id as string, p as { display_name: string | null; avatar_emoji: string | null }))
      setComments(
        rows.map((r) => ({
          ...r,
          display_name: map.get(r.user_id)?.display_name ?? null,
          avatar_emoji: map.get(r.user_id)?.avatar_emoji ?? null,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const postComment = useCallback(
    async (body: string) => {
      if (!requestId || !user) throw new Error('ログインが必要です')
      // REQ-213 FR-213-05: インラインの trim/空判定/長さ500 を共有 zod スキーマに置換する
      //   （body は DB CHECK が char_length BETWEEN 1 AND 500。trim 後の 1〜500 を検証）。
      //   表示側（SurveyRequestPage）は err.message を直接表示するため、i18n キーを t() で
      //   文字列化して throw する（FR-213-08）。最終防御は DB CHECK / RLS。
      const parsed = surveyRequestCommentInputSchema.safeParse({ body })
      if (!parsed.success) {
        throw new Error(t(parsed.error.issues[0]?.message ?? 'validation.generic'))
      }
      const { error: e } = await supabase
        .from('survey_request_comments')
        .insert({ request_id: requestId, user_id: user.id, body: parsed.data.body })
      if (e) throw e
      await refresh()
    },
    [requestId, user, refresh, t],
  )

  const deleteComment = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.rpc('soft_delete_request_comment', { comment_id: id })
      if (e) throw e
      await refresh()
    },
    [refresh],
  )

  return { comments, loading, error, refresh, postComment, deleteComment }
}
