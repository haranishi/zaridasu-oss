// REQ-330: 希少種の保護は「地点の id」でなく「場所」で決める。
//
// 地点の id だけで判定すると、「この計画をもう一度使う」（地点の id が新しくなる）・地点を外して足し直す・
// 計画の外で記録した場所を後から地点にする・別の端末の記録、のどれでも保護が外れ、希少種の場所に
// 公開の投稿ができてしまう。だから、自分の希少種の記録から 300 m 以内の地点・位置は保護の対象にする
// （300 m は位置の規則の「地点から 300 m 以内なら現在地を使う」と同じ距離）。

import { distanceM, POSITION_RULE, type LatLngLite } from './positionRule'

/** 自分の希少種の記録からこの距離（m）以内なら、そこから作る投稿の位置を非公開にする。 */
export const RARE_PROTECT_RADIUS_M = POSITION_RULE.maxDistanceM

/** 1 度あたりの距離（m）。緯度の 1 度はほぼ一定。経度の 1 度は緯度の cos 倍に縮む。 */
const M_PER_DEG = 111_195

export interface LatLngBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** 点の集まりを、周り radiusM だけ広げた緯度経度の範囲（DB で絞るのに使う。距離は端末で測り直す）。 */
export function boxAround(points: readonly LatLngLite[], radiusM: number = RARE_PROTECT_RADIUS_M): LatLngBox | null {
  const valid = points.filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
  if (valid.length === 0) return null
  const lats = valid.map((p) => Number(p.lat))
  const lngs = valid.map((p) => Number(p.lng))
  const dLat = radiusM / M_PER_DEG
  // 範囲の中で cos がいちばん小さい（経度の 1 度が短い）緯度で広げれば、取りこぼさない
  const maxAbsLat = Math.min(89, Math.max(...lats.map((l) => Math.abs(l))) + dLat)
  const dLng = radiusM / (M_PER_DEG * Math.cos((maxAbsLat * Math.PI) / 180))
  return {
    minLat: Math.min(...lats) - dLat,
    maxLat: Math.max(...lats) + dLat,
    minLng: Math.min(...lngs) - dLng,
    maxLng: Math.max(...lngs) + dLng,
  }
}

/** point から radiusM 以内に、points のどれかがあるか。 */
export function isNearAny(
  point: LatLngLite,
  points: readonly LatLngLite[],
  radiusM: number = RARE_PROTECT_RADIUS_M
): boolean {
  const p = { lat: Number(point.lat), lng: Number(point.lng) }
  return points.some((q) => distanceM(p, { lat: Number(q.lat), lng: Number(q.lng) }) <= radiusM)
}
