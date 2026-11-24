'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import Header from '@/components/layout/Header'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import { useTheme } from '@/context/ThemeContext'
import IllustrationTag from './IllustrationTag'
import { HOME_IMAGES } from './homeImages'
import styles from './home.module.css'

export default function HomeGuide() {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const router = useRouter()
  return <div className={`${styles.home} ${dark ? styles.dark : ''}`}>
    <Header onPostClick={() => router.push('/map?post=1')} onLoginClick={mode => router.push(`/?auth=${mode}`)} />
    <article className={styles.guide}>
      <Link href="/" className={styles.inlineButton}>{t('homeHub.backHome')}</Link>
      <h1>{t('homeHub.guideTitle')}</h1>
      <div className={styles.guideCover}><Image src={HOME_IMAGES.waterside} alt="" fill sizes="(min-width: 768px) 720px, 100vw" className={styles.cover} priority /><IllustrationTag /></div>
      <section id="water"><h2>{t('homeHub.articles.water.title')}</h2><p>{t('homeHub.guide.water')}</p></section>
      <section id="photos"><h2>{t('homeHub.articles.photos.title')}</h2><p>{t('homeHub.guide.photos')}</p></section>
      <section id="gaps"><h2>{t('homeHub.gaps.title')}</h2>
        <section id="species"><h3>{t('homeHub.gaps.guide.species')}</h3><p>{t('homeHub.guide.species')}</p></section>
        <section id="absence"><h3>{t('homeHub.gaps.guide.absence')}</h3><p>{t('homeHub.guide.absence')}</p></section>
        <section id="area"><h3>{t('homeHub.gaps.guide.area')}</h3><p>{t('homeHub.guide.area')}</p></section>
        <Link className={`${styles.button} ${styles.primary}`} href="/map?post=1">{t('homeHub.startRecording')}</Link></section>
      <section id="questions"><h2>{t('homeHub.readFaq')}</h2>{['login', 'status', 'safety'].map(key => <details className={styles.faq} key={key}><summary>{t(`homeHub.faq.${key}.question`)}</summary><p>{t(`homeHub.faq.${key}.answer`)}</p></details>)}</section>
      <Link className={styles.button} href="/map">{t('homeHub.viewMap')}</Link><p className={styles.caption}>{t('homeHub.illustrationNote')}</p>
    </article>
    <BottomNavSpacer /><PageBottomNav />
  </div>
}
