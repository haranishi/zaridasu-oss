'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { FEATURE_UNLOCKS, SPECIES, DEX_INFO_TYPE_TOTAL } from '@/lib/constants'
import type { Progress, CollectionEntry } from '@/hooks/useProfile'
import { collectionCompletionPct } from '@/lib/quests'
import UnlockTeaser from '@/components/ui/UnlockTeaser'
import { cardCls, subheading, faint, muted } from '@/lib/themeClasses'

interface NextStepCardProps {
  progress: Progress | null
  collection: CollectionEntry[]
  dark: boolean
}

/**
 * REQ-251 FR-251-01: 「次にできること」の一望。
 *
 * ProgressCard（現在レベル / 次レベルまでの XP）と対で、①次に解放される機能（UnlockTeaser 共通化）と
 * ②図鑑の収集率（%）を 1 枚にまとめ、「今どこ / 次に何を」を散らばらせず一目で読める面にする。
 * 進捗はすべて既存の DB 権威データ（get_user_progress / get_user_collection）から算出（追加 RPC なし）。
 */
export default function NextStepCard({ progress, collection, dark }: NextStepCardProps) {
  const { t } = useTranslation()
  const level = progress?.level ?? null

  // 次に解放される機能＝現在レベルで未解放のうち、解放レベルが最小のもの（FEATURE_UNLOCKS を単一ソースに引く）。
  const nextUnlock = useMemo(() => {
    if (level == null) return null
    const locked = Object.values(FEATURE_UNLOCKS).filter((def) => level < def.level)
    if (locked.length === 0) return null
    return locked.reduce((min, d) => (d.level < min.level ? d : min))
  }, [level])

  if (!progress) return null

  const pct = collectionCompletionPct(collection, SPECIES.length, DEX_INFO_TYPE_TOTAL)
  const observed = collection.length

  return (
    <div className={cardCls(dark)}>
      <h2 className={`text-sm font-semibold mb-3 ${subheading(dark)}`}>{t('journey.title')}</h2>

      {/* 次に解放される機能（ロックは壁ではなく目標として見せる） */}
      <div className="mb-4">
        <p className={`text-xs font-medium mb-1 ${muted(dark)}`}>{t('journey.nextUnlockLabel')}</p>
        {nextUnlock ? (
          <UnlockTeaser
            unlockLevel={nextUnlock.level}
            featureLabelKey={nextUnlock.labelKey}
            currentXp={progress.xp}
            dark={dark}
          />
        ) : (
          <p className={`text-xs ${faint(dark)}`}>{t('journey.allUnlocked')}</p>
        )}
      </div>

      {/* 図鑑の収集率 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-xs font-medium ${muted(dark)}`}>{t('journey.collectionLabel')}</span>
          <span className={`text-xs tabular-nums ${faint(dark)}`}>{t('journey.collectionPct', { pct })}</span>
        </div>
        <div
          className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}
          role="progressbar"
          aria-label={t('journey.collectionLabel')}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-linear-to-r from-teal-400 to-cyan-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-xs ${faint(dark)}`}>{t('collection.dex.progress', { observed, total: SPECIES.length })}</span>
          <Link
            href="/collection"
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              dark ? 'text-amber-300 hover:text-amber-200' : 'text-amber-600 hover:text-amber-700'
            }`}
          >
            <Sparkles size={12} aria-hidden="true" /> {t('journey.viewCollection')}
          </Link>
        </div>
      </div>
    </div>
  )
}
