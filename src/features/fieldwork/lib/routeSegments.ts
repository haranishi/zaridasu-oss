// REQ-330: 「Google マップでまとめて開く」の区切り方。
//
// Google の経路 URL（Maps URLs）は、スマホのブラウザで開くと経由地が 3 か所まで、URL は 2,048 字まで。
// どの端末でも同じ順に開けるよう、未完了の地点を 4 つずつ区切る（経由地 3 ＋ 目的地 1）。
//   - 1 区間目は出発地を書かない（Google マップが現在地から始める）
//   - 2 区間目からは、前の区間の最後の地点を出発地にする
// 移動手段は既存の経路ボタン（src/lib/maps/routeLinks.ts）と同じ車。座標の桁も同じ小数 6 桁。
// **URL には座標だけを載せる。** 地点名を外部サービスへ送らない（REQ-329 の約束）。
// Yahoo! マップの公開 URL には経由地の指定が無いので、ここでは作らない（「次の地点へ」だけで使う）。

import { isValidCoord } from '@/lib/maps/routeLinks'

/** 公式の上限。ここを超える URL は作らない。 */
export const GOOGLE_MAPS_URL_MAX = 2048
/** 1 本の URL に入れる地点の数（経由地 3 ＋ 目的地 1）。 */
export const STOPS_PER_SEGMENT = 4

export interface RoutePoint {
  lat: number
  lng: number
}

export interface RouteSegment {
  /** この区間で向かう地点の、渡した配列での位置（0 始まり・出発地は含まない）。 */
  indexes: number[]
  /** 出発地にした地点の位置。1 区間目は null（現在地から）。 */
  originIndex: number | null
  url: string
}

function coord(p: RoutePoint): string {
  return encodeURIComponent(`${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
}

/**
 * 未完了の地点（回る順）を 4 つずつの経路 URL にする。座標が不正な地点は飛ばす。
 * 返す URL はどれも 2,048 字以内で、経由地は 3 か所以内。
 */
export function buildGoogleRouteSegments(points: readonly RoutePoint[]): RouteSegment[] {
  const usable = points
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => isValidCoord(Number(p.lat), Number(p.lng)))

  const segments: RouteSegment[] = []
  let origin: { p: RoutePoint; index: number } | null = null
  for (let start = 0; start < usable.length; start += STOPS_PER_SEGMENT) {
    const chunk = usable.slice(start, start + STOPS_PER_SEGMENT)
    const destination = chunk[chunk.length - 1]
    if (!destination) break
    const waypoints = chunk.slice(0, -1)
    const url =
      'https://www.google.com/maps/dir/?api=1' +
      (origin ? `&origin=${coord(origin.p)}` : '') +
      `&destination=${coord(destination.p)}` +
      '&travelmode=driving' +
      (waypoints.length > 0 ? `&waypoints=${waypoints.map((w) => coord(w.p)).join('%7C')}` : '')
    // 4 地点なら 250 字ほどで、上限には遠い。上限を変える改修が入ったときの見張り。
    if (url.length > GOOGLE_MAPS_URL_MAX) throw new Error('経路の URL が長すぎます')
    segments.push({ indexes: chunk.map((c) => c.index), originIndex: origin?.index ?? null, url })
    origin = destination
  }
  return segments
}
