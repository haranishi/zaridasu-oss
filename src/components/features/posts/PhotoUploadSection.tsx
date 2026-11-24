'use client'

import { useRef } from 'react'
import { X, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { MAX_PHOTOS, MAX_INPUT_IMAGE_SIZE } from '@/lib/constants'
import type { LatLng, UploadProgress } from '@/types'

interface PhotoUploadSectionProps {
  photos: File[]
  photoPreviews: string[]
  uploadProgress: UploadProgress | null
  photoProcessing?: UploadProgress | null
  disabled?: boolean
  exifPosition: LatLng | null
  showExifBanner: boolean
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemovePhoto: (index: number) => void
  onApplyExif: (pos: LatLng) => void
  onDismissExif: () => void
  label: string
}

export default function PhotoUploadSection({
  photos,
  photoPreviews,
  photoProcessing,
  disabled = false,
  exifPosition,
  showExifBanner,
  onFileChange,
  onRemovePhoto,
  onApplyExif,
  onDismissExif,
  label,
}: PhotoUploadSectionProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const busy = disabled || !!photoProcessing
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <label className={`block text-sm font-semibold mb-2 ${label}`}>
        {t('postForm.photos')}
        <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          {t('postForm.photosUnit', { max: MAX_PHOTOS })}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {photoPreviews.map((src, i) => (
          <div key={i} className="relative w-20 h-20">
            {/* blob URL のためローカルプレビューには next/image を使えない */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={t('postForm.photoPreview', { n: i + 1 })}
              width={80}
              height={80}
              loading="lazy"
              decoding="async"
              className="w-full h-full aspect-square object-cover rounded-xl"
            />
            <button
              type="button"
              onClick={() => onRemovePhoto(i)}
              disabled={busy}
              aria-label={t('postForm.removePhoto', { n: i + 1 })}
              className="absolute -top-2 -right-2 bg-brand-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm shadow-sm leading-none before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-w-[44px] before:min-h-[44px] before:content-['']"
            >
              x
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className={`w-20 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${
              dark
                ? 'border-slate-600 text-slate-600 hover:border-red-500 hover:text-red-400'
                : 'border-gray-300 text-gray-400 hover:border-red-300 hover:text-red-400'
            }`}
          >
            <Upload size={18} />
            <span className="text-xs mt-1">{t('postForm.addPhoto')}</span>
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        onChange={onFileChange}
        disabled={busy}
        className="hidden"
      />
      <p role="status" className={`mt-2 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
        {photoProcessing
          ? t('postForm.preparingPhotos', { ...photoProcessing })
          : photos.length > 0
            ? t('postForm.photosReady', { size: (photos.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(1) })
            : t('postForm.autoResizeHint', { max: MAX_INPUT_IMAGE_SIZE / 1024 / 1024 })}
      </p>
      {/* REQ-252: 撮影のコツ（静的ガイド）。AI 判定の助言カテゴリ（角度/寄り/明るさ/ピント/部位）に揃えて
          投稿前に控えめに案内する。details/summary で既定は折りたたみ。 */}
      <details
        className={`mt-2 rounded-xl border text-xs ${
          dark ? 'border-slate-700 bg-slate-800/40' : 'border-gray-200 bg-gray-50'
        }`}
      >
        <summary
          className={`cursor-pointer select-none px-3 py-2 font-semibold ${
            dark ? 'text-slate-300' : 'text-gray-700'
          }`}
        >
          {t('postForm.photoTips.summary')}
        </summary>
        <div className="px-3 pb-3">
          <ul className={`list-disc space-y-1 pl-4 leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
            <li>{t('postForm.photoTips.angle')}</li>
            <li>{t('postForm.photoTips.frame')}</li>
            <li>{t('postForm.photoTips.lighting')}</li>
            <li>{t('postForm.photoTips.focus')}</li>
            <li>{t('postForm.photoTips.parts')}</li>
          </ul>
          <p className={`mt-1.5 ${dark ? 'text-slate-500' : 'text-gray-500'}`}>{t('postForm.photoTips.example')}</p>
        </div>
      </details>
      {/* EXIF GPS バナー */}
      {showExifBanner && exifPosition && (
        <div
          className={`mt-2 flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl border ${
            dark
              ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-300'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          <span className="shrink-0">📍</span>
          <span className="flex-1 text-xs">
            {t('postForm.exifDetected')}
          </span>
          <button
            type="button"
            onClick={() => onApplyExif(exifPosition)}
            className="shrink-0 text-xs font-semibold underline hover:opacity-80 transition-opacity"
          >
            {t('postForm.exifApply')}
          </button>
          <button
            type="button"
            onClick={onDismissExif}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            aria-label={t('postForm.exifClose')}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
