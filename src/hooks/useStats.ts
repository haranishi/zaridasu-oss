import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { SPECIES, INFO_TYPES } from '@/lib/constants'
import type { DashboardStats } from '@/types/database.types'

const STATS_CACHE_TTL_MS = 5 * 60 * 1000 // 5分

interface MonthlyEntry {
  label: string
  count: number
}

interface MunicipalityRankEntry {
  name: string
  count: number
}

interface Stats {
  totalAll: number
  totalThisMonth: number
  lastMonth: number
  myTotal?: number
  // REQ-248 FR-248-06: 承認済み（検証済み）投稿数。バッジラダー等の進捗表示は myTotal（未検証を含む
  // 全投稿数）ではなくこの検証済み数で駆動する（Goodhart 対策）。
  myApproved?: number
  speciesCounts: Record<string, number>
  infoTypeCounts: Record<string, number>
  monthly: MonthlyEntry[]
  municipalityRank: MunicipalityRankEntry[]
  municipalityCount: number
}

interface UseStatsOptions {
  months?: number
  userId?: string
}

interface UseStatsResult {
  stats: Stats | null
  loading: boolean
  error: string | null
  /** REQ-273: 取得失敗時のリトライ。effect を再実行する（キャッシュがあれば即時表示→再検証）。 */
  refetch: () => void
}

function getCached(key: string): Stats | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > STATS_CACHE_TTL_MS) return null
    return data as Stats
  } catch {
    return null
  }
}

function setCache(key: string, data: Stats): void {
  try {
    cleanExpiredCache()
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // sessionStorage が使えない場合は無視
  }
}

/** FR-007: TTL 期限切れエントリをクリーンアップ */
function cleanExpiredCache(): void {
  try {
    const prefix = 'zaridasu_stats_'
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      const raw = sessionStorage.getItem(key)
      if (!raw) continue
      try {
        const { ts } = JSON.parse(raw)
        if (Date.now() - ts > STATS_CACHE_TTL_MS) {
          sessionStorage.removeItem(key)
        }
      } catch {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}

/**
 * @param options.months  - 月別グラフの期間（デフォルト 6）
 * @param options.userId  - 指定すると myTotal をカウント（DashboardPage用）
 */
export function useStats({ months = 6, userId }: UseStatsOptions = {}): UseStatsResult {
  const cacheKey = `zaridasu_stats_${months}_${userId ?? 'anon'}`
  const [stats, setStats] = useState<Stats | null>(() => getCached(cacheKey))
  const [loading, setLoading] = useState(() => !getCached(cacheKey))
  const [error, setError] = useState<string | null>(null)
  // REQ-273: refetch 用 nonce。加算すると effect が再実行される。
  const [fetchNonce, setFetchNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal

    async function fetchStats() {
      // キャッシュがあれば即座に表示しつつバックグラウンドで再検証
      const cached = getCached(cacheKey)
      if (cached) {
        setStats(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }
      // オフライン時はキャッシュのみで終了（ネットワークエラーを防止）
      if (!navigator.onLine) {
        setLoading(false)
        return
      }
      setError(null)
      const now = new Date()

      try {
        // REQ-032: Single RPC call replaces multiple parallel queries
        const rpcPromise = supabase.rpc('get_dashboard_stats', { p_months: months }).abortSignal(signal)
        const myTotalPromise = userId
          ? supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).abortSignal(signal)
          : null
        // REQ-248 FR-248-06: 承認済みだけを数える別クエリ（進捗ラダーの検証済みベース化）。
        const myApprovedPromise = userId
          ? supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'approved').abortSignal(signal)
          : null

        const [rpcResult, myTotalResult, myApprovedResult] = await Promise.all([
          rpcPromise,
          myTotalPromise ?? Promise.resolve(undefined),
          myApprovedPromise ?? Promise.resolve(undefined),
        ])
        if (signal.aborted) return

        const { data: rpcData, error: rpcError } = rpcResult as {
          data: DashboardStats | null
          error: { message?: string } | null
        }
        if (rpcError) {
          if (!signal.aborted) {
            setError(rpcError.message || 'データの取得に失敗しました')
            setLoading(false)
          }
          return
        }

        const myTotal = userId
          ? ((myTotalResult as { count?: number | null } | undefined)?.count ?? 0)
          : undefined
        const myApproved = userId
          ? ((myApprovedResult as { count?: number | null } | undefined)?.count ?? 0)
          : undefined

        // 種類別: RPC結果をマッピング
        const speciesCounts: Record<string, number> = {}
        SPECIES.forEach((s) => { speciesCounts[s.value] = 0 })
        rpcData?.species_counts?.forEach((sc) => {
          speciesCounts[sc.species] = sc.count
        })

        // 情報種別: RPC結果をマッピング
        const infoTypeCounts: Record<string, number> = {}
        INFO_TYPES.forEach((t) => { infoTypeCounts[t.value] = 0 })
        rpcData?.info_type_counts?.forEach((itc) => {
          infoTypeCounts[itc.info_type] = itc.count
        })

        // 月別: RPC結果をラベル付きエントリに変換
        // REQ-282 D-5: m.month は date_trunc('month') の timestamptz（UTC月初のISO文字列）。
        // new Date(...).getMonth() はローカルTZ解釈のため UTC より西のTZで前月にズレる。
        // ISO文字列の月部分（"YYYY-MM-..." の5-6文字目）を直接読む（TZ非依存）。
        const monthly: MonthlyEntry[] = rpcData?.monthly_data?.map((m) => {
          const monthNum = Number(String(m.month).slice(5, 7))
          return { label: `${monthNum}月`, count: m.count }
        }) ?? []

        // 月別データが期間に満たない場合は空の月を先頭に追加
        while (monthly.length < months) {
          const i = months - monthly.length
          const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
          monthly.unshift({ label: `${d.getMonth() + 1}月`, count: 0 })
        }

        // 市区町村ランキング（RPC側で上位10に制限済み）
        const municipalityRank: MunicipalityRankEntry[] = rpcData?.municipality_counts?.map((mc) => ({
          name: mc.municipality,
          count: mc.count,
        })) ?? []
        const municipalityCount = municipalityRank.length

        const newStats: Stats = {
          totalAll: rpcData?.total_posts ?? 0,
          totalThisMonth: rpcData?.this_month_posts ?? 0,
          lastMonth: rpcData?.last_month_posts ?? 0,
          myTotal,
          myApproved,
          speciesCounts,
          infoTypeCounts,
          monthly,
          municipalityRank,
          municipalityCount,
        }
        setCache(cacheKey, newStats)
        setStats(newStats)
        setLoading(false)
      } catch (err: unknown) {
        if (signal.aborted) return
        setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
        setLoading(false)
      }
    }

    fetchStats()
    return () => controller.abort()
  }, [months, userId, cacheKey, fetchNonce])

  const refetch = useCallback(() => setFetchNonce((n) => n + 1), [])

  return { stats, loading, error, refetch }
}
