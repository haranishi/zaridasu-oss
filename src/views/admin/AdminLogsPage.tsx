'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { ADMIN_PAGE_SIZE } from '@/lib/constants'
import { todayLocalISODate } from '@/lib/localDate'
import { csvCell } from '@/lib/csv'
import { logError } from '@/lib/errorHandler'
import type { Database, Json } from '@/types/database.types'

type AuditLog = Database['public']['Functions']['get_audit_logs']['Returns'][number]

function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '—'
}

function detailText(value: Json | undefined): string {
  return typeof value === 'string' ? value : JSON.stringify(value) ?? '—'
}

function DetailsBadge({ details }: { details: Json | null }) {
  if (details === null) return <span className="text-gray-300">—</span>
  if (typeof details !== 'object' || Array.isArray(details)) {
    return <span className="text-xs text-gray-500">{detailText(details)}</span>
  }
  if (Object.keys(details).length === 0) return <span className="text-gray-300">—</span>
  const entries = Object.entries(details).slice(0, 3)
  return (
    <span className="text-xs text-gray-500 space-x-1">
      {entries.map(([k, v]) => (
        <span key={k} className="bg-gray-100 rounded-sm px-1.5 py-0.5">
          {k}: {detailText(v)}
        </span>
      ))}
    </span>
  )
}

interface AdminUser {
  id: string
  email: string
}

