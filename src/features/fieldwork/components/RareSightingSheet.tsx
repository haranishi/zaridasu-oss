'use client'

// REQ-330: 希少種シート。記録は公開の経路の外（rare_sightings と非公開の写真置き場 rare-photos）に置き、
// 見られるのは本人と運営だけ。保存ボタンの上に、そのことを毎回書く。
// 種は一覧のボタンから選び、「その他」のときだけ名前を書く。数・メモ・写真（3 枚まで）・観察日時は任意。
// 位置は地点シートと同じ規則（地点・ピンがあれば現在地と比べる。計画の外なら現在地、取れなければ地図の中心）。
// 圏外では写真を選べない（理由を出す）。写真なしなら送信待ちに積める。client_id はシートを開いたときに作り、
// 保存し直しても同じ値を使う（DB が二重登録を弾く）。

import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check, Loader2, Lock, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { isNetworkError } from '@/lib/privateSpots'

import { FIELDWORK_LIMITS, RARE_SPECIES, RARE_SPECIES_OTHER } from '../constants'
import type { StopView } from '../hooks/useFieldworkPlan'
import type { RareInput, RareSaveResult } from '../hooks/useRareSightings'
import {
  decidePosition,
  freePosition,
  getCurrentFix,
  type LatLngLite,
  type RecordPosition,
} from '../lib/positionRule'
import { newClientId } from '../lib/queue'
import { PositionLine, PrivateNote, SheetFrame, StopBadge, smallBtn, stopName, tone } from './parts'

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** 選べる元の写真の大きさ。保存前に縮めて EXIF を消すので、置く写真は 5MB に収まる。 */
const RAW_PHOTO_MAX_BYTES = 20 * 1024 * 1024

function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface RareSightingSheetProps {
  /** 計画の地点から開いたときの地点。計画の外なら null。 */
  stop: StopView | null
  /** 「希少種を自分の地図に表示」。切っている間は番号の丸に錠前を付けない。 */
  showRare: boolean
  /** 位置の比べ先（地点・ピン・非公開スポット）。計画の外なら null。 */
  anchor: LatLngLite | null
  /** 地点シートで決まった位置（あればそのまま使う）。 */
  initialPosition: RecordPosition | null
  mapCenter: LatLngLite
  online: boolean
  onSave: (input: RareInput) => Promise<RareSaveResult>
  onClose: () => void
  errorText: (err: unknown) => string
}

