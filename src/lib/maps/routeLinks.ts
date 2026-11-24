// REQ-329: 地図のピン・投稿・非公開スポットから「そこまでの経路」を外部の地図アプリで開くための URL を作る。
//
// API キーも利用料も要らない各社の公開 URL 仕様だけを使う（REQ-091 の方針をそのまま広げた）。
// 出発地は渡さない。各アプリが端末の現在地を出発地として扱うので、ザリダス側で位置を取得・送信せずに済む。
//
//   Google マップ … Maps URLs（https://developers.google.com/maps/documentation/urls/get-started）
//   Yahoo!マップ … 2022 年に公開された URL 仕様（/route/{car|walk|train} と to / toLat / toLon）
//   Apple マップ … iOS 18.4 以降の「統一 Maps URL」（/directions?destination=&mode=）。
//                  旧形式の `?daddr=緯度,経度` は iOS 18.4 以降で座標を解釈しない不具合が報告されているため使わない。
//
// **座標以外の情報を URL に載せないこと。** 非公開スポットの名前（例「〇〇沼のメダカ」）を外部サービスへ
// 送ると、利用者が伏せたかった場所の手がかりが第三者のログに残る。行き先の表示名は固定の汎用語にする。

export type RouteProvider = 'google' | 'yahoo' | 'apple'

export interface RouteLink {
  provider: RouteProvider
  href: string
}

/** 表示順。国内で利用者の多い順（Google → Yahoo! → Apple）。 */
export const ROUTE_PROVIDERS: readonly RouteProvider[] = ['google', 'yahoo', 'apple']

/** 緯度経度として使える値か（NaN・Infinity・範囲外を弾く）。 */
export function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * URL に載せる座標の文字列。小数 6 桁（約 11 cm）に丸める。
 * 受け取る座標は既に公開レベル（粗化 ≒111 m）を反映済みなので、ここで精度を上げることはない。
 */
function fmt(v: number): string {
  return v.toFixed(6)
}

export function buildGoogleDirectionsUrl(lat: number, lng: number): string {
  const destination = encodeURIComponent(`${fmt(lat)},${fmt(lng)}`)
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
}

/**
 * Yahoo!マップのルート検索。`to` は表示名、`toLat` / `toLon` が実際の目的地。
 * 表示名には固定語だけを使う（上の注意書き参照）。出発地は Yahoo!マップ側で現在地を選ぶ。
 */
export function buildYahooRouteUrl(lat: number, lng: number, destinationLabel: string): string {
  const params = new URLSearchParams({
    to: destinationLabel,
    toLat: fmt(lat),
    toLon: fmt(lng),
  })
  return `https://map.yahoo.co.jp/route/car?${params.toString()}`
}

export function buildAppleDirectionsUrl(lat: number, lng: number): string {
  const destination = encodeURIComponent(`${fmt(lat)},${fmt(lng)}`)
  return `https://maps.apple.com/directions?destination=${destination}&mode=driving`
}

/**
 * 3 社ぶんの経路 URL をまとめて返す。座標が不正なら空配列（呼び出し側は何も描かない）。
 * @param destinationLabel Yahoo!マップに表示する行き先名。**固定の汎用語だけを渡すこと。**
 */
export function buildRouteLinks(lat: number, lng: number, destinationLabel: string): RouteLink[] {
  if (!isValidCoord(lat, lng)) return []
  return [
    { provider: 'google', href: buildGoogleDirectionsUrl(lat, lng) },
    { provider: 'yahoo', href: buildYahooRouteUrl(lat, lng, destinationLabel) },
    { provider: 'apple', href: buildAppleDirectionsUrl(lat, lng) },
  ]
}
