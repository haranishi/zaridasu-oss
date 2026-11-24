'use client'

import { lazy, Suspense, useRef } from 'react'
import { getSpecies, OSM_ATTRIBUTION } from '@/lib/constants'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

export interface MapPost {
  lat: number
  lng: number
  species: string
  municipality?: string | null
}

// 拡大地図モーダル用（遅延読み込み）
const MapModalInner = lazy(() =>
  import('react-leaflet').then((mod) => ({
    default: function MapModalMap({ post }: { post: MapPost }) {
      const species = getSpecies(post.species)
      return (
        <mod.MapContainer
          center={[post.lat, post.lng]}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <mod.TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution={OSM_ATTRIBUTION}
          />
          <mod.CircleMarker
            center={[post.lat, post.lng]}
            radius={12}
            fillColor={species?.color || '#6B7280'}
            color="white"
            weight={3}
            fillOpacity={0.9}
          />
        </mod.MapContainer>
      )
    },
  }))
)

function MapModalContent({ post }: { post: MapPost }) {
  return (
    // REQ-325 FR-325-01: 読み込み中の文字は下地が gray-100 なので gray-400 は 2.31:1。gray-600 で 6.87:1。
    <Suspense fallback={<div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-600">地図を読み込み中…</div>}>
      <MapModalInner post={post} />
    </Suspense>
  )
}

interface MapModalProps {
  post: MapPost
  onClose: () => void
}

export default function MapModal({ post, onClose }: MapModalProps) {
  // REQ-268 FR-268-04/12: Esc とフォーカストラップを共通フックへ（旧 onKeyDown は div が
  // フォーカスされず発火しなかった）。max-h-[90dvh] で短い landscape でも溢れないようにする。
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeKey(onClose)
  useFocusTrap(dialogRef)
  useBodyScrollLock()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="位置確認マップ">
      <button type="button" aria-label="閉じる" tabIndex={-1} className="fixed inset-0 bg-black/60 cursor-default border-0 p-0" onClick={onClose} />
      <div ref={dialogRef} role="document" className="relative bg-white rounded-xl shadow-xl overflow-hidden w-full max-w-lg max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="font-semibold text-gray-700">📍 {post.municipality || '位置情報'}</span>
          <button onClick={onClose} aria-label="閉じる" className="rounded-full p-2 -mr-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-lg leading-none">✕</button>
        </div>
        <div className="h-80 min-h-0 flex-1">
          <MapModalContent post={post} />
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
          {Number(post.lat).toFixed(5)}, {Number(post.lng).toFixed(5)}
        </div>
      </div>
    </div>
  )
}
