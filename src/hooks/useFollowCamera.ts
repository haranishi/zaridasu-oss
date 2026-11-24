'use client'

import type { LatLng, LatLngTuple, Map as LeafletMap } from 'leaflet'
import { useCallback, useEffect, useRef, type Dispatch } from 'react'
import { FOLLOW, type FollowAction, type FollowMode, type FollowState } from '@/lib/maps/locationFollow'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 滑らかに動かしてよいか。「視覚効果を減らす」では動かさない。
 * 現在地が画面 1 つ分より遠いときも動かさない（Leaflet は animate: true だと距離を問わず滑らせ、大きく動くとタイルが崩れる）。
 */
function canAnimate(map: LeafletMap, target: LatLngTuple) {
  if (prefersReducedMotion()) return false
  const size = map.getSize()
  return size.contains(map.latLngToContainerPoint(target).subtract(size.divideBy(2)))
}

/**
 * 地図を現在地へ寄せる規則と、利用者が地図を動かしたことの検出。
 *
 * **自分の移動は movestart を出さない**。panTo に noMoveStart: true を付けると、Leaflet は movestart を出さない。
 * だから movestart は、利用者（またはほかの部品）の移動だけを表す。
 * 「自分の移動の印を立てて moveend で降ろす」作りにしないのは、滑らかな動きの最中に次の位置が届くと、
 * Leaflet が前の動きを止める moveend が、新しい動きの movestart より先に出て、印が先に消えるため
 * （位置は約 1 秒ごと、動きも 1 秒なので、車での連続した移動では毎回起きる）。
 * 同期で終わる最初の setView だけは、実行中の印（ownCall）で見分ける。
 *
 * - ズームの最中（zoomstart〜zoomend）の movestart は、その場では判定しない。ボタンやピンチのズームでは止めたくない。
 *   終わったときに中心が FOLLOW.zoomShiftPx 以上ずれていたら、ズームでなく別の場所を見に行ったとみなして止める。
 * - ドラッグ（dragstart）は、ズームの最中でも必ず利用者の操作として止める。
 * - 画面サイズの変化（MapResizer の invalidateSize）は movestart を出さないので、止まらない。
 * - 利用者のズームの最中は、地図を動かさない。Leaflet はズームのアニメーション中の setView を黙って捨てる
 *   （_tryAnimatedZoom が先に true を返す）ので、終わってから（zoomend で）寄せ直す。
 *   途中で止められた flyTo は zoomend を出さないので、次の moveend でもズーム中の印を降ろす。
 */
export function useFollowCamera(map: LeafletMap, state: FollowState, dispatch: Dispatch<FollowAction>): void {
  const tracking = state.mode !== 'off'
  /** 自分の setView の最中（同期）。この間に出るイベントは、自分の移動のもの */
  const ownCall = useRef(false)
  /** 利用者（またはほかの部品）のズームの始まりの中心。null はズーム中ではない */
  const zoomFrom = useRef<LatLng | null>(null)
  /** 最初の寄せがまだか（取得を始めてから、追従になって一度寄せるまで。ズームの最中に届いた最初の位置は、終わるまで預かる） */
  const needsFirstMove = useRef(false)
  const prevMode = useRef<FollowMode>('off')
  /** イベントから、最新の状態を読む */
  const latest = useRef(state)
  useEffect(() => { latest.current = state })

  /** 地図を現在地へ寄せる。地図を動かす唯一の入口。 */
  const follow = useCallback(() => {
    const { mode, fix } = latest.current
    if (mode !== 'following' || !fix || zoomFrom.current !== null) return
    const target: LatLngTuple = [fix.lat, fix.lng]

    if (needsFirstMove.current) {
      needsFirstMove.current = false
      // 最初の位置。今のズームが大きければそのまま使う（旧実装は maxZoom: 14 で、拡大していても 14 へ引き戻していた）。
      // 滑らせない。同期で終われば、イベントは ownCall で見分けられる
      ownCall.current = true
      try {
        map.setView(target, Math.max(map.getZoom(), FOLLOW.firstFixZoom), { animate: false })
      } finally {
        ownCall.current = false
      }
      return
    }
    // 小さい縮尺では、車が動いても点はほとんど動かない。毎秒動かすと HomePage の境界の再計算が無駄に増える
    if (map.latLngToContainerPoint(target).distanceTo(map.getSize().divideBy(2)) < FOLLOW.deadZonePx) return
    map.panTo(target, { animate: canAnimate(map, target), duration: FOLLOW.panSeconds, easeLinearity: 1, noMoveStart: true })
  }, [map])

  useEffect(() => {
    if (!tracking) return
    const handlers = {
      zoomstart: () => { if (!ownCall.current) zoomFrom.current = map.getCenter() },
      dragstart: () => dispatch({ type: 'userMoved' }),
      movestart: () => {
        if (!ownCall.current && zoomFrom.current === null) dispatch({ type: 'userMoved' })
      },
      zoomend: () => {
        if (ownCall.current) return
        const from = zoomFrom.current
        zoomFrom.current = null
        if (from && map.project(from).distanceTo(map.project(map.getCenter())) >= FOLLOW.zoomShiftPx) {
          dispatch({ type: 'userMoved' })
        } else {
          follow() // ズームの最中に届いた位置を、終わってから反映する
        }
      },
      moveend: () => { zoomFrom.current = null },
    }
    map.on(handlers)
    return () => {
      map.off(handlers)
      zoomFrom.current = null
    }
  }, [map, tracking, dispatch, follow])

  useEffect(() => {
    // 「最初の寄せ」（ズームが小さければ14にして、現在地へ飛ぶ）は、取得を始めたとき（停止→取得中）に必要になり、追従になるまで持ち越す。
    // 取得中に利用者が地図を動かすと、位置が届いても一時停止になる（地図を引き戻さない）。その場合は、押して追従になったときに行う
    if (state.mode === 'off') needsFirstMove.current = false
    else if (prevMode.current === 'off') needsFirstMove.current = true
    prevMode.current = state.mode
    follow()
  }, [follow, state.mode, state.fix])
}
