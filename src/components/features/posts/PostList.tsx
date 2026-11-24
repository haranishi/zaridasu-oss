'use client'

import { Fragment, useEffect, useRef, useCallback } from 'react'
import PostCard from './PostCard'
import CrayfishIllustration from '../../ui/CrayfishIllustration'
import { Loader2 } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from 'react-i18next'
import type { Post } from '@/types'

const INLINE_CARD_POSITION = 5 // 何件目の後に挿入するか

interface SignupInlineCardProps {
  onLoginClick: () => void
  dark: boolean
}

function SignupInlineCard({ onLoginClick, dark }: SignupInlineCardProps) {
  const { t } = useTranslation()
  return (
    <div className={`col-span-1 min-[400px]:col-span-2 md:col-span-1 rounded-xl border p-3.5 flex items-center gap-3 ${dark
      ? 'bg-slate-800/60 border-slate-700'
      : 'bg-linear-to-r from-red-50 to-rose-50 border-red-100'
      }`}>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold mb-0.5 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
          {t('postList.signupPrompt')}
        </p>
        <div className={`text-xs space-y-0.5 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          <div>{t('postList.signupBenefit1')}</div>
          <div>{t('postList.signupBenefit2')}</div>
        </div>
      </div>
      <button
        onClick={onLoginClick}
        className="shrink-0 bg-accent text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-(--color-accent-hover) transition-all shadow-xs shadow-red-500/20 whitespace-nowrap"
      >
        {t('postList.signupButton')}
      </button>
    </div>
  )
}

interface PostListProps {
  posts: Post[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore?: () => void
  onPostDeleted: () => void
  onLoginClick: () => void
  hasActiveFilter?: boolean
  onResetFilter?: () => void
}

export default function PostList({ posts, loading, loadingMore, hasMore, onLoadMore, onPostDeleted, onLoginClick, hasActiveFilter, onResetFilter }: PostListProps) {
  const { dark } = useTheme()
  const { user } = useAuth()
  const { t } = useTranslation()
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Infinite scroll via IntersectionObserver
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0]
    if (entry?.isIntersecting && hasMore && !loadingMore && onLoadMore) {
      onLoadMore()
    }
  }, [hasMore, loadingMore, onLoadMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="animate-spin text-red-500" size={22} />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4">
        <CrayfishIllustration className="w-32 opacity-20 mb-3" />
        <div className={`text-sm font-medium ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
          {hasActiveFilter ? t('postList.noFilterResults') : t('postList.noResults')}
        </div>
        <div className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
          {hasActiveFilter ? t('postList.tryResetFilter') : t('postList.tryFilter')}
        </div>
        {hasActiveFilter && onResetFilter && (
          <button
            onClick={onResetFilter}
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 transition-colors"
          >
            {t('postList.resetFilter')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`overflow-y-auto custom-scrollbar flex-1 p-2 pb-20 md:p-0 md:pb-0 ${dark ? 'bg-slate-900' : 'bg-white'}`}>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-1 gap-2 md:gap-0">
        {posts.map((post, index) => (
          <Fragment key={post.id}>
            <PostCard post={post} onDeleted={onPostDeleted} onEdited={onPostDeleted} />
            {!user && index === INLINE_CARD_POSITION - 1 && (
              <SignupInlineCard onLoginClick={onLoginClick} dark={dark} />
            )}
          </Fragment>
        ))}
      </div>
      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />
      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="animate-spin text-red-500" size={18} />
        </div>
      )}
    </div>
  )
}
