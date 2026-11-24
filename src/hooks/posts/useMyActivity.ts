import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { selectMyActivityRows } from '@/lib/data/posts-own'
import { activityStart, type ActivityRow } from '@/lib/activityCalendar'
import { jstToday } from '@/lib/jstDate'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/** 1年分の上限（1日5件の投稿上限で、1年に約1800件）。 */
const ACTIVITY_ROW_LIMIT = 2000

interface State {
  rows: ActivityRow[] | null
  loading: boolean
  error: boolean
}

/**
 * マイページの「活動の記録」の材料。本人の審査待ち・承認済みの記録の、観察日・投稿日・種類・状態だけを取る。
 * 座標・コメント・写真は取らない。観察日は投稿日より前なので、過去1年に観察した記録は
 * 「過去1年に投稿された記録」に必ず含まれる。失敗のときは rows を null のままにして、空と区別する。
 */
export function useMyActivity(userId: string) {
  const [state, setState] = useState<State>({ rows: null, loading: true, error: false })
  const [attempt, setAttempt] = useState(0)
  const online = useOnlineStatus()

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        if (!navigator.onLine) throw new Error('offline')
        const since = new Date(`${activityStart(jstToday())}T00:00:00+09:00`).toISOString()
        const { data, error } = await selectMyActivityRows(supabase, userId, since)
          .limit(ACTIVITY_ROW_LIMIT)
          .abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) throw error
        setState({ rows: data ?? [], loading: false, error: false })
      } catch {
        if (!controller.signal.aborted) setState({ rows: null, loading: false, error: true })
      }
    })()
    return () => controller.abort()
  }, [userId, online, attempt])

  const retry = useCallback(() => {
    setState({ rows: null, loading: true, error: false })
    setAttempt(n => n + 1)
  }, [])

  return { ...state, retry }
}
