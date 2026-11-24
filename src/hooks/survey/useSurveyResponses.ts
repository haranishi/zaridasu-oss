// REQ-087 Phase 3: 調査依頼への「協力する」軽量応答 hook。

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

export interface SurveyResponseEntry {
  id: string
  user_id: string
  created_at: string
  display_name: string | null
  avatar_emoji: string | null
}

interface Result {
  responses: SurveyResponseEntry[]
  count: number
  hasResponded: boolean
  loading: boolean
  error: string | null
  respond: () => Promise<void>
  cancelResponse: () => Promise<void>
  refresh: () => Promise<void>
}

const LIST_LIMIT = 10

export function useSurveyResponses(requestId: string | undefined): Result {
  const { user } = useAuth()
  const [responses, setResponses] = useState<SurveyResponseEntry[]>([])
  const [count, setCount] = useState(0)
  const [hasResponded, setHasResponded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!requestId) return
    setLoading(true)
    setError(null)
    try {
      // 全件 count
      const { count: total } = await supabase
        .from('survey_request_responses')
        .select('id', { head: true, count: 'exact' })
        .eq('request_id', requestId)
      setCount(total ?? 0)

      // 表示用 10 件 + プロフィール
      const { data, error: e } = await supabase
        .from('survey_request_responses')
        .select('id, user_id, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)
      if (e) throw e
      const entries = (data ?? []) as { id: string; user_id: string; created_at: string }[]

      const userIds = entries.map((r) => r.user_id)
      const profiles =
        userIds.length > 0
          ? (await supabase
              .from('user_profiles')
              .select('id, display_name, avatar_emoji')
              .in('id', userIds)).data
          : []
      const profileMap = new Map<string, { display_name: string | null; avatar_emoji: string | null }>()
      ;(profiles ?? []).forEach((p) => profileMap.set(p.id as string, p as { display_name: string | null; avatar_emoji: string | null }))

      setResponses(
        entries.map((r) => ({
          ...r,
          display_name: profileMap.get(r.user_id)?.display_name ?? null,
          avatar_emoji: profileMap.get(r.user_id)?.avatar_emoji ?? null,
        })),
      )
      // 自分が応答済みかどうか
      if (user) {
        const { data: mine } = await supabase
          .from('survey_request_responses')
          .select('id')
          .eq('request_id', requestId)
          .eq('user_id', user.id)
          .maybeSingle()
        setHasResponded(!!mine)
      } else {
        setHasResponded(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [requestId, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const respond = useCallback(async () => {
    // REQ-183 FR-183-04: 文言ではなく安定した i18n キーを throw する（呼び出し側はログ用途で
    // 表示しないが、表示する場合は t() で解決できるようキーに統一）。
    if (!requestId || !user) throw new Error('survey.errors.loginRequired')
    setHasResponded(true)
    setCount((c) => c + 1)
    const { error: e } = await supabase
      .from('survey_request_responses')
      .insert({ request_id: requestId, user_id: user.id })
    if (e) {
      // 楽観的更新のロールバック
      setHasResponded(false)
      setCount((c) => Math.max(0, c - 1))
      throw e
    }
    void refresh()
  }, [requestId, user, refresh])

  const cancelResponse = useCallback(async () => {
    if (!requestId || !user) return
    setHasResponded(false)
    setCount((c) => Math.max(0, c - 1))
    const { error: e } = await supabase
      .from('survey_request_responses')
      .delete()
      .eq('request_id', requestId)
      .eq('user_id', user.id)
    if (e) {
      setHasResponded(true)
      setCount((c) => c + 1)
      throw e
    }
    void refresh()
  }, [requestId, user, refresh])

  return { responses, count, hasResponded, loading, error, respond, cancelResponse, refresh }
}
