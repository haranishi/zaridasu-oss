'use client'

// REQ-330: 地図のすぐ上（検索バーの下）に差し込む帯の置き場。
//
// 地図の上に浮かせた帯は、スマホでは地図の上のほうの印を隠す（地図が見えている高さが 300px ほどしかない）。
// ここに createPortal で中身を入れると置き場に高さが付き、その分だけ地図が下がるので、印を 1 つも隠さない。
// 中身が無いときは高さ 0（地図の大きさは今までと同じ）。MapActionStack と同じく、DOM の置き場を context で配る。
// 置き場の高さが変わったら、入れた側が地図の大きさを測り直させる（map.invalidateSize）。
//
// 置き場の高さは、いちばん近い [data-map-top-scope] の要素に CSS 変数 --zari-map-top-slot で渡す。
// ホームの「地図／写真」の切り替えは地図の外（地図と写真の 2 枚を包む枠）に重ねてあり、地図と一緒には下がらない。
// この変数で同じだけ下げないと、差し込んだ帯の上に切り替えが重なって帯の文字を隠す（2026-10-02 の撮影で発見）。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface MapTopSlotValue {
  slot: HTMLElement | null
  setSlot: (el: HTMLElement | null) => void
}

const MapTopSlotContext = createContext<MapTopSlotValue | null>(null)

export function MapTopSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ slot, setSlot }), [slot])
  return <MapTopSlotContext.Provider value={value}>{children}</MapTopSlotContext.Provider>
}

/** 置き場の高さを渡す CSS 変数の名前。 */
export const MAP_TOP_SLOT_VAR = '--zari-map-top-slot'

/** 地図（MapContainer）の直前に置く置き場。 */
export function MapTopSlot() {
  const setSlot = useContext(MapTopSlotContext)?.setSlot
  const ref = useRef<HTMLDivElement | null>(null)
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el
      setSlot?.(el)
    },
    [setSlot]
  )
  useEffect(() => {
    const el = ref.current
    const scope = el?.closest<HTMLElement>('[data-map-top-scope]')
    if (!el || !scope) return
    const apply = () => scope.style.setProperty(MAP_TOP_SLOT_VAR, `${el.offsetHeight}px`)
    apply()
    if (typeof ResizeObserver === 'undefined') return () => scope.style.removeProperty(MAP_TOP_SLOT_VAR)
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      scope.style.removeProperty(MAP_TOP_SLOT_VAR)
    }
  }, [])
  return <div ref={attach} data-testid="map-top-slot" className="shrink-0" />
}

/** 置き場の DOM（provider の外や、まだ置かれていないときは null）。 */
export function useMapTopSlot(): HTMLElement | null {
  return useContext(MapTopSlotContext)?.slot ?? null
}
