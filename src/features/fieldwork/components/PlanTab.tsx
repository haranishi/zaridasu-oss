'use client'

// REQ-330: 調査パネルの「調査計画」タブ。上から次の順に並べる。
//   1. 題名・予定日・進み具合（「3 / 5地点 終了（飛ばしを含む）」）。題名に日付が入っていれば予定日は重ねて出さない
//   2. 次の地点のカード（今日の計画で未調査の地点があるときだけ）。「次：④ 西の水路」と主ボタン
//      「この地点を開く（案内・記録）」。パネルの中で塗りつぶしのボタンはこれ 1 つ（色は既存の主ボタンの赤）
//   3. 「残りの地点をまとめて案内（N地点）」の開閉。開いた中に安全の一言
//   4. 地点の一覧（StopList。次の地点に「次」の札）
//   5. 地点を足す（地図で選ぶ・保存したスポットから選ぶ・現在地を足す）
//   6. 計画の操作（この計画を終える・この計画をもう一度使う）
//   7. これまでの計画（1 件以上あるときだけ。今の計画の操作を途切れさせないよう一番下）
// 計画がまだ無いときは「調査の計画を作る」。前の晩に作ることが多いので予定日を選べるようにし、16 時以降は明日を選んでおく。
// Google／Yahoo!／Apple の経路ボタンは地点シートにまとめた。地点シートは必ず安全の一言を通るので、
// 安全の一言を通らない案内の入口を作らない。
// 計画の編集は電波のある場所だけ。圏外では押せなくし、理由を出す。

import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Crosshair, ExternalLink, Lock, MapPin, Navigation, Pencil, Plus, Repeat, Route } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { btnPrimaryCls } from '@/lib/formStyles'
import { todayLocalISODate } from '@/lib/localDate'

import { FIELDWORK_LIMITS } from '../constants'
import type { FieldworkPlanApi, StopView } from '../hooks/useFieldworkPlan'
import { errorMessage } from '../lib/errors'
import { addDays, defaultPlannedOn, planDay, shortDate } from '../lib/planDate'
import { buildGoogleRouteSegments } from '../lib/routeSegments'
import SpotPicker from './SpotPicker'
import StopList from './StopList'
import { SafetyNote, sectionHeading, smallBtn, StopBadge, stopName, tone } from './parts'

interface PlanTabProps {
  userId: string
  plan: FieldworkPlanApi
  online: boolean
  /** 「希少種を自分の地図に表示」。切っている間は「希少種あり」の印を出さない。 */
  showRare: boolean
  /** 次の地点（今日の計画で未調査の最初の地点）。 */
  nextStop: StopView | null
  pickMode: boolean
  onPickModeChange: (on: boolean) => void
  onOpenStop: (stopId: string) => void
  onAddCurrentLocation: () => Promise<void>
  /** 新しい計画の題名（予定日 YYYY-MM-DD を渡す。省略すると今日）。 */
  newPlanTitle: (plannedOn?: string) => string
}

