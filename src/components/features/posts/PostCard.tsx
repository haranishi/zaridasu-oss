'use client'

import { memo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/dateLocales'
import Image from 'next/image'
import { getSpecies, getInfoType } from '@/lib/constants'
import { toThumbnailUrl } from '@/lib/imageUtils'
import { MapPin, Trash2, Star, Pencil } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useEditPost } from '@/hooks/posts/useEditPost'
import { useDeletePost } from '@/hooks/posts/useDeletePost'
// REQ-153: 編集モーダルは showEdit が true になるまで不要なので動的 import で初期バンドルから分離。
const EditDialog = dynamic(() => import('../../modals/EditDialog'), { ssr: false })

import type { Post } from '@/types'

type PostCardPost = Post & {
  ai_result?: {
    error?: boolean
    confidence?: number | null
    species_match?: boolean
  } | null
}

interface PostCardProps {
  post: PostCardPost
  onDeleted?: () => void
  onEdited?: () => void
}

// REQ-247 L1: リストアイテムなので memo 化し、親（一覧）の再レンダーで全カードが
// 再描画されるのを防ぐ。props（post / onDeleted / onEdited）が変化したカードだけ更新される。
function PostCard({ post, onDeleted, onEdited }: PostCardProps) {
  const { user } = useAuth()
  const { dark } = useTheme()
  const { t, i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const species = getSpecies(post.species)
  const infoType = getInfoType(post.info_type)
  const isOwner = user && post.user_id && user.id === post.user_id
  const [confirming, setConfirming] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const hasPhoto = post.photos && post.photos.length > 0

  const { deleting, handleDelete: deletePost } = useDeletePost(post, { onDeleted })

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    await deletePost()
    setConfirming(false)
  }

  const { saving: editSaving, error: editError, clearError: clearEditError, saveEdit } = useEditPost(post, {
    onSuccess: () => {
      setShowEdit(false)
      onEdited?.()
    },
  })

  return (
    <div className="relative group">
      <Link
        href={`/post/${post.id}`}
        className={`block rounded-xl border overflow-hidden transition-all duration-200 ${
          dark
            ? 'bg-slate-900 border-slate-800/60 hover:border-slate-700'
            : 'bg-white border-gray-100 hover:border-gray-200 hover:shadow-md'
        }`}
      >
        {/* 写真エリア */}
        {hasPhoto ? (
          <div className="relative aspect-4/3 overflow-hidden">
            <Image
              src={String(toThumbnailUrl(post.photos![0], 400) || post.photos![0])}
              alt={species ? t(`species.${post.species}`) : t('postCard.unknown')}
              width={400}
              height={300}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="w-full h-full object-cover"
            />
            {/* 種類バッジ（写真上オーバーレイ） */}
            <div className="absolute top-2 left-2 max-w-[60%]">
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-black/60 text-white backdrop-blur-xs">
                <Image src={species?.image || '/images/unknown.png'} alt={species ? t(`species.${post.species}`) : t('postCard.unknown')} width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
                <span className="truncate">{species ? t(`species.${post.species}`) : t('postCard.unknown')}</span>
              </span>
            </div>
            {/* 情報種別バッジ（写真上右） */}
            <span className="absolute top-2 right-2 max-w-[35%] truncate text-xs px-2 py-1 rounded-lg bg-black/60 text-white backdrop-blur-xs font-medium">
              {infoType?.emoji} {infoType ? t(`infoType.${post.info_type}`) : post.info_type}
            </span>
            {/* 写真枚数 */}
            {post.photos!.length > 1 && (
              <span className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-xs">
                📷 {post.photos!.length}
              </span>
            )}
          </div>
        ) : (
          /* 写真なし: ヘッダー行 */
          <div className={`flex items-center gap-2 px-3 pt-3 pb-1`}>
            <Image
              src={species?.image || '/images/unknown.png'}
              alt={species ? t(`species.${post.species}`) : t('postCard.unknown')}
              width={28}
              height={28}
              className="w-7 h-7 object-contain shrink-0"
            />
            <span className={`font-semibold text-sm truncate ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
              {species ? t(`species.${post.species}`) : t('postCard.unknown')}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
              dark ? 'bg-slate-700/80 text-slate-400' : 'bg-gray-100 text-gray-600'
            }`}>
              {infoType?.emoji} {infoType ? t(`infoType.${post.info_type}`) : post.info_type}
            </span>
          </div>
        )}

        {/* テキスト情報 */}
        <div className="px-3 py-2.5">
          {/* バッジ行 */}
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {!post.is_anonymous && (
              <span
                title={t('postCard.verifiedTitle')}
                className="text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded-full font-medium"
              >
                ✓ {t('postCard.verified')}
              </span>
            )}
            {post.is_official && (
              <span className="flex items-center gap-0.5 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                <Star size={8} fill="white" />
                {t('postCard.official')}
              </span>
            )}
            {post.ai_result && !post.ai_result.error && post.ai_result.species_match === true && (post.ai_result.confidence ?? 0) >= 0.75 && (
              <span className="text-[10px] bg-green-500/10 text-green-600 border border-green-500/20 px-1.5 py-0.5 rounded-full font-medium">
                🤖 AI
              </span>
            )}
          </div>

          {/* 位置・数 */}
          <div className={`flex items-center gap-2 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            {post.municipality && (
              <span className="flex items-center gap-0.5">
                <MapPin size={11} />
                {post.municipality}
              </span>
            )}
            {post.count != null && (
              <span>{t('postCard.count', { count: post.count })}</span>
            )}
          </div>

          {/* コメント */}
          {post.comment && (
            <div className={`text-xs line-clamp-2 leading-relaxed mt-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {post.comment}
            </div>
          )}

          {/* 日時 */}
          <div className={`text-[11px] mt-1.5 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
            {format(new Date(post.created_at), 'M/d HH:mm', { locale: dateLocale })}
          </div>
        </div>
      </Link>

      {/* オーナーアクション */}
      {isOwner && (
        <div className="absolute top-2 right-2 z-10" style={hasPhoto ? { top: 'auto', bottom: '0.5rem' } : {}}>
          {confirming ? (
            <div className="flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-lg p-1">
              <button
                onClick={(e) => { e.preventDefault(); setConfirming(false) }}
                className={`text-xs px-2 py-1 rounded-md ${
                  dark ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {t('postCard.deleteCancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-white px-2 py-1 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t('postCard.deleting') : t('postCard.deleteOk')}
              </button>
            </div>
          ) : (
            <div className={`flex items-center gap-0.5 rounded-lg ${hasPhoto ? 'bg-black/40 backdrop-blur-xs' : ''} opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity`}>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearEditError(); setShowEdit(true) }}
                className={`p-2 rounded-md ${
                  hasPhoto
                    ? 'text-white/80 hover:text-white'
                    : dark ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-700' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                }`}
                title={t('postCard.editTitle')}
                aria-label={t('postCard.editTitle')}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
                className={`p-2 rounded-md ${
                  hasPhoto
                    ? 'text-white/80 hover:text-white'
                    : dark ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                }`}
                title={t('postCard.deleteTitle')}
                aria-label={t('postCard.deleteTitle')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {showEdit && (
        <EditDialog
          post={post}
          onSave={saveEdit}
          onCancel={() => setShowEdit(false)}
          saving={editSaving}
          dark={dark}
          error={editError}
        />
      )}
    </div>
  )
}

export default memo(PostCard)
