// 座標から秋田県の市区町村名を引く（Nominatim の逆ジオコーディング）。
// 投稿フォーム（useReverseGeocode）と、REQ-330 の不在の投稿（地点シートの「いなかった」）が同じ関数を使う。
// 市区町村は地域ページと市町村別の集計に効くので、フォームを通らない不在の投稿にも入れる。
//
// 規約順守（識別できる UA・1 秒 1 回・永続キャッシュ）はサーバー側の enrich-place に集約してある。
// ここは「市区町村の即時の表示・保存」だけを受け持ち、約 100 m 粒度のセッション内キャッシュを使う。

import { MUNICIPALITIES, TARGET_PREFECTURE } from '@/lib/constants'
import { getCachedGeocode, setCachedGeocode } from '@/lib/geocodeCache'

export interface MunicipalityResult {
  /** 秋田県の市区町村に一致した名前。一致しなければ ''。 */
  municipality: string
  /** 一致すれば秋田県。一致しなければ Nominatim の県名（無ければ ''）。 */
  prefecture: string
}

/**
 * Nominatim に問い合わせて市区町村を決め、キャッシュに書く（キャッシュは読まない）。
 * 圏外は Error('offline')、HTTP エラー・時間切れは別の Error を投げる。
 */
export async function fetchMunicipality(lat: number, lng: number, timeoutMs = 5000): Promise<MunicipalityResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline')
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja`
  // ブラウザの fetch は User-Agent を付けられない（REQ-231）。UA 付きの正規の取得はサーバー側の enrich-place。
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error('geocode failed')
  const json = await res.json()
  const addr = json.address ?? {}
  const candidate: string = addr.city || addr.town || addr.village || addr.county || ''
  // 候補が空のとき m.includes('') は常に真になり、一覧の先頭の市に誤って一致するので除く
  const matched = candidate
    ? MUNICIPALITIES.find((m: string) => candidate.includes(m) || m.includes(candidate))
    : undefined
  const municipality = matched ?? ''
  setCachedGeocode(lat, lng, municipality)
  return { municipality, prefecture: matched ? TARGET_PREFECTURE : addr.province || addr.state || '' }
}

/**
 * キャッシュを見てから問い合わせる。取れなければ null（呼び出し側は空のまま保存する）。
 * 不在の投稿では短い期限（既定 3 秒）にして、記録を待たせすぎない。
 */
export async function lookupMunicipality(lat: number, lng: number, timeoutMs = 3000): Promise<string | null> {
  const cached = getCachedGeocode(lat, lng)
  if (cached !== null) return cached || null
  try {
    const { municipality } = await fetchMunicipality(lat, lng, timeoutMs)
    return municipality || null
  } catch {
    return null
  }
}
