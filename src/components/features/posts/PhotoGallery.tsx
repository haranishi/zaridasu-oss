'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { getSpecies, getInfoType } from '@/lib/constants'
import { format } from 'date-fns'
import type { Post } from '@/types/index'
import EmptyState from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/Skeleton'

interface PhotoGalleryProps {
  posts: Post[]
  loading?: boolean
  /**
   * REQ-222 (FR-222-03 / AC-03): 空状態の投稿 CTA。ホーム（HomeInteractive）から
   * handlePostClick を渡すと、未ログインなら AuthModal、ログイン済みなら投稿フォームへ接続する。
   */
  onPostClick?: () => void
}

interface PhotoItem {
  post: Post
  url: string
}

export default function PhotoGallery({ posts, loading, onPostClick }: PhotoGalleryProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()

  // REQ-278 FR-278-05: 表示範囲フィルタ有効時 posts は最大 QUERY_LIMITS.posts(2000) 件に
  // なり得るため、テーマ切替等の再レンダーごとに flatMap し直さないようメモ化する。
  const items: PhotoItem[] = useMemo(
    () => posts.flatMap<PhotoItem>((p) => (p.photos ?? []).map((url: string) => ({ post: p, url }))),
    [posts],
  )

  if (loading) {
    // 実コンテンツ（2 カラムの正方形グリッド）と同じ骨格でスケルトン化（CLS 防止）。
    return (
      <LoadingState className={`grid grid-cols-2 gap-2 p-2 ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`aspect-square rounded-lg animate-pulse ${dark ? 'bg-slate-800' : 'bg-gray-200'}`}
          />
        ))}
      </LoadingState>
    )
  }

  if (items.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <EmptyState
          icon="📷"
          title={t('photoGallery.emptyTitle')}
          description={t('photoGallery.emptyDesc')}
          action={onPostClick ? { label: t('empty.photoPostCta'), onClick: onPostClick } : undefined}
        />
      </div>
    )
  }

  return (
    <div className={`h-full overflow-y-auto ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 z-10 px-4 py-2 text-xs font-medium border-b ${
        dark ? 'bg-slate-950/90 backdrop-blur-sm border-slate-800 text-slate-400' : 'bg-white/90 backdrop-blur-sm border-gray-100 text-gray-600'
      }`}>
        {t('photoGallery.count', { count: items.length })}
      </div>
      {/* REQ-268 FR-268-09: 最下行が固定 BottomNav(h-14)＋ホームインジケータに隠れないよう下余白を確保 */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {items.map(({ post, url }, i) => {
          const species = getSpecies(post.species)
          const infoType = getInfoType(post.info_type)
          // REQ-183 FR-183-11: 既存の species.* キーで多言語化（constants.label を直接表示しない）
          const speciesLabel = species ? t(`species.${post.species}`) : ''
          return (
            <Link
              key={`${post.id}-${i}`}
              href={`/post/${post.id}`}
              className="relative aspect-square rounded-lg overflow-hidden group"
            >
              <Image
                src={url}
                alt={`${speciesLabel}${post.municipality ?? ''}`}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition-transform group-active:scale-95"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-2">
                <div className="flex items-center gap-1 text-[11px] text-white">
                  {infoType?.emoji && <span>{infoType.emoji}</span>}
                  <span className="font-medium truncate">{speciesLabel}</span>
                </div>
                {post.municipality && (
                  <div className="text-[11px] text-white/80 truncate">{post.municipality}</div>
                )}
                <div className="text-[10px] text-white/70 mt-0.5">
                  {format(new Date(post.created_at), 'M/d')}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
