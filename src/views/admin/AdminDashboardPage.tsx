'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { SPECIES, INFO_TYPES } from '@/lib/constants'
import { useAdminStats } from '@/hooks/admin/useAdminStats'
import DateRangePicker from '@/components/features/admin/DateRangePicker'
import AdminStatCard from '@/components/features/admin/AdminStatCard'
import dynamic from 'next/dynamic'
const AreaChart = dynamic(() => import('@/components/features/admin/AreaChart'), { ssr: false })
const AdminDonutChart = dynamic(() => import('@/components/features/admin/AdminDonutChart'), { ssr: false })
import RecentPostsCard from '@/components/features/admin/RecentPostsCard'
import MunicipalityRanking from '@/components/features/admin/MunicipalityRanking'
import SummaryCard from '@/components/features/admin/SummaryCard'
import { SkeletonStats, SkeletonCard } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase/client'
import { useToastContext } from '@/context/ToastContext'

export default function AdminDashboardPage() {
  const { t, i18n } = useTranslation()
  const { stats, loading, error, range, setRange } = useAdminStats()

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    delete_post:     { label: t('admin.logs.action.delete_post'),    color: 'text-red-600' },
    delete_comment:  { label: t('admin.logs.action.delete_comment'), color: 'text-red-600' },
    resolve_report:  { label: t('admin.logs.action.resolve_report'), color: 'text-blue-600' },
    grant_admin:     { label: t('admin.logs.action.grant_admin'),    color: 'text-amber-600' },
    revoke_admin:    { label: t('admin.logs.action.revoke_admin'),   color: 'text-orange-600' },
    toggle_official: { label: t('admin.logs.action.toggle_official'), color: 'text-purple-600' },
  }

  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <SkeletonStats />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <p className="text-red-600 text-sm mb-2">{error}</p>
          <button type="button" onClick={() => setRange({ ...range })} className="text-sm text-blue-600 hover:underline">
            再試行
          </button>
        </div>
      </div>
    )
  }

  if (!stats) return null

  const speciesSegments = SPECIES.map(s => ({ color: s.color ?? '#888', value: stats.speciesCounts[s.value] || 0 }))
  const infoColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'] as const
  const infoSegments = INFO_TYPES.map((t2, i) => ({ color: infoColors[i] ?? '#888', value: stats.infoTypeCounts[t2.value] || 0 }))
  const verifiedPct = stats.total ? Math.round((stats.verifiedCount / stats.total) * 100) : 0

  const locale = i18n.language === 'ja' ? 'ja-JP' : i18n.language === 'zh' ? 'zh-CN' : i18n.language === 'ko' ? 'ko-KR' : 'en-US'
  const rangeLabel = range.from
    ? `${range.from.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })} 〜 ${(range.to ?? new Date()).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })}`
    : t('admin.dashboard.allPeriod')

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('admin.dashboard.title')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{rangeLabel}</p>
          </div>
          <span className="text-3xl select-none">🦞</span>
        </div>
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <AdminStatCard
          label={t('admin.dashboard.kpi.posts')}
          value={stats.total}
          icon="📍"
          trend={stats.trend}
          color="blue"
        />
        <AdminStatCard
          label={t('admin.dashboard.kpi.verified')}
          value={stats.verifiedCount}
          icon="✅"
          trend={null}
          color="green"
        />
        <AdminStatCard
          label={t('admin.dashboard.kpi.verifiedRate')}
          value={`${verifiedPct}%`}
          icon="📊"
          trend={null}
          color="purple"
        />
        <AdminStatCard
          label={t('admin.dashboard.kpi.pendingReports')}
          value={stats.pendingReports}
          icon="🚨"
          trend={null}
          color={stats.pendingReports > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* ── Chart + Recent Posts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Area Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">{t('admin.dashboard.chart.monthly')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('admin.dashboard.chart.monthlyDesc')}</p>
            </div>
            <div className="flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              <span className="text-xs text-blue-700 font-medium">{t('admin.dashboard.chart.postCount')}</span>
            </div>
          </div>
          <AreaChart data={stats.monthly} />
        </div>

        {/* Recent Posts */}
        <RecentPostsCard posts={stats.recentPosts as { id: string; species: string; info_type: string; created_at: string; is_anonymous: boolean; municipality?: string }[]} />
      </div>

      {/* ── Summary + Breakdowns ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Period Comparison */}
        <SummaryCard
          current={stats.total}
          previous={stats.prevTotal}
          trend={stats.trend}
        />

        {/* Species Donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('admin.dashboard.breakdown.species')}</h2>
          <div className="flex items-center gap-4">
            <AdminDonutChart segments={speciesSegments} size={80} />
            <div className="flex-1 space-y-2">
              {SPECIES.map(s => {
                const count = stats.speciesCounts[s.value] || 0
                const pct = stats.total ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div key={s.value}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                      <span className="font-semibold text-gray-800 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full">
                      <div className="h-1 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Info Type Donut */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('admin.dashboard.breakdown.infoType')}</h2>
          <div className="flex items-center gap-4">
            <AdminDonutChart segments={infoSegments} size={80} />
            <div className="flex-1 space-y-2">
              {INFO_TYPES.map((infoType, i) => {
                const count = stats.infoTypeCounts[infoType.value] || 0
                const pct = stats.total ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div key={infoType.value}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="flex items-center gap-1.5 text-gray-600">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: infoColors[i] }} />
                        {infoType.emoji} {infoType.label}
                      </span>
                      <span className="font-semibold text-gray-800 tabular-nums">{count}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full">
                      <div className="h-1 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: infoColors[i] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Municipality Ranking */}
        <MunicipalityRanking data={stats.municipalityRanking} />
      </div>

      {/* ── Recent Logs ── */}
      {stats.recentLogs?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">{t('admin.dashboard.recentLogs')}</h2>
            <Link href="/admin/logs" className="text-xs text-blue-500 hover:text-blue-700 transition-colors">
              {t('admin.dashboard.viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.recentLogs.map(log => {
              const action = log.action as string
              const meta = ACTION_LABELS[action] ?? { label: action, color: 'text-gray-600' }
              return (
                <div key={log.id as string} className="flex items-center gap-3 py-2.5 text-xs">
                  <span className="text-gray-400 shrink-0 tabular-nums">
                    {new Date(log.created_at as string).toLocaleString(locale, {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-gray-500 truncate min-w-0 flex-1">
                    {(log.admin_email as string) ?? t('admin.dashboard.adminFallback')}
                  </span>
                  <span className={`font-medium shrink-0 ${meta.color}`}>{meta.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/posts"
          className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex items-center gap-4 hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-2xl shadow-xs group-hover:scale-105 transition-transform">
            📋
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{t('admin.dashboard.quickActions.managePosts')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t('admin.dashboard.quickActions.managePostsDesc')}</p>
          </div>
          <svg className="ml-auto w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/admin/reports"
          className={`bg-white rounded-2xl border shadow-xs p-5 flex items-center gap-4 hover:shadow-md transition-all group ${
            stats.pendingReports > 0 ? 'border-red-200 hover:border-red-300' : 'border-gray-100 hover:border-gray-200'
          }`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-xs group-hover:scale-105 transition-transform ${
            stats.pendingReports > 0 ? 'bg-red-500' : 'bg-gray-400'
          }`}>
            🚨
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{t('admin.dashboard.quickActions.checkReports')}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {stats.pendingReports > 0
                ? <span className="text-red-500 font-medium">{t('admin.dashboard.quickActions.pendingReports', { count: stats.pendingReports })}</span>
                : t('admin.dashboard.quickActions.noPendingReports')}
            </p>
          </div>
          <svg className="ml-auto w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* ── REQ-126 FR-126-08: Gemini API ヘルスチェック ── */}
      <GeminiHealthCheckSection />
    </div>
  )
}

/**
 * REQ-126 FR-126-08: 管理者が GEMINI_API_KEY の生存を能動的に検証できるボタン。
 *   - `supabase.functions.invoke('health-gemini')` を呼ぶ
 *   - 10 秒間 disabled で連打防止
 *   - 結果は toast 表示（緑 / 赤）
 */
function GeminiHealthCheckSection() {
  const toast = useToastContext()
  const [running, setRunning] = useState(false)
  const [cooldown, setCooldown] = useState(false)
  const [lastResult, setLastResult] = useState<{
    ok: boolean
    model?: string
    latency_ms?: number
    status?: number
    error_kind?: string
    message?: string
    checkedAt: string
  } | null>(null)

  const disabled = running || cooldown

  async function handleClick() {
    if (disabled) return
    setRunning(true)
    try {
      const { data, error } = await supabase.functions.invoke('health-gemini', {
        method: 'POST',
      })
      if (error) {
        toast.error(`ヘルスチェック失敗: ${error.message ?? String(error)}`)
        setLastResult({ ok: false, message: error.message ?? String(error), checkedAt: new Date().toISOString() })
        return
      }
      const result = data as {
        ok: boolean
        model?: string
        latency_ms?: number
        status?: number
        error_kind?: string
        message?: string
      }
      setLastResult({ ...result, checkedAt: new Date().toISOString() })
      if (result.ok) {
        toast.success(`✅ Gemini OK (${result.model ?? '?'}, ${result.latency_ms ?? '?'}ms)`)
      } else {
        toast.error(`❌ Gemini NG (status=${result.status ?? '?'}, ${result.error_kind ?? 'unknown'})`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      toast.error(`ヘルスチェック例外: ${message}`)
      setLastResult({ ok: false, message, checkedAt: new Date().toISOString() })
    } finally {
      setRunning(false)
      setCooldown(true)
      // 10 秒クールダウン後に再度押せるようにする
      window.setTimeout(() => setCooldown(false), 10_000)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">🔍 システムステータス</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Gemini API キーが有効か、最小コストの ping で能動的に検証します
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-busy={running}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <span className={`text-sm leading-none ${running ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
          {running ? '実行中…' : cooldown ? 'クールダウン中…' : '🔍 Gemini API ヘルスチェック'}
        </button>
        {lastResult && (
          <span className={`text-xs ${lastResult.ok ? 'text-green-700' : 'text-red-700'}`}>
            {lastResult.ok
              ? `OK · model=${lastResult.model} · latency=${lastResult.latency_ms}ms`
              : `NG · status=${lastResult.status ?? '?'} · ${lastResult.error_kind ?? 'unknown'}${lastResult.message ? ` · ${lastResult.message}` : ''}`}
          </span>
        )}
      </div>
    </div>
  )
}
