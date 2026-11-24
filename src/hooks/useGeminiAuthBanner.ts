'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

const POLL_INTERVAL_MS = 30_000
const ONE_HOUR_MS = 60 * 60 * 1000
const SESSION_STORAGE_KEY = 'admin.geminiAuthBanner.dismissed.v1'

/**
 * REQ-126 FR-126-06: admin layout 用に「直近 1 時間以内に
 * `ai_call_logs.error_kind='gemini_auth'` のレコードがあるか」を 30 秒ごとに polling する hook。
 *
 * - 軽量化のため `count: 'exact', head: true` で COUNT のみ取得する
 * - sessionStorage に閉じる操作を記録し、当該タブセッション中は再表示しない
 * - cleanup で必ず clearInterval を呼んで leak しないようにする
 */
export function useGeminiAuthBanner(): {
  visible: boolean
  hasFailure: boolean
  dismiss: () => void
} {
  const [hasFailure, setHasFailure] = useState(false)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.sessionStorage.getItem(SESSION_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    let cancelled = false

    async function fetchCount() {
      try {
        const since = new Date(Date.now() - ONE_HOUR_MS).toISOString()
        const { count, error } = await supabase
          .from('ai_call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'error')
          .eq('error_kind', 'gemini_auth')
          .gte('created_at', since)
        if (cancelled) return
        if (error) {
          // RLS で見えない / migration 未適用などのケースでもバナーは押し付けない
          setHasFailure(false)
          return
        }
        setHasFailure((count ?? 0) > 0)
      } catch {
        if (!cancelled) setHasFailure(false)
      }
    }

    fetchCount()
    const interval = window.setInterval(fetchCount, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, '1')
    } catch {
      // sessionStorage が使えない環境（プライベートブラウジング等）でも状態は保持される
    }
  }

  return {
    visible: hasFailure && !dismissed,
    hasFailure,
    dismiss,
  }
}
