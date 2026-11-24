'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { Bookmark, Camera, ChevronRight, Heart, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useToastContext } from '@/context/ToastContext'
import { useHomeFeed, type HomePost } from '@/hooks/posts/useHomeFeed'
import { getSpecies } from '@/lib/constants'
import { groupPhotoless, type PhotolessGroup } from '@/lib/homeGaps'
import styles from './home.module.css'

const SavedPosts = dynamic(() => import('./SavedPosts'), { ssr: false })

/** 人気の投稿は、いいねが付いた公開記録がこの件数に達してから出す（1〜2件だけの「人気」は出さない）。 */
const POPULAR_MIN = 3
/** 写真なしの記録を、新着の下に1行ずつ並べる最大のまとまり数。 */
const PHOTOLESS_ROWS = 4

export function HomeSection({ title, href, id, children }: { title: string; href?: string; id?: string; children: ReactNode }) {
  const { t } = useTranslation()
  return <section className={styles.section} id={id} aria-label={title}>
    <div className={styles.sectionHeading}><h2>{title}</h2>{href && <Link className={styles.more} href={href}>{t('homeHub.more')}<span className="sr-only"> ({title})</span><ChevronRight size={18} /></Link>}</div>
    {children}
  </section>
}

function PostPhoto({ post, sizes = '180px' }: { post: HomePost; sizes?: string }) {
  const [failed, setFailed] = useState(false)
  const { t } = useTranslation()
  return post.photos?.[0] && !failed
    ? <Image src={post.photos[0]} alt={t(`species.${post.species}`, { defaultValue: t('homeHub.observation') })} fill sizes={sizes} className={styles.cover} onError={() => setFailed(true)} />
    : <span className={styles.noPhoto}><Camera size={28} aria-hidden="true" /><span>{t(failed ? 'homeHub.photoError' : 'homeHub.noPhoto')}</span></span>
}

/** 写真なしの記録を、灰色の空カードにせず1行で並べる。同じ日・市町村・種・種類は「N件」にまとめる。 */
function PhotolessRows({ groups }: { groups: PhotolessGroup[] }) {
  const { t, i18n } = useTranslation()
  return <>
    <h3 className={styles.subHeading}>{t('homeHub.noPhoto')}</h3>
    <ul className={styles.postRows}>
      {groups.map(group => {
        const species = getSpecies(group.species) ? t(`species.${group.species}`) : t('homeHub.observation')
        const text = group.info_type === 'absence'
          ? t('homeHub.absenceRow', { species })
          : t('homeHub.photolessRow', { species, type: t(`infoType.${group.info_type}`, { defaultValue: t('homeHub.observation') }) })
        return <li key={group.id}>
          <Link href={`/post/${group.id}`} className={styles.postRow}>
            <time className={styles.postRowDate} dateTime={group.created_at}>{new Date(group.created_at).toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })}</time>
            <span className={styles.postRowBody}>
              <strong>{group.municipality || t('homeHub.locationPrivate')}</strong>
              <span className={styles.postRowText}>{text}</span>
              {group.count > 1 && <span className={styles.postRowCount}>{t('homeHub.groupCount', { count: group.count })}</span>}
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </li>
      })}
    </ul>
  </>
}

