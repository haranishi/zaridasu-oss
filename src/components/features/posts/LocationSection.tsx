'use client'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { OSM_ATTRIBUTION, AKITA_CENTER, AKITA_ZOOM, MUNICIPALITIES, GPS_ACCURACY_GOOD_M, GPS_ACCURACY_WARN_M } from '@/lib/constants'
import { formInputCls } from '@/lib/formStyles'
import LocationPicker from './LocationPicker'
import ManualLocationInput from './ManualLocationInput'
import type { LocationSource } from '@/types'

// REQ-144: react-leaflet を静的 import すると LocationSection の chunk に
// leaflet 一式が乗ってしまう。SSR safe + lazy chunk として読み込む。
const MapSkeleton = () => {
  const { t } = useTranslation()
  return (
    <div
      className="w-full h-full bg-gray-100 dark:bg-slate-800 animate-pulse"
      aria-label={t('survey.mapLoading')}
      role="status"
    />
  )
}
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.MapContainer })),
  { ssr: false, loading: () => <MapSkeleton /> },
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.TileLayer })),
  { ssr: false },
)

interface LocationSectionProps {
  position: { lat: number; lng: number } | null
  setPosition: (pos: { lat: number; lng: number } | null) => void
  setGpsPosition: (pos: { lat: number; lng: number }, accuracy: number | null) => void
  // REQ-172: GPS 水平精度（m）と取得手段。精度バッジ表示に使用
  accuracy?: number | null
  locationSource?: LocationSource
  municipality: string
  setMunicipality: (m: string) => void
  positionError: string
  geocoding: boolean
  geocodeError: string
  retryGeocode: () => void
  municipalityManualRef: React.MutableRefObject<boolean>
  label: string
}

export default function LocationSection({
  position,
  setPosition,
  setGpsPosition,
  accuracy = null,
  locationSource = 'manual',
  municipality,
  setMunicipality,
  positionError,
  geocoding,
  geocodeError,
  retryGeocode,
  municipalityManualRef,
  label,
}: LocationSectionProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const inputCls = formInputCls(dark)

  // REQ-172: 位置精度バッジ。GPS 由来かつ accuracy あり → 良好/注意/警告、それ以外 → 手動（精度なし）
  const renderAccuracyBadge = () => {
    if (!position) return null
    const isGps = locationSource === 'gps' && typeof accuracy === 'number' && Number.isFinite(accuracy)
    if (!isGps) {
      return (
        <span className={`inline-flex items-center gap-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          📍 {t('postForm.accuracyManual')}
        </span>
      )
    }
    const acc = accuracy as number
    const rounded = Math.round(acc)
    const level = acc <= GPS_ACCURACY_GOOD_M ? 'good' : acc <= GPS_ACCURACY_WARN_M ? 'warn' : 'bad'
    // REQ-224 FR-224-05: 色だけに依存しない（色＋アイコン＋テキスト）。
    // 緑/黄/赤の素朴な対比をやめ、状態トークン（success/warning/error）でコントラストを底上げ。
    const cls =
      level === 'good'
        ? 'text-success'
        : level === 'warn'
          ? 'text-warning'
          : 'text-error'
    const icon = level === 'good' ? '✅' : level === 'warn' ? '⚠️' : '⛔'
    return (
      <span className={`inline-flex items-center gap-1 ${cls}`}>
        {icon} {t('postForm.accuracyValue', { meters: rounded })}
        <span className="opacity-80">（{t(`postForm.accuracy_${level}`)}）</span>
      </span>
    )
  }

  return (
    <>
      <div>
        <label className={`block text-sm font-semibold mb-1 ${label}`}>
          <MapPin size={13} className="inline mr-1 mb-0.5" />
          {t('postForm.location')} <span className="text-red-500">*</span>
        </label>
        <p className={`text-xs mb-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
          {t('postForm.locationHint')}
        </p>
        <ManualLocationInput
          position={position}
          onManualPosition={setPosition}
          onGpsPosition={setGpsPosition}
          idPrefix="postform-location"
          dark={dark}
        />
        <p
          id="postform-map-instructions"
          className={`mb-2 mt-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}
        >
          {t('postForm.mapInstructions')}
        </p>
        <div
          className={`relative h-56 sm:h-64 rounded-xl overflow-hidden border-2 ${
            dark ? 'border-slate-600' : 'border-gray-200'
          }`}
        >
          <MapContainer
            center={position ? [position.lat, position.lng] : AKITA_CENTER}
            zoom={position ? 12 : AKITA_ZOOM}
            style={{ height: '100%', width: '100%', cursor: 'crosshair' }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} />
            <LocationPicker
              position={position}
              setPosition={setPosition}
              ariaLabel={t('postForm.mapAriaLabel')}
              describedById="postform-map-instructions"
            />
          </MapContainer>
          {!position && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600/80 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
              style={{ zIndex: 400 }}
            >
              <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white" />
              <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white" />
            </span>
          )}
        </div>
        {position ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <p className="text-success flex items-center gap-1">
              <span>✓</span>
              <span>
                {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
              </span>
            </p>
            {/* REQ-172: 位置精度バッジ（色のみに依存せずアイコン＋テキスト併記） */}
            {renderAccuracyBadge()}
          </div>
        ) : (
          <p
            className={`text-xs mt-1.5 ${
              positionError ? 'text-error font-medium' : 'text-warning'
            }`}
          >
            {/* REQ-158: エラー本文は上部バナーに集約。ここでは未選択フィールドを
                赤系で視覚的に flag しつつ、案内文（locationPrompt）のみ表示して二重表示を避ける。 */}
            {t('postForm.locationPrompt')}
          </p>
        )}
      </div>

      <div>
        {/* REQ-040 と同方針: label の htmlFor と select の id を明示紐付けし、
            アクセシブルネームを a11y ツリーで関連付ける（spinner span は補助情報として label 内に同居）。 */}
        <label htmlFor="postform-municipality" className={`block text-sm font-semibold mb-1 ${label}`}>
          {t('postForm.municipality')}
          {geocoding && (
            <span
              className={`font-normal ml-2 text-xs inline-flex items-center gap-1 ${
                dark ? 'text-slate-400' : 'text-gray-400'
              }`}
            >
              <svg
                className="animate-spin w-3 h-3"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {t('postForm.municipalityFetching')}
            </span>
          )}
        </label>
        <select
          id="postform-municipality"
          value={municipality}
          onChange={(e) => {
            municipalityManualRef.current = true
            setMunicipality(e.target.value)
          }}
          className={inputCls}
        >
          <option value="">
            {geocoding ? t('common.loading') : t('postForm.municipalityPlaceholder')}
          </option>
          {MUNICIPALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {!geocoding && geocodeError && geocodeError !== 'market' && position && (
          <p
            className="text-xs mt-1.5 flex items-center gap-1.5 text-warning"
          >
            <span aria-hidden="true">⚠️</span>
            <span>
              {geocodeError === 'offline'
                ? 'オフラインのため自動取得できません。手動で選択してください。'
                : '市区町村の自動取得に失敗しました。手動で選択してください。'}
            </span>
            <button
              type="button"
              onClick={retryGeocode}
              className="underline shrink-0 hover:opacity-80 transition-opacity"
            >
              再試行
            </button>
          </p>
        )}
      </div>
    </>
  )
}
