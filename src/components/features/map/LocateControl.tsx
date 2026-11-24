'use client'

// 地図右下の「現在地を表示」。押すと位置を継続して取り、青い点と精度の円を動かし、地図を現在地に寄せ続ける。
// 状態（停止・取得中・追従・一時停止）はこのコンポーネントの中に閉じる。位置が届くたびに再描画されるのはここだけで、位置の状態で MapView が再描画されることはない。
// 仕様と設計: .kiro/specs/map-location-follow/
import type { LatLngTuple } from 'leaflet'
import { LocateFixed, Navigation } from 'lucide-react'
import { memo, useEffect, useEffectEvent, useMemo, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Circle, CircleMarker, Pane, Popup, useMap } from 'react-leaflet'
import { MAP_ACTION_ORDER, MapAction } from './MapActionStack'
import { useToastContext } from '@/context/ToastContext'
import { useFollowCamera } from '@/hooks/useFollowCamera'
import { useLocateHint } from '@/hooks/useLocateHint'
import { useLocationWatch } from '@/hooks/useLocationWatch'
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock'
import { INITIAL_FOLLOW_STATE, LOCATE_TOAST_MS, followReducer, locateTitleKey, type FollowErrorKind, type FollowMode } from '@/lib/maps/locationFollow'

// 現在地の青（従来から。種別の青 #0072B2 とは別の、現在地の慣例色）
const DOT_COLOR = '#3B82F6'
// 点の大きさ。投稿のまとまり（約34px）の隣でも埋もれず、重なっても「別の物」と分かる白い縁の太さにする
// （評価者3人が、半径8・縁2px では小さく、まとまりに溶けると指摘した）
const DOT_RADIUS = 9
const DOT_BORDER = 3
// 白い縁の外側に、暗い半透明の輪を1つ足す。明るい地図でも白い縁が溶けず、赤いまとまりに乗っても「別の物」と分かる
const DOT_HALO_RADIUS = DOT_RADIUS + DOT_BORDER / 2 + 2

// 点を描く層。Leaflet の標準では、図形（overlayPane=400）は投稿のマーカーやまとまり（markerPane=600）の下に描かれ、
// 投稿の多い場所では、自分の現在地がまとまりの下に隠れる（追従中にいちばん大事な情報なのに）。
// マーカーより上、吹き出し（popupPane=700）より下に置く。精度の円は、下の層のまま（マーカーを薄く覆わないため）。
const USER_LOCATION_PANE = 'zari-user-location'
const USER_LOCATION_PANE_Z_INDEX = 620

// REQ-322 FR-322-03: 地図の操作子は無彩色にする（青は種別＝データ専用）。
// 状態は色や動きだけに頼らず、形（矢印の塗り・十字）・枠・押下状態（aria-pressed）でも伝える。
//   停止＝白地・輪郭の矢印 / 取得中＝黒地・輪郭の矢印・内側の点線の輪（脈動） / 追従＝黒地・塗りつぶしの矢印 / 一時停止＝白地・太い黒枠・十字（押すと現在地に戻る）
const BUTTON_CLASS: Record<FollowMode, string> = {
  off: 'bg-white text-gray-700 hover:bg-gray-50',
  locating: 'bg-gray-900 text-white ring-2 ring-white',
  following: 'bg-gray-900 text-white ring-2 ring-white',
  paused: 'bg-white text-gray-900 ring-[3px] ring-gray-900',
}

// 状態の説明（札）。ボタンの左に出す。押せない（地図の操作を妨げない）。出ていないときは、読み上げ用の領域だけを残す
// 文は1文ごとに改行する（翻訳の \n）。語の途中で折れないように、幅は広めにとり、対応するブラウザでは文節で折り返す。
const HINT_CLASS =
  'pointer-events-none absolute right-full top-1/2 mr-2 w-max max-w-[min(calc(100vw-5.5rem),22rem)] -translate-y-1/2 whitespace-pre-line rounded-xl bg-gray-900 px-3 py-2 text-[13px] leading-snug text-white shadow-md ring-1 ring-white/30 [word-break:auto-phrase]'

interface LocateControlProps {
  /** 「現在の地図範囲内のみ」がオンか。オンだと、地図の範囲（南北・東西の座標）が検索条件としてサーバーへ送られる */
  boundsFilterEnabled?: boolean
  onBoundsFilterOff?: () => void
}

