'use client'

import { useId, useState, type FormEvent } from 'react'
import { Camera, Droplets, Loader2, MapPin, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { PrivateNote, SheetFrame, smallBtn, tone } from '@/features/fieldwork/components/parts'

import { WATER_REPORT_LIMITS } from './constants'
import { WATER_PHOTO_TYPES } from './data/photos'
import type { WaterPosition } from './types'
import { useWaterReport } from './useWaterReport'

interface Props {
  userId: string
  position: WaterPosition
  onClose: () => void
  onSubmitted?: () => void
}

export default function WaterReportSheet(props: Props) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const titleId = useId()
  return (
    <SheetFrame titleId={titleId} title={t('water.report.title')} onClose={props.onClose}
      testId="water-report-sheet" icon={<Droplets size={20} aria-hidden="true" />}>
      {user?.id === props.userId
        ? <ReportForm key={props.userId} {...props} />
        : <p role="alert">{t('water.report.errors.accountChanged')}</p>}
    </SheetFrame>
  )
}

function ReportForm({ userId, position, onClose, onSubmitted }: Props) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const id = useId()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [selectedPosition] = useState(() => ({ ...position }))
  const report = useWaterReport(userId, selectedPosition)
  const disabled = report.busy || report.locked || report.photoProcessing !== null
  const inputClass = `block w-full rounded-xl border-2 px-3 py-2.5 text-base ${c.input} disabled:opacity-70`

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!(await report.submit(name, note))) return
    toast.success(t('water.report.success'))
    onSubmitted?.()
    onClose()
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${c.subtle}`}>
        <MapPin size={16} aria-hidden="true" className="shrink-0" />
        <span>{t('water.report.position')}<br /><span className="tabular-nums">{selectedPosition.lat.toFixed(5)}, {selectedPosition.lng.toFixed(5)}</span></span>
      </div>
      <div>
        <label htmlFor={`${id}-name`} className="mb-1 block text-sm font-semibold">{t('water.report.name')} *</label>
        <input id={`${id}-name`} data-testid="water-report-name" value={name} required maxLength={WATER_REPORT_LIMITS.nameMax}
          placeholder={t('water.report.namePlaceholder')} disabled={disabled} onChange={(event) => setName(event.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="mb-1 block text-sm font-semibold">{t('water.report.note')}</label>
        <textarea id={`${id}-note`} data-testid="water-report-note" value={note} rows={2} maxLength={WATER_REPORT_LIMITS.noteMax}
          placeholder={t('water.report.notePlaceholder')} disabled={disabled} onChange={(event) => setNote(event.target.value)} className={inputClass} />
      </div>
      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold">{t('water.report.photos')} *</legend>
        <div className="flex flex-wrap items-center gap-5 pt-4 pr-3">
          {report.photos.map((photo, index) => (
            <div key={photo.preview} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- Sanitized, local blob preview; never a public URL. */}
              <img src={photo.preview} alt={t('water.report.photoAlt', { number: index + 1 })} className="h-20 w-20 rounded-lg object-cover" />
              <button type="button" onClick={() => report.removePhoto(index)} aria-label={t('water.report.removePhoto', { number: index + 1 })}
                className="absolute -top-4 -right-4 flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-50">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white"><X size={14} aria-hidden="true" /></span>
              </button>
            </div>
          ))}
          {report.photos.length < WATER_REPORT_LIMITS.photosMax && (
            <label className={`${smallBtn} ${c.btn} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
              <Camera size={16} aria-hidden="true" />{t('water.report.addPhotos')}
              <input type="file" accept={WATER_PHOTO_TYPES.join(',')} multiple className="sr-only" data-testid="water-report-photos"
                onChange={(event) => { void report.addPhotos(event.target.files); event.target.value = '' }} />
            </label>
          )}
        </div>
        <p className={`mt-2 text-sm ${c.muted}`}>{t('water.report.photoHint')}</p>
      </fieldset>
      {report.photoProcessing && <p role="status" className={`text-sm ${c.muted}`}>
        {t('water.report.preparing', report.photoProcessing)}
      </p>}
      <div className={`sticky bottom-0 -mx-5 -mb-5 space-y-2.5 border-t px-5 pt-3 pb-5 ${c.card} ${c.border}`}>
        <PrivateNote dark={dark} text={t('water.report.privacy')} />
        {report.errorKey && <p role="alert" className="text-sm text-red-600">{t(report.errorKey)}</p>}
        <button type="submit" data-testid="water-report-submit" disabled={report.busy || report.photoProcessing !== null}
          className={`${smallBtn} w-full border-blue-700 bg-blue-700 py-3 text-base text-white hover:bg-blue-800`}>
          {report.busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {t(report.busy ? 'water.report.submitting' : 'water.report.submit')}
        </button>
      </div>
    </form>
  )
}
