'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { getSpecies, getInfoType, speciesLabel, infoTypeLabel } from '@/lib/constants'
import AudioPlayer from '@/components/ui/AudioPlayer'
import type { ReviewPost } from './ReviewCardAI'

// react-leaflet がモジュール評価時に window を参照するため、SSR/RSC pre-render で
// `ReferenceError: window is not defined` を起こす。client-only で遅延ロードする。
const ReviewCardMiniMap = dynamic(() => import('./ReviewCardMiniMap'), { ssr: false })
const ReviewCardAI = dynamic(() => import('./ReviewCardAI'), { ssr: false })

interface ReviewCardProps {
  post: ReviewPost
  selected: boolean
  onToggleSelect: () => void
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
  onReanalyze?: (post: ReviewPost) => Promise<void>
  onPhotoClick: (photos: string[], index: number) => void
  onMapClick?: (post: ReviewPost) => void
}

export default function ReviewCard({
  post,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onDelete,
  onReanalyze,
  onPhotoClick,
  onMapClick,
}: ReviewCardProps) {
  const species = getSpecies(post.species)
  const infoType = getInfoType(post.info_type)

  const dateStr = new Date(post.created_at).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <article
      className={`bg-white rounded-xl border-2 transition-colors overflow-hidden ${
        selected ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
      }`}
    >
      {/* ── ヘッダー ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="rounded-sm w-4 h-4 shrink-0"
          aria-label="この投稿を選択"
        />
        <span className="text-base font-semibold text-gray-700">{dateStr}</span>
        <span className="text-base text-gray-600">{post.municipality || '—'}</span>
        <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          審査待ち
        </span>
      </div>

      {/* ── ボディ ── */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* 左カラム: 写真 + AI */}
        <div className="space-y-4">
          {/* 写真 */}
          {post.photos && post.photos.length > 0 ? (
            <div className="space-y-2">
              <button
                onClick={() => onPhotoClick(post.photos!, 0)}
                className="block w-full rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity focus:outline-hidden focus:ring-2 focus:ring-red-400"
                aria-label="写真を拡大表示"
              >
                <div className="relative w-full h-44">
                  <Image
                    src={post.photos![0]!}
                    alt="投稿写真 1"
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-cover"
                  />
                </div>
              </button>
              {post.photos!.length > 1 && (
                <div className="flex gap-2">
                  {post.photos!.slice(1, 3).map((url, i) => (
                    <button
                      key={i}
                      onClick={() => onPhotoClick(post.photos!, i + 1)}
                      className="relative w-16 h-12 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
                    >
                      <Image src={url} alt={`投稿写真 ${i + 2}`} fill sizes="64px" className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-44 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
              写真なし
            </div>
          )}

          {/* 音声 — REQ-069 */}
          {post.audio_url ? (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                <span className="text-base">🎤</span>
                鳴き声
              </div>
              <AudioPlayer src={post.audio_url} className="w-full" />
            </div>
          ) : (
            <div className="w-full py-2 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 text-xs">
              音声なし
            </div>
          )}

          {/* AI判定 */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
            <ReviewCardAI post={post} onReanalyze={onReanalyze} />
          </div>
        </div>

        {/* 右カラム: 投稿情報 + コメント + 地図 */}
        <div className="space-y-4">
          {/* 投稿情報 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-base">
              {species?.image && (
                <Image src={species.image} alt={speciesLabel(post.species)} width={24} height={24} className="w-6 h-6 object-contain" />
              )}
              <span className="font-semibold text-gray-800">{speciesLabel(post.species)}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
              <span>{infoType?.emoji} {infoTypeLabel(post.info_type)}</span>
              {post.count != null && <span>個体数: {post.count}</span>}
              {post.observed_at && (
                <span>観察日: {new Date(post.observed_at).toLocaleDateString('ja-JP')}</span>
              )}
              {post.weather && <span>天気: {post.weather}</span>}
              {post.temperature != null && <span>気温: {post.temperature}°C</span>}
              {post.humidity != null && <span>湿度: {post.humidity}%</span>}
            </div>
          </div>

          {/* コメント */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">コメント</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap wrap-break-word leading-relaxed">
              {post.comment || '—'}
            </p>
          </div>

          {/* ミニマップ */}
          {post.lat != null && post.lng != null && (
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">📍 位置情報</p>
              <ReviewCardMiniMap
                lat={post.lat}
                lng={post.lng}
                speciesColor={species?.color}
                onClick={() => onMapClick?.(post)}
              />
              <p className="text-xs text-gray-400 mt-1">
                {Number(post.lat).toFixed(5)}, {Number(post.lng).toFixed(5)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── アクションバー ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/30">
        <button
          onClick={onApprove}
          className="bg-green-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-600 active:scale-95 transition-all"
          aria-label="この投稿を承認"
        >
          ✅ 承認する
        </button>
        <button
          onClick={onReject}
          className="bg-red-100 text-red-600 text-sm font-semibold px-5 py-2 rounded-lg hover:bg-red-200 active:scale-95 transition-all"
          aria-label="この投稿を却下"
        >
          ❌ 却下する
        </button>
        <button
          onClick={onDelete}
          className="ml-auto text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
          aria-label="この投稿を削除"
        >
          🗑 削除
        </button>
      </div>
    </article>
  )
}
