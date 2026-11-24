import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { selectPublicPostCoverage } from '@/lib/data/posts'
import { summarizeCoverage, type Coverage } from '@/lib/homeGaps'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/**
 * ホームの「次に足りない記録」の材料。承認済みの公開記録の種・種類・市町村だけを取って集計する。
 * 取得中・失敗中は coverage を null のままにし、見本の数値やゼロを実績として出さない。
 */
export function useHomeCoverage() {
  const [state, setState] = useState<{ coverage: Coverage | null; loading: boolean }>({ coverage: null, loading: true })
  const online = useOnlineStatus()
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        if (!navigator.onLine) throw new Error('offline')
        const { data, error } = await selectPublicPostCoverage(supabase).limit(2000).abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) throw error
        setState({ coverage: summarizeCoverage(data ?? []), loading: false })
      } catch {
        if (!controller.signal.aborted) setState({ coverage: null, loading: false })
      }
    })()
    return () => controller.abort()
  }, [online])
  return state
}
