import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'
import { settleAll } from '@/lib/settleAll'

// REQ-233: 卒研 KPI ダッシュボードの集計取得フック。
// admin 限定 RPC 3 本（get_kpi_summary / get_kpi_quality_funnel / get_retention_cohorts）を
// Promise.allSettled で並列取得し、一部失敗が他指標を巻き込まないようにする
// （useAdminStats.ts の部分失敗許容パターンを踏襲）。

// ── NSM + ガードレール + KGI サマリー（get_kpi_summary） ──
export interface KpiSummary {
  accuracy_threshold_m: number
  nsm: {
    label: string
    value: number
    prev: number
    wow: number | null
    delta: number
  }
  guardrails: {
    rejection_rate: number | null
    completeness_rate: number | null
    accuracy_rate: number | null
    posts_this_week: number
  }
  kgi: {
    cumulative_approved: number
    repeat_contributors: number
  }
}

// ── 承認ファネル + 量×質カウンター指標（get_kpi_quality_funnel） ──
export interface KpiQualityFunnel {
  accuracy_threshold_m: number
  funnel: {
    completed: number
    approved: number
    pending: number
    rejected: number
    approval_rate: number | null
    rejection_rate: number | null
  }
  completeness: {
    count: number
    complete: number
    rate: number | null
    photo_rate: number | null
    accuracy_present_rate: number | null
  }
  accuracy: {
    count: number
    within_threshold: number
    rate_of_all: number | null
    rate_of_measured: number | null
    measured: number
  }
  cost_per_submission: {
    approved: number
    ai_calls: number
    input_tokens: number
    output_tokens: number
    tokens_per_approved: number | null
  }
}

// ── 獲得月コホート継続率（get_retention_cohorts） ──
export interface RetentionPoint {
  m: number
  users: number
  rate: number | null
}
export interface RetentionCohort {
  cohort: string
  size: number
  retention: RetentionPoint[]
}
export interface RetentionCohorts {
  max_months: number
  cohorts: RetentionCohort[]
}

// ── REQ-253: AI 信頼度→的中率エビデンス（get_ai_accuracy_stats） ──
// 信頼度ビン別に人手判定結果（approved/rejected/pending）・自動承認数・承認率・的中率を返す。
// 「正解(truth)」は承認済み投稿の確定 species を真値とみなす運用プロキシ（真の適合率/再現率ではない）。
export interface AiAccuracyBin {
  key: 'lt50' | 'c50_70' | 'c70_90' | 'c90_100'
  min: number
  max: number
  total: number
  approved: number
  rejected: number
  pending: number
  auto_approved: number
  /** 承認 ÷（承認＋却下）。保留は分母から除外。承認+却下=0 のビンは null。 */
  approval_rate: number | null
  /** 的中（承認かつ AI 検出種＝確定種）÷ 承認。承認=0 のビンは null。 */
  match_rate: number | null
}
export interface AiAccuracyStats {
  bins: AiAccuracyBin[]
  summary: {
    total: number
    approved: number
    rejected: number
    pending: number
    auto_approved: number
    approval_rate: number | null
    match_rate: number | null
    avg_confidence: number | null
    /** 人手レビュー分（reviewed_by 非 NULL）＝自動承認を除いた独立検証。 */
    human_reviewed: {
      count: number
      approved: number
      rejected: number
      match_rate: number | null
    }
  }
}

export interface AdminKpi {
  summary: KpiSummary | null
  funnel: KpiQualityFunnel | null
  cohorts: RetentionCohorts | null
  accuracy: AiAccuracyStats | null
}

interface UseAdminKpiResult {
  data: AdminKpi
  loading: boolean
  error: string | null
  /** ファネル/量質指標の集計期間（日）。 */
  funnelDays: number
  setFunnelDays: (d: number) => void
  /** コホートの遡及月数。 */
  cohortMonths: number
  setCohortMonths: (m: number) => void
  reload: () => void
}

const MS_PER_DAY = 86400000

export function useAdminKpi(): UseAdminKpiResult {
  const [data, setData] = useState<AdminKpi>({
    summary: null,
    funnel: null,
    cohorts: null,
    accuracy: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [funnelDays, setFunnelDays] = useState(90)
  const [cohortMonths, setCohortMonths] = useState(12)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function fetchKpi() {
      setLoading(true)
      setError(null)

      const to = new Date()
      const from = new Date(to.getTime() - funnelDays * MS_PER_DAY)

      // REQ-247: Promise.allSettled → settleAll に共通化（rejected は null に丸め・logError 済み）。
      const values = await settleAll<{ data?: unknown; error?: unknown }>([
        supabase.rpc('get_kpi_summary', {}).abortSignal(signal),                       // 0
        supabase.rpc('get_kpi_quality_funnel', {                                       // 1
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        }).abortSignal(signal),
        supabase.rpc('get_retention_cohorts', { p_months: cohortMonths }).abortSignal(signal), // 2
        supabase.rpc('get_ai_accuracy_stats', {}).abortSignal(signal),                          // 3 (REQ-253・期間非依存)
      ], 'useAdminKpi:rpc', () => signal.aborted)

      if (signal.aborted) return

      // 埋め込みエラー（fulfilled だが Supabase が error を返した場合）は指標ごとに記録して null 化。
      const pick = <T,>(i: number): T | null => {
        const v = values[i]
        if (!v) return null
        if (v.error) {
          logError(
            v.error instanceof Error ? v.error : new Error(String(v.error)),
            `useAdminKpi:rpc[${i}]`,
          )
          return null
        }
        return (v.data as T | null) ?? null
      }

      const summary = pick<KpiSummary>(0)
      const funnel = pick<KpiQualityFunnel>(1)
      const cohorts = pick<RetentionCohorts>(2)
      const accuracy = pick<AiAccuracyStats>(3)

      // 全滅時のみ全画面エラー（部分失敗は取得できた指標を表示）。
      if (summary === null && funnel === null && cohorts === null && accuracy === null) {
        setError('KPI の取得に失敗しました。管理者権限を確認してください。')
        setLoading(false)
        return
      }

      setData({ summary, funnel, cohorts, accuracy })
      setLoading(false)
    }

    void fetchKpi()
    return () => controller.abort()
  }, [funnelDays, cohortMonths, nonce])

  return {
    data,
    loading,
    error,
    funnelDays,
    setFunnelDays,
    cohortMonths,
    setCohortMonths,
    reload,
  }
}
