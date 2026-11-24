'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { Award, ChevronRight, User, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useProfile, useProgress, useCollection } from '@/hooks/useProfile'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { BADGES } from '@/lib/constants'
import styles from './home.module.css'

function Member({ userId, online, onRetry }: { userId: string; online: boolean; onRetry: () => void }) {
  const { t } = useTranslation()
  const { profile, error: profileError, loading: profileLoading } = useProfile(userId)
  const { progress, error: progressError, loading: progressLoading } = useProgress(userId)
  const { collection, error: collectionError, loading: collectionLoading } = useCollection(userId)
  const [badgesOpen, setBadgesOpen] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setBadgesOpen(false), [])
  useFocusTrap(dialog, badgesOpen)
  useEscapeKey(useCallback(() => { if (badgesOpen) close() }, [badgesOpen, close]))
  useBodyScrollLock(badgesOpen)
  const approved = progress?.approved_count
  const earned = approved == null ? null : BADGES.filter(badge => approved >= badge.min).length
  const pct = progress ? Math.min(100, (progress.xp_into_level / Math.max(1, progress.xp_for_next_level)) * 100) : 0
  const unavailable = !online || profileError || progressError || collectionError || (!profileLoading && !profile) || (!progressLoading && !progress)
  return (
    <>
      <div className={styles.profileCard} aria-busy={profileLoading || progressLoading}>
        <Link href="/dashboard" className={styles.profileIdentity}>
          <span className={styles.avatar} aria-hidden="true">{profile?.avatar_emoji || <User size={26} />}</span>
          <span className={styles.identityCopy}><strong>{profile?.display_name || t('homeHub.myPage')}</strong><span className={styles.caption}>{progress ? t('homeHub.level', { level: progress.level }) : t('homeHub.myRecords')}</span></span>
          <ChevronRight size={20} />
        </Link>
        {unavailable && <p role="status" className={styles.caption}>{t('homeHub.accountError')} <button type="button" className={styles.inlineButton} onClick={onRetry}>{t('common.retry')}</button></p>}
        <div className={styles.xpText}><span>{progress ? t('homeHub.totalXp', { count: progress.xp }) : '— XP'}</span><span>{progress ? t('homeHub.nextXp', { count: Math.max(0, progress.xp_for_next_level - progress.xp_into_level) }) : progressLoading ? t('homeHub.loading') : t('homeHub.progressError')}</span></div>
        <div className={styles.progress} role="progressbar" aria-label={t('homeHub.levelProgress')} aria-valuenow={progress ? Math.round(pct) : undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
        <div className={styles.stats}>
          <div><strong>{approved ?? '—'}</strong><span>{t('homeHub.approved')}</span></div>
          <div><strong>{!online || collectionError || collectionLoading ? '—' : collection.length}</strong><span>{t('homeHub.speciesCount')}</span></div>
          <div><strong>{earned ?? '—'}</strong><span>{t('homeHub.badges')}</span></div>
        </div>
        <button type="button" className={styles.badgeLink} disabled={!progress} onClick={() => setBadgesOpen(true)}><Award size={24} /><span>{t('homeHub.viewBadges')}</span><ChevronRight size={20} /></button>
      </div>
      {badgesOpen && <div className={styles.dialogBackdrop}>
        <button type="button" className={styles.backdropButton} tabIndex={-1} aria-label={t('common.close')} onClick={close} />
        <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="home-badges-title">
          <div className={styles.sectionHeading}><h2 id="home-badges-title">{t('homeHub.viewBadges')}</h2><button type="button" className={styles.iconButton} onClick={close} aria-label={t('common.close')}><X size={24} /></button></div>
          <p className={styles.caption}>{t('homeHub.badgeRule')}</p>
          {BADGES.map((badge, index) => <div key={badge.min} className={`${styles.badgeRow} ${approved != null && approved >= badge.min ? styles.cream : ''}`}><span aria-hidden="true" className={styles.badgeMedal}>{badge.emoji}</span><span><strong>{t(`homeHub.badgeNames.${index}`)}</strong><span className={styles.caption}>{approved != null && approved >= badge.min ? t('homeHub.earned') : t('homeHub.lockedBadge', { count: badge.min })}</span></span></div>)}
          <Link href="/dashboard" className={styles.button} onClick={close}>{t('homeHub.myPage')}</Link>
        </div>
      </div>}
    </>
  )
}

/** 会員の本人カード。未ログインのホームでは HomeHero が先頭を担うので、ここでは何も出さない。 */
export default function HomeProfile() {
  const { user, loading } = useAuth()
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const [attempt, setAttempt] = useState(0)
  if (loading) return <div className={`${styles.profileCard} ${styles.profileSkeleton}`} role="status">{t('homeHub.loading')}</div>
  if (!user) return null
  return <Member key={`${user.id}:${online}:${attempt}`} userId={user.id} online={online} onRetry={() => setAttempt(value => value + 1)} />
}
