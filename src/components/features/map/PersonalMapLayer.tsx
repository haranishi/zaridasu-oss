'use client'

// REQ-329: 地図上の「自分だけの」機能をまとめたレイヤー。
//   - ピンを立てる: 地図をタップ（ピンモード）または長押し／右クリックで一時的なピンを置き、
//     そこへの経路を Google / Yahoo! / Apple マップで開く。ピンは端末の画面上だけで、保存しない。
//   - 非公開スポット: 自分がクイック保存した地点を表示する（本人と運営だけが見られる）。
//   - クイック保存: ボタン 1 つで現在地（またはピン）を名前付きで非公開保存する。
// MapView（遅延チャンク）の中でだけ描画される。ホームの初期チャンクには載らない。
// 「ここで投稿」の投稿フォームとログイン画面もこのレイヤーが自分で開く。ホーム（page chunk 10 KB 予算・
// 余裕は数百バイト）に配線を足すと予算を超えるため（2026-09-26 実測 +17 B 超過）。

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { format } from 'date-fns'
import { Lock, MapPinned, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import RouteLinks from '@/components/ui/RouteLinks'
import { usePrivateSpots } from '@/hooks/usePrivateSpots'
import { normalizeSpotName } from '@/lib/privateSpots'
import { PRIVATE_SPOT_NAME_MAX } from '@/lib/constants'
import { useToastContext } from '@/context/ToastContext'
import { trackEvent } from '@/lib/analytics'
import { MapAction, MAP_ACTION_ORDER } from './MapActionStack'
import FieldworkPopupActions from '@/features/fieldwork/components/PopupActions'
import { mustLockPostAt } from './postLock'
import type { PrivateSpot } from '@/lib/data/private-spots'
import type { PendingPrivateSpot } from '@/lib/privateSpots'

const QuickSaveSheet = dynamic(() => import('./QuickSaveSheet'), { ssr: false })
const PostForm = dynamic(() => import('@/components/features/posts/PostForm'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })

export interface LatLngLite {
  lat: number
  lng: number
}

// 非公開スポット: 紫の丸に錠前。送信待ち（圏外で保存）は破線の灰色。種の色（青・橙）と被らない色を選ぶ。
function spotIcon(pending: boolean) {
  const fill = pending ? '#6B7280' : '#7C3AED'
  const dash = pending ? ' stroke-dasharray="3 2"' : ''
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r="13" fill="${fill}" stroke="white" stroke-width="2.5"${dash}/>
      <rect x="10" y="14" width="10" height="8" rx="1.5" fill="white"/>
      <path d="M12 14v-2.5a3 3 0 0 1 6 0V14" fill="none" stroke="white" stroke-width="2"/>
    </svg>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}
const SPOT_ICON = spotIcon(false)
const SPOT_PENDING_ICON = spotIcon(true)

// 立てたピン: 濃い灰色の雫型。投稿（種の色）や非公開スポット（紫）と見分けがつくようにする。
const DROPPED_PIN_ICON = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">
    <path d="M15 1C8.4 1 3 6.4 3 13c0 8.6 12 26 12 26s12-17.4 12-26C27 6.4 21.6 1 15 1z" fill="#111827" stroke="white" stroke-width="2"/>
    <circle cx="15" cy="13" r="4.5" fill="white"/>
  </svg>`,
  className: '',
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -38],
})

const popupBtn =
  'inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-xl text-xs font-semibold border transition-colors'
const popupBtnNeutral = `${popupBtn} border-gray-300 text-gray-700 bg-white hover:bg-gray-50`
const popupBtnViolet = `${popupBtn} border-violet-300 text-violet-800 bg-violet-50 hover:bg-violet-100`
const popupBtnDanger = `${popupBtn} border-red-300 text-red-700 bg-white hover:bg-red-50`

/** 地図クリック／長押しでピンを落とす。操作ボタン上のクリックは拾わない。 */
function PinDropHandler({ pinMode, onDrop }: { pinMode: boolean; onDrop: (p: LatLngLite) => void }) {
  const map = useMapEvents({
    // react-leaflet はポップアップの中身を「開いた後」に描くため、Leaflet の自動スクロール（autoPan）が
    // 空の高さで計算され、背の高いポップアップ（経路ボタン付き）の上端が地図の外へ切れていた。
    // 中身が描かれた後にもう一度レイアウトと autoPan をやり直す。上は「地図／写真」切替の下まで空ける。
    popupopen(e) {
      e.popup.options.autoPanPaddingTopLeft = L.point(12, 72)
      window.setTimeout(() => {
        if (e.popup.isOpen()) e.popup.update()
      }, 50)
    },
    click(e) {
      if (!pinMode) return
      const target = e.originalEvent?.target as HTMLElement | null
      if (target?.closest('.leaflet-control')) return
      onDrop({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
    // 右クリック（PC）・長押し（スマホ）はピンモードでなくても立てられる近道
    contextmenu(e) {
      onDrop({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = pinMode ? 'crosshair' : ''
    return () => { el.style.cursor = '' }
  }, [map, pinMode])
  return null
}

interface DroppedPinProps {
  position: LatLngLite
  onSaveHere: () => void
  onPostHere?: () => void
  onRemove: () => void
}

function DroppedPin({ position, onSaveHere, onPostHere, onRemove }: DroppedPinProps) {
  const { t } = useTranslation()
  const markerRef = useRef<L.Marker | null>(null)
  // 立てたらすぐ経路ボタンが見えるよう、ポップアップを自動で開く
  useEffect(() => {
    const id = window.setTimeout(() => markerRef.current?.openPopup(), 0)
    return () => window.clearTimeout(id)
  }, [position])

  return (
    <Marker ref={markerRef} position={[position.lat, position.lng]} icon={DROPPED_PIN_ICON} title={t('map.pin.title')}>
      <Popup>
        <div className="text-sm" style={{ minWidth: '240px' }}>
          <div className="font-bold mb-0.5">📍 {t('map.pin.title')}</div>
          <div className="text-xs text-gray-500 mb-2">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
          </div>
          <RouteLinks lat={position.lat} lng={position.lng} variant="popup" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            <button type="button" onClick={onSaveHere} className={popupBtnViolet}>
              <Lock size={12} aria-hidden="true" />
              {t('map.pin.saveHere')}
            </button>
            {onPostHere && (
              <button type="button" onClick={onPostHere} className={popupBtnNeutral}>
                ✏️ {t('map.pin.postHere')}
              </button>
            )}
            <button type="button" onClick={onRemove} className={popupBtnNeutral}>
              {t('map.pin.remove')}
            </button>
          </div>
          {/* REQ-330: 計画に入れる・希少種を記録（FieldworkLayer に頼む） */}
          <FieldworkPopupActions lat={position.lat} lng={position.lng} source="pin" />
        </div>
      </Popup>
    </Marker>
  )
}

interface SpotPopupBodyProps {
  /** 送信済みのスポットの id（送信待ちは無し）。REQ-330 の「計画に入れる」で元の id として使う。 */
  spotId?: string
  name: string
  note: string | null
  recordedAt: string
  accuracy: number | null
  lat: number
  lng: number
  pending: boolean
  onPostHere?: () => void
  onRename?: (name: string) => Promise<void>
  onDelete: () => Promise<void> | void
}

function SpotPopupBody({ spotId, name, note, recordedAt, accuracy, lat, lng, pending, onPostHere, onRename, onDelete }: SpotPopupBodyProps) {
  const { t } = useTranslation()
  const toast = useToastContext()
  const [mode, setMode] = useState<'view' | 'rename' | 'confirmDelete'>('view')
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = normalizeSpotName(draft)
    if (!next || !onRename || busy) return
    setBusy(true)
    try {
      await onRename(next)
      setMode('view')
    } catch {
      toast?.error(t('map.spot.renameFailed'))
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onDelete()
    } catch {
      toast?.error(t('map.spot.deleteFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="text-sm" style={{ minWidth: '240px' }}>
      <div className="font-bold mb-0.5 flex items-center gap-1.5 wrap-break-word">
        <Lock size={13} aria-hidden="true" className="shrink-0 text-violet-600" />
        {name}
      </div>
      {note && <div className="text-gray-700 text-xs mb-1 whitespace-pre-wrap wrap-break-word line-clamp-4">{note}</div>}
      <div className="text-xs text-gray-500 mb-1">
        {format(new Date(recordedAt), 'yyyy/M/d HH:mm')}
        {accuracy != null && ` · ${t('quickSave.accuracy', { m: Math.round(Number(accuracy)) })}`}
      </div>
      <div className={`text-[11px] mb-2 ${pending ? 'text-amber-700' : 'text-violet-700'}`}>
        {pending ? t('map.spot.pending') : t('map.spot.privateNote')}
      </div>
      <RouteLinks lat={lat} lng={lng} variant="popup" />

      {mode === 'view' && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {onPostHere && (
            <button type="button" onClick={onPostHere} className={popupBtnNeutral}>
              ✏️ {t('map.pin.postHere')}
            </button>
          )}
          {onRename && (
            <button type="button" onClick={() => { setDraft(name); setMode('rename') }} className={popupBtnNeutral}>
              {t('map.spot.rename')}
            </button>
          )}
          <button type="button" onClick={() => setMode('confirmDelete')} className={popupBtnDanger}>
            {t('map.spot.delete')}
          </button>
        </div>
      )}
      {/* REQ-330: 計画に入れる・希少種を記録（送信待ちのスポットは元の id が無いのでピンとして渡す） */}
      {mode === 'view' && (
        <FieldworkPopupActions
          lat={lat}
          lng={lng}
          source={spotId ? 'private_spot' : 'pin'}
          sourceId={spotId ?? null}
          name={name}
        />
      )}

      {mode === 'rename' && (
        <form onSubmit={submitRename} className="mt-2 space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700">
            {t('quickSave.nameLabel')}
            <input
              type="text"
              value={draft}
              maxLength={PRIVATE_SPOT_NAME_MAX}
              onChange={(e) => setDraft(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-2 text-base md:text-sm text-gray-800"
            />
          </label>
          <div className="flex gap-1.5">
            <button type="submit" disabled={busy || !normalizeSpotName(draft)} className={popupBtnViolet}>
              {t('map.spot.renameSave')}
            </button>
            <button type="button" onClick={() => setMode('view')} className={popupBtnNeutral}>
              {t('map.spot.cancel')}
            </button>
          </div>
        </form>
      )}

      {mode === 'confirmDelete' && (
        <div className="mt-2 space-y-1.5" role="alert">
          <p className="text-xs text-gray-700">{t('map.spot.deleteConfirm')}</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={doDelete} disabled={busy} className={popupBtnDanger}>
              {t('map.spot.deleteYes')}
            </button>
            <button type="button" onClick={() => setMode('view')} className={popupBtnNeutral}>
              {t('map.spot.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface PersonalMapLayerProps {
  userId: string | null
}

function PersonalMapLayer({ userId }: PersonalMapLayerProps) {
  const { t } = useTranslation()
  const map = useMap()
  const { spots, pending, save, remove, removePending, rename } = usePrivateSpots(userId)
  const [pinMode, setPinMode] = useState(false)
  const [droppedPin, setDroppedPin] = useState<LatLngLite | null>(null)
  // null=閉じている / { position: null }=現在地で保存 / { position }=ピンの位置で保存
  const [quickSave, setQuickSave] = useState<{ position: LatLngLite | null } | null>(null)
  // 「ここで投稿」の位置（投稿フォームを開く）と、未ログイン時のログイン画面。
  // locked: その位置の近くに自分の希少種の記録がある（または確かめられない）ので、位置を非公開に固定する
  const [postAt, setPostAt] = useState<(LatLngLite & { locked: boolean }) | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  const openQuickSave = (position: LatLngLite | null) => {
    map.closePopup()
    if (!userId) {
      setShowAuth(true)
      return
    }
    setQuickSave({ position })
  }

  // REQ-330（2 周目の点検）: 同じ吹き出しから希少種を記録できるので、「ここで投稿」も保護を通す。
  // フォームを開く前に、その位置の近く（300 m）に自分の希少種の記録が無いかを DB で確かめ、あれば位置を非公開に
  // 固定する（判定は postLock.ts）。
  const postHere = async (pos: LatLngLite) => {
    map.closePopup()
    if (!userId) {
      setShowAuth(true)
      return
    }
    trackEvent('post_start', { entry: 'map_pin' })
    const locked = await mustLockPostAt(userId, pos)
    setPostAt({ ...pos, locked })
  }

  const spotItems = useMemo(
    () => [
      ...pending.map((p) => ({ key: `pending-${p.localId}`, spot: p, pending: true as const })),
      ...spots.map((s) => ({ key: s.id, spot: s, pending: false as const })),
    ],
    [spots, pending]
  )

  const mapCenter = quickSave ? (() => { const c = map.getCenter(); return { lat: c.lat, lng: c.lng } })() : null

  return (
    <>
      <PinDropHandler
        pinMode={pinMode}
        onDrop={(p) => {
          setDroppedPin(p)
          setPinMode(false)
        }}
      />

      {spotItems.map(({ key, spot, pending: isPending }) => {
        const lat = Number(spot.lat)
        const lng = Number(spot.lng)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
        const recordedAt = isPending ? (spot as PendingPrivateSpot).recordedAt : (spot as PrivateSpot).recorded_at
        return (
          <Marker
            key={key}
            position={[lat, lng]}
            icon={isPending ? SPOT_PENDING_ICON : SPOT_ICON}
            // 自分のスポットは件数が少ないのでキーボードで辿れるようにする（投稿マーカーとは扱いが違う）
            title={spot.name}
          >
            <Popup>
              <SpotPopupBody
                spotId={isPending ? undefined : (spot as PrivateSpot).id}
                name={spot.name}
                note={spot.note}
                recordedAt={recordedAt}
                accuracy={spot.accuracy}
                lat={lat}
                lng={lng}
                pending={isPending}
                onPostHere={() => void postHere({ lat, lng })}
                onRename={isPending ? undefined : (name) => rename((spot as PrivateSpot).id, name)}
                onDelete={isPending
                  ? () => removePending((spot as PendingPrivateSpot).localId)
                  : () => remove((spot as PrivateSpot).id)}
              />
            </Popup>
          </Marker>
        )
      })}

      {droppedPin && (
        <DroppedPin
          position={droppedPin}
          onSaveHere={() => openQuickSave(droppedPin)}
          onPostHere={() => void postHere(droppedPin)}
          onRemove={() => { map.closePopup(); setDroppedPin(null) }}
        />
      )}

      {/* 操作ボタン（右下の列・現在地ボタンの上）。位置と間隔は MapActionStack（REQ-331）が決める。 */}
      <MapAction order={MAP_ACTION_ORDER.personal}>
        <button
          type="button"
          data-testid="quick-save-open"
          onClick={() => openQuickSave(null)}
          className="flex items-center gap-1.5 min-h-11 px-3.5 rounded-full shadow-md bg-violet-700 hover:bg-violet-800 text-white text-xs font-bold active:scale-95 transition-all"
        >
          <Lock size={15} aria-hidden="true" />
          {t('quickSave.button')}
        </button>
        <button
          type="button"
          data-testid="pin-mode-toggle"
          onClick={() => setPinMode((v) => !v)}
          aria-pressed={pinMode}
          aria-label={t('map.pin.button')}
          title={t('map.pin.button')}
          className={`shadow-md rounded-xl min-h-11 min-w-11 p-3 flex items-center justify-center active:scale-95 transition-all ${
            pinMode ? 'bg-gray-900 text-white' : 'bg-white hover:bg-gray-50 text-gray-700'
          }`}
        >
          <MapPinned size={18} aria-hidden="true" />
        </button>
      </MapAction>

      {pinMode && (
        <div className="leaflet-top" style={{ left: '50%', transform: 'translateX(-50%)', marginTop: '64px' }}>
          <div className="leaflet-control flex items-center gap-2 bg-gray-900/90 text-white text-xs font-medium rounded-full pl-3.5 pr-1 py-1 shadow-lg" role="status">
            <span>{t('map.pin.hint')}</span>
            <button
              type="button"
              onClick={() => setPinMode(false)}
              aria-label={t('map.pin.cancel')}
              className="min-h-9 min-w-9 rounded-full flex items-center justify-center hover:bg-white/15"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* 地図は横スワイプの transform の内側にあるため、固定配置のシート・フォームは body 直下へ出す */}
      {quickSave && typeof document !== 'undefined' && createPortal(
        <QuickSaveSheet
          initialPosition={quickSave.position}
          mapCenter={mapCenter}
          onSave={save}
          onClose={() => setQuickSave(null)}
        />,
        document.body
      )}
      {postAt && typeof document !== 'undefined' && createPortal(
        <PostForm
          initialPosition={{ lat: postAt.lat, lng: postAt.lng }}
          lockedPrivateReason={postAt.locked ? t('fieldwork.stop.privateLockReason') : undefined}
          onClose={() => setPostAt(null)}
          // 新しい投稿は審査待ちで公開地図には出ないため、ここでは一覧を取り直さない
          onSuccess={() => {}}
          onLoginClick={() => { setPostAt(null); setShowAuth(true) }}
        />,
        document.body
      )}
      {showAuth && typeof document !== 'undefined' && createPortal(
        <AuthModal onClose={() => setShowAuth(false)} defaultTab="signup" />,
        document.body
      )}
    </>
  )
}

export default memo(PersonalMapLayer)
