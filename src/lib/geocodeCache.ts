/**
 * Nominatim逆ジオコーディング結果のインメモリLRUキャッシュ（市区町村名のみ）。
 *
 * REQ-231 役割整理:
 * - 本キャッシュは「投稿フォームでの市区町村即時表示」用のクライアント側 LRU（セッション内・
 *   ≒100m 粒度）。リロードで消える。市区町村の自動入力 UX を高速化するためのもの。
 * - 字レベル地名・水系・水辺・標高の付与結果は、サーバー側の DB 永続キャッシュ（geo_cache テーブル）
 *   と enrich-place Edge Function が担う（利用者/セッションをまたいで再利用・Nominatim 規約
 *   「キャッシュ推奨」を恒久的に満たす）。両者は対象データ・寿命・スコープが異なる別レイヤ。
 */

type CacheEntry = { municipality: string; timestamp: number }

const CACHE_TTL_MS = 60 * 60 * 1000 // 1時間
const CACHE_MAX_SIZE = 100

// モジュールスコープのシングルトン（セッション中持続、リロードで消える）
const cache = new Map<string, CacheEntry>()

/** 約100m精度でキャッシュキーを生成 */
function makeKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

/** キャッシュから取得。ヒットしなければ null を返す */
export function getCachedGeocode(lat: number, lng: number): string | null {
  const key = makeKey(lat, lng)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.municipality
}

/** キャッシュに保存。上限超過時は最古エントリを削除（LRU） */
export function setCachedGeocode(lat: number, lng: number, municipality: string): void {
  if (cache.size >= CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(makeKey(lat, lng), { municipality, timestamp: Date.now() })
}

/** テスト間のキャッシュリーク防止用 */
export function clearGeocodeCache(): void {
  cache.clear()
}
