'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { HomeSection } from './HomeFeed'
import { FEEDBACK_FORM_URL } from '@/lib/constants'
import { MONITOR_SURVEY_URL } from './CampaignBanner'
import IllustrationTag from './IllustrationTag'
import { HOME_IMAGES, type HomeImage } from './homeImages'
import styles from './home.module.css'

/** 記録ガイドの記事。写真は記事の内容に合わせ、バナー・図鑑の欄とは別の画像にする。 */
const ARTICLES: readonly { key: 'water' | 'photos'; image: HomeImage }[] = [
  { key: 'water', image: 'waterside' },
  { key: 'photos', image: 'phone' },
]

export default function HomeResources() {
  const { t } = useTranslation()
  const { user } = useAuth()
  return <>
    <HomeSection title={t('homeHub.collections')} href={user ? '/collection' : '/?auth=signup'}>
      <div className={styles.twoColumns}>{['american', 'bullfrog'].map((species, index) => <Link className={styles.collectionCard} href={`/species/${species}`} key={species}>
        <div className={styles.collectionPhoto}><Image src={HOME_IMAGES[index ? 'bullfrog' : 'crayfish']} alt="" fill sizes="(min-width: 1024px) 384px, 50vw" className={styles.cover} /><IllustrationTag /></div><div className={styles.postBody}><h3>{t(`species.${species}`)}</h3><p className={styles.caption}>{t('homeHub.speciesGuide')}</p></div>
      </Link>)}</div>
    </HomeSection>
    <HomeSection title={t('homeHub.reading')} href="/guide">
      <div className={styles.rail} role="group" aria-label={t('homeHub.reading')}>{ARTICLES.map(({ key, image }) => <Link href={`/guide#${key}`} className={styles.articleCard} key={key}>
        {/* 横幅216px×DPR1.75=378px なので、384幅の版が選ばれる（248pxだと640幅になり、画素が2倍強の無駄になる） */}
        <div className={styles.articlePhoto}><Image src={HOME_IMAGES[image]} alt="" fill sizes="(min-width: 600px) 350px, 216px" className={styles.cover} /><IllustrationTag /></div><div className={styles.postBody}><h3>{t(`homeHub.articles.${key}.title`)}</h3><p className={styles.caption}>{t('homeHub.guideByline')}</p></div>
      </Link>)}</div>
    </HomeSection>
    <HomeSection title={t('homeHub.news')} id="home-news">
      <a className={styles.newsItem} href={MONITOR_SURVEY_URL} target="_blank" rel="noopener noreferrer"><span><span className={styles.caption}>{t('homeHub.monitorTag')}</span><span>{t('homeHub.monitorNews')}</span></span><ChevronRight size={20} /></a>
      <Link className={styles.newsItem} href="/guide#questions"><span><span className={styles.caption}>{t('homeHub.guideTag')}</span><span>{t('homeHub.readFaq')}</span></span><ChevronRight size={20} /></Link>
      <Link className={styles.newsItem} href="/guide"><span><span className={styles.caption}>{t('homeHub.guideTag')}</span><span>{t('homeHub.guideNews')}</span></span><ChevronRight size={20} /></Link>
    </HomeSection>
    <p className={styles.homeEnd}><MapPin size={16} />{t('homeHub.tagline')}</p>
    <nav className={styles.legalLinks} aria-label={t('homeHub.legalNav')}>
      <Link href="/about">{t('footer.aboutService')}</Link>
      <Link href="/terms">{t('footer.terms')}</Link>
      <Link href="/privacy">{t('footer.privacy')}</Link>
      <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer">{t('footer.contact')}</a>
    </nav>
  </>
}