export default function RareSightingSheet({
  stop,
  showRare,
  anchor,
  initialPosition,
  mapCenter,
  online,
  onSave,
  onClose,
  errorText,
}: RareSightingSheetProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const [clientId] = useState(newClientId)
  const [speciesKey, setSpeciesKey] = useState('')
  const [speciesLabel, setSpeciesLabel] = useState('')
  const [count, setCount] = useState('')
  const [note, setNote] = useState('')
  const [observedAt, setObservedAt] = useState(() => localDateTimeValue(new Date()))
  const [photos, setPhotos] = useState<File[]>([])
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])
  const uploadedRef = useRef<string[]>([])

  const [position, setPosition] = useState<RecordPosition | null>(initialPosition)
  const [locating, setLocating] = useState(!initialPosition)
  const [locateNonce, setLocateNonce] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialPosition && locateNonce === 0) return
    let cancelled = false
    setLocating(true)
    void getCurrentFix().then((fix) => {
      if (cancelled) return
      setPosition(anchor ? decidePosition(anchor, fix) : freePosition(fix))
      setLocating(false)
    })
    return () => {
      cancelled = true
    }
  }, [anchor, initialPosition, locateNonce])

  const applyMapCenter = () => {
    setPosition({ source: 'map', lat: mapCenter.lat, lng: mapCenter.lng, accuracy: null, reason: 'manual', distanceM: null })
  }

  const addPhotos = (files: FileList | null) => {
    setError('')
    const picked = Array.from(files ?? [])
    const ok = picked.filter((f) => PHOTO_TYPES.includes(f.type) && f.size <= RAW_PHOTO_MAX_BYTES)
    if (ok.length < picked.length) setError(t('fieldwork.rare.photosInvalid'))
    uploadedRef.current = []
    setPhotos((prev) => [...prev, ...ok].slice(0, FIELDWORK_LIMITS.rarePhotosMax))
  }

  const removePhoto = (index: number) => {
    uploadedRef.current = []
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const label = speciesLabel.trim()
    const countNumber = count.trim() === '' ? null : Number(count)
    if (!speciesKey) return setError(t('fieldwork.rare.needSpecies'))
    if (speciesKey === RARE_SPECIES_OTHER && !label) return setError(t('fieldwork.rare.needLabel'))
    if (
      countNumber !== null &&
      (!Number.isInteger(countNumber) || countNumber < FIELDWORK_LIMITS.rareCountMin || countNumber > FIELDWORK_LIMITS.rareCountMax)
    ) {
      return setError(t('fieldwork.rare.countInvalid'))
    }
    if (!position) return setError(t('fieldwork.position.freeFailed'))
    if (photos.length > 0 && !online) return setError(t('fieldwork.rare.photosOffline'))
    const observed = new Date(observedAt)
    setBusy(true)
    setError('')
    try {
      const result = await onSave({
        clientId,
        stopId: stop?.id ?? null,
        speciesKey,
        speciesLabel: speciesKey === RARE_SPECIES_OTHER ? label.slice(0, FIELDWORK_LIMITS.speciesLabelMax) : null,
        count: countNumber,
        note: note.trim() ? note.trim().slice(0, FIELDWORK_LIMITS.noteMax) : null,
        position: { lat: position.lat, lng: position.lng, accuracy: position.accuracy, source: position.source },
        observedAt: Number.isNaN(observed.getTime()) ? new Date().toISOString() : observed.toISOString(),
        photos,
        uploadedPaths: uploadedRef.current,
        onUploaded: (paths) => {
          uploadedRef.current = paths
        },
      })
      if (result.status === 'queued') toast.success(t('fieldwork.queue.saved'))
      else toast.success(t(result.duplicate ? 'fieldwork.rare.duplicate' : 'fieldwork.rare.saved'))
      // 近くの投稿を非公開にする続きを端末に残せなかった（送信待ちが満杯）。黙って捨てずに知らせる
      if (result.status === 'saved' && result.protectFailed) toast.error(t('fieldwork.error.protectQueueFull'))
      onClose()
    } catch (err) {
      // 写真を置いたあとに通信が切れたときは、同じ client_id のまま保存し直せる（記録は増えない）
      setError(isNetworkError(err) && photos.length > 0 ? t('fieldwork.rare.retryUpload') : errorText(err))
      setBusy(false)
    }
  }

  // 選んだ種は左に ✓・枠 2px・背景を一段濃い紫に（「いなかった」の ✓＝選んだ、とそろえる）
  const chip = (active: boolean) =>
    `flex min-h-12 items-center justify-center gap-1 rounded-xl border-2 px-1.5 py-2 text-[13px] font-semibold leading-tight transition-colors sm:text-sm ${
      active
        ? dark ? 'border-violet-300 bg-violet-500/40 text-white' : 'border-violet-700 bg-violet-200 text-violet-950'
        : dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-800 hover:bg-gray-50'
    }`
  const inputCls = `block w-full rounded-xl border-2 px-3 py-2.5 text-base md:text-sm ${c.input}`

  return (
    <SheetFrame
      titleId="fieldwork-rare-title"
      testId="fieldwork-rare-sheet"
      onClose={onClose}
      icon={<Lock size={20} aria-hidden="true" className="shrink-0 text-violet-600" />}
      title={t('fieldwork.rare.title')}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {stop && (
          <div className="-mt-1 flex items-center gap-2">
            <StopBadge number={stop.number} status={stop.shownStatus} rare={showRare && stop.rare} />
            <span className="min-w-0 wrap-break-word text-sm font-semibold">{stopName(stop, t)}</span>
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            {t('fieldwork.rare.speciesLabel')} <span className="text-red-600">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {RARE_SPECIES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={speciesKey === s.key}
                data-testid={`fieldwork-rare-species-${s.key}`}
                onClick={() => setSpeciesKey(s.key)}
                className={chip(speciesKey === s.key)}
              >
                {speciesKey === s.key && <Check size={15} strokeWidth={3} aria-hidden="true" className="shrink-0" />}
                <span className="min-w-0">{t(s.labelKey)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {speciesKey === RARE_SPECIES_OTHER && (
          <div>
            <label htmlFor="fieldwork-rare-label" className="mb-1 block text-sm font-semibold">
              {t('fieldwork.rare.otherLabel')} <span className="text-red-600">*</span>
            </label>
            <input
              id="fieldwork-rare-label"
              type="text"
              value={speciesLabel}
              maxLength={FIELDWORK_LIMITS.speciesLabelMax}
              onChange={(e) => setSpeciesLabel(e.target.value)}
              placeholder={t('fieldwork.rare.otherPlaceholder')}
              className={inputCls}
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
          <div>
            <label htmlFor="fieldwork-rare-count" className="mb-1 block text-sm font-semibold">
              {t('fieldwork.rare.countLabel')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="fieldwork-rare-count"
                type="number"
                inputMode="numeric"
                min={FIELDWORK_LIMITS.rareCountMin}
                max={FIELDWORK_LIMITS.rareCountMax}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                aria-describedby="fieldwork-rare-count-unit"
                className={inputCls}
              />
              <span id="fieldwork-rare-count-unit" className="shrink-0 text-sm font-semibold">
                {t('fieldwork.rare.countUnit')}
              </span>
            </div>
          </div>
          <div>
            <label htmlFor="fieldwork-rare-observed" className="mb-1 block text-sm font-semibold">
              {t('fieldwork.rare.observedLabel')}
            </label>
            <input
              id="fieldwork-rare-observed"
              type="datetime-local"
              value={observedAt}
              max={localDateTimeValue(new Date())}
              onChange={(e) => setObservedAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="fieldwork-rare-note" className="mb-1 block text-sm font-semibold">
            {t('fieldwork.rare.noteLabel')}
          </label>
          <textarea
            id="fieldwork-rare-note"
            rows={2}
            value={note}
            maxLength={FIELDWORK_LIMITS.noteMax}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('fieldwork.rare.notePlaceholder')}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold">{t('fieldwork.rare.photosLabel')}</p>
          {online ? (
            <>
              <div className="flex flex-wrap items-center gap-5 pt-3 pr-3">
                {previews.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 端末内の写真（blob: URL）の確認用。最適化の経路に通さない */}
                    <img src={url} alt={t('fieldwork.rare.photoAlt', { n: i + 1 })} className="h-16 w-16 rounded-lg object-cover" />
                    {/* 押せる範囲は 44px。見た目の丸は小さく、写真の角に重ねる */}
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label={t('fieldwork.rare.photoRemove', { n: i + 1 })}
                      className="absolute -top-4 -right-4 flex h-11 w-11 items-center justify-center rounded-full"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white">
                        <X size={14} aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                ))}
                {photos.length < FIELDWORK_LIMITS.rarePhotosMax && (
                  <label className={`${smallBtn} cursor-pointer ${c.btn}`}>
                    <Camera size={16} aria-hidden="true" />
                    {t('fieldwork.rare.photosAdd')}
                    <input
                      type="file"
                      accept={PHOTO_TYPES.join(',')}
                      multiple
                      className="sr-only"
                      data-testid="fieldwork-rare-photos"
                      onChange={(e) => {
                        addPhotos(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
              <p className={`mt-1 text-[13px] ${c.muted}`}>{t('fieldwork.rare.photosExif')}</p>
            </>
          ) : (
            <p className={`text-sm leading-relaxed ${dark ? 'text-amber-300' : 'text-amber-800'}`} data-testid="fieldwork-rare-photos-offline">
              {t('fieldwork.rare.photosOffline')}
            </p>
          )}
        </div>

        <div className={`space-y-1.5 rounded-xl px-3 py-2.5 ${c.subtle}`}>
          <PositionLine position={position} locating={locating} dark={dark} />
          {!locating && (!position || position.source === 'map') && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setLocateNonce((n) => n + 1)} className={`${smallBtn} ${c.btn}`}>
                {t('fieldwork.position.retry')}
              </button>
              {!anchor && (
                <button type="button" onClick={applyMapCenter} className={`${smallBtn} ${c.btn}`}>
                  {t('fieldwork.position.useMapCenter')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 保存ボタンと「あなたと運営だけ」は、下にスクロールしなくても見えるよう下端に固定する */}
        <div className={`sticky bottom-0 -mx-5 -mb-5 space-y-2.5 border-t px-5 pt-3 pb-5 ${c.card} ${c.border}`}>
          <PrivateNote dark={dark} text={t('fieldwork.rare.privacy')} className="font-semibold" />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-testid="fieldwork-rare-submit"
            disabled={busy || locating || !position}
            className={`${smallBtn} w-full border-violet-700 bg-violet-700 py-3.5 text-base text-white hover:bg-violet-800`}
          >
            {busy ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Lock size={18} aria-hidden="true" />}
            {busy ? t('fieldwork.rare.submitting') : t('fieldwork.rare.submit')}
          </button>
        </div>
      </form>
    </SheetFrame>
  )
}
