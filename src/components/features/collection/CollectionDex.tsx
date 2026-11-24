'use client'

import { useTranslation } from 'react-i18next'
import { SPECIES } from '@/lib/constants'
import type { CollectionEntry } from '@/hooks/useProfile'
import SpeciesDexCard from './SpeciesDexCard'
import { subheading, faint } from '@/lib/themeClasses'

interface CollectionDexProps {
  collection: CollectionEntry[]
  dark: boolean
}

/**
 * REQ-250 FR-250-01: 図鑑（コレクション）グリッド。SPECIES 定数の全種を並べ、承認済み観察がある種は
 * カラーで、無い種はグレーで表示する（ProfilePage のバッジ図鑑と同じ解放/未解放ショーケース様式）。
 * カードは種 × info_type × 市区町村 × 初観察で「埋まっていく」。
 */
export default function CollectionDex({ collection, dark }: CollectionDexProps) {
  const { t } = useTranslation()
  const bySpecies = new Map(collection.map((c) => [c.species, c]))
  const observedCount = SPECIES.filter((s) => bySpecies.has(s.value)).length

  return (
    <section aria-label={t('collection.dex.title')}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-sm font-semibold ${subheading(dark)}`}>{t('collection.dex.title')}</h2>
        <span className={`text-xs tabular-nums ${faint(dark)}`}>
          {t('collection.dex.progress', { observed: observedCount, total: SPECIES.length })}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SPECIES.map((s) => (
          <SpeciesDexCard key={s.value} species={s} entry={bySpecies.get(s.value)} dark={dark} />
        ))}
      </div>
      <p className={`text-xs mt-3 ${faint(dark)}`}>{t('collection.dex.emptyHint')}</p>
    </section>
  )
}
