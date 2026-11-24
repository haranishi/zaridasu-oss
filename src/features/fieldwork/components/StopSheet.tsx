'use client'

// REQ-330: 地点シート（現地での記録）。上に名前・メモ・案内、下に大きなボタンを 4 つ。
//   いた（投稿する）→ 既存の投稿フォーム / いなかった → 確認 1 回で不在の投稿 / 希少種を記録 → 希少種シート / 飛ばす
// 水辺では片手しか空かないので、ボタンは大きく、色だけでなく記号と文字で区別する。
// 位置はシートを開いたときに取りにいく（最大 8 秒）。ボタンを押す頃には決まっていることが多い。
// 1 つの地点に結果をいくつ付けてもよい。「元に戻す」で未調査に戻せる（作った投稿や記録は消さない）。
// 「希少種あり」の札・錠前・件数は「希少種を自分の地図に表示」を入れているときだけ出す。
// 投稿の位置を非公開にする地点でも、地点シートには何も出さない（画面写真から「特別な地点」と分からないように）。
// 非公開になることは、「いた」で開く投稿フォームと「いなかった」の確認の中でだけ、理由を書かずに出す。
// 「記録の位置」の箱は、いちばん長い状態（2 行＋「現在地を取り直す」）の高さを最初から取っておき、
// 位置が更新されても下の 4 つのボタンが動かないようにする（押す直前にずれると押し間違える）。

import { useCallback, useEffect, useRef, useState } from 'react'
import { Ban, Crosshair, Loader2, Lock, PenLine, RotateCcw, SkipForward } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import RouteLinks from '@/components/ui/RouteLinks'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'

import { FIELDWORK_LIMITS } from '../constants'
import type { StopStatus } from '../data/stops'
import type { StopView } from '../hooks/useFieldworkPlan'
import { decidePosition, getCurrentFix, type RecordPosition } from '../lib/positionRule'
import { PositionLine, RareChip, SafetyNote, SheetFrame, StatusText, StopBadge, smallBtn, stopName, tone } from './parts'

type Action = 'found' | 'absent' | 'rare'

interface StopSheetProps {
  stop: StopView
  /** 「希少種を自分の地図に表示」。切っている間は希少種の印と件数を出さない。 */
  showRare: boolean
  online: boolean
  onClose: () => void
  /** 投稿フォームを開く前に DB で確かめるので、終わるまで押したボタンに待ちの印を出す。 */
  onFound: (position: RecordPosition) => void | Promise<void>
  onAbsent: (position: RecordPosition) => void
  onRare: (position: RecordPosition) => void
  onSetStatus: (status: StopStatus, note?: string | null) => Promise<'saved' | 'queued'>
  errorText: (err: unknown) => string
}

