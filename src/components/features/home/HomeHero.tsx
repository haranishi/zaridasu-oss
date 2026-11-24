'use client'

import Link from 'next/link'
import { ChevronRight, Map, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { trackEvent } from '@/lib/analytics'
import styles from './home.module.css'

/**
 * 未ログインのホームの最上部。何のサービスか・何をすればよいか・誰がつくったかを先に伝える。
 * 文言はLPの見出しと運営者の一文（lp.stats.operator）を引き継ぐ。運営者の一文は、画面の他の欄に合わせて「報告」を「記録」と書く。
 * ページの h1 は従来の読み上げ専用のままなので、ここの見出しは h2。
 */
export default function HomeHero({ onSignup }: { onSignup: () => void }) {
  const { t } = useTranslation()
  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <p className={styles.heroEyebrow}>{t('homeHub.hero.eyebrow')}</p>
      <h2 id="home-hero-title" className={styles.heroTitle}>{t('homeHub.hero.title')}</h2>
      <p className={styles.heroLead}>{t('homeHub.hero.description')}</p>
      <div className={styles.heroActions}>
        <button type="button" className={`${styles.button} ${styles.primary} ${styles.heroButton}`} onClick={onSignup}>
          <Plus size={20} aria-hidden="true" />{t('homeHub.hero.signup')}
        </button>
        <Link href="/map" className={`${styles.button} ${styles.heroButton}`} onClick={() => trackEvent('home_cta', { target: 'map' })}>
          <Map size={20} aria-hidden="true" />{t('homeHub.hero.map')}
        </Link>
      </div>
      <p className={styles.heroOperator}>{t('homeHub.hero.operator')}</p>
      <div className={styles.heroLinks}>
        <Link href="/guide" className={styles.heroGuide} onClick={() => trackEvent('home_cta', { target: 'guide' })}>
          {t('homeHub.guideNews')}<ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/about" className={styles.heroAbout} onClick={() => trackEvent('home_cta', { target: 'about' })}>
          {t('homeHub.hero.about')}<ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
