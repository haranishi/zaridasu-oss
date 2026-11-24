'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle } from 'lucide-react'
import type { CollectionEntry } from '@/hooks/useProfile'
import { deriveCollectionSignals, computeQuests } from '@/lib/quests'
import { cardCls, subheading, faint, muted } from '@/lib/themeClasses'

interface WeeklyQuestsProps {
  collection: CollectionEntry[]
  dark: boolean
}

/**
 * REQ-251 FR-251-02: 調査ミッション（クエスト）。
 *
 * 質・多様性へ誘う穏やかな提案。**任意参加で未達成を罰さない**（NFR-251-02）——ストリーク圧力・偽の緊急性・
 * 損失フレーミングを持たない。達成状態は色/アイコンだけでなく必ずテキストでも伝える（a11y / FR-251-05）。
 * 集計は useCollection（DB 権威）からクライアント導出（quests.ts）で、追加の DB/RPC は使わない。
 */
export default function WeeklyQuests({ collection, dark }: WeeklyQuestsProps) {
  const { t } = useTranslation()
  const quests = useMemo(() => computeQuests(deriveCollectionSignals(collection)), [collection])

  return (
    <section className={cardCls(dark)} aria-label={t('quests.title')}>
      <h2 className={`text-sm font-semibold ${subheading(dark)}`}>{t('quests.title')}</h2>
      <p className={`text-xs mt-1 ${faint(dark)}`}>{t('quests.subtitle')}</p>

      <ul className="mt-3 space-y-2">
        {quests.map((q) => {
          const achieved = q.done === true
          // 状態テキスト（色/アイコン非依存）。達成=穏やかな肯定 / 未達・自由提案=誘い（罰さない）。
          const statusText = achieved
            ? t('quests.done')
            : q.target != null
              ? t('quests.progress', { current: Math.min(q.current ?? 0, q.target), target: q.target })
              : t('quests.tryIt')
          return (
            <li
              key={q.id}
              className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                dark ? 'border-slate-700 bg-slate-800/40' : 'border-gray-100 bg-gray-50'
              }`}
            >
              <span className="text-lg leading-none shrink-0" aria-hidden="true">{q.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {achieved ? (
                    <CheckCircle2 size={14} className={dark ? 'text-teal-300' : 'text-teal-600'} aria-hidden="true" />
                  ) : (
                    <Circle size={14} className={faint(dark)} aria-hidden="true" />
                  )}
                  <span className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{t(q.titleKey)}</span>
                </div>
                <p className={`text-xs mt-0.5 ${muted(dark)}`}>{t(q.descKey)}</p>
                <p className={`text-xs mt-1 ${achieved ? (dark ? 'text-teal-300' : 'text-teal-600') : faint(dark)}`}>
                  {statusText}
                </p>
              </div>
            </li>
          )
        })}
      </ul>

      {/* NFR-251-02: 任意参加・無罰を明示（ダークパターン回避） */}
      <p className={`text-xs mt-3 ${faint(dark)}`}>{t('quests.optionalNote')}</p>
    </section>
  )
}
