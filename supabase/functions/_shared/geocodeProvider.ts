// REQ-231 (FR-231-02 / FR-231-05): 逆ジオコーディングのプロバイダ抽象化。
//
// 提供する純粋関数 + I/O 関数:
//   - parseNominatim / parseOpenCage / parseGeoapify : 各レスポンス → PlaceFields（純粋・テスト容易）
//   - reverseGeocode : env の GEOCODE_PROVIDER に従い reverse geocoding を実行（throttle + timeout + retry）
//   - fetchIsOnWater : OnWater で水辺フラグを取得（任意）
//   - fetchElevation : Open Topo Data で標高を取得（CORS 不可 → サーバー側のみ / AC-05）
//
// 制約（NFR-231-01 / NFR-231-02 / NFR-231-05）:
//   - Nominatim: 識別可能 User-Agent（連絡先付き）を必ず付与。1req/秒は geocodeThrottle で担保。
//   - タイムアウト（既定 5s）、リトライ上限（既定 2）+ 指数バックオフ + ジッタ。無限リトライ禁止。
//   - apiKey は env からのみ読む（実値はコード/ログに残さない）。
//   - kill switch（GEO_ENRICH_ENABLED=false）で付与を即停止できる（呼び出し側で参照）。

import { runThrottled } from './geocodeThrottle.ts'

export type GeoSource =
  | 'nominatim'
  | 'opencage'
  | 'geoapify'
  | 'onwater'
  | 'opentopodata'
  | 'cache'

export interface PlaceFields {
  locality: string | null
  water_body: string | null
  geo_source: GeoSource
}

// ── env helpers ──────────────────────────────────────────────────────────────

/** kill switch（AC-07 / NFR-231-02(c)）。既定は有効。明示 'false' のときのみ停止。 */
export function isEnrichEnabled(): boolean {
  return (Deno.env.get('GEO_ENRICH_ENABLED') ?? 'true') !== 'false'
}

export function getProvider(): 'nominatim' | 'opencage' | 'geoapify' {
  const p = (Deno.env.get('GEOCODE_PROVIDER') ?? 'nominatim').toLowerCase()
  if (p === 'opencage' || p === 'geoapify') return p
  return 'nominatim'
}

function getTimeoutMs(): number {
  const n = Number(Deno.env.get('GEOCODE_TIMEOUT_MS') ?? '5000')
  return Number.isFinite(n) && n > 0 ? n : 5000
}

function getMaxRetries(): number {
  const n = Number(Deno.env.get('GEOCODE_MAX_RETRIES') ?? '2')
  return Number.isFinite(n) && n >= 0 ? n : 2
}

/**
 * Nominatim Usage Policy 必須の識別可能 User-Agent（アプリ名 + 連絡先）。
 * 連絡先は env GEOCODE_CONTACT_EMAIL から差し込む（実値はコミットしない / NFR-231-05）。
 */
export function getUserAgent(): string {
  const contact = Deno.env.get('GEOCODE_CONTACT_EMAIL') ?? ''
  const base = 'zaridasu/1.0 (+https://zaridasu.com)'
  return contact ? `${base} ${contact}` : base
}

