'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import i18n from '@/lib/i18n'
import LocationPicker from '../features/posts/LocationPicker'
import ManualLocationInput from '../features/posts/ManualLocationInput'

// REQ-144: SurveyRequestForm 自体は HomeInteractive 等で dynamic import 済みだが、
// 内部の react-leaflet を静的 import すると同 chunk に leaflet 一式が乗る。
// モーダル表示時に地図表示まで遅延させ、初期取得サイズを削減する。
// REQ-183 FR-183-09: aria-label は t() 化。dynamic の loading callback はモジュール
// スコープのため hook を使えず、i18n シングルトンの t() で現在言語を解決する
// （短時間のローディング表示のため言語切替時の即時再描画は不要）。
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 dark:bg-slate-800 animate-pulse" aria-label={i18n.t('survey.mapLoading')} role="status" />
)
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.MapContainer })),
  { ssr: false, loading: () => <MapSkeleton /> },
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.TileLayer })),
  { ssr: false },
)
import { X, Loader2, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useSurveyRequests } from '@/hooks/survey/useSurveyRequests'
import { useReverseGeocode } from '@/hooks/useReverseGeocode'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { OSM_ATTRIBUTION, AKITA_CENTER, AKITA_ZOOM, SURVEY_SPECIES, MAX_SURVEY_REASON_LENGTH } from '@/lib/constants'
import { formInputCls } from '@/lib/formStyles'
import { trackEvent } from '@/lib/analytics'

interface SurveyRequestFormProps {
  onClose: () => void
  onSuccess?: () => void
}

