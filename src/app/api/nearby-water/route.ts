/**
 * REQ-259 / REQ-264: 近くの水域検索エンドポイント（サーバー側 Overpass プロキシ）。
 *
 * なぜサーバー側で叩くか:
 *  - Overpass API（overpass-api.de）をクライアントから直接叩くと CSP `connect-src` の変更が必要になり、
 *    セキュリティヘッダの緩和につながる。ここでサーバー（Route Handler）が代理取得し、**同一オリジン**の
 *    `/api/nearby-water` だけをクライアントに露出することで CSP を一切変えずに済む（next.config.ts 不変）。
 *  - キャッシュ・レート抑制（半径上限・要素数上限・タイムアウト・in-memory TTL キャッシュ・Japan bbox 制限）を
 *    サーバー側に集約し、Overpass への連打・悪用（グローバルな無料プロキシ化）を防ぐ。
 *
 * 契約:
 *  - GET /api/nearby-water?lat=<number>&lng=<number>&radius=<meters>
 *  - radius は 100〜3000m にクランプ（未指定/不正は既定 1500m）。lat/lng は日本の bbox 内のみ許可。
 *  - 返却は最小 GeoJSON FeatureCollection（Feature ごとに id / geometry(Polygon|MultiPolygon) / properties.name のみ。
 *    重いタグは落とす）＋ meta（ok/degraded/count/truncated/radius/cached/source）。
 *  - パラメータ不正/範囲外 → 400。Overpass のエラー/タイムアウト → **空 features + meta.degraded=true の 200**
 *    （クライアントが穏当に扱える。クラッシュさせない）。
 *
 * 作法は `src/app/dataset/zaridasu.csv/route.ts` に倣う（named export の純粋関数＋GET ハンドラ）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/errorHandler'

// 検索パラメータ由来のため常に動的。静的最適化を無効化し、キャッシュは Cache-Control + module cache で制御する。
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// 公開インスタンスの障害時だけ次へ進む。正常な0件に対して再照会はしない。
// 現行 endpoint: https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const

/** 半径の下限/上限（m）。上限 3000m を超える指定はクランプする（Overpass 負荷・DoS 抑制）。 */
export const MIN_RADIUS_M = 100
export const MAX_RADIUS_M = 3000
export const DEFAULT_RADIUS_M = 1500

/** Overpass クエリ側のタイムアウト（秒）。サーバー側 fetch の AbortSignal が最終的な上限。 */
const OVERPASS_TIMEOUT_S = 8
/** 1取得先の上限（ms）。2取得先を順に試し、総待機時間は最大24秒。 */
const FETCH_TIMEOUT_MS = 12_000
/** 返却 Feature の上限（巨大ペイロード/描画コスト抑制）。 */
const MAX_FEATURES = 200

/** in-memory キャッシュ TTL（ms）。同一近傍への連打で Overpass を叩き直さない。 */
const CACHE_TTL_MS = 5 * 60_000
/** キャッシュ最大エントリ数（メモリ上限。超過時は最古を捨てる簡易 LRU）。 */
const CACHE_MAX_ENTRIES = 128

/**
 * 日本を広くカバーする bbox ガード。ザリダスは秋田県フォーカスの日本向けサービスのため、
 * これを大きく外れる座標（＝当エンドポイントをグローバルな Overpass プロキシとして悪用する試み）は 400 で弾く。
 * 秋田県（≒ lat 39.7 / lng 140.1）は十分内側。
 */
const JP_BOUNDS = { latMin: 20, latMax: 46, lngMin: 122, lngMax: 154 } as const

export interface NearbyWaterParams {
  lat: number
  lng: number
  radius: number
}

export type ParseResult =
  | { ok: true; params: NearbyWaterParams }
  | { ok: false; error: 'invalid_params' | 'out_of_area' }

/**
 * クエリ文字列を検証済みパラメータに正規化する。
 * lat/lng が非有限・座標範囲外 → invalid_params。日本 bbox 外 → out_of_area。
 * radius は [MIN, MAX] にクランプ（未指定/不正は DEFAULT）。
 */
export function parseNearbyWaterParams(sp: URLSearchParams): ParseResult {
  // 欠落/空文字は Number(...) が 0 になり「有効な 0 度」と誤認されるため、先に文字列で弾く。
  const latRaw = sp.get('lat')
  const lngRaw = sp.get('lng')
  if (latRaw == null || latRaw.trim() === '' || lngRaw == null || lngRaw.trim() === '') {
    return { ok: false, error: 'invalid_params' }
  }
  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { ok: false, error: 'invalid_params' }
  }
  if (lat < JP_BOUNDS.latMin || lat > JP_BOUNDS.latMax || lng < JP_BOUNDS.lngMin || lng > JP_BOUNDS.lngMax) {
    return { ok: false, error: 'out_of_area' }
  }
  // radius は明示指定があるときだけ数値化してクランプ。欠落/空/非数値は既定値。
  const radiusRaw = sp.get('radius')
  const radiusNum = radiusRaw == null || radiusRaw.trim() === '' ? NaN : Number(radiusRaw)
  const radius = Number.isFinite(radiusNum)
    ? Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(radiusNum)))
    : DEFAULT_RADIUS_M
  return { ok: true, params: { lat, lng, radius } }
}

