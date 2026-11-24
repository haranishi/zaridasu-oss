// REQ-330: 記録するときの位置の規則。
//
// 記録するときに現在地を最大 8 秒取りにいく。誤差 100 m 以内で、地点から 300 m 以内なら現在地を使う
// （取り方 gps・誤差も残す）。そうでなければ地点の座標を使う（取り方 map）。どちらを使ったかは確定前に表示する。
// 研究に使える投稿は誤差 30 m 以内の現在地が要るので、現場にいるなら現在地を優先する。

export const POSITION_RULE = {
  timeoutMs: 8000,
  maxAccuracyM: 100,
  maxDistanceM: 300,
} as const

export interface LatLngLite {
  lat: number
  lng: number
}

/** 端末から取れた現在地。 */
export interface Fix extends LatLngLite {
  accuracy: number | null
}

export type RecordPosition =
  | { source: 'gps'; lat: number; lng: number; accuracy: number | null; distanceM: number | null }
  | {
      source: 'map'
      lat: number
      lng: number
      accuracy: null
      /** noFix=現在地が取れない / inaccurate=誤差が大きい / far=地点から遠い / manual=地図の中心を選んだ */
      reason: 'noFix' | 'inaccurate' | 'far' | 'manual'
      distanceM: number | null
    }

/** 2 点の距離（m）。球面の近似（haversine）で、数百 m の判定には十分。 */
export function distanceM(a: LatLngLite, b: LatLngLite): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 地点（anchor）と現在地から、記録に使う位置を決める（純粋関数）。 */
export function decidePosition(anchor: LatLngLite, fix: Fix | null): RecordPosition {
  const atAnchor = { lat: anchor.lat, lng: anchor.lng, accuracy: null }
  if (!fix) return { source: 'map', ...atAnchor, reason: 'noFix', distanceM: null }
  const d = distanceM(anchor, fix)
  if (fix.accuracy == null || !(fix.accuracy <= POSITION_RULE.maxAccuracyM)) {
    return { source: 'map', ...atAnchor, reason: 'inaccurate', distanceM: d }
  }
  if (d > POSITION_RULE.maxDistanceM) return { source: 'map', ...atAnchor, reason: 'far', distanceM: d }
  return { source: 'gps', lat: fix.lat, lng: fix.lng, accuracy: Math.round(fix.accuracy), distanceM: d }
}

/**
 * 地点が無い記録（計画の外の希少種）の位置。現在地が取れればそれを使う（誤差はそのまま残す）。
 * 取れなければ null（呼び出し側が「地図の中心を使う」を出す）。
 */
export function freePosition(fix: Fix | null): RecordPosition | null {
  if (!fix) return null
  return {
    source: 'gps',
    lat: fix.lat,
    lng: fix.lng,
    accuracy: fix.accuracy == null ? null : Math.round(fix.accuracy),
    distanceM: null,
  }
}

/** 現在地を 1 回だけ取る。取れない・許可が無い・時間切れは null。 */
export function getCurrentFix(
  timeoutMs: number = POSITION_RULE.timeoutMs,
  geolocation: Geolocation | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined
): Promise<Fix | null> {
  if (!geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    let done = false
    const finish = (fix: Fix | null) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      resolve(fix)
    }
    // 端末が timeout を守らないことがあるので、こちらでも打ち切る
    const timer = window.setTimeout(() => finish(null), timeoutMs + 500)
    try {
      geolocation.getCurrentPosition(
        (p) =>
          finish({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          }),
        () => finish(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 }
      )
    } catch {
      finish(null)
    }
  })
}

/** 投稿（posts.location_source）の取り方に直す。地点の座標は「手動で選んだ位置」と同じ扱い。 */
export function postLocationSource(position: RecordPosition): 'gps' | 'manual' {
  return position.source === 'gps' ? 'gps' : 'manual'
}