// ── retry/backoff ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * fetch + timeout + 指数バックオフ + ジッタ。NFR-231-02(a)(b)。
 * - 5xx / 429 / ネットワークエラー / timeout はリトライ対象。
 * - 4xx（429 以外）は即諦める（リトライしても無駄）。
 * - リトライは最大 getMaxRetries() 回（無限リトライ禁止）。
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response | null> {
  const maxRetries = getMaxRetries()
  const timeoutMs = getTimeoutMs()
  let lastErr: unknown = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return res
      // 429 / 5xx はリトライ。それ以外の 4xx は即終了。
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${label} ${res.status}`)
        // body を読み捨ててコネクションを解放
        await res.body?.cancel().catch(() => {})
      } else {
        console.warn(`[geocode] ${label} non-retryable ${res.status}`)
        return null
      }
    } catch (e) {
      lastErr = e
    }
    if (attempt < maxRetries) {
      // 指数バックオフ + ジッタ（200ms * 2^attempt + 0..200ms）
      const backoff = 200 * Math.pow(2, attempt) + Math.floor(Math.random() * 200)
      await sleep(backoff)
    }
  }
  console.warn(`[geocode] ${label} exhausted retries:`, String(lastErr))
  return null
}

// ── response parsers（純粋関数・テスト容易）──────────────────────────────────

/**
 * Nominatim reverse（addressdetails=1）レスポンスから locality / water_body を抽出する。
 * - locality: suburb → neighbourhood → quarter → hamlet → city_district の優先順で字レベルを選ぶ。
 * - water_body: address.water / address.river / address.stream / address.lake、
 *   無ければ display_name 中の「〜川/〜池/〜湖/〜沼/〜ダム」をヒューリスティック抽出。
 */
export function parseNominatim(json: unknown): Pick<PlaceFields, 'locality' | 'water_body'> {
  const obj = (json ?? {}) as Record<string, unknown>
  const addr = (obj.address ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = addr[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }
  const locality = pick('suburb', 'neighbourhood', 'quarter', 'hamlet', 'city_district')
  let water_body = pick('water', 'river', 'stream', 'lake', 'reservoir', 'bay')
  if (!water_body) {
    const display = typeof obj.display_name === 'string' ? obj.display_name : ''
    water_body = extractWaterFromText(display)
  }
  return { locality, water_body }
}

/** 自由文（display_name 等）から日本語の水系名らしき語を 1 つ抽出する。 */
export function extractWaterFromText(text: string): string | null {
  if (!text) return null
  // 「○○川 / ○○池 / ○○湖 / ○○沼 / ○○ダム」の最初の一致を返す。
  const m = text.match(/([぀-ヿ一-鿿々ヶ\w]{1,12}?(?:川|池|湖|沼|ダム|貯水池))/)
  return m ? m[1] : null
}

/** OpenCage（results[0].components）から locality / water_body を抽出する。 */
export function parseOpenCage(json: unknown): Pick<PlaceFields, 'locality' | 'water_body'> {
  const obj = (json ?? {}) as Record<string, unknown>
  const results = Array.isArray(obj.results) ? obj.results : []
  const first = (results[0] ?? {}) as Record<string, unknown>
  const comp = (first.components ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = comp[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }
  const locality = pick('suburb', 'neighbourhood', 'city_district', 'hamlet', 'village')
  let water_body = pick('river', 'water', 'body_of_water', 'stream')
  if (!water_body) {
    const formatted = typeof first.formatted === 'string' ? first.formatted : ''
    water_body = extractWaterFromText(formatted)
  }
  return { locality, water_body }
}

/** Geoapify（features[0].properties）から locality / water_body を抽出する。 */
export function parseGeoapify(json: unknown): Pick<PlaceFields, 'locality' | 'water_body'> {
  const obj = (json ?? {}) as Record<string, unknown>
  const features = Array.isArray(obj.features) ? obj.features : []
  const first = (features[0] ?? {}) as Record<string, unknown>
  const props = (first.properties ?? {}) as Record<string, unknown>
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = props[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }
  const locality = pick('suburb', 'district', 'neighbourhood', 'village', 'hamlet')
  let water_body = pick('water', 'river')
  if (!water_body) {
    const formatted = typeof props.formatted === 'string' ? props.formatted : ''
    water_body = extractWaterFromText(formatted)
  }
  return { locality, water_body }
}

/** OnWater レスポンス（{ water: true|false }）→ boolean | null（純粋関数）。 */
export function parseOnWater(json: unknown): boolean | null {
  const obj = (json ?? {}) as Record<string, unknown>
  if (typeof obj.water === 'boolean') return obj.water
  return null
}

/** Open Topo Data レスポンス（{ results:[{ elevation }] }）→ number | null（純粋関数）。 */
export function parseOpenTopoData(json: unknown): number | null {
  const obj = (json ?? {}) as Record<string, unknown>
  const results = Array.isArray(obj.results) ? obj.results : []
  const first = (results[0] ?? {}) as Record<string, unknown>
  const e = first.elevation
  return typeof e === 'number' && Number.isFinite(e) ? e : null
}

// ── reverse geocoding（I/O）──────────────────────────────────────────────────

/**
 * env の GEOCODE_PROVIDER に従って reverse geocoding を実行する。
 * Nominatim を使う場合は throttle（1req/秒）を必ず通す。失敗時は null（fail-open）。
 */
export async function reverseGeocode(lat: number, lng: number): Promise<PlaceFields | null> {
  const provider = getProvider()

  if (provider === 'opencage') {
    const key = Deno.env.get('OPENCAGE_API_KEY') ?? ''
    if (!key) {
      console.warn('[geocode] OPENCAGE_API_KEY 未設定。nominatim へフォールバック')
      return reverseNominatim(lat, lng)
    }
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${key}&language=ja&no_annotations=1`
    const res = await fetchWithRetry(url, {}, 'opencage')
    if (!res) return reverseNominatim(lat, lng)
    const json = await res.json().catch(() => null)
    if (!json) return reverseNominatim(lat, lng)
    return { ...parseOpenCage(json), geo_source: 'opencage' }
  }

  if (provider === 'geoapify') {
    const key = Deno.env.get('GEOAPIFY_API_KEY') ?? ''
    if (!key) {
      console.warn('[geocode] GEOAPIFY_API_KEY 未設定。nominatim へフォールバック')
      return reverseNominatim(lat, lng)
    }
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&lang=ja&apiKey=${key}`
    const res = await fetchWithRetry(url, {}, 'geoapify')
    if (!res) return reverseNominatim(lat, lng)
    const json = await res.json().catch(() => null)
    if (!json) return reverseNominatim(lat, lng)
    return { ...parseGeoapify(json), geo_source: 'geoapify' }
  }

  return reverseNominatim(lat, lng)
}

/**
 * Nominatim reverse geocoding。
 * - 必ず throttle（1req/秒）を通す（NFR-231-01(a)）。
 * - 識別可能 User-Agent を付与（NFR-231-01(b) / 現状の問題 1 の是正）。
 * - addressdetails=1 で字・水系を取得（現状は city のみだった）。
 */
export async function reverseNominatim(lat: number, lng: number): Promise<PlaceFields | null> {
  const url =
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&addressdetails=1&accept-language=ja`
  const res = await runThrottled(() =>
    fetchWithRetry(url, { headers: { 'User-Agent': getUserAgent() } }, 'nominatim')
  )
  if (!res) return null
  const json = await res.json().catch(() => null)
  if (!json) return null
  return { ...parseNominatim(json), geo_source: 'nominatim' }
}

