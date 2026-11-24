'use client'

// REQ-330: 調査パネル。スマホは画面の下半分のシート、PC は地図の右のパネルにして、地図は残す
// （地点の位置関係を見ながら操作できるように。REQ-330 §1 骨格）。モーダルにはしない。
// 中身は 2 つのタブ: 「調査計画」（切り替え・題名/予定日/進み具合・地点の一覧・地点を足す・案内・計画の操作）と
// 「希少種の記録」（自分の記録の一覧・計画なしで記録する・地図に表示）。
// スマホで「地図で選ぶ」を押している間は、地図を広く使えるよう細い帯だけにする。

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronDown, ClipboardList, CloudOff, Loader2, Lock, MapPin, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'

import type { FieldworkPlanApi, StopView } from '../hooks/useFieldworkPlan'
import type { RareSightingsApi } from '../hooks/useRareSightings'
import type { QueueItem } from '../lib/queue'
import PlanTab from './PlanTab'
import RareTab from './RareTab'
import { phraseWrap, smallBtn, stopName, tone } from './parts'

export interface FieldworkPanelProps {
  userId: string
  plan: FieldworkPlanApi
  rare: RareSightingsApi
  queueItems: QueueItem[]
  queueFlushing: boolean
  onFlush: () => void
  /** 送れない送信待ちを捨てる。 */
  onDiscardQueued: (clientId: string) => void
  online: boolean
  tab: 'plan' | 'rare'
  onTabChange: (tab: 'plan' | 'rare') => void
  pickMode: boolean
  onPickModeChange: (on: boolean) => void
  showRare: boolean
  onShowRareChange: (on: boolean) => void
  /** 次の地点（今日の計画で未調査の最初の地点）。無ければ null。 */
  nextStop: StopView | null
  onOpenStop: (stopId: string) => void
  onAddCurrentLocation: () => Promise<void>
  onRecordRare: () => void
  /** 新しい計画の題名（予定日 YYYY-MM-DD。省略すると今日）。 */
  newPlanTitle: (plannedOn?: string) => string
  onCollapse: () => void
  onClose: () => void
  /** 地図の上端（px）。PC のパネルは地図の上端に合わせて置く。 */
  mapTop: number
  panelWidth: number
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function FieldworkPanel(props: FieldworkPanelProps) {
  const { plan, rare, queueItems, queueFlushing, onFlush, online, tab, onTabChange, pickMode, onPickModeChange } = props
  const { t } = useTranslation()
  const { dark } = useTheme()
  const c = tone(dark)
  const failed = queueItems.filter((q) => q.lastError)
  // 破棄は確認を挟む（送れない記録でも、押し間違いで消さない）
  const [discardId, setDiscardId] = useState<string | null>(null)
  // タブを替えたら中身を先頭から見せる（前のタブの送り位置のままだと、希少種タブの説明が上に隠れる）
  const tabPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tabPanelRef.current) tabPanelRef.current.scrollTop = 0
  }, [tab])
  /** 送れない項目の説明（何の記録か・どの地点か）。 */
  const describeQueued = (q: QueueItem) => {
    const stopId = q.type === 'protect' ? q.rareStopId : q.stopId
    const stop = stopId ? plan.stops.find((s) => s.id === stopId) : undefined
    const what = t(`fieldwork.queue.kind.${q.type === 'status' ? `status_${q.status}` : q.type}`)
    return stop ? `${what}（${stopName(stop, t)}）` : what
  }

  const tabBtn = (active: boolean) =>
    `min-h-11 flex-1 rounded-lg px-3 text-sm font-bold transition-colors ${
      active
        ? dark ? 'bg-slate-100 text-slate-900' : 'bg-gray-900 text-white'
        : dark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'
    }`

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="fieldwork-panel-title"
      data-testid="fieldwork-panel"
      className={`fixed inset-x-0 bottom-0 z-425 flex max-h-[52dvh] flex-col rounded-t-2xl border-t shadow-[0_-8px_30px_rgba(0,0,0,0.18)] ${c.card} ${c.border} ${phraseWrap} lg:inset-x-auto lg:right-3 lg:bottom-3 lg:top-(--fw-top) lg:max-h-none lg:w-(--fw-w) lg:rounded-2xl lg:border lg:shadow-2xl`}
      style={
        {
          '--fw-top': `${props.mapTop + 12}px`,
          '--fw-w': `${props.panelWidth}px`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        } as CSSProperties
      }
    >
      {/* スマホで地図を選んでいる間の細い帯（PC ではパネルのまま）。下のナビの「投稿」の丸ボタンが
          帯の上にはみ出さない高さにする */}
      {pickMode && (
        <div className="flex min-h-20 items-center gap-2 px-4 py-2 lg:hidden" role="status">
          <MapPin size={18} aria-hidden="true" className="shrink-0 text-emerald-700" />
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug">
            {t('fieldwork.add.pickBar', { count: plan.stops.length })}
          </p>
          <button
            type="button"
            onClick={() => onPickModeChange(false)}
            className={`${smallBtn} border-2 border-gray-900 ${c.btn}`}
          >
            {t('fieldwork.add.pickDone')}
          </button>
        </div>
      )}

      <div className={`flex min-h-0 flex-1 flex-col ${pickMode ? 'max-lg:hidden' : ''}`}>
        <div className={`border-b px-4 pt-2 pb-2 ${c.border}`}>
          <div aria-hidden="true" className={`mx-auto mb-1.5 h-1 w-10 rounded-full lg:hidden ${dark ? 'bg-slate-600' : 'bg-gray-300'}`} />
          <div className="flex items-center gap-2">
            <h2 id="fieldwork-panel-title" className="flex items-center gap-1.5 text-base font-bold">
              <ClipboardList size={18} aria-hidden="true" className="text-emerald-700" />
              {t('fieldwork.panel.title')}
            </h2>
            <div className="ml-auto flex items-center">
              {/* 「畳む」と「×」で何が起きるかを名前で分ける（どちらも計画は残る） */}
              <button
                type="button"
                onClick={props.onCollapse}
                data-testid="fieldwork-collapse"
                aria-label={t('fieldwork.panel.collapseAria')}
                title={t('fieldwork.panel.collapseAria')}
                className={`flex min-h-11 items-center gap-1 rounded-xl px-2.5 text-sm font-semibold ${dark ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <ChevronDown size={18} aria-hidden="true" />
                {t('fieldwork.panel.collapse')}
              </button>
              <button
                type="button"
                onClick={props.onClose}
                aria-label={t('fieldwork.panel.close')}
                title={t('fieldwork.panel.close')}
                data-testid="fieldwork-close"
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-full ${dark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div role="tablist" aria-label={t('fieldwork.panel.tabs')} className={`mt-1.5 flex gap-1 rounded-xl p-1 ${c.subtle}`}>
            <button
              type="button"
              role="tab"
              id="fieldwork-tab-plan"
              aria-selected={tab === 'plan'}
              aria-controls="fieldwork-tabpanel"
              onClick={() => onTabChange('plan')}
              className={tabBtn(tab === 'plan')}
            >
              {t('fieldwork.panel.tabPlan')}
            </button>
            <button
              type="button"
              role="tab"
              id="fieldwork-tab-rare"
              aria-selected={tab === 'rare'}
              aria-controls="fieldwork-tabpanel"
              onClick={() => onTabChange('rare')}
              data-testid="fieldwork-tab-rare"
              className={`${tabBtn(tab === 'rare')} inline-flex items-center justify-center gap-1.5`}
            >
              <Lock size={14} aria-hidden="true" />
              {t('fieldwork.panel.tabRare')}
            </button>
          </div>
        </div>

        <div
          ref={tabPanelRef}
          id="fieldwork-tabpanel"
          role="tabpanel"
          aria-labelledby={tab === 'plan' ? 'fieldwork-tab-plan' : 'fieldwork-tab-rare'}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pt-3 pb-4"
        >
          {plan.cachedAt && (
            <p
              role="status"
              data-testid="fieldwork-offline-cache"
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                dark ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-900'
              }`}
            >
              <CloudOff size={15} aria-hidden="true" className="mt-px shrink-0" />
              <span>{t('fieldwork.panel.offlineCache', { time: formatTime(plan.cachedAt) })}</span>
            </p>
          )}

          {queueItems.length > 0 && (
            <div
              data-testid="fieldwork-queue"
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                dark ? 'border-sky-500/40 bg-sky-500/10 text-sky-100' : 'border-sky-300 bg-sky-50 text-sky-900'
              }`}
            >
              <span className="min-w-0 flex-1 font-semibold">
                ⟳ {t('fieldwork.queue.pending', { count: queueItems.length })}
              </span>
              <button
                type="button"
                onClick={onFlush}
                disabled={!online || queueFlushing}
                className={`${smallBtn} ${c.btn}`}
              >
                {queueFlushing ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <RefreshCw size={15} aria-hidden="true" />}
                {queueFlushing ? t('fieldwork.queue.sending') : t('fieldwork.queue.sendNow')}
              </button>
              {failed.length > 0 && (
                <div className="w-full space-y-1.5" data-testid="fieldwork-queue-failed">
                  <p className="text-sm">{t('fieldwork.queue.failed')}</p>
                  <ul className="space-y-1.5">
                    {failed.map((q) => (
                      <li key={q.clientId} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 ${c.border} ${c.card}`}>
                        <span className="min-w-0 flex-1 text-sm leading-snug">
                          <span className="block font-semibold">{describeQueued(q)}</span>
                          <span className={`block text-[13px] ${c.muted}`}>{t(`fieldwork.error.${q.lastError}`, { defaultValue: t('fieldwork.error.failed') })}</span>
                        </span>
                        {discardId === q.clientId ? (
                          <span className="flex w-full flex-wrap items-center justify-end gap-2" role="alert">
                            <span className="min-w-0 flex-1 text-sm">{t('fieldwork.queue.discardConfirm')}</span>
                            <button type="button" onClick={() => setDiscardId(null)} className={`${smallBtn} shrink-0 ${c.btn}`}>
                              {t('fieldwork.common.cancel')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                props.onDiscardQueued(q.clientId)
                                setDiscardId(null)
                              }}
                              className={`${smallBtn} shrink-0 border-2 ${c.btn}`}
                            >
                              {t('fieldwork.queue.discardYes')}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDiscardId(q.clientId)}
                            aria-label={`${t('fieldwork.queue.discard')}：${describeQueued(q)}`}
                            className={`${smallBtn} shrink-0 ${c.btn}`}
                          >
                            {t('fieldwork.queue.discard')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tab === 'plan' ? (
            <PlanTab
              userId={props.userId}
              plan={plan}
              online={online}
              showRare={props.showRare}
              nextStop={props.nextStop}
              pickMode={pickMode}
              onPickModeChange={onPickModeChange}
              onOpenStop={props.onOpenStop}
              onAddCurrentLocation={props.onAddCurrentLocation}
              newPlanTitle={props.newPlanTitle}
            />
          ) : (
            <RareTab
              rare={rare}
              showRare={props.showRare}
              onShowRareChange={props.onShowRareChange}
              onRecordRare={props.onRecordRare}
            />
          )}
        </div>
      </div>
    </section>
  )
}
