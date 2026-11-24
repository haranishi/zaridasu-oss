'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PartyPopper, X } from 'lucide-react'
import { FEATURE_UNLOCKS } from '@/lib/constants'
import type { CollectionEntry } from '@/hooks/useProfile'
import { detectNewThresholds, detectNewBadgeIds, prefersReducedMotion } from '@/lib/achievement'
import { faint } from '@/lib/themeClasses'

interface UnlockCelebrationProps {
  /** DB 権威の現在レベル（get_user_progress）。null=匿名/未取得（何も出さない）。 */
  level: number | null
  /** 図鑑コレクション（新カード検知用）。 */
  collection: CollectionEntry[]
  /** localStorage スコープ分離用（端末/ユーザー取り違え防止）。 */
  userId: string
  dark: boolean
}

// レベルしきい値 [2..40]。detectNewThresholds に渡して「前回表示以降に新たに跨いだレベル」を検出する。
const LEVEL_THRESHOLDS = Array.from({ length: 39 }, (_, i) => i + 2)

type CelebrationEvent =
  | { type: 'level'; level: number }
  | { type: 'unlock'; labelKey: string }
  | { type: 'card'; species: string }

/**
 * REQ-251 FR-251-03: レベルアップ / 機能解放 / 新図鑑カードの「一度きり」解放演出。
 *
 * 検知は既存 achievement.ts の localStorage 差分（detectNewThresholds / detectNewBadgeIds）を流用し、
 * サーバーへ逐次送らない（NFR-251-03 プライバシー安全）。演出は既存 CSS キーフレーム（badge-unlock）の
 * transform/opacity のみ（リフローフリー / NFR-251-01）。新規アニメライブラリは追加しない。
 * prefers-reduced-motion は globals.css が全 animation を無効化＋ここでも animate クラスを外して静止させる。
 * 内容は色/動きだけでなく必ずテキストで伝える（role="status" aria-live="polite" / FR-251-05）。
 */
export default function UnlockCelebration({ level, collection, userId, dark }: UnlockCelebrationProps) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<CelebrationEvent[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!userId || level == null) return
    const next: CelebrationEvent[] = []

    // レベルアップ検知（初回＝記録なしのときは空＝既存/初回ユーザーで過去分が一斉発火しない）。
    const crossed = detectNewThresholds(`level_${userId}`, level, LEVEL_THRESHOLDS)
    if (crossed.size > 0) {
      next.push({ type: 'level', level: Math.max(...crossed) })
      // 跨いだレベルで解放された機能（同一レベルに複数あっても対応）。
      for (const def of Object.values(FEATURE_UNLOCKS)) {
        if (crossed.has(def.level)) next.push({ type: 'unlock', labelKey: def.labelKey })
      }
    }

    // 新しい図鑑カード（種）検知。
    const newCards = detectNewBadgeIds(`collection_${userId}`, collection.map((c) => c.species))
    for (const s of newCards) next.push({ type: 'card', species: s })

    // 新規イベントがあるときだけ差し替える（無ければ既存の表示を壊さない＝再フェッチで消えない）。
    if (next.length > 0) {
      setEvents(next)
      setDismissed(false)
    }
  }, [level, collection, userId])

  // 穏やかに自動で閉じる（任意）。閉じるボタンも常設し、ユーザーがいつでも消せる。
  useEffect(() => {
    if (events.length === 0 || dismissed) return
    const timer = setTimeout(() => setDismissed(true), 9000)
    return () => clearTimeout(timer)
  }, [events, dismissed])

  if (events.length === 0 || dismissed) return null

  const reduced = prefersReducedMotion()

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative flex items-start gap-3 p-4 rounded-2xl border ${
        dark ? 'border-amber-500/40 bg-amber-500/10' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <span className={`shrink-0 ${reduced ? '' : 'animate-badge-unlock'}`} aria-hidden="true">
        <PartyPopper size={22} className={dark ? 'text-amber-300' : 'text-amber-600'} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${dark ? 'text-amber-200' : 'text-amber-800'}`}>{t('celebrate.title')}</p>
        <ul className="mt-1 space-y-0.5">
          {events.map((e, i) => (
            <li key={i} className={`text-sm ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
              {e.type === 'level' && t('celebrate.levelUp', { level: e.level })}
              {e.type === 'unlock' && t('celebrate.unlocked', { feature: t(e.labelKey) })}
              {e.type === 'card' && t('celebrate.newCard', { name: t(`species.${e.species}`) })}
            </li>
          ))}
        </ul>
        <p className={`text-xs mt-1.5 ${faint(dark)}`}>{t('celebrate.encouragement')}</p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t('celebrate.dismiss')}
        className={`shrink-0 p-1 rounded-lg ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-400 hover:bg-gray-100'}`}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