export default function StopSheet({ stop, showRare, online, onClose, onFound, onAbsent, onRare, onSetStatus, errorText }: StopSheetProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const name = stopName(stop, t)

  const [position, setPosition] = useState<RecordPosition | null>(null)
  const [locating, setLocating] = useState(true)
  const [waitingFor, setWaitingFor] = useState<Action | null>(null)
  const rareShown = showRare && stop.rare
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lat = Number(stop.lat)
  const lng = Number(stop.lng)

  // 記録に使う位置を決める（現在地を最大 8 秒。誤差 100 m 以内かつ地点から 300 m 以内なら現在地）
  const [locateNonce, setLocateNonce] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLocating(true)
    void getCurrentFix().then((fix) => {
      if (cancelled) return
      setPosition(decidePosition({ lat, lng }, fix))
      setLocating(false)
    })
    return () => {
      cancelled = true
    }
  }, [lat, lng, locateNonce])

  const handlers = useRef({ found: onFound, absent: onAbsent, rare: onRare })
  useEffect(() => {
    handlers.current = { found: onFound, absent: onAbsent, rare: onRare }
  })

  // 位置が決まる前に押されたら、決まった時点で続きを行う。続き（「いた」の確認など）が終わるまで待ちの印を出す
  const run = useCallback((action: Action, at: RecordPosition) => {
    const done = handlers.current[action](at)
    if (done instanceof Promise) {
      setWaitingFor(action)
      void done.finally(() => setWaitingFor(null))
    } else {
      setWaitingFor(null)
    }
  }, [])
  const [queuedAction, setQueuedAction] = useState<Action | null>(null)
  useEffect(() => {
    if (!queuedAction || locating || !position) return
    setQueuedAction(null)
    run(queuedAction, position)
  }, [queuedAction, locating, position, run])

  const act = (action: Action) => {
    if (waitingFor) return
    if (locating || !position) {
      setWaitingFor(action)
      setQueuedAction(action)
      return
    }
    run(action, position)
  }

  const setStatus = async (status: StopStatus, note?: string | null) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await onSetStatus(status, note)
      const key = status === 'skipped' ? 'skipped' : 'undone'
      toast.success(result === 'queued' ? t('fieldwork.queue.saved') : t(`fieldwork.stop.${key}`))
      onClose()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  const confirmSkip = () => {
    const extra = reason.trim()
    const note = extra ? [stop.note?.trim(), extra].filter(Boolean).join('\n').slice(0, FIELDWORK_LIMITS.noteMax) : undefined
    void setStatus('skipped', note)
  }

  const bigBtn =
    'flex min-h-18 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2.5 text-center transition-colors active:scale-[0.98] disabled:opacity-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-500'
  const label = (main: string, sub: string) => (
    <>
      <span className="text-base font-bold leading-tight">{main}</span>
      <span className="text-sm font-semibold leading-tight opacity-85">{sub}</span>
    </>
  )
  const found = dark ? 'border-red-400 bg-red-500/15 text-red-200' : 'border-red-600 bg-red-50 text-red-800 hover:bg-red-100'
  const absent = dark ? 'border-slate-400 bg-slate-800 text-slate-100' : 'border-gray-600 bg-gray-50 text-gray-900 hover:bg-gray-100'
  const rareCls = dark ? 'border-violet-400 bg-violet-500/15 text-violet-100' : 'border-violet-600 bg-violet-50 text-violet-900 hover:bg-violet-100'
  const skip = dark ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
  const spinner = (action: Action) =>
    waitingFor === action ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : null

  return (
    <SheetFrame
      titleId="fieldwork-stop-title"
      testId="fieldwork-stop-sheet"
      onClose={onClose}
      icon={<StopBadge number={stop.number} status={stop.shownStatus} rare={rareShown} size="lg" />}
      title={name}
    >
      <div className="-mt-1 flex flex-wrap items-center gap-2">
        <StatusText status={stop.shownStatus} dark={dark} />
        {rareShown && <RareChip dark={dark} />}
        {stop.unsent && (
          <span className={`text-sm font-semibold ${dark ? 'text-sky-300' : 'text-sky-800'}`}>⟳ {t('fieldwork.stops.unsent')}</span>
        )}
      </div>

      {stop.note && <p className={`whitespace-pre-wrap wrap-break-word text-sm ${c.muted}`}>{stop.note}</p>}

      <p className={`text-sm ${c.muted}`} data-testid="fieldwork-stop-results">
        {rareShown
          ? t('fieldwork.stop.results', {
              sighting: stop.counts.sighting,
              absence: stop.counts.absence,
              rare: stop.counts.rare,
            })
          : t('fieldwork.stop.resultsNoRare', { sighting: stop.counts.sighting, absence: stop.counts.absence })}
      </p>

      <SafetyNote dark={dark} />

      <RouteLinks lat={lat} lng={lng} dark={dark} variant={dark ? 'card' : 'popup'} size="md" />

      <div className={`space-y-2 rounded-xl px-3 py-2.5 ${c.subtle}`} data-testid="fieldwork-position-box">
        <PositionLine position={position} locating={locating} dark={dark} reserveReasonLine />
        <button
          type="button"
          data-testid="fieldwork-position-retry"
          onClick={() => setLocateNonce((n) => n + 1)}
          disabled={locating}
          className={`${smallBtn} h-11 w-full ${c.btn}`}
        >
          {locating ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Crosshair size={16} aria-hidden="true" />}
          {t('fieldwork.position.retry')}
        </button>
      </div>

      {!skipping ? (
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" data-testid="fieldwork-stop-found" aria-label={t('fieldwork.stop.found')} onClick={() => act('found')} className={`${bigBtn} ${found}`}>
            {spinner('found') ?? <PenLine size={20} aria-hidden="true" />}
            {label(t('fieldwork.stop.foundMain'), t('fieldwork.stop.foundSub'))}
          </button>
          <button type="button" data-testid="fieldwork-stop-absent" aria-label={t('fieldwork.stop.absent')} onClick={() => act('absent')} className={`${bigBtn} ${absent}`}>
            {spinner('absent') ?? <Ban size={20} aria-hidden="true" />}
            {label(t('fieldwork.stop.absent'), t('fieldwork.stop.absentSub'))}
          </button>
          <button type="button" data-testid="fieldwork-stop-rare" aria-label={t('fieldwork.stop.rare')} onClick={() => act('rare')} className={`${bigBtn} ${rareCls}`}>
            {spinner('rare') ?? <Lock size={20} aria-hidden="true" />}
            {label(t('fieldwork.stop.rare'), t('fieldwork.stop.rareSub'))}
          </button>
          <button
            type="button"
            data-testid="fieldwork-stop-skip"
            aria-label={t('fieldwork.stop.skip')}
            onClick={() => setSkipping(true)}
            disabled={busy}
            className={`${bigBtn} ${skip}`}
          >
            <SkipForward size={20} aria-hidden="true" />
            {label(t('fieldwork.stop.skip'), t('fieldwork.stop.skipSub'))}
          </button>
        </div>
      ) : (
        <div className={`space-y-2 rounded-xl border p-3 ${c.border}`}>
          <label htmlFor="fieldwork-skip-reason" className="block text-sm font-semibold">
            {t('fieldwork.stop.skipReason')}
          </label>
          <input
            id="fieldwork-skip-reason"
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('fieldwork.stop.skipPlaceholder')}
            className={`block w-full rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setSkipping(false)} className={`${smallBtn} ${c.btn}`}>
              {t('fieldwork.common.cancel')}
            </button>
            <button
              type="button"
              data-testid="fieldwork-skip-confirm"
              onClick={confirmSkip}
              disabled={busy}
              className={`${smallBtn} flex-1 border-gray-800 bg-gray-800 text-white hover:bg-gray-900`}
            >
              {busy ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <SkipForward size={16} aria-hidden="true" />}
              {t('fieldwork.stop.skipConfirm')}
            </button>
          </div>
        </div>
      )}

      {stop.shownStatus !== 'pending' && !skipping && (
        <button
          type="button"
          data-testid="fieldwork-stop-undo"
          onClick={() => void setStatus('pending')}
          disabled={busy}
          className={`${smallBtn} w-full ${c.btn}`}
        >
          <RotateCcw size={16} aria-hidden="true" />
          {t('fieldwork.stop.undo')}
        </button>
      )}

      {!online && <p className={`text-sm leading-relaxed ${dark ? 'text-amber-300' : 'text-amber-800'}`}>{t('fieldwork.stop.offlineHint')}</p>}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </SheetFrame>
  )
}
