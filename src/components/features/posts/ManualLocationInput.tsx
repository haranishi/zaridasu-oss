'use client'

import { useEffect, useState } from 'react'
import { LocateFixed, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formInputCls } from '@/lib/formStyles'
import { isWithinTargetBBox } from '@/lib/area/targetArea'
import { LAT_MIN, LAT_MAX, LNG_MIN, LNG_MAX } from '@/lib/constants'

interface Position {
  lat: number
  lng: number
}

interface ManualLocationInputProps {
  position: Position | null
  onManualPosition: (position: Position | null) => void
  onGpsPosition: (position: Position, accuracy: number | null) => void
  idPrefix: string
  dark: boolean
  accent?: 'red' | 'amber'
}

const COMPLETE_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/

function parseCoordinate(value: string, min: number, max: number): number | null {
  const trimmed = value.trim()
  if (!COMPLETE_DECIMAL.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

export default function ManualLocationInput({
  position,
  onManualPosition,
  onGpsPosition,
  idPrefix,
  dark,
  accent = 'red',
}: ManualLocationInputProps) {
  const { t } = useTranslation()
  const [latitude, setLatitude] = useState(position ? String(position.lat) : '')
  const [longitude, setLongitude] = useState(position ? String(position.lng) : '')
  const [locating, setLocating] = useState(false)
  const [geolocationErrorKey, setGeolocationErrorKey] = useState('')

  useEffect(() => {
    if (!position) return
    setLatitude(String(position.lat))
    setLongitude(String(position.lng))
  }, [position])

  const parsedLatitude = parseCoordinate(latitude, LAT_MIN, LAT_MAX)
  const parsedLongitude = parseCoordinate(longitude, LNG_MIN, LNG_MAX)
  const parsedPosition =
    parsedLatitude !== null && parsedLongitude !== null
      ? { lat: parsedLatitude, lng: parsedLongitude }
      : null
  const hasInvalidValue =
    (latitude.trim() !== '' && parsedLatitude === null) ||
    (longitude.trim() !== '' && parsedLongitude === null)
  const latitudeIsInvalid = latitude.trim() !== '' && parsedLatitude === null
  const longitudeIsInvalid = longitude.trim() !== '' && parsedLongitude === null
  const isOutsideTargetArea =
    parsedPosition !== null && !isWithinTargetBBox(parsedPosition.lat, parsedPosition.lng)

  const updateManualPosition = (nextLatitude: string, nextLongitude: string) => {
    const lat = parseCoordinate(nextLatitude, LAT_MIN, LAT_MAX)
    const lng = parseCoordinate(nextLongitude, LNG_MIN, LNG_MAX)
    if (lat === null || lng === null) {
      onManualPosition(null)
      return
    }
    setGeolocationErrorKey('')
    onManualPosition({ lat, lng })
  }

  const useCurrentLocation = () => {
    setGeolocationErrorKey('')
    if (!navigator.geolocation) {
      setGeolocationErrorKey('postForm.geoUnsupported')
      return
    }

    setLocating(true)
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const latitudeIsValid =
            Number.isFinite(coords.latitude) &&
            coords.latitude >= LAT_MIN &&
            coords.latitude <= LAT_MAX
          const longitudeIsValid =
            Number.isFinite(coords.longitude) &&
            coords.longitude >= LNG_MIN &&
            coords.longitude <= LNG_MAX
          if (!latitudeIsValid || !longitudeIsValid) {
            setLocating(false)
            setGeolocationErrorKey('postForm.geoUnavailable')
            return
          }

          const nextPosition = { lat: coords.latitude, lng: coords.longitude }
          setLatitude(String(coords.latitude))
          setLongitude(String(coords.longitude))
          setLocating(false)
          onGpsPosition(
            nextPosition,
            Number.isFinite(coords.accuracy) ? coords.accuracy : null,
          )
        },
        (error) => {
          setLocating(false)
          if (error.code === 1) {
            setGeolocationErrorKey('postForm.geoPermissionDenied')
          } else if (error.code === 3) {
            setGeolocationErrorKey('postForm.geoTimeout')
          } else if (error.code === 2) {
            setGeolocationErrorKey('postForm.geoUnavailable')
          } else {
            setGeolocationErrorKey('postForm.geoDefault')
          }
        },
        { timeout: 10000, enableHighAccuracy: true },
      )
    } catch {
      setLocating(false)
      setGeolocationErrorKey('postForm.geoDefault')
    }
  }

  const inputCls = formInputCls(dark, accent)

  return (
    <fieldset className={`rounded-xl border p-3 ${dark ? 'border-slate-600' : 'border-gray-200'}`}>
      <legend className={`px-1 text-sm font-semibold ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
        {t('postForm.manualLocation')}
      </legend>
      <p className={`mb-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
        {t('postForm.manualLocationHint')}
      </p>

      {/*
        step="any" は必須。地図クリック・GPS・EXIF から入る座標は小数6桁以上あり、
        刻み幅を決め打ちすると stepMismatch でブラウザが送信そのものを止める
        （「有効な値として最も近いのは 35.70413 と 35.70414 です」の検証バブル）。
        値域の検証は min/max と parseCoordinate が担うので、刻み幅は不要。
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${idPrefix}-latitude`}
            className={`mb-1 block text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}
          >
            {t('postForm.latitude')}
          </label>
          <input
            id={`${idPrefix}-latitude`}
            type="number"
            inputMode="decimal"
            step="any"
            min={LAT_MIN}
            max={LAT_MAX}
            value={latitude}
            aria-invalid={latitudeIsInvalid}
            aria-describedby={latitudeIsInvalid ? `${idPrefix}-coordinate-error` : undefined}
            onChange={(event) => {
              const next = event.target.value
              setLatitude(next)
              updateManualPosition(next, longitude)
            }}
            className={inputCls}
          />
        </div>

        <div>
          <label
            htmlFor={`${idPrefix}-longitude`}
            className={`mb-1 block text-sm font-medium ${dark ? 'text-slate-300' : 'text-gray-700'}`}
          >
            {t('postForm.longitude')}
          </label>
          <input
            id={`${idPrefix}-longitude`}
            type="number"
            inputMode="decimal"
            step="any"
            min={LNG_MIN}
            max={LNG_MAX}
            value={longitude}
            aria-invalid={longitudeIsInvalid}
            aria-describedby={longitudeIsInvalid ? `${idPrefix}-coordinate-error` : undefined}
            onChange={(event) => {
              const next = event.target.value
              setLongitude(next)
              updateManualPosition(latitude, next)
            }}
            className={inputCls}
          />
        </div>
      </div>

      {hasInvalidValue && (
        <p
          id={`${idPrefix}-coordinate-error`}
          role="alert"
          className="mt-2 text-xs text-error"
        >
          {t('postForm.coordinateRangeError')}
        </p>
      )}

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className={`mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-wait disabled:opacity-60 ${
          dark
            ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
        }`}
      >
        {locating ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t('postForm.locating')}
          </>
        ) : (
          <>
            <LocateFixed size={16} aria-hidden="true" />
            {t('postForm.useCurrentLocation')}
          </>
        )}
      </button>

      {geolocationErrorKey && (
        <p role="alert" className="mt-2 text-xs text-error">
          {t(geolocationErrorKey)} {t('postForm.geolocationRetryHint')}
        </p>
      )}

      {isOutsideTargetArea && (
        <p
          role="status"
          className={`mt-2 text-xs ${dark ? 'text-amber-300' : 'text-amber-800'}`}
        >
          <span aria-hidden="true">⚠️ </span>
          {t('postForm.outsideTargetArea')}
        </p>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {parsedPosition
          ? t('postForm.locationSelected', {
              lat: parsedPosition.lat.toFixed(5),
              lng: parsedPosition.lng.toFixed(5),
            })
          : ''}
      </p>
    </fieldset>
  )
}
