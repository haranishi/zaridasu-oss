'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'
import { WATER_REPORT_LIMITS } from '../constants'
import { createWaterPhotoUrls } from '../data/photos'
import { reviewWaterReport, selectWaterReportsForAdmin } from '../data/reports'
import type { WaterReport, WaterReportStatus } from '../types'

const button = 'min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700'

export default function AdminWaterReportsView() {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<WaterReport[]>([])
  const [publicNames, setPublicNames] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [limited, setLimited] = useState(false)
  const [photoError, setPhotoError] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [filter, setFilter] = useState<WaterReportStatus | 'all'>('pending')
  const [message, setMessage] = useState('')
  const [reviewError, setReviewError] = useState('')
  const generation = useRef(0)
  const mounted = useRef(true)
  const reviewLock = useRef(false)

  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setLoadError(false)
    setPhotoError(false)
    try {
      const { data, error, count } = await selectWaterReportsForAdmin(supabase, filter)
      if (error) throw error
      if (!mounted.current || request !== generation.current) return
      const list: WaterReport[] = data ?? []
      setLimited(count != null && count > list.length)
      setRows(list)
      setPublicNames(Object.fromEntries(list.map(row => [row.id, row.public_name ?? row.name])))
      setPhotos({})
      setLoading(false)
      const paths = [...new Set(list.flatMap(row => row.photo_paths))]
      if (paths.length === 0) return
      try {
        const urls = await createWaterPhotoUrls(supabase, paths)
        if (mounted.current && request === generation.current) {
          setPhotos(Object.fromEntries(urls.map(photo => [photo.path, photo.url])))
          setPhotoError(urls.length < paths.length)
        }
      } catch {
        if (mounted.current && request === generation.current) setPhotoError(true)
      }
    } catch (error) {
      if (!mounted.current || request !== generation.current) return
      logError(error, 'AdminWaterReportsView:load')
      setLoadError(true)
    } finally {
      if (mounted.current && request === generation.current) setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    mounted.current = true
    void load()
    const invalidate = () => { generation.current++ }
    return () => { mounted.current = false; invalidate() }
  }, [load])

  async function review(row: WaterReport, status: 'accepted' | 'rejected') {
    if (reviewLock.current) return
    const name = (publicNames[row.id] ?? '').trim()
    if (status === 'accepted' && (!name || [...name].length > WATER_REPORT_LIMITS.nameMax)) {
      setReviewError(t('water.admin.nameRequired'))
      return
    }
    reviewLock.current = true
    setReviewing(row.id)
    setReviewError('')
    setMessage('')
    try {
      await reviewWaterReport(supabase, row.id, status, status === 'accepted' ? name : undefined)
      if (!mounted.current) return
      setMessage(t(status === 'accepted' ? 'water.admin.acceptedNotice' : row.status === 'accepted' ? 'water.admin.unpublishedNotice' : 'water.admin.rejectedNotice'))
      await load()
    } catch (error) {
      if (mounted.current) {
        logError(error, 'AdminWaterReportsView:review')
        setReviewError(t('water.admin.reviewFailed'))
      }
    } finally {
      reviewLock.current = false
      if (mounted.current) setReviewing(null)
    }
  }

  const visibleRows = rows.filter(row => filter === 'all' || row.status === filter)
  const date = (value: string) => {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString(i18n.language)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">{t('water.admin.title')}</h1>
        <button type="button" disabled={loading || !!reviewing} onClick={() => void load()} className={`${button} border-gray-300 bg-white text-gray-900`}>{t('common.retry')}</button>
      </div>
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-950" role="note">{t('water.admin.notice')}</p>
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
        {t('water.admin.filter')}
        <select value={filter} disabled={loading || !!reviewing} onChange={event => { setMessage(''); setReviewError(''); setFilter(event.target.value as WaterReportStatus | 'all') }} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 disabled:opacity-50">
          {(['pending', 'accepted', 'rejected', 'all'] as const).map(status => <option key={status} value={status}>{t(`water.report.status.${status}`)}</option>)}
        </select>
      </label>
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
      {reviewError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{reviewError}</p>}
      {loading && <p role="status" className="py-8 text-center text-gray-600">{t('common.loading')}</p>}
      {!loading && loadError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{t('water.admin.loadFailed')}</p>}
      {photoError && <p role="status" className="text-sm text-gray-700">{t('water.admin.photoUnavailable')}</p>}
      {!loading && !loadError && <p className="text-sm text-gray-600">{t('water.admin.count', { count: visibleRows.length })}</p>}
      {!loading && !loadError && limited && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{t('water.admin.limited', { limit: WATER_REPORT_LIMITS.perUser })}</p>}
      {!loading && !loadError && visibleRows.length === 0 && <p className="py-8 text-center text-gray-600">{t('water.admin.empty')}</p>}
      {!loading && !loadError && <ul className="space-y-4" data-testid="water-reports-list">
        {visibleRows.map(row => <li key={row.id} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="min-w-0 wrap-break-word text-base font-bold text-gray-900">{row.name}</h2>
            <span className="rounded-full bg-gray-100 px-2 py-1 text-sm text-gray-800">{t(`water.report.status.${row.status}`)}</span>
          </div>
          <p className="text-sm text-gray-600">{date(row.created_at)} · {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}</p>
          {row.note && <p className="whitespace-pre-wrap wrap-break-word text-sm text-gray-800">{row.note}</p>}
          <div className="flex flex-wrap gap-2">
            {row.photo_paths.map((path, index) => photos[path] ? (
              // eslint-disable-next-line @next/next/no-img-element -- Private signed images must not enter a public image cache.
              <img key={path} src={photos[path]} alt={t('water.report.photoAlt', { number: index + 1 })} loading="lazy" className="h-28 w-28 rounded-xl border border-gray-200 object-cover" />
            ) : <span key={path} className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-gray-300 p-2 text-center text-xs text-gray-600">{t('water.admin.photoUnavailable')}</span>)}
          </div>
          <label className="block space-y-1 text-sm font-medium text-gray-800" htmlFor={`water-name-${row.id}`}>
            <span>{t('water.admin.publicName')}</span>
            <input id={`water-name-${row.id}`} value={publicNames[row.id] ?? row.name} maxLength={WATER_REPORT_LIMITS.nameMax} disabled={!!reviewing} onChange={event => setPublicNames(names => ({ ...names, [row.id]: event.target.value }))} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-base text-gray-900" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!reviewing} onClick={() => void review(row, 'accepted')} className={`${button} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`}>{reviewing === row.id ? t('water.admin.saving') : t('water.admin.accept')}</button>
            <button type="button" disabled={!!reviewing || row.status === 'rejected'} onClick={() => void review(row, 'rejected')} className={`${button} border-gray-300 bg-white text-gray-900 hover:bg-gray-50`}>{t(row.status === 'accepted' ? 'water.admin.unpublish' : 'water.admin.reject')}</button>
          </div>
        </li>)}
      </ul>}
    </div>
  )
}
