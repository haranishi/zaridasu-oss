'use client'

// REQ-331: 地図の右下に縦に並ぶボタンの入れ物。
//
// 以前は各レイヤーが自分の `.leaflet-bottom` を置き、下にあるボタンの高さを足した決め打ちで
// 位置を計算していた（現在地は「下端から 5rem」、ピンと非公開で保存は「5rem + 現在地の 3.75rem」）。
// ボタンを足すたびに全員の計算がずれるので、入れ物を 1 つにし、各レイヤーは <MapAction> で
// 自分のボタンを React の portal で差し込む。足す側は次の 1 行で済む:
//   <MapAction order={MAP_ACTION_ORDER.xxx}>…ボタン…</MapAction>
//
// - 並び（上から）は order の小さい順で、CSS の order で決める。portal は差し込んだ順に DOM へ足されるため、
//   レイヤーが作り直される（ログインで key が変わる等）と DOM の順は動くが、見た目の順は動かない。
// - 差し込み先の DOM は MapActionStackProvider（MapView の外側）が context で配る。
// - グループの間は 16px、グループの中は 8px。入れ物の箱は押せないようにして、隙間を押すと地図に届く
//   （ボタンのグループだけが押せる。REQ-331 以前の配置と同じ当たり判定）。

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 上からの並び。数字が小さいほど上。ボタンを足すときはここに 1 行足す。 */
export const MAP_ACTION_ORDER = {
  /** FieldworkLayer（REQ-330）: 調査（計画→案内→記録の入口） */
  fieldwork: 10,
  /** PersonalMapLayer: 非公開で保存・ピンを立てる */
  personal: 20,
  /** MapView: 現在地（いちばん下） */
  locate: 90,
} as const

interface Slot {
  el: HTMLElement | null
  setEl: (el: HTMLElement | null) => void
}

const SlotContext = createContext<Slot | null>(null)

/** MapView の外側に 1 つ。入れ物（地図の中）の DOM を、地図の中の各レイヤーへ配る。 */
export function MapActionStackProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ el, setEl }), [el])
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>
}

/** 入れ物そのもの。MapContainer の中に 1 つだけ置く。 */
export function MapActionStack() {
  const slot = useContext(SlotContext)
  return (
    <div
      className="leaflet-bottom leaflet-right"
      // 地図の下端から 5rem 上（REQ-331 より前の現在地ボタンと同じ位置。スマホでは下部ナビの上）
      // ＋ iOS のセーフエリア。margin と padding は足し算になる。
      style={{ marginBottom: '5rem', paddingBottom: 'env(safe-area-inset-bottom, 0px)', marginRight: '8px' }}
    >
      {/* .leaflet-control: Leaflet の右下の余白（10px）を受け、PinDropHandler が「操作子の上のクリック」と見分ける目印 */}
      <div
        ref={slot?.setEl}
        className="leaflet-control flex flex-col items-end gap-4"
        style={{ pointerEvents: 'none' }}
      />
    </div>
  )
}

/** レイヤーが自分のボタンを右下の入れ物へ差し込む。入れ物がまだ無いあいだは何も描かない。 */
export function MapAction({ order, children }: { order: number; children: ReactNode }) {
  const el = useContext(SlotContext)?.el
  if (!el) return null
  return createPortal(
    <div className="flex flex-col items-end gap-2" style={{ order, pointerEvents: 'auto' }}>
      {children}
    </div>,
    el
  )
}