/**
 * OnWater で水辺フラグを取得（任意）。env GEO_WATER_ENABLED=false で無効化。
 * 失敗時は null（fail-open）。OnWater は Auth=No だが高頻度時は要キー（呼び出しは控えめに）。
 */
export async function fetchIsOnWater(lat: number, lng: number): Promise<boolean | null> {
  if ((Deno.env.get('GEO_WATER_ENABLED') ?? 'false') !== 'true') return null
  const key = Deno.env.get('ONWATER_API_KEY') ?? ''
  const url = `https://api.onwater.io/api/v1/results/${lat},${lng}` + (key ? `?access_token=${key}` : '')
  const res = await fetchWithRetry(url, {}, 'onwater')
  if (!res) return null
  const json = await res.json().catch(() => null)
  return parseOnWater(json)
}

/**
 * Open Topo Data で標高を取得（任意・CORS 不可なのでサーバー側のみ / AC-05）。
 * env GEO_ELEVATION_ENABLED=false で無効化（既定 OFF＝外部負荷/コストを増やさない）。
 * 失敗時は null（fail-open）。
 */
export async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  if ((Deno.env.get('GEO_ELEVATION_ENABLED') ?? 'false') !== 'true') return null
  const dataset = Deno.env.get('OPENTOPODATA_DATASET') ?? 'aster30m'
  const url = `https://api.opentopodata.org/v1/${dataset}?locations=${lat},${lng}`
  const res = await fetchWithRetry(url, {}, 'opentopodata')
  if (!res) return null
  const json = await res.json().catch(() => null)
  return parseOpenTopoData(json)
}

// ── grid key（DB 永続キャッシュ用 / NFR-231-06）─────────────────────────────

/**
 * lat/lng を 3 桁丸め（≒100m）したキャッシュキー。
 * 既存クライアントキャッシュ（geocodeCache.ts の toFixed(3)）と同粒度。
 * NFR-231-06: 個人特定可能な細かい座標を外部 API/キャッシュに残さない。
 */
export function makeGridKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}