export default function PlanTab({
  userId,
  plan,
  online,
  showRare,
  nextStop,
  pickMode,
  onPickModeChange,
  onOpenStop,
  onAddCurrentLocation,
  newPlanTitle,
}: PlanTabProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const today = todayLocalISODate()
  const current = plan.currentPlan
  const canEdit = plan.canEdit
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDate, setDraftDate] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [showSpots, setShowSpots] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  // 計画が無いときに作る計画の予定日（16 時以降は明日を最初から選んでおく）
  const [newPlannedOn, setNewPlannedOn] = useState(() => defaultPlannedOn())

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      if (success) toast.success(success)
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(null)
    }
  }

  const todayPlan = plan.plans.find((p) => p.planned_on === today && p.status === 'active') ?? null
  const history = plan.plans.filter((p) => p.id !== current?.id)
  const stops = plan.stops
  const counts = useMemo(
    () => ({
      done: stops.filter((s) => s.shownStatus === 'done').length,
      skipped: stops.filter((s) => s.shownStatus === 'skipped').length,
      pending: stops.filter((s) => s.shownStatus === 'pending').length,
    }),
    [stops]
  )
  const pendingStops = useMemo(() => stops.filter((s) => s.shownStatus === 'pending'), [stops])
  const segments = useMemo(
    () => buildGoogleRouteSegments(pendingStops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) }))),
    [pendingStops]
  )

  const createToday = () =>
    run('create', () => plan.createPlan({ title: newPlanTitle(today), plannedOn: today }), t('fieldwork.plan.created'))
  const createOn = (plannedOn: string) =>
    run('create', () => plan.createPlan({ title: newPlanTitle(plannedOn), plannedOn }), t('fieldwork.plan.created'))
  const tomorrow = addDays(today, 1)

  const startEdit = () => {
    if (!current) return
    setDraftTitle(current.title)
    setDraftDate(current.planned_on)
    setEditing(true)
  }
  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault()
    const title = draftTitle.replace(/\s+/g, ' ').trim().slice(0, FIELDWORK_LIMITS.planTitleMax)
    if (!title) return
    void run('edit', async () => {
      await plan.updateCurrentPlan({ title, ...(draftDate ? { plannedOn: draftDate } : {}) })
      setEditing(false)
    })
  }

  const editHint = !canEdit ? <p className={`text-sm ${dark ? 'text-amber-300' : 'text-amber-800'}`}>{t('fieldwork.add.offline')}</p> : null
  const sectionTop = `space-y-2 border-t pt-4 ${c.border}`

  if (plan.loadState === 'loading' || plan.loadState === 'idle') {
    return <p className={`py-6 text-center text-sm ${c.muted}`}>{t('fieldwork.panel.loading')}</p>
  }
  if (plan.loadState === 'error') {
    return (
      <div role="alert" className="space-y-2 py-4 text-center text-sm">
        <p>{online ? t('fieldwork.panel.loadFailed') : t('fieldwork.panel.offlineNoCache')}</p>
        <button type="button" onClick={() => void plan.load()} className={`${smallBtn} ${c.btn}`}>
          {t('fieldwork.common.retry')}
        </button>
      </div>
    )
  }

  const historyList = history.length === 0 ? null : (
    <div>
      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        aria-expanded={showHistory}
        className={`flex min-h-11 items-center gap-1 text-sm font-semibold ${c.muted}`}
      >
        {showHistory ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        {t('fieldwork.plan.history')}
        <span className="tabular-nums">（{history.length}）</span>
      </button>
      {showHistory && (
        <ul className={`mt-1 divide-y rounded-xl border ${c.border} ${dark ? 'divide-slate-700' : 'divide-gray-200'}`}>
          {history.length === 0 && <li className={`px-3 py-2 text-sm ${c.muted}`}>{t('fieldwork.plan.historyEmpty')}</li>}
          {history.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setShowHistory(false)
                  void plan.selectPlan(p.id)
                }}
                className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{p.title}</span>
                <span className={`shrink-0 text-[13px] ${c.muted}`}>
                  {shortDate(p.planned_on)}
                  {p.status !== 'active' && ` · ${t('fieldwork.plan.statusDone')}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  if (!current) {
    const dateChip = (value: string, label: string, testId: string) => (
      <button
        type="button"
        data-testid={testId}
        aria-pressed={newPlannedOn === value}
        onClick={() => setNewPlannedOn(value)}
        className={`flex min-h-11 items-center justify-center gap-1 rounded-xl border-2 px-3 text-sm font-semibold ${
          newPlannedOn === value
            ? dark ? 'border-slate-100 bg-slate-100 text-slate-900' : 'border-gray-900 bg-gray-900 text-white'
            : dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-800 hover:bg-gray-50'
        }`}
      >
        {newPlannedOn === value && <Check size={15} strokeWidth={3} aria-hidden="true" />}
        {label}
      </button>
    )
    return (
      <div className="space-y-4">
        <div className={`space-y-3 rounded-2xl border-2 border-dashed p-4 ${c.border}`}>
          <p className="text-base font-bold">{t('fieldwork.plan.noPlan')}</p>
          <p className={`whitespace-pre-line text-sm leading-relaxed ${c.muted}`} data-testid="fieldwork-empty-lead">
            {t('fieldwork.plan.emptyLead')}
          </p>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">{t('fieldwork.plan.dateLabel')}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {dateChip(today, t('fieldwork.plan.dayToday', { date: shortDate(today) }), 'fieldwork-new-today')}
              {dateChip(tomorrow, t('fieldwork.plan.dayTomorrow', { date: shortDate(tomorrow) }), 'fieldwork-new-tomorrow')}
              <input
                type="date"
                aria-label={t('fieldwork.plan.dayOther')}
                data-testid="fieldwork-new-date"
                value={newPlannedOn}
                min={today}
                onChange={(e) => e.target.value && setNewPlannedOn(e.target.value)}
                className={`min-h-11 rounded-xl border-2 px-2 text-base md:text-sm ${c.input}`}
              />
            </div>
          </fieldset>
          {/* 計画が無いときは、これがこの画面でただ 1 つの主ボタン */}
          <button
            type="button"
            data-testid="fieldwork-create-today"
            onClick={() => void createOn(newPlannedOn)}
            disabled={!canEdit || busy === 'create'}
            className={`flex min-h-12 w-full items-center justify-center gap-2 px-3 py-3 text-base font-bold ${btnPrimaryCls}`}
          >
            <Plus size={18} aria-hidden="true" />
            {t('fieldwork.plan.createPlan')}
          </button>
          {editHint}
        </div>
        {historyList}
      </div>
    )
  }

  const day = planDay(current.planned_on, today)
  const isToday = day === 'today'
  // 題名に予定日（「10/2」）が入っていれば、予定日の行は重ねて出さない
  const titleHasDate = current.title.includes(shortDate(current.planned_on))
  const finished = current.status !== 'active'
  const total = stops.length

  return (
    <div className="space-y-4">
      {/* 1. 題名・予定日・進み具合 */}
      <section className="space-y-2" aria-labelledby="fieldwork-plan-title">
        {!todayPlan && !isToday && (
          <button
            type="button"
            onClick={() => void createToday()}
            disabled={!canEdit || busy === 'create'}
            className={`${smallBtn} w-full ${c.btn}`}
          >
            <Plus size={16} aria-hidden="true" />
            {t('fieldwork.plan.createToday')}
          </button>
        )}
        {todayPlan && todayPlan.id !== current.id && (
          <button type="button" onClick={() => void plan.selectPlan(todayPlan.id)} className={`${smallBtn} w-full ${c.btn}`}>
            {t('fieldwork.plan.openToday')}
          </button>
        )}

        {editing ? (
          <form onSubmit={saveEdit} className={`space-y-2 rounded-xl border p-3 ${c.border}`}>
            <label htmlFor="fieldwork-plan-title-input" className="block text-sm font-semibold">
              {t('fieldwork.plan.titleLabel')}
            </label>
            <input
              id="fieldwork-plan-title-input"
              type="text"
              value={draftTitle}
              maxLength={FIELDWORK_LIMITS.planTitleMax}
              onChange={(e) => setDraftTitle(e.target.value)}
              className={`block w-full rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`}
            />
            <label htmlFor="fieldwork-plan-date-input" className="block text-sm font-semibold">
              {t('fieldwork.plan.dateLabel')}
            </label>
            <input
              id="fieldwork-plan-date-input"
              type="date"
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              className={`block w-full rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className={`${smallBtn} ${c.btn}`}>
                {t('fieldwork.common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy === 'edit' || !draftTitle.trim()}
                className={`${smallBtn} flex-1 border-2 border-gray-900 ${c.btn}`}
              >
                {t('fieldwork.common.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p data-testid="fieldwork-plan-day" className={`text-[13px] font-bold ${day !== 'other' ? (dark ? 'text-emerald-300' : 'text-emerald-800') : c.muted}`}>
                {day === 'today'
                  ? t('fieldwork.plan.today')
                  : day === 'tomorrow'
                    ? t('fieldwork.plan.tomorrow')
                    : t('fieldwork.plan.dated', { date: shortDate(current.planned_on) })}
                {finished && ` · ${t('fieldwork.plan.statusDone')}`}
              </p>
              <h3 id="fieldwork-plan-title" data-testid="fieldwork-plan-title" className="text-lg font-bold leading-snug wrap-break-word">
                {current.title}
              </h3>
              {!titleHasDate && (
                <p className={`text-[13px] ${c.muted}`} data-testid="fieldwork-plan-date">
                  {t('fieldwork.plan.dateLabel')}: {current.planned_on.replace(/-/g, '/')}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={startEdit}
              disabled={!canEdit}
              aria-label={t('fieldwork.plan.edit')}
              className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-40 ${c.btn}`}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {total > 0 && (
          <div data-testid="fieldwork-progress">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="text-base font-bold tabular-nums">
                {t('fieldwork.plan.progress', { done: counts.done + counts.skipped, total })}
              </p>
              <p className={`text-[13px] tabular-nums ${c.muted}`}>{t('fieldwork.plan.progressDetail', counts)}</p>
            </div>
            <div aria-hidden="true" className={`mt-1 flex h-2.5 overflow-hidden rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
              <span className="bg-emerald-700" style={{ width: `${(counts.done / total) * 100}%` }} />
              <span
                className="bg-gray-400"
                style={{
                  width: `${(counts.skipped / total) * 100}%`,
                  backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 3px, transparent 3px 6px)',
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* 2. 次の地点のカード（パネルでただ 1 つの塗りつぶしの主ボタン） */}
      {nextStop && (
        <section
          data-testid="fieldwork-next-card"
          aria-label={t('fieldwork.next.label')}
          className={`space-y-2.5 rounded-2xl border-2 p-3 ${dark ? 'border-red-400/60 bg-red-500/10' : 'border-red-200 bg-red-50/60'}`}
        >
          <p className="flex items-center gap-2 text-base font-bold">
            <span className={`text-sm font-bold ${dark ? 'text-red-200' : 'text-red-800'}`}>{t('fieldwork.next.prefix')}</span>
            <StopBadge number={nextStop.number} status={nextStop.shownStatus} rare={showRare && nextStop.rare} />
            <span className="min-w-0 wrap-break-word">{stopName(nextStop, t)}</span>
          </p>
          <button
            type="button"
            data-testid="fieldwork-next-open"
            onClick={() => onOpenStop(nextStop.id)}
            className={`flex min-h-12 w-full items-center justify-center gap-2 px-3 py-3 text-base font-bold ${btnPrimaryCls}`}
          >
            <Navigation size={18} aria-hidden="true" />
            {t('fieldwork.next.open')}
          </button>
        </section>
      )}

      {/* 3. 残りの地点をまとめて案内（開閉。開いた中に安全の一言） */}
      {segments.length > 0 && (
        <section className={`rounded-xl border ${c.border}`}>
          <button
            type="button"
            data-testid="fieldwork-bulk-open"
            aria-expanded={bulkOpen}
            onClick={() => setBulkOpen((v) => !v)}
            className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-bold ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
          >
            <Route size={17} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">{t('fieldwork.nav.bulk', { count: pendingStops.length })}</span>
            {bulkOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>
          {bulkOpen && (
            <div className="space-y-2.5 px-3 pb-3">
              <SafetyNote dark={dark} />
              <p className={`text-[13px] leading-relaxed ${c.muted}`}>{t('fieldwork.nav.bulkHint')}</p>
              <ul className="space-y-1.5">
                {segments.map((seg, i) => {
                  const numbers = seg.indexes.map((k) => pendingStops[k]?.number ?? k + 1)
                  const from = seg.originIndex === null ? t('fieldwork.nav.here') : String(pendingStops[seg.originIndex]?.number ?? '')
                  return (
                    <li key={seg.url}>
                      <a
                        href={seg.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="fieldwork-bulk-link"
                        className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold no-underline ${
                          dark ? 'border-blue-500/30 bg-blue-500/15 text-blue-100' : 'border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100'
                        }`}
                      >
                        <span className="min-w-0 flex-1">{t('fieldwork.nav.segment', { index: i + 1, from, stops: numbers.join(' → ') })}</span>
                        <ExternalLink size={14} aria-hidden="true" className="shrink-0 opacity-70" />
                      </a>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* 4. 地点の一覧 */}
      <section aria-labelledby="fieldwork-stops-heading" className={sectionTop}>
        <h3 id="fieldwork-stops-heading" className={sectionHeading}>
          {t('fieldwork.stops.heading')}
        </h3>
        {total === 0 ? (
          <p className={`text-sm leading-relaxed ${c.muted}`}>{t('fieldwork.stops.empty')}</p>
        ) : (
          <StopList plan={plan} canEdit={canEdit} showRare={showRare} nextStopId={nextStop?.id ?? null} onOpenStop={onOpenStop} />
        )}
      </section>

      {/* 5. 地点を足す */}
      <section aria-labelledby="fieldwork-add-heading" className={sectionTop}>
        <h3 id="fieldwork-add-heading" className={sectionHeading}>
          {t('fieldwork.add.heading')}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <button
            type="button"
            data-testid="fieldwork-pick-on-map"
            aria-pressed={pickMode}
            onClick={() => onPickModeChange(!pickMode)}
            disabled={!canEdit}
            className={`${smallBtn} justify-start ${pickMode ? 'border-2 border-gray-900' : ''} ${c.btn}`}
          >
            <MapPin size={16} aria-hidden="true" />
            {t('fieldwork.add.pickOnMap')}
            {pickMode && <Check size={16} aria-hidden="true" className="ml-auto" />}
          </button>
          <button
            type="button"
            aria-expanded={showSpots}
            onClick={() => setShowSpots((v) => !v)}
            disabled={!canEdit}
            className={`${smallBtn} justify-start ${c.btn}`}
          >
            <Lock size={16} aria-hidden="true" className="text-violet-600" />
            {t('fieldwork.add.fromSpots')}
          </button>
          <button
            type="button"
            onClick={() => void run('current', onAddCurrentLocation)}
            disabled={!canEdit || busy === 'current'}
            className={`${smallBtn} justify-start ${c.btn}`}
          >
            <Crosshair size={16} aria-hidden="true" />
            {busy === 'current' ? t('fieldwork.add.locating') : t('fieldwork.add.current')}
          </button>
        </div>
        {pickMode && (
          <p role="status" className={`text-sm ${dark ? 'text-emerald-300' : 'text-emerald-800'}`}>
            {t('fieldwork.add.pickOnMapHint')}
          </p>
        )}
        {showSpots && canEdit && (
          <SpotPicker
            userId={userId}
            existingSourceIds={stops.filter((s) => s.source === 'private_spot').map((s) => s.source_id ?? '')}
            onAdd={(picked) =>
              run(
                'spots',
                async () => {
                  await plan.addStops(
                    picked.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng), source: 'private_spot' as const, sourceId: s.id, name: s.name })),
                    { newPlanTitle: newPlanTitle(today) }
                  )
                  setShowSpots(false)
                },
                t('fieldwork.add.addedMany', { count: picked.length })
              )
            }
          />
        )}
        {editHint}
      </section>

      {/* 6. 計画の操作 */}
      <section aria-label={t('fieldwork.plan.actions')} className={sectionTop}>
        {!finished &&
          (confirmFinish ? (
            <div className={`space-y-2 rounded-xl border p-3 ${c.border}`} role="alert" data-testid="fieldwork-finish-confirm">
              <p className="text-sm">{t('fieldwork.plan.finishConfirm')}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmFinish(false)} className={`${smallBtn} ${c.btn}`}>
                  {t('fieldwork.common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(
                      'finish',
                      async () => {
                        await plan.updateCurrentPlan({ status: 'done' })
                        setConfirmFinish(false)
                      },
                      t('fieldwork.plan.finishedToast')
                    )
                  }
                  disabled={busy === 'finish'}
                  className={`${smallBtn} flex-1 border-2 border-gray-900 ${c.btn}`}
                >
                  {t('fieldwork.plan.finishYes')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="fieldwork-finish"
              onClick={() => setConfirmFinish(true)}
              disabled={!canEdit}
              className={`${smallBtn} w-full ${c.btn}`}
            >
              <Check size={16} aria-hidden="true" />
              {t('fieldwork.plan.finish')}
            </button>
          ))}
        {finished && <p className={`text-sm ${c.muted}`}>{t('fieldwork.plan.finished')}</p>}
        {total > 0 && (
          <div>
            <button
              type="button"
              data-testid="fieldwork-reuse"
              onClick={() => void run('reuse', () => plan.reusePlan(current.title), t('fieldwork.plan.reused'))}
              disabled={!canEdit || busy === 'reuse'}
              className={`${smallBtn} w-full ${c.btn}`}
            >
              <Repeat size={16} aria-hidden="true" />
              {t('fieldwork.plan.reuse')}
            </button>
            <p className={`mt-1 text-[13px] ${c.muted}`}>{t('fieldwork.plan.reuseHint')}</p>
          </div>
        )}
      </section>

      {/* 7. これまでの計画（1 件以上あるときだけ） */}
      {historyList && <section className={sectionTop}>{historyList}</section>}
    </div>
  )
}
