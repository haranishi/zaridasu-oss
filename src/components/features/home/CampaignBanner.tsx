'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import IllustrationTag from './IllustrationTag'
import { HOME_IMAGES, type HomeImage } from './homeImages'
import styles from './home.module.css'

export const MONITOR_SURVEY_URL = 'https://project-not-configured.invalid/form'
const CAMPAIGNS = [
  // 1枚目は「記録する」へ。会員は投稿画面、未ログインは登録画面が開く（/map?post=1）。調査依頼のページ（/requests）は、本物の依頼が立つまで案内しない
  { key: 'fieldwork', photo: 'canal', href: '/map?post=1', color: 'cream' },
  { key: 'monitor', photo: 'crayfish', href: MONITOR_SURVEY_URL, color: 'rose' },
  { key: 'research', photo: 'pond', href: '/about', color: 'water' },
] as const satisfies readonly { key: string; photo: HomeImage; href: string; color: string }[]

export default function CampaignBanner() {
  const [index, setIndex] = useState(0)
  const { t } = useTranslation()
  const item = CAMPAIGNS[index]!
  return (
    <section className={`${styles.campaign} ${styles[item.color]}`} aria-label={t('homeHub.campaigns')} aria-roledescription={t('homeHub.carousel')}>
      <Link className={styles.campaignCopy} href={item.href} onClick={() => trackEvent('home_banner', { banner: item.key })} {...(item.key === 'monitor' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        <span className={styles.eyebrow}>{t(`homeHub.banner.${item.key}.tag`)}</span>
        <span className={styles.campaignTitle}>{t(`homeHub.banner.${item.key}.title`)}</span>
        <span className={`${styles.caption} ${styles.campaignCaption}`}>{t(`homeHub.banner.${item.key}.caption`)}<ChevronRight size={14} aria-hidden="true" /></span>
      </Link>
      <div className={styles.campaignPhoto}>
        <Image src={HOME_IMAGES[item.photo]} alt="" fill sizes="(min-width: 1024px) 384px, (min-width: 600px) 50vw, 120px" className={styles.cover} priority={index === 0} />
        <span className={styles.campaignPosition} aria-live="polite" aria-atomic="true">{index + 1} / {CAMPAIGNS.length}</span>
        <IllustrationTag />
        <button type="button" className={styles.nextBanner} aria-label={t('homeHub.nextBanner')} onClick={() => setIndex((index + 1) % CAMPAIGNS.length)}><ChevronRight size={24} /></button>
      </div>
    </section>
  )
}
