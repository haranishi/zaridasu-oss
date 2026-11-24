'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHomeCoverage } from '@/hooks/posts/useHomeCoverage'
import { computeGaps, type Gap } from '@/lib/homeGaps'
import { HomeSection } from './HomeFeed'
import styles from './home.module.css'

/**
 * 次に足りない記録。公開記録の実数から、記録が少ない種・「見つからなかった」・市町村の広がりを数字つきで出す。
 * 取得中は場所だけ空けておき、失敗・該当なしのときは欄ごと出さない（見本の数値を実績として出さない）。
 */
export default function HomeGaps({ onStart }: { onStart: (gap: Gap) => void }) {
  const { t } = useTranslation()
  const { coverage, loading } = useHomeCoverage()
  const gaps = useMemo(() => (coverage ? computeGaps(coverage) : []), [coverage])
  if (loading) return <div className={styles.gapsSkeleton} aria-hidden="true" />
  if (!gaps.length) return null
  return (
    <HomeSection title={t('homeHub.gaps.title')} href="/guide#gaps">
      <p className={styles.caption}>{t('homeHub.gaps.description')}</p>
      <div className={styles.rail} role="group" aria-label={t('homeHub.gaps.title')}>
        {gaps.map((gap) => {
          const label = gap.species ? t(`species.${gap.species}`) : ''
          const title = gap.kind === 'species'
            ? t(gap.count === 0 ? 'homeHub.gaps.species.none' : 'homeHub.gaps.species.few', { species: label, count: gap.count })
            : gap.kind === 'absence'
              ? t('homeHub.gaps.absence.title', { count: gap.count })
              : t('homeHub.gaps.area.title', { count: gap.count, total: gap.total })
          const stat = gap.kind === 'area'
            ? `${gap.count}/${gap.total}`
            : t('homeHub.gaps.count', { count: gap.count })
          return (
            <button type="button" key={gap.kind} className={styles.gapCard} onClick={() => onStart(gap)}>
              <span className={styles.gapStat} aria-hidden="true">{stat}</span>
              <span className={styles.gapTitle}>{title}</span>
              <span className={styles.caption}>{t(`homeHub.gaps.${gap.kind}.description`)}</span>
              <span className={styles.gapAction}>{t('homeHub.gaps.action')}<ChevronRight size={16} aria-hidden="true" /></span>
            </button>
          )
        })}
      </div>
    </HomeSection>
  )
}
