'use client'

// REQ-330: 利用者が非公開で残した希少種の記録の一覧（管理者・閲覧専用）。AdminSpotsPage（REQ-329）と同じ形。
// 公開ページ・公開データセットには一切出ないデータ。研究と保全の判断のために運営だけが見る。
// 取り扱い注意の表示を必ず出し、利用者の識別は短縮 ID に留める（メールは出さない）。
// 写真は 1 時間の署名 URL で小さく出す（公開 URL は作らない）。CSV は csvCell を通す（式の差し込み対策）。

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import RouteLinks from '@/components/ui/RouteLinks'
import { csvCell } from '@/lib/csv'
import { logError } from '@/lib/errorHandler'
import { supabase } from '@/lib/supabase/client'

import { isKnownRareSpecies } from '../constants'
import { createRarePhotoUrls } from '../data/rarePhotos'
import { selectRareSightingsForAdmin, type AdminRareSighting } from '../data/rareSightings'

/** 「2026/10/02 10:20」（利用者の画面と同じ書き方。秒は出さない）。 */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminRareSightingsView() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AdminRareSighting[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  const speciesName = useCallback(
    (r: Pick<AdminRareSighting, 'species_key' | 'species_label'>) =>
      r.species_key === 'other'
        ? `${t('fieldwork.rareSpecies.other')}（${r.species_label ?? ''}）`
        : isKnownRareSpecies(r.species_key)
          ? t(`fieldwork.rareSpecies.${r.species_key}`)
          : r.species_key,
    [t]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(false)
    const { data, error } = await selectRareSightingsForAdmin(supabase)
    if (error) {
      logError(error, 'AdminRareSightingsView:load')
      setFetchError(true)
      setLoading(false)
      return
    }
    const list = data ?? []
    setRows(list)
    setLoading(false)
    const paths = list.flatMap((r) => r.photo_paths)
    if (paths.length === 0) return
    try {
      const urls = await createRarePhotoUrls(supabase, paths)
      setPhotos(Object.fromEntries(urls.map((u) => [u.path, u.url])))
    } catch (err) {
      // 写真が出なくても一覧は使える。理由はログに残す
      logError(err, 'AdminRareSightingsView:photos')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function handleExportCsv() {
    const headers = [
      'id',
      'observed_at',
      'species_key',
      'species_label',
      'count',
      'note',
      'lat',
      'lng',
      'accuracy_m',
      'location_source',
      'stop_id',
      'photo_count',
      'user_id',
      'created_at',
    ]
    const lines = rows.map((r) =>
      [
        r.id,
        r.observed_at,
        r.species_key,
        r.species_label,
        r.count,
        r.note,
        Number(r.lat),
        Number(r.lng),
        r.accuracy != null ? Number(r.accuracy) : null,
        r.location_source,
        r.stop_id,
        r.photo_paths.length,
        r.user_id,
        r.created_at,
      ]
        .map((v) => csvCell(v as string | number | null))
        .join(',')
    )
    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zaridasu-rare-sightings-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-800">🔐 {t('fieldwork.admin.title')}</h1>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
        >
          {t('fieldwork.admin.exportCsv')}
        </button>
      </div>

      {/* 注意書きは語の途中で折らない（調査パネルと同じ word-break: auto-phrase と text-wrap: pretty） */}
      <div role="note" className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 text-sm leading-relaxed text-violet-950 [word-break:auto-phrase] text-pretty">
        <p className="mb-1 font-bold">⚠ {t('fieldwork.admin.noticeTitle')}</p>
        {/* 1 行が長すぎると読みにくいので、全角 40 字ほどで折り返す */}
        <p className="max-w-[40em]">{t('fieldwork.admin.noticeBody')}</p>
      </div>

      {loading && <p className="py-8 text-center text-sm text-gray-500">{t('fieldwork.panel.loading')}</p>}
      {!loading && fetchError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{t('fieldwork.admin.fetchFailed')}</span>
          <button type="button" onClick={() => void load()} className="min-h-11 rounded-lg bg-red-100 px-3 font-semibold hover:bg-red-200">
            {t('common.retry')}
          </button>
        </div>
      )}
      {!loading && !fetchError && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500">{t('fieldwork.admin.empty')}</p>
      )}

      {!loading && !fetchError && rows.length > 0 && (
        <>
          <p className="text-xs text-gray-600">{t('fieldwork.admin.count', { count: rows.length })}</p>
          <ul className="space-y-3" data-testid="admin-rare-list">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 md:flex-1">
                    <p className="font-bold text-gray-900 wrap-break-word">
                      🔒 {speciesName(r)}
                      {r.count != null && <span className="ml-2 text-sm font-semibold text-gray-700">{t('fieldwork.admin.countValue', { count: r.count })}</span>}
                    </p>
                    {r.note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700 wrap-break-word">{r.note}</p>}
                    <p className="mt-1 text-xs text-gray-600">
                      {t('fieldwork.admin.observed')}: {formatDateTime(r.observed_at)}
                      {' · '}
                      {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)}
                      {/* 利用者の画面と同じ「誤差 約8m」。数と単位・「地図上の位置」は折り返さない固まりにする */}
                      {r.accuracy != null && (
                        <>
                          {' · '}
                          <span className="whitespace-nowrap">{t('fieldwork.admin.accuracy', { m: Math.round(Number(r.accuracy)) })}</span>
                        </>
                      )}
                      {' · '}
                      <span className="whitespace-nowrap">{t(`fieldwork.admin.source.${r.location_source}`)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {t('fieldwork.admin.user')}: <span className="font-mono">{r.user_id.slice(0, 8)}</span>
                      {r.stop_id && ` · ${t('fieldwork.admin.fromPlan')}`}
                    </p>
                    {r.photo_paths.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.photo_paths.map((p, i) =>
                          photos[p] ? (
                            // eslint-disable-next-line @next/next/no-img-element -- 1 時間の署名 URL。画像最適化の経路に通すと期限付きの URL が別の場所に残る
                            <img
                              key={p}
                              src={photos[p]}
                              alt={t('fieldwork.rare.photoAlt', { n: i + 1 })}
                              loading="lazy"
                              className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                            />
                          ) : (
                            <span key={p} className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-gray-300 text-[11px] text-gray-500">
                              {t('fieldwork.admin.photoUnavailable')}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                  <RouteLinks lat={Number(r.lat)} lng={Number(r.lng)} variant="popup" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
