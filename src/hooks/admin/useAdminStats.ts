import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { SPECIES, INFO_TYPES, QUERY_LIMITS } from '@/lib/constants'
import { logError } from '@/lib/errorHandler'
import { settleAll } from '@/lib/settleAll'
import type { AdminPostStats } from '@/types/database.types'

const MS_PER_DAY = 86400000

interface DateRange {
  from: Date | null
  to: Date | null
}

interface MonthlyEntry {
  label: string
  count: number
}

interface MunicipalityRankEntry {
  name: string
  count: number
}

interface AdminStats {
  total: number
  prevTotal: number
  trend: number
  pendingReports: number
  verifiedCount: number
  speciesCounts: Record<string, number>
  infoTypeCounts: Record<string, number>
  monthly: MonthlyEntry[]
  recentPosts: Record<string, unknown>[]
  municipalityRanking: MunicipalityRankEntry[]
  recentLogs: Record<string, unknown>[]
}

interface UseAdminStatsResult {
  stats: AdminStats | null
  loading: boolean
  error: string | null
  range: DateRange
  setRange: React.Dispatch<React.SetStateAction<DateRange>>
}

function initRange(): DateRange {
  const n = new Date()
  return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: new Date() }
}

export function useAdminStats(): UseAdminStatsResult {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<DateRange>(initRange)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function fetchStats() {
      setLoading(true)
      setError(null)
      const now = new Date()

      const fromMs = range.from?.getTime()
      const toMs = (range.to ?? now).getTime()
      const spanMs = fromMs != null ? toMs - fromMs : null
      const prevFrom = spanMs != null ? new Date(fromMs! - spanMs) : null
      const prevTo = range.from ?? null

      function filteredPosts(select: string, head = false) {
        let q = supabase.from('posts').select(select, { count: 'exact', head }).abortSignal(signal)
        if (range.from) q = q.gte('created_at', range.from.toISOString())
        if (range.to) q = q.lte('created_at', new Date(range.to.getTime() + MS_PER_DAY).toISOString())
        return q
      }
      function prevPosts(select: string, head = false) {
        let q = supabase.from('posts').select(select, { count: 'exact', head }).abortSignal(signal)
        if (prevFrom) q = q.gte('created_at', prevFrom.toISOString())
        if (prevTo) q = q.lt('created_at', prevTo.toISOString())
        return q
      }

    try {
      // REQ-154: 集計は get_admin_post_stats RPC（GROUP BY）へ寄せ、全行転送を廃止する。
      // また Promise.all から Promise.allSettled（REQ-247: settleAll に共通化）に変更し、
      // 一部クエリの失敗が他指標を巻き込んで全画面エラーになるのを防ぐ
      // （成功した指標は表示し、失敗分のみ既定値でフォールバック）。
      const values = await settleAll<{ count?: number | null; data?: unknown }>([
        filteredPosts('id', true),                                                                         // 0: total
        prevPosts('id', true),                                                                             // 1: prevTotal
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('resolved', false).abortSignal(signal), // 2: pendingReports
        filteredPosts('id', true).eq('is_anonymous', false),                                               // 3: verifiedCount
        supabase.rpc('get_admin_post_stats', {                                                             // 4: 集約 RPC
          p_from: range.from ? range.from.toISOString() : null,
          p_to: (range.to ?? now).toISOString(),
          p_max_months: QUERY_LIMITS.adminMaxMonths,
        }).abortSignal(signal),
        supabase.from('posts')                                                                             // 5: recentPosts
          .select('id, species, info_type, municipality, is_anonymous, created_at')
          .order('created_at', { ascending: false })
          .limit(QUERY_LIMITS.recentPosts)
          .abortSignal(signal),
        supabase.rpc('get_audit_logs', { p_limit: 5, p_offset: 0 }).abortSignal(signal),                   // 6: recentLogs
      ], 'useAdminStats:query', () => signal.aborted)

      if (signal.aborted) return

      // settleAll が rejected → null に丸め済み。ここでは count / data を安全に取り出すだけ。
      const countOf = (i: number): number | null => values[i]?.count ?? null
      const dataOf = <T,>(i: number): T | null => (values[i]?.data as T | null) ?? null

      const total = countOf(0)
      const prevTotal = countOf(1)
      const pendingReports = countOf(2)
      const verifiedCount = countOf(3)
      const agg = dataOf<AdminPostStats>(4)
      const recentPosts = dataOf<Record<string, unknown>[]>(5)
      const recentLogs = dataOf<Record<string, unknown>[]>(6)

      // 主要指標がすべて取得失敗した場合のみ全画面エラーにする（部分失敗は表示継続）。
      const allCriticalFailed = total === null && agg === null && recentPosts === null
      if (allCriticalFailed) {
        setError('統計データの取得に失敗しました。')
        return
      }

      // 種別カウント（既知の種別は 0 で初期化してから RPC 結果で上書き）
      const speciesCounts: Record<string, number> = {}
      SPECIES.forEach(s => { speciesCounts[s.value] = 0 })
      ;(agg?.species_counts ?? []).forEach((row) => { speciesCounts[row.species] = row.count })

      // 情報種別カウント
      const infoTypeCounts: Record<string, number> = {}
      INFO_TYPES.forEach(t => { infoTypeCounts[t.value] = 0 })
      ;(agg?.info_type_counts ?? []).forEach((row) => { infoTypeCounts[row.info_type] = row.count })

      // 月次（RPC は YYYY-MM-DD の月初を返す。直近 adminMaxMonths 件に丸めてラベル化）
      const monthly: MonthlyEntry[] = (agg?.monthly ?? [])
        .slice(-QUERY_LIMITS.adminMaxMonths)
        .map((row) => ({ label: `${Number(row.month.slice(5, 7))}月`, count: row.count }))

      // 市区町村ランキング（RPC が件数降順で返す）
      const municipalityRanking: MunicipalityRankEntry[] = (agg?.municipality_counts ?? [])
        .map((row) => ({ name: row.municipality, count: row.count }))

      setStats({
        total: total ?? 0,
        prevTotal: prevTotal ?? 0,
        trend: (total ?? 0) - (prevTotal ?? 0),
        pendingReports: pendingReports || 0,
        verifiedCount: verifiedCount ?? 0,
        speciesCounts,
        infoTypeCounts,
        monthly,
        recentPosts: recentPosts ?? [],
        municipalityRanking,
        recentLogs: recentLogs ?? [],
      })
    } catch (err) {
      if (signal.aborted) return
      logError(err as Error, 'useAdminStats:fetchStats')
      setError('統計データの取得に失敗しました。')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
    }
    fetchStats()
    return () => controller.abort()
  }, [range])

  return { stats, loading, error, range, setRange }
}
