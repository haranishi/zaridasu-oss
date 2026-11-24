'use client'

// REQ-329: 利用者がクイック保存した非公開スポットの一覧（管理者・閲覧専用）。
// 希少種の生息地のメモなど、公開ページ・公開データセットには一切出ないデータ。研究のために管理者だけが見る。
// 取り扱い注意の表示を必ず出し、利用者の識別は短縮 ID に留める（メールは出さない）。

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { selectPrivateSpotsForAdmin, type AdminPrivateSpot } from '@/lib/data/private-spots'
import { csvCell } from '@/lib/csv'
import RouteLinks from '@/components/ui/RouteLinks'
import { logError } from '@/lib/errorHandler'

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ja-JP')
}

export default function AdminSpotsPage() {
  const { t } = useTranslation()
  const [spots, setSpots] = useState<AdminPrivateSpot[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    const { data, error } = await selectPrivateSpotsForAdmin(supabase)
    if (error) {
      logError(error, 'AdminSpotsPage:load')
      setFetchError(true)
    } else {
      setSpots(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function handleExportCsv() {
    const headers = ['id', 'recorded_at', 'name', 'note', 'lat', 'lng', 'accuracy_m', 'user_id']
    const rows = spots.map((s) => [
      s.id, s.recorded_at, s.name, s.note, Number(s.lat), Number(s.lng),
      s.accuracy != null ? Number(s.accuracy) : null, s.user_id,
    ].map((v) => csvCell(v as string | number | null)).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zaridasu-private-spots-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">🔒 {t('admin.spots.title')}</h1>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={spots.length === 0}
          className="flex items-center gap-1.5 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          {t('admin.spots.exportCsv')}
        </button>
      </div>

      <div className="bg-violet-50 border border-violet-200 text-violet-900 rounded-xl p-4 text-sm leading-relaxed">
        <p className="font-semibold mb-1">{t('admin.spots.noticeTitle')}</p>
        <p>{t('admin.spots.noticeBody')}</p>
      </div>

      {loading && <p className="text-sm text-gray-400 py-8 text-center">{t('admin.spots.loading')}</p>}
      {!loading && fetchError && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <span>{t('admin.spots.fetchFailed')}</span>
          <button type="button" onClick={() => { void load() }} className="min-h-11 px-3 rounded-lg bg-red-100 hover:bg-red-200 font-semibold">
            {t('common.retry')}
          </button>
        </div>
      )}
      {!loading && !fetchError && spots.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">{t('admin.spots.empty')}</p>
      )}

      {!loading && !fetchError && spots.length > 0 && (
        <>
          <p className="text-xs text-gray-500">{t('admin.spots.count', { count: spots.length })}</p>
          <ul className="space-y-3">
            {spots.map((s) => (
              <li key={s.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-800 wrap-break-word">{s.name}</p>
                    {s.note && <p className="text-sm text-gray-600 whitespace-pre-wrap wrap-break-word mt-0.5">{s.note}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDateTime(s.recorded_at)}
                      {' · '}
                      {Number(s.lat).toFixed(5)}, {Number(s.lng).toFixed(5)}
                      {s.accuracy != null && ` · ±${Math.round(Number(s.accuracy))}m`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t('admin.spots.user')}: <span className="font-mono">{s.user_id.slice(0, 8)}</span>
                    </p>
                  </div>
                  <RouteLinks lat={Number(s.lat)} lng={Number(s.lng)} variant="popup" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
