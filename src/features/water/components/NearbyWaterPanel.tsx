'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { formatWaterDistance } from '../lib/candidates'
import type { WaterCandidate } from '../types'

export interface NearbyWaterPanelProps {
  candidates: WaterCandidate[]
  selectedId: string | null
  onSelect: (candidate: WaterCandidate) => void
  onAddToPlan: (candidate: WaterCandidate) => void
  onReport: () => void
  onClose: () => void
}

/** 地図を残す小さな一覧。計画・写真フォーム本体はこのチャンクにも取り込まない。 */
export default function NearbyWaterPanel({ candidates, selectedId, onSelect, onAddToPlan, onReport, onClose }: NearbyWaterPanelProps) {
  const { t } = useTranslation()
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const [onlyNoRecords, setOnlyNoRecords] = useState(false)
  const shown = onlyNoRecords ? candidates.filter(c => c.publicRecordCount === 0) : candidates
  const nearestNoRecord = candidates.find(c => c.publicRecordCount === 0)
  useEffect(() => { headingRef.current?.focus() }, [])
  return (
    <section aria-label={t('water.listTitle')} style={{ maxHeight: 'max(8rem, min(36dvh, calc(100dvh - 29rem)))' }} className="pointer-events-auto! flex w-[min(320px,calc(100vw-16px))] flex-col rounded-xl border border-gray-200 bg-white shadow-lg">
      <div className="flex shrink-0 items-center justify-between border-b px-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-700">{t('water.listTitle')}</h2>
        <button type="button" onClick={onClose} aria-label={t('water.closeList')} className="flex min-h-11 min-w-11 items-center justify-center"><X size={18} /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3 text-xs">
        <p className="mb-2 leading-relaxed text-gray-600">{t('water.recordsNote')}</p>
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={onlyNoRecords} onChange={e => setOnlyNoRecords(e.target.checked)} />
          {t('water.onlyNoRecords')}
        </label>
        <button type="button" onClick={() => nearestNoRecord && onSelect(nearestNoRecord)} disabled={!nearestNoRecord} className="mb-2 min-h-11 w-full rounded-lg border px-3 font-semibold disabled:opacity-50">{t('water.chooseNoRecord')}</button>
        {shown.length === 0 && <p role="status" className="py-3 text-gray-600">{t('water.noCandidates')}</p>}
        <ul className="space-y-2">
          {shown.map(candidate => (
            <li key={candidate.id} className={`rounded-lg border p-2 ${candidate.id === selectedId ? 'border-blue-700 bg-blue-50' : 'border-gray-200'}`}>
              <button type="button" onClick={() => onSelect(candidate)} aria-pressed={candidate.id === selectedId} className="min-h-11 w-full text-left">
                <span className="block break-words text-sm font-semibold">{candidate.name ?? t('water.genericName')}</span>
                <span className="block text-gray-600">{t('water.distance', { distance: formatWaterDistance(candidate.distanceM) })}{candidate.source === 'community' && ` · ${t('water.community')}`}</span>
                <span className="block text-gray-600">{candidate.publicRecordCount === null ? t('water.publicRecordUnknown') : candidate.publicRecordCount === 0 ? t('water.noPublicRecords') : t('water.publicRecordCount', { count: candidate.publicRecordCount })}</span>
              </button>
              {candidate.id === selectedId && <p className="mb-1 text-gray-600">{t('water.shoreHint')}</p>}
              <button type="button" onClick={() => onAddToPlan(candidate)} aria-label={`${candidate.name ?? t('water.genericName')}: ${t('water.addToPlan')}`} className="min-h-11 rounded-lg border border-emerald-700 px-3 font-semibold text-emerald-900">{t('water.addToPlan')}</button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onReport} className="mt-3 min-h-11 w-full rounded-lg border px-3 font-semibold">{t('water.reportButton')}</button>
      </div>
    </section>
  )
}
