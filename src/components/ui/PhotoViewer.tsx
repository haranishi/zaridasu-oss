'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import React from 'react'

interface PhotoViewerProps {
  photos: string[]
  initialIndex?: number
  onClose: () => void
}

export default function PhotoViewer({ photos, initialIndex = 0, onClose }: PhotoViewerProps) {
  const [current, setCurrent] = useState(initialIndex)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const prev = useCallback(() => setCurrent((i) => (i - 1 + photos.length) % photos.length), [photos.length])
  const next = useCallback(() => setCurrent((i) => (i + 1) % photos.length), [photos.length])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', handleKey)
    const prev_overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prev_overflow
    }
  }, [onClose, prev, next])

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0]
    if (touch) setTouchStartX(touch.clientX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return
    const touch = e.changedTouches[0]
    if (!touch) return
    const diff = touchStartX - touch.clientX
    if (Math.abs(diff) > 30) {
      if (diff > 0) next(); else prev()
    }
    setTouchStartX(null)
  }

  return (
    <div
      className="fixed inset-0 z-9999 bg-black/95 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-viewer-title"
    >
      <span id="photo-viewer-title" className="sr-only">写真ビューア</span>
      {/* カウンター */}
      {photos.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full pointer-events-none">
          {current + 1} / {photos.length}
        </div>
      )}

      {/* 閉じるボタン */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white bg-black/50 min-h-11 min-w-11 inline-flex items-center justify-center rounded-full hover:bg-black/70 transition-colors z-10"
        aria-label="閉じる"
      >
        <X size={20} />
      </button>

      {/* 画像 — pinch-zoom / touch 操作のため <img> 維持 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[current]}
        alt={`写真 ${current + 1}`}
        className="max-w-full max-h-[85dvh] object-contain select-none"
        style={{ touchAction: 'pinch-zoom' }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        draggable={false}
      />

      {/* 前へ */}
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); prev() }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white bg-black/50 p-3 rounded-full hover:bg-black/70 transition-colors"
            aria-label="前の写真"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); next() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white bg-black/50 p-3 rounded-full hover:bg-black/70 transition-colors"
            aria-label="次の写真"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {/* サムネイル（複数枚） */}
      {photos.length > 1 && (
        <div
          role="presentation"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          {photos.map((url, i) => (
            <button
              type="button"
              key={i}
              onClick={() => setCurrent(i)}
              className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === current ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <Image src={url} alt={`写真 ${i + 1}`} fill sizes="48px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
