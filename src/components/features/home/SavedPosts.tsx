'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { BookmarkX, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHomeFeed } from '@/hooks/posts/useHomeFeed'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import styles from './home.module.css'

export default function SavedPosts({ ids, onClose, onRemove }: { ids: string[]; onClose: () => void; onRemove: (id: string) => void }) {
  const { t } = useTranslation()
  const { posts, loading, error, refresh } = useHomeFeed(ids)
  const dialog = useRef<HTMLDivElement>(null)
  useFocusTrap(dialog)
  useEscapeKey(onClose)
  useBodyScrollLock()
  return <div className={styles.dialogBackdrop}>
    <button type="button" className={styles.backdropButton} tabIndex={-1} aria-label={t('common.close')} onClick={onClose} />
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="home-saved-title">
      <div className={styles.sectionHeading}><h2 id="home-saved-title">{t('homeHub.savedTitle')}</h2><button type="button" className={styles.iconButton} onClick={onClose} aria-label={t('common.close')}><X size={24} /></button></div>
      <p className={styles.caption}>{t('homeHub.savedNotice')}</p>
      {loading ? <p role="status">{t('homeHub.loading')}</p> : error ? <div role="status"><p>{t('homeHub.feedError')}</p><button type="button" className={styles.button} onClick={() => void refresh()}>{t('common.retry')}</button></div> : !posts.length ? <p>{t('homeHub.noSaved')}</p> : posts.map(post => <div className={styles.savedRow} key={post.id}>
        <Link href={`/post/${post.id}`} onClick={onClose}><strong>{t(`species.${post.species}`, { defaultValue: t('homeHub.observation') })}</strong><span className={styles.caption}>{post.municipality || t('homeHub.locationPrivate')}</span></Link>
        <button type="button" className={styles.iconButton} aria-label={t('homeHub.unsave')} onClick={() => onRemove(post.id)}><BookmarkX size={20} /></button>
      </div>)}
    </div>
  </div>
}