/**
 * 半径内と中心を含む水面を取得する。around は岸までの距離を見るので、大きい湖の
 * 内部では is_in / pivot も必要。旧 landuse=reservoir 形式のため池も対象にする。
 * 水域タグに絞ってから out geom（最大 MAX_FEATURES）。広域の行政境界は出力しない。
 * ※ waterway（河川ライン）はスコープ拡大＋線描画が必要なため本増分では対象外（将来オプション）。
 */
export function buildOverpassQuery({ lat, lng, radius }: NearbyWaterParams): string {
  const around = `(around:${radius},${lat},${lng})`
  const queries = [
    ['natural', 'water'],
    ['landuse', 'reservoir'],
  ].flatMap(([key, value]) => {
    const tag = `["${key}"="${value}"]`
    return [
      `way${tag}${around};`,
      `relation${tag}${around};`,
      `way.containing${tag};`,
      `relation(pivot.containing)${tag};`,
    ]
  })
  return (
    `[out:json][timeout:${OVERPASS_TIMEOUT_S}][maxsize:16777216];` +
    `is_in(${lat},${lng})->.containing;` +
    `(${queries.join('')});` +
    `out geom ${MAX_FEATURES};`
  )
}

type Position = [number, number]
type LinearRing = Position[]
type WaterGeometry =
  | { type: 'Polygon'; coordinates: LinearRing[] }
  | { type: 'MultiPolygon'; coordinates: LinearRing[][] }

export interface WaterFeature {
  type: 'Feature'
  id: string
  geometry: WaterGeometry
  properties: { name: string | null }
}

interface OverpassGeom {
  lat: number
  lon: number
}
interface OverpassWay {
  type: 'way'
  id: number
  geometry?: OverpassGeom[]
  tags?: Record<string, string>
}
interface OverpassRelationMember {
  type: string
  role?: string
  geometry?: OverpassGeom[]
}
interface OverpassRelation {
  type: 'relation'
  id: number
  members?: OverpassRelationMember[]
  tags?: Record<string, string>
}

/** 点列を [lng,lat] に変換。欠損座標を飛ばして架空の水面を作らない。 */
function coordinatesFromGeometry(geom: OverpassGeom[] | undefined): Position[] | null {
  if (!Array.isArray(geom) || geom.length < 2) return null
  const coords: LinearRing = []
  for (const g of geom) {
    if (
      !g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon) ||
      Math.abs(g.lat) > 90 || Math.abs(g.lon) > 180
    ) return null
    coords.push([g.lon, g.lat])
  }
  return coords
}

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1]
const isRing = (coords: Position[]) => coords.length >= 4 && samePosition(coords[0]!, coords[coords.length - 1]!)

/** multipolygon の way 断片を端点で接続する。向きの反転に対応し、閉じない断片は捨てる。 */
function ringsFromMembers(members: OverpassRelationMember[], role: 'outer' | 'inner'): LinearRing[] {
  const pending = members
    .filter(m => m && m.type === 'way' && (m.role === role || (role === 'outer' && !m.role)))
    .map(m => coordinatesFromGeometry(m.geometry))
    .filter((coords): coords is Position[] => coords !== null)
  const rings: LinearRing[] = []
  while (pending.length > 0) {
    const ring = pending.shift()!
    while (!samePosition(ring[0]!, ring[ring.length - 1]!)) {
      const tail = ring[ring.length - 1]!
      const next = pending.findIndex(coords =>
        samePosition(tail, coords[0]!) || samePosition(tail, coords[coords.length - 1]!),
      )
      if (next < 0) break
      const segment = pending.splice(next, 1)[0]!
      if (!samePosition(tail, segment[0]!)) segment.reverse()
      for (let i = 1; i < segment.length; i++) ring.push(segment[i]!)
    }
    if (isRing(ring)) rings.push(ring)
  }
  return rings
}

/** 内周を包含する outer にだけ割り当てる（島などの陸地を青く塗らない）。 */
function pointInRing(point: Position, ring: LinearRing): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (
      (a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]
    ) inside = !inside
  }
  return inside
}

/** タグから表示名だけ拾う（name:ja 優先）。それ以外の重いタグは落とす。 */
function nameFromTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null
  const name = tags['name:ja'] || tags.name
  return typeof name === 'string' && name !== '' ? name : null
}

/**
 * Overpass の elements を最小 GeoJSON Feature 配列に変換する（純粋関数・テスト対象）。
 * - way: 閉じたリング → Polygon。
 * - relation(multipolygon): 分割された outer / inner を閉じたリングに組み立てる。
 * - name 以外のタグは全て破棄。MAX_FEATURES で打ち切る。
 */
