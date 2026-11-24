'use client'

// REQ-330: 「いなかった」の確認（1 回）。種を選び（既定はアメリカザリガニだけ）、調査にかけた分数は任意。
// 確定すると種ごとに不在の投稿（調査方法 structured）を作り、地点とつないで「済み」にする。
// 承認は DB が決める: 管理者以外の投稿は INSERT 時に pending に戻る（protect_post_insert_columns）ので、
// 運営の確認のあとで地図に出る。管理者の分だけすぐ出る。画面の説明もこの事実に合わせる。
// 不在の記録は研究価値が最も高いのに、投稿フォームの 5 択に埋もれて累計 0 件だった（9/28 時点）ので、
// 地点シートから確認 1 回で残せるようにした（REQ-330 §1「5 階層で変わった設計」1）。
// 位置の規則と、位置が公開になるか非公開になるかは、確定前に必ず見せる。

import { useState } from 'react'
import Image from 'next/image'
import { Ban, Check, Globe, Info, Loader2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { SPECIES } from '@/lib/constants'
import { todayLocalISODate } from '@/lib/localDate'
import type { Species } from '@/types'

import type { StopView } from '../hooks/useFieldworkPlan'
import type { RecordPosition } from '../lib/positionRule'
import { PositionLine, SheetFrame, StopBadge, smallBtn, stopName, tone } from './parts'

/** posts.survey_duration_minutes の CHECK（1〜480 分）。 */
const MINUTES_MAX = 480

export interface AbsenceConfirmInput {
  species: Species[]
  surveyDurationMinutes: number | null
  observedOn: string
}

interface AbsenceConfirmProps {
  stop: StopView
  /** 「希少種を自分の地図に表示」。切っている間は番号の丸に錠前を付けない。 */
  showRare: boolean
  position: RecordPosition
  onConfirm: (input: AbsenceConfirmInput) => Promise<'saved' | 'queued'>
  onClose: () => void
  errorText: (err: unknown) => string
}

export default function AbsenceConfirm({ stop, showRare, position, onConfirm, onClose, errorText }: AbsenceConfirmProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const { isAdmin } = useAuth()
  const toast = useToastContext()
  const c = tone(dark)
  const [species, setSpecies] = useState<Species[]>(['american'])
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const minutesNumber = minutes.trim() === '' ? null : Number(minutes)
  const minutesInvalid =
    minutesNumber !== null && (!Number.isInteger(minutesNumber) || minutesNumber < 1 || minutesNumber > MINUTES_MAX)

  const toggle = (value: Species) =>
    setSpecies((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]))

  const submit = async () => {
    if (busy) return
    if (species.length === 0) {
      setError(t('fieldwork.absence.needSpecies'))
      return
    }
    if (minutesInvalid) {
      setError(t('fieldwork.absence.minutesInvalid'))
      return
    }
    setBusy(true)
    setError('')
    try {
      // 種の並びは一覧の順にそろえる（押した順に依存させない）
      const ordered = SPECIES.map((s) => s.value).filter((v) => species.includes(v))
      const result = await onConfirm({ species: ordered, surveyDurationMinutes: minutesNumber, observedOn: todayLocalISODate() })
      toast.success(result === 'queued' ? t('fieldwork.queue.saved') : t('fieldwork.absence.saved'))
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const chip = (active: boolean) =>
    `flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-colors ${
      active
        ? dark ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100' : 'border-emerald-700 bg-emerald-50 text-emerald-900'
        : dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-800 hover:bg-gray-50'
    }`

  return (
    <SheetFrame
      titleId="fieldwork-absence-title"
      testId="fieldwork-absence-confirm"
      onClose={onClose}
      icon={<Ban size={20} aria-hidden="true" className="shrink-0" />}
      title={t('fieldwork.absence.title')}
    >
      <div className="-mt-1 flex items-center gap-2">
        <StopBadge number={stop.number} status={stop.shownStatus} rare={showRare && stop.rare} />
        <span className="min-w-0 wrap-break-word text-sm font-semibold">{stopName(stop, t)}</span>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t('fieldwork.absence.speciesLabel')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SPECIES.map((s) => {
            const on = species.includes(s.value)
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                data-testid={`fieldwork-absence-species-${s.value}`}
                onClick={() => toggle(s.value)}
                className={chip(on)}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                    on ? 'border-emerald-700 bg-emerald-700 text-white' : dark ? 'border-slate-400' : 'border-gray-400 bg-white'
                  }`}
                >
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <Image src={s.image} alt="" aria-hidden="true" width={22} height={22} className="h-5.5 w-5.5 shrink-0 object-contain" />
                <span className="min-w-0 leading-tight">{t(`species.${s.value}`)}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="fieldwork-absence-minutes" className="mb-1 block text-sm font-semibold">
          {t('fieldwork.absence.minutesLabel')}
        </label>
        <input
          id="fieldwork-absence-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={MINUTES_MAX}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder={t('fieldwork.absence.minutesPlaceholder')}
          aria-invalid={minutesInvalid}
          className={`block w-40 rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`}
        />
      </div>

      <div className={`space-y-1.5 rounded-xl px-3 py-2.5 ${c.subtle}`}>
        <PositionLine position={position} locating={false} dark={dark} />
        {stop.rare ? (
          <p className={`flex items-start gap-1.5 text-sm leading-snug ${c.violet}`} data-testid="fieldwork-absence-private">
            <Lock size={13} aria-hidden="true" className="mt-px shrink-0" />
            {t('fieldwork.absence.disclosurePrivate')}
          </p>
        ) : (
          <p className={`flex items-start gap-1.5 text-sm leading-snug ${c.muted}`}>
            <Globe size={13} aria-hidden="true" className="mt-px shrink-0" />
            {t('fieldwork.absence.disclosurePublic')}
          </p>
        )}
        <p className={`flex items-start gap-1.5 text-sm leading-snug ${c.muted}`} data-testid="fieldwork-absence-review">
          <Info size={13} aria-hidden="true" className="mt-px shrink-0" />
          {isAdmin ? t('fieldwork.absence.reviewAdmin') : t('fieldwork.absence.review')}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={`${smallBtn} ${c.btn}`}>
          {t('fieldwork.common.cancel')}
        </button>
        <button
          type="button"
          data-testid="fieldwork-absence-submit"
          onClick={() => void submit()}
          disabled={busy || species.length === 0}
          className={`${smallBtn} flex-1 border-gray-900 bg-gray-900 py-3 text-base text-white hover:bg-black`}
        >
          {busy ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Ban size={18} aria-hidden="true" />}
          {busy ? t('fieldwork.absence.submitting') : t('fieldwork.absence.submit', { count: species.length })}
        </button>
      </div>
    </SheetFrame>
  )
}
