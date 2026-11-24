'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: 位置/種別/写真/音声/観測情報のセクション分割（送信ロジックは usePostForm 集約済み）（527行）。

import { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { X, Loader2, Save, Globe, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SPECIES, INFO_TYPES, MAX_COMMENT_LENGTH, COUNT_MIN, COUNT_MAX } from '@/lib/constants'
import { isWithinTargetBBox, isWithinTargetPrefecture } from '@/lib/area/targetArea'
import { todayLocalISODate } from '@/lib/localDate'
import { formInputCls, btnPrimaryCls } from '@/lib/formStyles'
import { useTheme } from '@/context/ThemeContext'
import { usePostForm } from '@/hooks/posts/usePostForm'
import { useToastContext } from '@/context/ToastContext'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { usePostDraft, loadDraft, clearDraft } from '@/hooks/posts/usePostDraft'
import { useReverseGeocode } from '@/hooks/useReverseGeocode'
import { useWeather } from '@/hooks/useWeather'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import type { PostFormData, Species, LocationSource } from '@/types'
import type { PostPreset } from '@/lib/postPreset'
import LocationSection from './LocationSection'
import WeatherSelector from './WeatherSelector'
import PhotoUploadSection from './PhotoUploadSection'
import AudioRecorder from './AudioRecorder'

// REQ-086 Phase 2: 調査依頼から「結果を投稿」遷移してきた時に渡される最小情報
export interface SurveyRequestSeed {
  id: string
  species: string
  lat: number
  lng: number
  municipality: string | null
  reason: string | null
}

interface PostFormProps {
  onClose: () => void
  onSuccess: () => void
  onLoginClick: () => void
  // REQ-086 Phase 2: 紐付け対象の調査依頼。指定時は species/位置/市区町村を初期値にし、species は固定する
  surveyRequest?: SurveyRequestSeed | null
  // REQ-329: 地図のピン／非公開スポットの「ここで投稿」から開いたときの位置（現在地で上書きしない）
  // REQ-330: 精度（m）と取り方も渡せる。gps=その場で取った現在地、map=地図上の地点の座標（手動の位置と同じ扱い）。
  //          渡さなければ従来どおり手動の位置（精度なし）。
  initialPosition?: { lat: number; lng: number; accuracy?: number | null; source?: 'gps' | 'map' } | null
  // REQ-330: 通常の送信で投稿ができたとき、作られた投稿の id で呼ぶ。圏外で下書きに入ったときは呼ばない。
  onCreated?: (postId: string) => void
  // REQ-330: 調査計画の地点から開いたときの調査方法。渡さなければ従来どおり（定点なら structured、ほかは opportunistic）。
  surveyMethod?: 'structured'
  // REQ-330: 位置の非公開を固定する理由（希少種の記録がある地点から開いたとき）。渡すと非公開で始まり、公開は選べない。
  lockedPrivateReason?: string
  // REQ-330: 調査計画の地点から開いたときの地点 id。圏外で下書きに入れるとき「地点から作った」印として持たせ、
  //          送るときに近くの希少種を DB で確かめ直し（近ければ非公開）、送れたら地点とつなぐ。
  fieldworkStopId?: string
  // 2026-10-19: ホームの「次に足りない記録」から開いたときの、種・種類の事前選択。指定した項目は下書きより優先する。
  //             調査依頼（surveyRequest）があるときは依頼の種を優先し、位置・ほかの項目には触れない。
  preset?: PostPreset | null
}

export default function PostForm({ onClose, onSuccess, surveyRequest, initialPosition, onCreated, surveyMethod, lockedPrivateReason, fieldworkStopId, preset }: PostFormProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const toast = useToastContext()
  const {
    currentUser,
    photos,
    photoPreviews,
    photoProcessing,
    setAudio,
    loading,
    error,
    uploadProgress,
    exifPosition,
    showExifBanner,
    imageGateWarning,
    dismissImageGateWarning,
    setError,
    handleFileChange,
    removePhoto,
    applyExifPosition,
    dismissExifBanner,
    submitPost,
    saveOffline,
  } = usePostForm()

  useEscapeKey(onClose)
  useBodyScrollLock()
  const modalRef = useRef<HTMLDivElement>(null)
  const errorBannerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(modalRef)
  // REQ-272: ローカル日付で導出する。toISOString() は UTC のため JST 0:00-8:59 に
  // 「今日」が選べなくなっていた（既定値と max の両方が昨日になる）。
  const today = useMemo(() => todayLocalISODate(), [])
  // REQ-330: 地点（調査計画・ピン・非公開スポット）から開いたときと、非公開が固定のときは下書きを読まず書かない。
  // 希少種の近くの座標や「非公開固定」の状態を端末に残さないため。下書きは利用者ごとのキーに分ける（usePostDraft）。
  // 下書きの持ち主はフォームを開いた時点の利用者に固定する。別のタブで利用者が替わったら（持ち主と今の利用者が
  // 違えば）もう保存しない。前の人の入力を次の人の下書きとして残さないため。
  const [draftUserId] = useState<string | null>(() => currentUser?.id ?? null)
  const draftEnabled = !initialPosition && !lockedPrivateReason
  const [draft] = useState(() => (draftEnabled ? loadDraft(draftUserId) : null))
  const ownerStillSignedIn = (currentUser?.id ?? null) === draftUserId

  // フォーム状態
  // REQ-086 Phase 2: surveyRequest 指定時は依頼側の値で初期化（draft より優先）
  // species は SPECIES (現状 'american' | 'bullfrog') 以外が来たら 'american' にフォールバック
  const seedSpecies: Species | undefined =
    surveyRequest && SPECIES.some((s) => s.value === surveyRequest.species)
      ? (surveyRequest.species as Species)
      : undefined
  const [showDraftBanner, setShowDraftBanner] = useState(!!draft && !surveyRequest)
  // 調査依頼の位置が優先。initialPosition は依頼が無いときだけ位置・精度・取り方を決める。
  const initialFix = surveyRequest ? null : (initialPosition ?? null)
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    surveyRequest
      ? { lat: surveyRequest.lat, lng: surveyRequest.lng }
      : initialFix
        ? { lat: initialFix.lat, lng: initialFix.lng }
        : (draft?.position ?? null),
  )
  // REQ-172: GPS 水平精度（m）と取得手段。手動選択/EXIF/草稿復元では 'manual'（精度なし）。
  // REQ-330: initialPosition に精度・取り方があればそれで始める（送るときの精度は gps のときだけ。下の handleSubmit）。
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(initialFix?.accuracy ?? null)
  const [locationSource, setLocationSource] = useState<LocationSource>(
    initialFix?.source === 'gps' ? 'gps' : 'manual',
  )
  // 手動（地図クリック / EXIF / 復元）で位置を確定した場合は精度を破棄し manual に倒す
  const selectManualPosition = (pos: { lat: number; lng: number } | null) => {
    setPosition(pos)
    setGpsAccuracy(null)
    setLocationSource('manual')
    setPositionError('')
  }
  const selectGpsPosition = (pos: { lat: number; lng: number }, accuracy: number | null) => {
    setPosition(pos)
    setGpsAccuracy(accuracy)
    setLocationSource('gps')
    setPositionError('')
  }
  const [species, setSpecies] = useState<Species>(seedSpecies ?? preset?.species ?? draft?.species ?? 'american')
  const [infoType, setInfoType] = useState(preset?.infoType ?? draft?.infoType ?? 'sighting')
  const [municipality, setMunicipality] = useState(surveyRequest?.municipality ?? draft?.municipality ?? '')
  const [comment, setComment] = useState(draft?.comment ?? '')
  const [count, setCount] = useState(draft?.count ?? '')
  const [observedAt, setObservedAt] = useState(draft?.observedAt ?? today)
  const [surveyDurationMinutes, setSurveyDurationMinutes] = useState('')
  // REQ-329: 位置の公開／非公開。非公開（hidden）は地図・公開データに位置が出ない（本人と運営だけ）。
  const lockedPrivate = !!lockedPrivateReason
  const [locationPrivate, setLocationPrivate] = useState<boolean>(lockedPrivate || (draft?.locationPrivate ?? false))
  const [honeypot, setHoneypot] = useState('')
  // REQ-197 FR-197-03: 独自の online/offline 購読を共通フック useOnlineStatus に統合。
  const isOffline = !useOnlineStatus()
  const [weatherManual, setWeatherManual] = useState(false)
  const [manualWeather, setManualWeather] = useState('')
  const [manualTemperature, setManualTemperature] = useState('')
  const [manualHumidity, setManualHumidity] = useState('')
  const [positionError, setPositionError] = useState('')
  const [inlineError, setInlineError] = useState('')
  const [countError, setCountError] = useState('')

  // REQ-158: 送信時バリデーションエラー発生時、上部エラーバナーへフォーカスを移し
  // スクリーンリーダー利用者に発生を確実に伝える（FR-158-04）。
  useEffect(() => {
    if (error || inlineError || positionError) errorBannerRef.current?.focus()
  }, [error, inlineError, positionError])

  // REQ-197: オンライン/オフライン検知は useOnlineStatus（useSyncExternalStore）へ移譲。

  // beforeunload 保護（フォームにデータがある場合）
  useEffect(() => {
    const hasData = !!position || photos.length > 0 || comment.trim().length > 0
    if (!hasData) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [position, photos.length, comment])

  // 草稿自動保存
  const draftFields = useMemo(
    () => ({ position, species, infoType, municipality, comment, count, observedAt, locationPrivate }),
    [position, species, infoType, municipality, comment, count, observedAt, locationPrivate],
  )
  usePostDraft(draftFields, draftUserId, draftEnabled && ownerStillSignedIn)

  // 逆ジオコーディング & 天気自動取得
  const { municipality: autoMunicipality, prefecture, geocoding, geocodeError, retry: retryGeocode } = useReverseGeocode(position)
  // REQ-255: 解決した県が対象（秋田県）外なら、ソフトな注意喚起を出す（送信は止めない・非ブロッキング）。
  // 県が判明していて、かつ対象外のときだけ表示（未解決/取得中は出さない＝誤検知を避ける）。
  const outsideTargetArea = !geocoding && prefecture !== '' && !isWithinTargetPrefecture(prefecture)
  const { weatherData, fetching: weatherFetching, weatherError } = useWeather(position, observedAt || null)
  const municipalityManualRef = useRef(false)
  useEffect(() => {
    if (!municipalityManualRef.current && autoMunicipality) setMunicipality(autoMunicipality)
  }, [autoMunicipality])

  // 現在地取得
  // REQ-329: ピンから開いたときは、その位置を現在地で上書きしない（離れた場所の記録のため）。
  const skipAutoLocate = !!initialPosition
  useEffect(() => {
    if (skipAutoLocate) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (isWithinTargetBBox(latitude, longitude)) {
          // REQ-172: 端末 Geolocation 由来は accuracy を保持し source='gps'
          setPosition({ lat: latitude, lng: longitude })
          setGpsAccuracy(Number.isFinite(accuracy) ? accuracy : null)
          setLocationSource('gps')
        }
      },
      () => { /* 位置取得失敗は無視 — ユーザーは地図で手動選択可能 */ },
      // REQ-172: 高精度測位を要求。NFR-172-04 によりタイムアウトは従来の 5s を尊重
      { timeout: 5000, enableHighAccuracy: true },
    )
  }, [skipAutoLocate])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
    // ボタンの disabled={loading} は state 反映前の連打にわずかな隙があるため、ここで処理中なら即 return する。
    // 最終防衛はサーバー側冪等（DB レートリミット check_post_rate_limit / 画像 hash dedup〔usePostForm.ts〕）。
    if (loading || photoProcessing) return
    if (honeypot) return
    setPositionError('')
    setInlineError('')
    if (!position) { setPositionError(t('postForm.locationError')); return }
    if (count && (Number(count) < COUNT_MIN || Number(count) > COUNT_MAX || !Number.isInteger(Number(count)))) {
      setInlineError(t('postForm.countValidation', { min: COUNT_MIN, max: COUNT_MAX })); return
    }
    if (comment.length > MAX_COMMENT_LENGTH) {
      setInlineError(t('postForm.commentValidation', { max: MAX_COMMENT_LENGTH })); return
    }

    const postPayload = {
      position, species, infoType, municipality, comment, count, observedAt,
      weather: weatherManual ? (manualWeather || null) : (weatherData?.weather ?? null),
      temperature: weatherManual ? (manualTemperature !== '' ? Number(manualTemperature) : null) : (weatherData?.temperature ?? null),
      humidity: weatherManual ? (manualHumidity !== '' ? Number(manualHumidity) : null) : (weatherData?.humidity ?? null),
      surveyDurationMinutes: surveyDurationMinutes ? Number(surveyDurationMinutes) : null,
      // REQ-172: GPS 由来のときのみ精度を送る。手動選択は null
      accuracy: locationSource === 'gps' ? gpsAccuracy : null,
      locationSource,
      // REQ-086 Phase 2
      surveyRequestId: surveyRequest?.id ?? null,
      // REQ-329: 位置を非公開にする（REQ-330: 固定されているときは必ず非公開）
      locationPrivate: lockedPrivate || locationPrivate,
      // REQ-330: 調査計画の地点からの投稿は structured
      ...(surveyMethod ? { surveyMethod } : {}),
    }
    if (isOffline) {
      // REQ-330: 地点から開いたフォームは「地点から作った」印を付けて下書きに入れる（送るときに保護を確かめ直す）
      const saved = fieldworkStopId
        ? await saveOffline(postPayload as PostFormData, { fieldworkStopId })
        : await saveOffline(postPayload as PostFormData)
      if (saved) { if (draftEnabled && ownerStillSignedIn) clearDraft(draftUserId); toast?.success(t('postForm.draftSaved')); onClose() }
    } else {
      const success = await submitPost(postPayload as PostFormData, { onCreated })
      if (success) { if (draftEnabled && ownerStillSignedIn) clearDraft(draftUserId); toast?.success(t('postForm.successMessage')); onSuccess(); onClose() }
    }
  }

  const card = dark ? 'bg-slate-900 border-slate-700/60' : 'bg-white'
  const label = dark ? 'text-slate-300' : 'text-gray-700'
  const inputCls = formInputCls(dark)
  const selectBtnCls = (active: boolean) =>
    `px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${active
      ? 'border-red-500 bg-red-500/10 text-red-400'
      : dark ? 'border-slate-600/80 hover:border-slate-500 text-slate-300' : 'border-gray-200 hover:border-gray-300 text-gray-700'
    }`

  return (
    // REQ-160: Escape は useEscapeKey（document リスナ）で処理済み。これは背景クリックで閉じるためのオーバーレイ。
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-form-title"
      className={`fixed inset-0 z-430 flex items-end md:items-center justify-center ${dark ? 'bg-black/70' : 'bg-black/50'} backdrop-blur-xs`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`${card} rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-lg max-h-[92dvh] landscape:max-h-[98dvh] landscape:rounded-none md:landscape:rounded-2xl md:landscape:max-h-[90vh] overflow-y-auto`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10 ${dark ? 'border-slate-700/60 bg-slate-900' : 'border-gray-100 bg-white'
          }`}>
          <h2 id="post-form-title" className={`text-lg font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('postForm.title')}</h2>
          <button
            onClick={onClose}
            className={`rounded-full p-1.5 transition-colors ${dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            aria-label={t('postForm.close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* 草稿復元バナー */}
        {showDraftBanner && (
          <div className={`mx-5 mt-3 flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
            dark ? 'bg-blue-900/20 border-blue-500/30 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}>
            <span className="shrink-0">📝</span>
            <span className="flex-1 text-xs">{t('postForm.draftRestored')}</span>
            <button
              type="button"
              onClick={() => { clearDraft(draftUserId); setShowDraftBanner(false) }}
              className="shrink-0 text-xs underline opacity-70 hover:opacity-100"
            >
              {t('postForm.draftClear')}
            </button>
          </div>
        )}

        {/* スティッキーエラーバナー — REQ-158: 送信時の全エラー（送信処理/個体数・コメント/位置）を集約。
            role="alert" + aria-live="assertive" で支援技術へ即時通知し、発生時にフォーカスを移す。 */}
        {(error || inlineError || positionError) && (
          <div
            ref={errorBannerRef}
            tabIndex={-1}
            role="alert"
            aria-live="assertive"
            className={`sticky top-14 z-10 mx-5 mt-3 flex items-start gap-2 text-sm px-4 py-3 rounded-xl border outline-hidden ${
            dark ? 'bg-red-900/30 border-red-500/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span className="shrink-0 mt-0.5">⚠️</span>
            <span className="flex-1">{error || inlineError || positionError}</span>
            <button
              type="button"
              onClick={() => { setError(''); setInlineError(''); setPositionError('') }}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label={t('postForm.errorClose')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {currentUser && (
          <div className="mx-5 mt-4 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2.5">
            <span className="text-blue-400 text-base">🔵</span>
            <div>
              <p className="text-xs font-semibold text-blue-400">{t('postForm.loggedInPost')}</p>
              <p className="text-xs text-blue-400/70">{t('postForm.loggedInDesc')}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
            <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
              value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>

          {/* 位置選択 & 市区町村 */}
          <LocationSection
            position={position}
            setPosition={selectManualPosition}
            setGpsPosition={selectGpsPosition}
            accuracy={gpsAccuracy}
            locationSource={locationSource}
            municipality={municipality}
            setMunicipality={setMunicipality}
            positionError={positionError}
            geocoding={geocoding}
            geocodeError={geocodeError}
            retryGeocode={retryGeocode}
            municipalityManualRef={municipalityManualRef}
            label={label}
          />

          {/* REQ-255: 対象エリア（秋田県）外の位置に対するソフトな注意喚起。
              非ブロッキング＝投稿は止めない。県が秋田県内に戻れば自動的に消える。 */}
          {outsideTargetArea && position && isWithinTargetBBox(position.lat, position.lng) && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${
                dark ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              <span aria-hidden="true" className="shrink-0">📍</span>
              <span>{t('postForm.outsideTargetArea')}</span>
            </div>
          )}

          {/* REQ-329: 位置の公開／非公開。希少な生きものの生息地などは非公開にできる。
              非公開は一方向（投稿者は公開へ戻せない）なので、選んだときに理由と影響を必ず見せる。 */}
          <div>
            <p id="postform-disclosure-label" className={`block text-sm font-semibold mb-2 ${label}`}>
              {t('postForm.disclosure.label')}
            </p>
            <div role="group" aria-labelledby="postform-disclosure-label" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocationPrivate(false)}
                aria-pressed={!locationPrivate}
                disabled={lockedPrivate}
                className={`flex items-center justify-center gap-1.5 ${selectBtnCls(!locationPrivate)} ${lockedPrivate ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Globe size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t('postForm.disclosure.public')}</span>
              </button>
              <button
                type="button"
                data-testid="postform-disclosure-private"
                onClick={() => setLocationPrivate(true)}
                aria-pressed={locationPrivate}
                className={`flex items-center justify-center gap-1.5 ${selectBtnCls(locationPrivate)}`}
              >
                <Lock size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{t('postForm.disclosure.private')}</span>
              </button>
            </div>
            {lockedPrivate ? (
              <p data-testid="postform-disclosure-locked" className={`text-xs mt-1.5 leading-relaxed font-semibold ${dark ? 'text-violet-300' : 'text-violet-800'}`}>
                🔒 {lockedPrivateReason}
              </p>
            ) : (
              <p className={`text-xs mt-1.5 leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                {locationPrivate ? t('postForm.disclosure.privateHint') : t('postForm.disclosure.publicHint')}
              </p>
            )}
          </div>

          <div>
            <label id="postform-species-label" className={`block text-sm font-semibold mb-2 ${label}`}>
              {t('postForm.species')} <span className="text-red-500">*</span>
            </label>
            {surveyRequest && (
              <p className={`mb-2 text-xs ${dark ? 'text-amber-300' : 'text-amber-700'}`}>
                🔍 {t('postForm.surveyLocked')}
              </p>
            )}
            <div role="group" aria-labelledby="postform-species-label" className="grid grid-cols-2 gap-2">
              {SPECIES.map((s) => {
                const locked = !!surveyRequest
                const disabled = locked && surveyRequest.species !== s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => { if (!locked) setSpecies(s.value) }}
                    disabled={disabled}
                    aria-pressed={species === s.value}
                    className={`flex items-center gap-2 ${selectBtnCls(species === s.value)} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <Image src={s.image} alt={t(`species.${s.value}`)} width={24} height={24} className="w-6 h-6 object-contain shrink-0" />
                    <span className="truncate">{t(`species.${s.value}`)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label id="postform-infotype-label" className={`block text-sm font-semibold mb-2 ${label}`}>
              {t('postForm.infoType')} <span className="text-red-500">*</span>
            </label>
            <div role="group" aria-labelledby="postform-infotype-label" className="grid grid-cols-2 gap-2">
              {INFO_TYPES.map((inf) => (
                <button key={inf.value} type="button" onClick={() => setInfoType(inf.value)}
                  className={selectBtnCls(infoType === inf.value)}>
                  <span className="truncate">{inf.emoji} {t(`infoType.${inf.value}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {infoType === 'absence' && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-xl border text-sm ${dark ? 'bg-slate-800/60 border-slate-600 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              <span className="shrink-0 text-base">🚫</span>
              <div className="text-xs leading-relaxed">
                <p className="font-semibold mb-0.5">{t('postForm.absenceMode')}</p>
                <p>{t('postForm.absenceModeDesc')}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {infoType !== 'absence' && (
              <div>
                <label htmlFor="postform-count" className={`block text-sm font-semibold mb-1 ${label}`}>
                  {t('postForm.count')}
                  <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.countUnit')}</span>
                </label>
                <input id="postform-count" type="number" inputMode="numeric" min="1" max={COUNT_MAX} value={count}
                  aria-invalid={!!countError}
                  aria-describedby={countError ? 'postform-count-error' : undefined}
                  onChange={(e) => {
                    const v = e.target.value
                    setCount(v)
                    if (v === '') {
                      setCountError('')
                    } else {
                      const n = Number(v)
                      if (!Number.isInteger(n)) {
                        setCountError(t('postForm.countValidation', { min: COUNT_MIN, max: COUNT_MAX }))
                      } else if (n < COUNT_MIN || n > COUNT_MAX) {
                        setCountError(t('postForm.countValidation', { min: COUNT_MIN, max: COUNT_MAX }))
                      } else {
                        setCountError('')
                      }
                    }
                  }} placeholder={t('postForm.countPlaceholder')} className={inputCls} />
                {countError && <p id="postform-count-error" aria-live="polite" className="text-red-500 text-xs mt-1">{countError}</p>}
              </div>
            )}
            <div>
              <label htmlFor="postform-observed-at" className={`block text-sm font-semibold mb-1 ${label}`}>
                {t('postForm.observedAt')}
                <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.observedAtUnit')}</span>
              </label>
              <input id="postform-observed-at" type="date" max={today} value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* REQ-258: 調査時間（努力量）。従来は absence 専用だったが、捕獲/目撃でも任意入力できるようにし、
              上の個体数と合わせて地図の密度表示（CPUE＝捕獲努力量あたり）に反映する。absence の挙動は不変。 */}
          <div>
            <label htmlFor="postform-survey-duration" className={`block text-sm font-semibold mb-1 ${label}`}>
              {t('postForm.surveyDuration')}
              <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.surveyDurationUnit')}</span>
            </label>
            <input id="postform-survey-duration" type="number" inputMode="numeric" min="1" max="480" value={surveyDurationMinutes}
              onChange={(e) => setSurveyDurationMinutes(e.target.value)} placeholder={t('postForm.surveyDurationPlaceholder')}
              aria-describedby={infoType !== 'absence' ? 'postform-survey-duration-hint' : undefined} className={inputCls} />
            {infoType !== 'absence' && (
              <p id="postform-survey-duration-hint" className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                {t('postForm.surveyDurationHint')}
              </p>
            )}
          </div>

          {/* 天気セクション */}
          <WeatherSelector
            weatherManual={weatherManual}
            setWeatherManual={setWeatherManual}
            manualWeather={manualWeather}
            setManualWeather={setManualWeather}
            manualTemperature={manualTemperature}
            setManualTemperature={setManualTemperature}
            manualHumidity={manualHumidity}
            setManualHumidity={setManualHumidity}
            weatherData={weatherData}
            weatherFetching={weatherFetching}
            weatherError={weatherError}
            position={position}
          />

          <div>
            <label htmlFor="postform-comment" className={`block text-sm font-semibold mb-1 ${label}`}>
              {t('postForm.comment')}
              <span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.commentUnit', { max: MAX_COMMENT_LENGTH })}</span>
            </label>
            <textarea id="postform-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
              maxLength={MAX_COMMENT_LENGTH} placeholder={t('postForm.commentPlaceholder')} className={inputCls + ' resize-none'} />
            {(() => {
              const remaining = MAX_COMMENT_LENGTH - comment.length
              const colorCls = remaining <= 0 ? 'text-red-500' : remaining <= 20 ? 'text-yellow-500' : dark ? 'text-slate-500' : 'text-gray-400'
              // REQ-158: 色のみに依存せず aria-live で残り文字数を読み上げ、上限近接/超過を伝える。
              return <p aria-live="polite" className={`text-xs text-right mt-1 ${colorCls}`}>{remaining}/{MAX_COMMENT_LENGTH}</p>
            })()}
          </div>

          {/* 写真アップロード */}
          <PhotoUploadSection
            photos={photos}
            photoPreviews={photoPreviews}
            uploadProgress={uploadProgress}
            photoProcessing={photoProcessing}
            disabled={loading}
            exifPosition={exifPosition}
            showExifBanner={showExifBanner}
            onFileChange={handleFileChange}
            onRemovePhoto={removePhoto}
            onApplyExif={(pos) => { selectManualPosition(pos); applyExifPosition() }}
            onDismissExif={dismissExifBanner}
            label={label}
          />

          {/* REQ-077: 画像事前ゲート警告（強制弾きはしない） */}
          {imageGateWarning && (
            <div
              role="alert"
              className={`flex items-start justify-between gap-2 rounded-lg border p-2 text-xs ${
                dark ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'
              }`}
            >
              <span>⚠️ {imageGateWarning}</span>
              <button
                type="button"
                onClick={dismissImageGateWarning}
                className="shrink-0 underline underline-offset-2"
                aria-label={t('postForm.warningClose')}
              >
                {t('postForm.close')}
              </button>
            </div>
          )}

          {/* REQ-069: 音声録音（ウシガエルのみ表示。写真と排他ではなく併用可） */}
          {species === 'bullfrog' && (
            <AudioRecorder
              onRecorded={(blob, mime, durationMs) => setAudio(blob, mime, durationMs)}
              onCleared={() => setAudio(null, null, null)}
              disabled={loading}
            />
          )}

          <div className="pb-2">
            {isOffline && <p className="text-xs text-amber-500 text-center mb-2">{t('postForm.offlineNotice')}</p>}
            {loading && uploadProgress && (
              <p className={`text-xs text-center mb-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('postForm.uploadingPhotos', { current: uploadProgress.current, total: uploadProgress.total })}</p>
            )}
            <button type="submit" disabled={loading || !!photoProcessing}
              className={`w-full font-bold py-3.5 flex items-center justify-center gap-2 text-base ${
                isOffline ? 'rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-linear-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:from-amber-600 hover:to-orange-600'
                  : btnPrimaryCls}`}>
              {photoProcessing ? (<><Loader2 size={18} className="animate-spin" />{t('postForm.preparingPhotos', { ...photoProcessing })}</>) : loading ? (<><Loader2 size={18} className="animate-spin" />{isOffline ? t('postForm.saving') : t('postForm.submitting')}</>)
                : isOffline ? (<><Save size={18} />{t('postForm.saveDraft')}</>) : t('postForm.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