export default function AdminLogsPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ action: '', from: '', to: '', admin_id: '' })
  const [adminList, setAdminList] = useState<AdminUser[]>([])
  const requestVersion = useRef(0)

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    delete_post:     { label: t('admin.logs.action.delete_post'),    color: 'bg-red-100 text-red-700' },
    delete_comment:  { label: t('admin.logs.action.delete_comment'), color: 'bg-red-100 text-red-700' },
    resolve_report:  { label: t('admin.logs.action.resolve_report'), color: 'bg-blue-100 text-blue-700' },
    grant_admin:     { label: t('admin.logs.action.grant_admin'),    color: 'bg-amber-100 text-amber-700' },
    revoke_admin:    { label: t('admin.logs.action.revoke_admin'),   color: 'bg-orange-100 text-orange-700' },
    toggle_official: { label: t('admin.logs.action.toggle_official'), color: 'bg-purple-100 text-purple-700' },
    login_success:   { label: t('admin.logs.action.login_success'),  color: 'bg-green-100 text-green-700' },
    login_failed:    { label: t('admin.logs.action.login_failed'),   color: 'bg-red-100 text-red-700' },
    review_water_report: { label: t('admin.logs.action.review_water_report'), color: 'bg-emerald-100 text-emerald-700' },
  }

  const TARGET_LABELS: Record<string, string> = {
    post:    t('admin.logs.target.post'),
    comment: t('admin.logs.target.comment'),
    report:  t('admin.logs.target.report'),
    user:    t('admin.logs.target.user'),
    water_report: t('admin.logs.target.water_report'),
  }

  useEffect(() => {
    supabase.rpc('get_admin_user_list').then(({ data }) => {
      if (data) setAdminList(data as AdminUser[])
    })
  }, [])

  const fetchLogs = useCallback(async () => {
    const version = ++requestVersion.current
    setLoading(true)
    setFetchError(false)
    try {
      const { data, error } = await supabase.rpc('get_audit_logs', {
        p_limit:    ADMIN_PAGE_SIZE,
        p_offset:   page * ADMIN_PAGE_SIZE,
        p_action:   filters.action   || null,
        p_from:     filters.from     || null,
        p_to:       filters.to       ? filters.to + 'T23:59:59' : null,
        p_admin_id: filters.admin_id || null,
      })
      if (version !== requestVersion.current) return
      if (error) throw error
      setLogs(data ?? [])
      setTotal(data?.[0]?.total_count ?? 0)
    } catch (error) {
      if (version !== requestVersion.current) return
      logError(error, 'AdminLogsPage:fetchLogs')
      setLogs([])
      setTotal(0)
      setFetchError(true)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void fetchLogs()
    return () => {
      // A retry may have advanced the counter; invalidate its current version on cleanup too.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestVersion.current++
    }
  }, [fetchLogs])

  function handleFilterChange(key: string, value: string) {
    setPage(0)
    setFilters(f => ({ ...f, [key]: value }))
  }

  function handleExportCSV() {
    const headers = [
      t('admin.logs.csv.date'),
      t('admin.logs.csv.operator'),
      t('admin.logs.csv.action'),
      t('admin.logs.csv.targetType'),
      t('admin.logs.csv.targetId'),
      t('admin.logs.csv.details'),
    ]
    const rows = logs.map((log: AuditLog) => [
      new Date(log.created_at).toLocaleString('ja-JP'),
      log.admin_email ?? log.admin_id,
      ACTION_LABELS[log.action]?.label ?? log.action,
      TARGET_LABELS[log.target_type] ?? log.target_type,
      log.target_id,
      JSON.stringify(log.details ?? {}),
    ])
    const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_logs_${todayLocalISODate()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / ADMIN_PAGE_SIZE)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t('admin.logs.title')}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{t('admin.logs.subtitle')}</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t('admin.logs.exportCsv')}
        </button>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <select
            value={filters.action}
            onChange={e => handleFilterChange('action', e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          >
            <option value="">{t('admin.logs.filter.allActions')}</option>
            {Object.entries(ACTION_LABELS).map(([value, { label }]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filters.admin_id}
            onChange={e => handleFilterChange('admin_id', e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          >
            <option value="">{t('admin.logs.filter.allAdmins')}</option>
            {adminList.map(admin => (
              <option key={admin.id} value={admin.id}>{admin.email}</option>
            ))}
          </select>
          <button
            onClick={() => handleFilterChange('admin_id', user?.id ?? '')}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 focus:outline-hidden focus:ring-2 focus:ring-gray-400 transition-colors"
          >
            {t('admin.logs.filter.myOnly')}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="date"
            value={filters.from}
            onChange={e => handleFilterChange('from', e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          />
          <input
            type="date"
            value={filters.to}
            onChange={e => handleFilterChange('to', e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          />
        </div>
      </div>

      {!loading && fetchError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <span>{t('admin.logs.fetchFailed')}</span>
          <button type="button" onClick={() => { void fetchLogs() }} className="min-h-11 px-3 rounded-lg bg-red-100 hover:bg-red-200 font-semibold">
            {t('common.retry')}
          </button>
        </div>
      )}

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
          {loading ? t('admin.logs.loading') : t('admin.logs.total', { count: total })}
        </div>
        {/* モバイル: カード表示 */}
        <div className="md:hidden divide-y divide-gray-100">
          {logs.map(log => {
            const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
            return (
              <div key={log.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionMeta.color}`}>
                    {actionMeta.label}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="truncate">{log.admin_email ?? <span className="text-gray-400 font-mono">{shortId(log.admin_id)}</span>}</span>
                </div>
                <div className="text-xs text-gray-500">
                  <span className="mr-1">{TARGET_LABELS[log.target_type] ?? log.target_type}</span>
                  <span className="font-mono text-gray-400">{shortId(log.target_id)}</span>
                </div>
                <DetailsBadge details={log.details} />
              </div>
            )
          })}
          {!loading && !fetchError && logs.length === 0 && (
            <div className="px-4 py-12 text-center text-gray-400">
              {t('admin.logs.empty')}
            </div>
          )}
        </div>

        {/* PC: テーブル表示 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.logs.table.date')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.logs.table.operator')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.logs.table.action')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.logs.table.target')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.logs.table.details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map(log => {
                const actionMeta = ACTION_LABELS[log.action] ?? { label: log.action, color: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                      {new Date(log.created_at).toLocaleString('ja-JP', {
                        month: 'numeric', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs truncate max-w-[160px]">
                      {log.admin_email ?? <span className="text-gray-400 font-mono text-[11px]">{shortId(log.admin_id)}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionMeta.color}`}>
                        {actionMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      <span className="mr-1">{TARGET_LABELS[log.target_type] ?? log.target_type}</span>
                      <span className="font-mono text-[11px] text-gray-400">{shortId(log.target_id)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <DetailsBadge details={log.details} />
                    </td>
                  </tr>
                )
              })}
              {!loading && !fetchError && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    {t('admin.logs.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800"
            >
              {t('admin.logs.prev')}
            </button>
            <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800"
            >
              {t('admin.logs.next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