function LocateControl({ boundsFilterEnabled = false, onBoundsFilterOff }: LocateControlProps) {
  const map = useMap()
  const { t } = useTranslation()
  const toast = useToastContext()
  const [state, dispatch] = useReducer(followReducer, INITIAL_FOLLOW_STATE)
  const { mode, fix } = state
  const tracking = mode !== 'off'

  useLocationWatch({
    enabled: tracking,
    onFix: (next) => dispatch({ type: 'fix', fix: next }),
    onError: (kind) => dispatch({ type: 'error', kind }),
  })
  useScreenWakeLock(tracking)
  useFollowCamera(map, state, dispatch)

  // 失敗は、押し直すたびに（errorSeq が進むたびに）ここへ来る。ただし、同じ通知がまだ出ている間は重ねない
  // （拒否のまま4回押すと、同じ通知が4枚積み重なり、画面の上半分を覆った）
  const lastError = useRef<{ kind: FollowErrorKind; at: number } | null>(null)
  const notify = useEffectEvent((kind: FollowErrorKind) => {
    const now = Date.now()
    const last = lastError.current
    if (last && last.kind === kind && now - last.at < LOCATE_TOAST_MS.error) return
    lastError.current = { kind, at: now }
    toast.error(t(`map.locateError.${kind}`), LOCATE_TOAST_MS.error)
  })
  useEffect(() => {
    if (state.error) notify(state.error)
  }, [state.error, state.errorSeq])

  const hint = useLocateHint(mode)

  // 位置が動いている間（取得中・追従中）は、地図の範囲が現在地を中心に動く。「現在の地図範囲内のみ」がオンだと、
  // その範囲が検索条件としてサーバーへ送られ続け、ログイン中の利用者の移動の軌跡がサーバーのログに残ってしまう。
  // だから追従の間はオフにする。一時停止中は、利用者が見る場所を自分で選んでいるので、従来どおり使える。
  // 通知の文は、追従を始めたときに自動でオフにしたか、追従中に利用者がオンにしたかで分ける
  const turnOffMapAreaFilter = useEffectEvent((startedNow: boolean) => {
    if (!onBoundsFilterOff) return
    onBoundsFilterOff()
    toast.info(t(startedNow ? 'map.locateFilterOff' : 'map.locateFilterBusy'), LOCATE_TOAST_MS.filterOff)
  })
  const followingLive = mode === 'locating' || mode === 'following'
  const wasFollowingLive = useRef(false)
  useEffect(() => {
    const startedNow = followingLive && !wasFollowingLive.current
    wasFollowingLive.current = followingLive
    if (boundsFilterEnabled && followingLive) turnOffMapAreaFilter(startedNow)
  }, [boundsFilterEnabled, followingLive])

  const position = useMemo<LatLngTuple | null>(() => (fix ? [fix.lat, fix.lng] : null), [fix])

  const press = () => {
    // 非対応は押した直後に分かる。取得を始めずに通知する
    if (mode === 'off' && (typeof navigator === 'undefined' || !navigator.geolocation)) {
      dispatch({ type: 'error', kind: 'unsupported' })
      return
    }
    dispatch({ type: 'press' })
  }

  // REQ-331: 右下の列（MapActionStack）のいちばん下へ差し込む。位置の計算は入れ物だけが持つ。
  return (
    <>
      <MapAction order={MAP_ACTION_ORDER.locate}>
        <div className="relative">
          <button
            type="button"
            onClick={press}
            data-testid="map-locate"
            data-follow-mode={mode}
            // 名前は常に「現在地を表示」のまま変えない。名前が変わるボタンに aria-pressed を付けると読み上げが食い違う。
            // 押された状態は aria-pressed（取得中・追従で true）、押すと起きることは title で伝える。
            aria-label={t('map.locate')}
            title={t(locateTitleKey(mode))}
            aria-pressed={mode === 'locating' || mode === 'following'}
            aria-busy={mode === 'locating'}
            className={`relative shadow-md rounded-xl min-h-11 min-w-11 p-3 flex items-center justify-center active:scale-95 transition-all ${BUTTON_CLASS[mode]}`}
          >
            {mode === 'locating' && (
              // 取得中の目印（内側の点線の輪）。outline は使えない：Leaflet は、地図の中で mousedown が起きるたびに、押した要素の outline を消す
              // （DomUtil.preventOutline。タップのあとの mousedown でも同じ）。押した直後に見えなくなるので、box の border で描く
              <span aria-hidden="true" data-testid="locate-searching-ring" className="pointer-events-none absolute inset-[3px] rounded-[9px] border-2 border-dashed border-white" />
            )}
            {mode === 'paused' ? (
              // 一時停止は「現在地に戻る」。地図アプリで定番の十字にして、停止の矢印と形で分ける
              <LocateFixed size={18} />
            ) : (
              <Navigation
                size={18}
                // 塗りつぶしは、位置が取れて追従している間だけ。取得中は輪郭のまま（脈動だけに頼ると、静止画や「視覚効果を減らす」で追従と同じに見える）
                fill={mode === 'following' ? 'currentColor' : 'none'}
                className={mode === 'locating' ? 'animate-pulse motion-reduce:animate-none' : ''}
              />
            )}
          </button>
          {/* 位置を待つ間・一時停止の最初の1回に、いま何が起きているかを文字で伝える。読み上げのため、領域は常に残す */}
          <div role="status" aria-live="polite" className={hint ? HINT_CLASS : 'sr-only'}>
            {hint ? t(`map.locateHint.${hint}`) : ''}
          </div>
        </div>
      </MapAction>

      {fix && position && (
        <>
          {/* 押せない円。押せると、地図のクリック・長押し・ピン立てを円が受けてしまう */}
          {fix.accuracy !== null && fix.accuracy > 0 && (
            <Circle
              center={position}
              radius={fix.accuracy}
              interactive={false}
              // 縁は2pxの濃い青。航空写真の灰色に溶けない（視覚評価）
              pathOptions={{ color: '#2563EB', weight: 2, opacity: 0.7, fillColor: DOT_COLOR, fillOpacity: 0.15 }}
            />
          )}
          <Pane name={USER_LOCATION_PANE} style={{ zIndex: USER_LOCATION_PANE_Z_INDEX }}>
            <CircleMarker
              center={position}
              radius={DOT_HALO_RADIUS}
              interactive={false}
              pathOptions={{ stroke: false, fillColor: '#0F172A', fillOpacity: 0.3 }}
            />
            <CircleMarker center={position} radius={DOT_RADIUS} pathOptions={{ fillColor: DOT_COLOR, color: 'white', weight: DOT_BORDER, fillOpacity: 0.9 }}>
              <Popup>
                {fix.accuracy === null
                  ? t('map.currentLocation')
                  : t('map.currentLocationAccuracy', { meters: Math.max(1, Math.round(fix.accuracy)) })}
              </Popup>
            </CircleMarker>
          </Pane>
        </>
      )}
    </>
  )
}

export default memo(LocateControl)