export function elementsToFeatures(elements: unknown[]): WaterFeature[] {
  const features: WaterFeature[] = []
  for (const raw of elements) {
    if (features.length >= MAX_FEATURES) break
    if (!raw || typeof raw !== 'object') continue
    const el = raw as { type?: string }
    if (el.type === 'way') {
      const way = raw as OverpassWay
      const ring = coordinatesFromGeometry(way.geometry)
      if (!ring || !isRing(ring)) continue
      features.push({
        type: 'Feature',
        id: `way/${way.id}`,
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { name: nameFromTags(way.tags) },
      })
    } else if (el.type === 'relation') {
      const rel = raw as OverpassRelation
      const members = Array.isArray(rel.members) ? rel.members : []
      const polys = ringsFromMembers(members, 'outer').map(ring => [ring])
      for (const inner of ringsFromMembers(members, 'inner')) {
        const polygon = polys.find(poly => pointInRing(inner[0]!, poly[0]!))
        polygon?.push(inner)
      }
      if (polys.length === 0) continue
      const geometry: WaterGeometry =
        polys.length === 1
          ? { type: 'Polygon', coordinates: polys[0]! }
          : { type: 'MultiPolygon', coordinates: polys }
      features.push({
        type: 'Feature',
        id: `relation/${rel.id}`,
        geometry,
        properties: { name: nameFromTags(rel.tags) },
      })
    }
  }
  return features
}

export interface NearbyWaterResponseBody {
  type: 'FeatureCollection'
  features: WaterFeature[]
  meta: {
    /** Overpass 取得に成功したか（0 件でも true）。 */
    ok: boolean
    /** Overpass のエラー/タイムアウトで空返しになったか（クライアントは穏当に「取得失敗」を表示）。 */
    degraded: boolean
    count: number
    /** MAX_FEATURES に達して切り詰めた可能性。 */
    truncated: boolean
    radius: number
    cached: boolean
    source: 'overpass' | 'cache' | 'unavailable'
  }
}

// モジュールレベル in-memory キャッシュ（丸めた lat/lng/radius をキー・短 TTL）。
// サーバーレスではインスタンス毎だが、CDN の s-maxage と併せて Overpass 連打を抑える。
const cache = new Map<string, { expires: number; body: NearbyWaterResponseBody }>()
const inFlight = new Map<string, Promise<NearbyWaterResponseBody>>()

function cacheKey(p: NearbyWaterParams): string {
  // 3 桁（≒111m グリッド）に丸めて近傍の連打を同一キーに寄せる。
  return `${p.lat.toFixed(3)},${p.lng.toFixed(3)},${p.radius}`
}

const CACHE_HEADERS_OK = {
  'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
} as const
const CACHE_HEADERS_NOSTORE = { 'Cache-Control': 'no-store' } as const

async function fetchNearbyWater(params: NearbyWaterParams): Promise<NearbyWaterResponseBody> {
  let features: WaterFeature[] = []
  let degraded = true
  let lastError: unknown
  const query = buildOverpassQuery(params)
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          // Overpass への礼儀（一部ミラーは UA 必須）。
          'User-Agent': 'zaridasu/1.0 (+https://zaridasu.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`overpass responded ${res.status}`)
      const json = (await res.json()) as { elements?: unknown[]; remark?: unknown } | null
      // Overpass は実行中のタイムアウトを HTTP 200 + remark で返すこともある。
      // この失敗を「水域なし」としてキャッシュしない。上流の本文はログへ転記しない。
      if (!json || !Array.isArray(json.elements) || json.remark) throw new Error('overpass returned an incomplete result')
      features = elementsToFeatures(json.elements)
      degraded = false
      break
    } catch (err) {
      lastError = err
    }
  }
  if (degraded) logError(lastError, 'api:nearby-water')

  return {
    type: 'FeatureCollection',
    features,
    meta: {
      ok: !degraded,
      degraded,
      count: features.length,
      truncated: features.length >= MAX_FEATURES,
      radius: params.radius,
      cached: false,
      source: degraded ? 'unavailable' : 'overpass',
    },
  }
}

export async function GET(request: NextRequest) {
  const parsed = parseNearbyWaterParams(request.nextUrl.searchParams)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers: CACHE_HEADERS_NOSTORE })
  }
  const params = parsed.params
  const key = cacheKey(params)
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) {
    return NextResponse.json(
      { ...hit.body, meta: { ...hit.body.meta, cached: true, source: 'cache' } },
      { status: 200, headers: CACHE_HEADERS_OK },
    )
  }

  let pending = inFlight.get(key)
  if (!pending) {
    pending = fetchNearbyWater(params).finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
  }
  const body = await pending

  // 成功時のみキャッシュ（失敗はキャッシュしない＝次アクセスで再試行できる）。
  if (!body.meta.degraded) {
    if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, body })
  }

  return NextResponse.json(body, {
    status: 200,
    headers: body.meta.degraded ? CACHE_HEADERS_NOSTORE : CACHE_HEADERS_OK,
  })
}