function FeedContent({ scope, afterPickup }: { scope: string; afterPickup?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const { posts, loading, error, refresh } = useHomeFeed()
  const toast = useToastContext()
  const [saved, setSaved] = useState<string[]>([])
  const [savedOpen, setSavedOpen] = useState(false)
  const storageKey = `zaridasu:home-saved:${scope}`
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(value)) setSaved(value.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200))
    } catch { /* The feed remains usable when local storage is unavailable. */ }
  }, [storageKey])
  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter(value => value !== id) : [...saved, id].slice(-200)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setSaved(next)
    } catch { toast.error(t('homeHub.saveError')) }
  }
  const popular = [...posts].filter(post => post.likes.length > 0).sort((a, b) => b.likes.length - a.likes.length || b.created_at.localeCompare(a.created_at))
  const withPhoto = posts.filter(post => post.photos?.length)
  const photos = withPhoto.slice(0, 5)
  // ピックアップに出した記録は新着に出さない（同じ写真が1回のスクロールで2度出るのを避ける）
  const pickedIds = new Set(photos.map(post => post.id))
  const newPhotos = withPhoto.filter(post => !pickedIds.has(post.id))
  const photoless = groupPhotoless(posts.filter(post => !post.photos?.length)).slice(0, PHOTOLESS_ROWS)
  const questions = posts.flatMap(post => post.comments.filter(comment => /[?？]/.test(comment.content)).map(comment => ({ post, ...comment })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4)
  // 中身がまだ無い欄は出さない。取得中・失敗の案内は、最初に出る欄（ピックアップ・新着）だけが担う。
  const showPickup = loading || error || photos.length > 0
  const showPopular = !loading && !error && popular.length >= POPULAR_MIN
  const showQuestions = !loading && !error && questions.length > 0
  const showNew = loading || error || !posts.length || newPhotos.length > 0 || photoless.length > 0 || saved.length > 0
  function state(empty: string) {
    if (loading) return <div className={styles.feedSkeleton} role="status" aria-label={t('homeHub.loading')}><div /><div /></div>
    if (error) return <div className={styles.empty} role="status"><p>{t('homeHub.feedError')}</p><button type="button" className={styles.button} onClick={() => void refresh()}>{t('common.retry')}</button></div>
    return <div className={styles.empty}><p>{empty}</p><Link href="/map" className={styles.inlineButton}>{t('homeHub.viewMap')}<ChevronRight size={16} /></Link></div>
  }
  function cards(items: HomePost[]) {
    return <div className={styles.rail} role="group" aria-label={t('homeHub.postRail')}>
      {items.slice(0, 8).map(post => <article key={post.id} className={styles.postCard}>
        <Link href={`/post/${post.id}`} className={styles.postPhoto}><PostPhoto post={post} /></Link>
        <div className={styles.postBody}>
          <Link href={`/post/${post.id}`} className={styles.postTitle}>{getSpecies(post.species) ? t(`species.${post.species}`) : t('homeHub.observation')}</Link>
          <p className={styles.caption}>{t(`infoType.${post.info_type}`, { defaultValue: t('homeHub.observation') })}</p>
          <p className={styles.caption}>{post.municipality || t('homeHub.locationPrivate')}</p>
          <time className={styles.caption} dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(i18n.language, { month: 'numeric', day: 'numeric' })}</time>
          <div className={styles.postActions}>
            <Link href={`/post/${post.id}`} aria-label={t('homeHub.likesDetail', { count: post.likes.length })}><Heart size={18} /><span>{post.likes.length >= 1000 ? '1000+' : post.likes.length}</span></Link>
            <Link href={`/post/${post.id}#comments`} aria-label={t('homeHub.commentsDetail', { count: post.comments.length })}><MessageCircle size={18} /><span>{post.comments.length >= 1000 ? '1000+' : post.comments.length}</span></Link>
            <button type="button" onClick={() => toggleSaved(post.id)} aria-pressed={saved.includes(post.id)} aria-label={t(saved.includes(post.id) ? 'homeHub.unsave' : 'homeHub.save')} title={t('homeHub.localSave')}><Bookmark size={20} fill={saved.includes(post.id) ? 'currentColor' : 'none'} /></button>
          </div>
        </div>
      </article>)}
    </div>
  }
  return <>
    {showPickup && <HomeSection title={t('homeHub.pickup')} href="/map">
      {loading || error ? state(t('homeHub.noPhotos')) : <div className={styles.mosaic} data-count={photos.length}>{photos.map(post => <Link key={post.id} href={`/post/${post.id}`} className={styles.pickupPhoto}><PostPhoto post={post} sizes="(min-width: 1024px) 400px, 50vw" /></Link>)}</div>}
      <p className={styles.caption}>{t('homeHub.pickupDescription')}</p>
    </HomeSection>}
    {afterPickup}
    {showNew && <HomeSection title={t('homeHub.newPosts')} href="/map">
      {saved.length > 0 && <button type="button" className={styles.inlineButton} onClick={() => setSavedOpen(true)}><Bookmark size={18} />{t('homeHub.viewSaved', { count: saved.length })}</button>}
      {loading || error || !posts.length ? state(t('homeHub.noPosts')) : <>
        {newPhotos.length > 0 && cards(newPhotos)}
        {photoless.length > 0 && <PhotolessRows groups={photoless} />}
      </>}
    </HomeSection>}
    {showPopular && <HomeSection title={t('homeHub.popular')} href="/map">
      <p className={styles.caption}>{t('homeHub.popularScope')}</p>
      {cards(popular)}
    </HomeSection>}
    {showQuestions && <HomeSection title={t('homeHub.questions')} href="/guide#questions">
      <div className={styles.rail} role="group" aria-label={t('homeHub.questions')}>
        {questions.map(question => <Link key={question.id} className={styles.questionCard} href={`/post/${question.post.id}#comments`}><div className={styles.questionPhoto}><PostPhoto post={question.post} /></div><p className={styles.questionText}>{question.content}</p><span className={styles.caption}><MessageCircle size={16} />{t('homeHub.viewConversation')}</span></Link>)}
      </div>
      <Link href="/guide#questions" className={styles.inlineButton}>{t('homeHub.readFaq')}<ChevronRight size={16} /></Link>
    </HomeSection>}
    {savedOpen && <SavedPosts ids={saved} onClose={() => setSavedOpen(false)} onRemove={toggleSaved} />}
  </>
}

export default function HomeFeed({ afterPickup }: { afterPickup?: ReactNode }) {
  const { user } = useAuth()
  // Account changes remount local preferences instead of exposing the previous account's saved state.
  const scope = user?.id ?? 'guest'
  return <FeedContent key={scope} scope={scope} afterPickup={afterPickup} />
}