export default function SurveyRequestForm({ onClose, onSuccess }: SurveyRequestFormProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { createRequest } = useSurveyRequests()

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null)
  const { municipality } = useReverseGeocode(position)
  const [species, setSpecies] = useState('unknown')
  const [reason, setReason] = useState('')
  const [urgency, setUrgency] = useState('normal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // REQ-189: 他モーダル（AuthModal/PostForm）と同一の a11y 構成に統一。
  // focus trap でフォーカスをモーダル内に保持し、Escape は document リスナで閉じる。
  const dialogRef = useRef<HTMLDivElement>(null)
  const errorBannerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  useEscapeKey(onClose)
  useBodyScrollLock()

  // REQ-189: 送信時バリデーションエラー発生時、エラーバナーへフォーカスを移し
  // スクリーンリーダー利用者に発生を確実に伝える（PostForm の FR-158-04 と同方針）。
  useEffect(() => {
    if (error) errorBannerRef.current?.focus()
  }, [error])

  const handlePositionChange = (latlng: { lat: number; lng: number } | null) => {
    setPosition(latlng)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
    // disabled={loading} は state 反映前の連打にわずかな隙があるため、処理中なら即 return する。
    // 最終防衛はサーバー側（useSurveyRequests.createRequest の RLS / DB 制約）。
    if (loading) return
    if (!position) { setError(t('survey.errors.noPosition')); return }
    if (!reason.trim()) { setError(t('survey.errors.noReason')); return }
    setLoading(true)
    setError('')
    try {
      await createRequest({
        lat: position.lat,
        lng: position.lng,
        municipality,
        species,
        reason: reason.trim(),
        urgency,
      })
      // REQ-232 (FR-232-05): 調査依頼の送信（キーイベント候補）。reason 自由記述・座標は送らない。
      trackEvent('survey_request_submit', { species, urgency })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      // REQ-183 FR-183-04: createRequest は i18n キーを Error.message に載せて throw する。
      // 既知の `survey.errors.*` キーは t() で当該言語に解決し、それ以外（RLS/ネットワーク等の
      // 外部エラー）は汎用メッセージにフォールバックして日本語露出を防ぐ。
      const raw = err instanceof Error ? err.message : ''
      setError(raw.startsWith('survey.errors.') ? t(raw) : t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  if (!user) return null

  // REQ-209 FR-209-02: 共有ヘルパーに集約。フォーム全体の amber テーマに合わせ focus 枠は amber
  // （構造・基本配色は formInputCls と共通。挙動・見た目は従来どおり不変）。
  const inputCls = formInputCls(dark, 'amber')

  return (
    // REQ-189: Escape は useEscapeKey（document リスナ）で処理済み。これは背景クリックで閉じるためのオーバーレイ。
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="survey-form-title"
      className={`fixed inset-0 z-430 flex items-end sm:items-center justify-center ${dark ? 'bg-black/75' : 'bg-black/50'} backdrop-blur-xs`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={dialogRef} className={`rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto pb-safe ${dark ? 'bg-slate-900 border border-slate-700/60' : 'bg-white'}`}>
        {/* ヘッダー */}
        <div className={`flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10 ${dark ? 'border-slate-700/60 bg-slate-900' : 'border-gray-100 bg-white'}`}>
          <h2 id="survey-form-title" className={`text-lg font-bold flex items-center gap-2 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            <Search size={20} className="text-amber-500" />
            {t('survey.formTitle')}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} className={`rounded-full min-h-11 min-w-11 inline-flex items-center justify-center transition-colors ${dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          {/* 地図 */}
          <div>
            <label className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('survey.location')} *
            </label>
            <ManualLocationInput
              position={position}
              onManualPosition={handlePositionChange}
              onGpsPosition={(nextPosition) => handlePositionChange(nextPosition)}
              idPrefix="survey-location"
              dark={dark}
              accent="amber"
            />
            <p
              id="survey-map-instructions"
              className={`mb-2 mt-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}
            >
              {t('postForm.mapInstructions')}
            </p>
            <div className="relative rounded-xl overflow-hidden border border-gray-200 h-48">
              <MapContainer
                center={AKITA_CENTER}
                zoom={AKITA_ZOOM}
                className="w-full h-full"
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} />
                <LocationPicker
                  position={position}
                  setPosition={handlePositionChange}
                  ariaLabel={t('postForm.mapAriaLabel')}
                  describedById="survey-map-instructions"
                />
              </MapContainer>
              {!position && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-amber-600/80 shadow-[0_0_0_2px_rgba(0,0,0,0.55)]"
                  style={{ zIndex: 400 }}
                >
                  <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-white" />
                  <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-white" />
                </span>
              )}
            </div>
            {position && (
              <p className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
                📍 {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                {municipality && ` — ${municipality}`}
              </p>
            )}
          </div>

          {/* 対象種 */}
          <div>
            <label id="survey-species-label" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('survey.species')} *
            </label>
            <div role="group" aria-labelledby="survey-species-label" className="flex gap-2">
              {SURVEY_SPECIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSpecies(s.value)}
                  aria-pressed={species === s.value}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                    species === s.value
                      ? `border-amber-400 ${dark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-50 text-amber-700'}`
                      : `${dark ? 'border-slate-600/80 text-slate-400 hover:border-slate-500' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`
                  }`}
                >
                  {s.image ? <Image src={s.image} alt={t(`species.${s.value}`)} width={16} height={16} className="w-4 h-4 inline mr-1" /> : '❓ '}
                  {s.value === 'unknown' ? t('survey.speciesUnknown') : t(`species.${s.value}`)}
                </button>
              ))}
            </div>
          </div>

          {/* 調査理由 */}
          <div>
            <label htmlFor="survey-reason" className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('survey.reason')} *
            </label>
            <textarea
              id="survey-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_SURVEY_REASON_LENGTH}
              rows={3}
              required
              placeholder={t('survey.reasonPlaceholder')}
              className={inputCls}
            />
            <p className={`text-xs text-right mt-0.5 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
              {reason.length}/{MAX_SURVEY_REASON_LENGTH}
            </p>
          </div>

          {/* 緊急度 */}
          <div>
            <label className={`block text-sm font-semibold mb-1.5 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('survey.urgency')}
            </label>
            <div className="flex gap-3">
              {[
                { value: 'normal', label: t('survey.urgencyNormal'), emoji: '🟡' },
                { value: 'urgent', label: t('survey.urgencyUrgent'), emoji: '🔴' },
              ].map((u) => (
                <label key={u.value} className={`flex items-center gap-2 cursor-pointer text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                  <input
                    type="radio"
                    name="urgency"
                    value={u.value}
                    checked={urgency === u.value}
                    onChange={() => setUrgency(u.value)}
                    className="accent-amber-500"
                  />
                  {u.emoji} {u.label}
                </label>
              ))}
            </div>
          </div>

          {/* エラー — REQ-189: role="alert" + aria-live で支援技術へ即時通知し、発生時にフォーカスを移す。
              コントラストは PostForm のエラーバナーに合わせ AA（4.5:1）を満たす配色に統一。 */}
          {error && (
            <div
              ref={errorBannerRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              className={`text-sm px-3 py-2.5 rounded-xl border outline-hidden ${dark ? 'bg-red-900/30 border-red-500/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}
            >
              {error}
            </div>
          )}

          {/* 送信 — REQ-189 (FR-189-08 案A): disabled を loading のみに緩和し、位置未選択/理由空でも
              押下を許容する。handleSubmit 内のバリデーションに到達させ、role="alert" のエラーバナーで
              「なぜ送れないか」を支援技術・視覚双方へ伝える（PostForm と同方式に統一）。 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-linear-to-r from-amber-500 to-orange-500 text-white font-bold py-3 rounded-xl hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98]"
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" />{t('survey.submitting')}</>
            ) : (
              <><Search size={16} />{t('survey.submit')}</>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
