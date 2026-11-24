'use client'

// REQ-330: 計画の地点の一覧。番号・名前・状態（済み・飛ばし・未）・↑↓・メニュー（名前を変える・メモ・外す）。
// 並べ替えはドラッグでなく ↑↓ ボタン（水辺では片手しか空かない。REQ-330 §1「5 階層で変わった設計」6）。
// 行を押すと地点シートを開く。編集（↑↓・メニュー）は電波のある場所だけ。
// 次の地点には「次」の札と薄い背景を付ける（地図の丸の太い輪と対応）。
// 「希少種あり」の札と錠前は「希少種を自分の地図に表示」を入れているときだけ出す。

import { useState } from 'react'
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'

import { FIELDWORK_LIMITS } from '../constants'
import type { FieldworkPlanApi, StopView } from '../hooks/useFieldworkPlan'
import { errorMessage } from '../lib/errors'
import { RareChip, StatusText, StopBadge, smallBtn, stopName, tone } from './parts'

interface StopListProps {
  plan: FieldworkPlanApi
  canEdit: boolean
  showRare: boolean
  nextStopId: string | null
  onOpenStop: (stopId: string) => void
}

type MenuMode = 'menu' | 'rename' | 'note' | 'remove'

export default function StopList({ plan, canEdit, showRare, nextStopId, onOpenStop }: StopListProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const [menu, setMenu] = useState<{ stopId: string; mode: MenuMode } | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, done?: () => void) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      done?.()
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  const openMenu = (stop: StopView, mode: MenuMode) => {
    setDraft(mode === 'rename' ? (stop.name ?? '') : mode === 'note' ? (stop.note ?? '') : '')
    setMenu({ stopId: stop.id, mode })
  }

  const iconBtn = `flex min-h-11 min-w-11 items-center justify-center rounded-xl disabled:opacity-30 ${
    dark ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'
  }`
  const input = `block w-full rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`

  return (
    <ol className={`divide-y ${dark ? 'divide-slate-800' : 'divide-gray-100'}`} data-testid="fieldwork-stop-list">
      {plan.stops.map((stop, i) => {
        const name = stopName(stop, t)
        const open = menu?.stopId === stop.id
        const isNext = stop.id === nextStopId
        const rareShown = showRare && stop.rare
        return (
          <li
            key={stop.id}
            className={`py-1.5 ${isNext ? `-mx-2 rounded-xl px-2 ${dark ? 'bg-red-500/10' : 'bg-red-50/70'}` : ''}`}
            data-testid="fieldwork-stop-row"
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpenStop(stop.id)}
                className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-1 text-left ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
              >
                <StopBadge number={stop.number} status={stop.shownStatus} rare={rareShown} />
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{stop.number}. </span>
                  <span className="flex items-center gap-1.5">
                    {isNext && (
                      <span
                        data-testid="fieldwork-next-tag"
                        className={`shrink-0 rounded-md px-1.5 py-px text-[13px] font-bold ${dark ? 'bg-red-500/30 text-red-100' : 'bg-red-600 text-white'}`}
                      >
                        {t('fieldwork.next.tag')}
                      </span>
                    )}
                    <span className="block min-w-0 truncate text-[15px] font-semibold" data-testid="fieldwork-stop-name">
                      {name}
                    </span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <StatusText status={stop.shownStatus} dark={dark} />
                    {rareShown && <RareChip dark={dark} />}
                    {stop.unsent && (
                      <span className={`text-sm font-semibold ${dark ? 'text-sky-300' : 'text-sky-800'}`}>
                        ⟳ {t('fieldwork.stops.unsent')}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void run(() => plan.moveStop(stop.id, -1))}
                disabled={!canEdit || busy || i === 0}
                aria-label={t('fieldwork.stops.moveUp', { name })}
                data-testid="fieldwork-stop-up"
                className={iconBtn}
              >
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => void run(() => plan.moveStop(stop.id, 1))}
                disabled={!canEdit || busy || i === plan.stops.length - 1}
                aria-label={t('fieldwork.stops.moveDown', { name })}
                data-testid="fieldwork-stop-down"
                className={iconBtn}
              >
                <ArrowDown size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => (open ? setMenu(null) : openMenu(stop, 'menu'))}
                disabled={!canEdit}
                aria-expanded={open}
                aria-label={t('fieldwork.stops.menu', { name })}
                className={iconBtn}
              >
                <MoreHorizontal size={18} aria-hidden="true" />
              </button>
            </div>

            {open && menu && (
              <div className={`mt-1 mb-1 ml-11 space-y-2 rounded-xl border p-2.5 ${c.border}`}>
                {menu.mode === 'menu' && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => openMenu(stop, 'rename')} className={`${smallBtn} ${c.btn}`}>
                      {t('fieldwork.stops.rename')}
                    </button>
                    <button type="button" onClick={() => openMenu(stop, 'note')} className={`${smallBtn} ${c.btn}`}>
                      {t('fieldwork.stops.note')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openMenu(stop, 'remove')}
                      className={`${smallBtn} ${dark ? 'border-red-400/50 text-red-300' : 'border-red-300 bg-white text-red-700 hover:bg-red-50'}`}
                    >
                      {t('fieldwork.stops.remove')}
                    </button>
                  </div>
                )}
                {(menu.mode === 'rename' || menu.mode === 'note') && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const value = menu.mode === 'rename' ? draft.replace(/\s+/g, ' ').trim() : draft.trim()
                      void run(
                        () => plan.editStop(stop.id, menu.mode === 'rename' ? { name: value || null } : { note: value || null }),
                        () => setMenu(null)
                      )
                    }}
                    className="space-y-2"
                  >
                    <label htmlFor={`fieldwork-stop-edit-${stop.id}`} className="block text-sm font-semibold">
                      {menu.mode === 'rename' ? t('fieldwork.stops.nameLabel') : t('fieldwork.stops.noteLabel')}
                    </label>
                    {menu.mode === 'rename' ? (
                      <input
                        id={`fieldwork-stop-edit-${stop.id}`}
                        type="text"
                        value={draft}
                        maxLength={FIELDWORK_LIMITS.stopNameMax}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t('fieldwork.stops.defaultName', { n: stop.number })}
                        className={input}
                      />
                    ) : (
                      <textarea
                        id={`fieldwork-stop-edit-${stop.id}`}
                        rows={2}
                        value={draft}
                        maxLength={FIELDWORK_LIMITS.noteMax}
                        onChange={(e) => setDraft(e.target.value)}
                        className={`${input} resize-none`}
                      />
                    )}
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setMenu(null)} className={`${smallBtn} ${c.btn}`}>
                        {t('fieldwork.common.cancel')}
                      </button>
                      <button type="submit" disabled={busy} className={`${smallBtn} flex-1 border-2 border-gray-900 ${c.btn}`}>
                        {t('fieldwork.common.save')}
                      </button>
                    </div>
                  </form>
                )}
                {menu.mode === 'remove' && (
                  <div className="space-y-2" role="alert">
                    <p className="text-sm leading-relaxed">{t('fieldwork.stops.removeConfirm')}</p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setMenu(null)} className={`${smallBtn} ${c.btn}`}>
                        {t('fieldwork.common.cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => plan.removeStop(stop.id), () => setMenu(null))}
                        className={`${smallBtn} flex-1 border-2 ${dark ? 'border-red-400 text-red-200' : 'border-red-700 bg-white text-red-800 hover:bg-red-50'}`}
                      >
                        {t('fieldwork.stops.removeYes')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
