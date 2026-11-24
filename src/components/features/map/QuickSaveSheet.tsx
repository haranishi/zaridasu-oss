'use client'

// REQ-329: 「ポチッと非公開で保存」。名前（任意）を入れて保存を押すだけで、今いる場所
// （またはピンを立てた場所）を本人と運営だけが見られるスポットとして残す。
// 通常の投稿と違い、種類・写真・審査・24 時間 5 件の上限は無い。希少種の生息地のメモなどに使う。

import { useEffect, useRef, useState } from 'react'
import { Lock, Loader2, MapPin, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { formInputCls, btnPrimaryCls } from '@/lib/formStyles'
import { PRIVATE_SPOT_NAME_MAX, PRIVATE_SPOT_NOTE_MAX } from '@/lib/constants'
import { defaultSpotName, normalizeSpotName, normalizeSpotNote } from '@/lib/privateSpots'
import type { PrivateSpotInput, SaveSpotResult } from '@/hooks/usePrivateSpots'

interface LatLngLite {
  lat: number
  lng: number
}

interface QuickSaveSheetProps {
  /** ピンから開いたときの位置。null なら端末の現在地を取りに行く。 */
  initialPosition: LatLngLite | null
  /** 現在地が取れないときの代わり（地図の中心）。 */
  mapCenter: LatLngLite | null
  onSave: (input: PrivateSpotInput) => Promise<SaveSpotResult>
  onClose: () => void
}

type LocStatus = 'locating' | 'ok' | 'error'

export default function QuickSaveSheet({ initialPosition, mapCenter, onSave, onClose }: QuickSaveSheetProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  useEscapeKey(onClose)
  useBodyScrollLock()

  const [position, setPosition] = useState<(LatLngLite & { accuracy: number | null }) | null>(
    initialPosition ? { ...initialPosition, accuracy: null } : null
  )
  const [locStatus, setLocStatus] = useState<LocStatus>(initialPosition ? 'ok' : 'locating')
  const [locateNonce, setLocateNonce] = useState(0)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 現在地の取得（ピンから開いたときは不要）。高精度・最大 15 秒。
  useEffect(() => {
    if (initialPosition) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('error')
      return
    }
    let cancelled = false
    setLocStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (cancelled) return
        const acc = p.coords.accuracy
        setPosition({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: Number.isFinite(acc) ? Math.round(acc) : null,
        })
        setLocStatus('ok')
      },
      () => { if (!cancelled) setLocStatus('error') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
    return () => { cancelled = true }
  }, [initialPosition, locateNonce])

  const applyMapCenter = () => {
    if (!mapCenter) return
    setPosition({ ...mapCenter, accuracy: null })
    setLocStatus('ok')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (saving || !position) return
    setSaving(true)
    setError('')
    const finalName = normalizeSpotName(name) || defaultSpotName(t('quickSave.defaultNamePrefix'), new Date())
    const result = await onSave({
      name: finalName,
      note: normalizeSpotNote(note),
      lat: position.lat,
      lng: position.lng,
      accuracy: position.accuracy,
    })
    setSaving(false)
    if (result.status === 'saved') {
      toast?.success(t('quickSave.saved', { name: finalName }))
      onClose()
    } else if (result.status === 'queued') {
      toast?.success(t('quickSave.queued'))
      onClose()
    } else {
      setError(t(`quickSave.error.${result.reason}`))
    }
  }

  const card = dark ? 'bg-slate-900 text-slate-100' : 'bg-white text-gray-800'
  const muted = dark ? 'text-slate-400' : 'text-gray-500'
  const inputCls = formInputCls(dark)

  return (
    // 背景クリックで閉じる（Escape は useEscapeKey が処理済み）
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-save-title"
      data-testid="quick-save-sheet"
      className={`fixed inset-0 z-430 flex items-end md:items-center justify-center ${dark ? 'bg-black/70' : 'bg-black/50'} backdrop-blur-xs`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className={`${card} w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl px-5 pt-4 pb-5 space-y-4`}
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between">
          <h2 id="quick-save-title" className="flex items-center gap-2 text-lg font-bold">
            <Lock size={18} aria-hidden="true" className="text-violet-500" />
            {t('quickSave.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('quickSave.close')}
            className={`rounded-full min-h-11 min-w-11 flex items-center justify-center ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* 位置 */}
        <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${dark ? 'bg-slate-800' : 'bg-gray-50'}`} role="status">
          <MapPin size={16} aria-hidden="true" className="shrink-0 mt-0.5 text-violet-500" />
          <div className="flex-1 min-w-0">
            {locStatus === 'locating' && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                {t('quickSave.locating')}
              </span>
            )}
            {locStatus === 'ok' && position && (
              <span>
                {initialPosition ? t('quickSave.atPin') : t('quickSave.atCurrent')}
                <span className={`block text-xs ${muted}`}>
                  {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                  {position.accuracy != null && ` · ${t('quickSave.accuracy', { m: position.accuracy })}`}
                </span>
              </span>
            )}
            {locStatus === 'error' && (
              <div className="space-y-2">
                <p>{t('quickSave.locateFailed')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setLocateNonce((n) => n + 1)}
                    className={`min-h-11 px-3 rounded-lg text-xs font-semibold border ${dark ? 'border-slate-600' : 'border-gray-300'}`}
                  >
                    {t('quickSave.retryLocate')}
                  </button>
                  {mapCenter && (
                    <button
                      type="button"
                      onClick={applyMapCenter}
                      className={`min-h-11 px-3 rounded-lg text-xs font-semibold border ${dark ? 'border-slate-600' : 'border-gray-300'}`}
                    >
                      {t('quickSave.useMapCenter')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 名前（任意。空なら「非公開スポット 9/26 14:05」） */}
        <div>
          <label htmlFor="quick-save-name" className="block text-sm font-semibold mb-1">
            {t('quickSave.nameLabel')}
            <span className={`font-normal ml-1 text-xs ${muted}`}>{t('quickSave.nameOptional')}</span>
          </label>
          <input
            id="quick-save-name"
            data-testid="quick-save-name"
            type="text"
            // 名前を付けるのが主目的なので開いたらすぐ打てるようにする
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={name}
            maxLength={PRIVATE_SPOT_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('quickSave.namePlaceholder')}
            className={inputCls}
            enterKeyHint="done"
          />
        </div>

        {showNote ? (
          <div>
            <label htmlFor="quick-save-note" className="block text-sm font-semibold mb-1">{t('quickSave.noteLabel')}</label>
            <textarea
              id="quick-save-note"
              value={note}
              maxLength={PRIVATE_SPOT_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t('quickSave.notePlaceholder')}
              className={`${inputCls} resize-none`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className={`text-sm underline underline-offset-2 min-h-11 ${muted}`}
          >
            {t('quickSave.addNote')}
          </button>
        )}

        <p className={`flex items-start gap-1.5 text-xs leading-relaxed ${muted}`}>
          <Lock size={12} aria-hidden="true" className="shrink-0 mt-0.5" />
          {t('quickSave.privacyNote')}
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          data-testid="quick-save-submit"
          disabled={saving || !position}
          className={`w-full font-bold py-3.5 flex items-center justify-center gap-2 text-base ${btnPrimaryCls}`}
        >
          {saving ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
          {saving ? t('quickSave.saving') : t('quickSave.submit')}
        </button>
      </form>
    </div>
  )
}
