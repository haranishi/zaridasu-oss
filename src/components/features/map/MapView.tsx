// REQ-282 D-8（分割候補・実施は個別REQ）: 同居する HeatmapLayer/MapResizer/BoundsWatcher 等の内部コンポーネントをファイル分離する。
// 現在地ボタン（旧 LocateButton）は、位置を継続して取る追従に広げて LocateControl.tsx へ分離した。
import { memo, useState, useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import dynamic from 'next/dynamic'
import L from 'leaflet'

// REQ-144: react-leaflet-cluster は MapView の chunk から切り出し、
// MapView 表示時に独立 chunk として lazy 取得する。MapView 自体は MapViewWrapper で
// dynamic import 済みなので、cluster 部分はさらに細粒度で遅延化される。
const MarkerClusterGroup = dynamic(() => import('react-leaflet-cluster'), { ssr: false })
import Image from 'next/image'
// REQ-026: Leaflet CSS は globals.css に集約済み
import { AKITA_FIT_BOUNDS, AKITA_CENTER, AKITA_ZOOM, SPECIES, getSpecies, HEATMAP_CONFIG, heatWeight, MAP_LAYERS } from '@/lib/constants'
import { useMapSettings } from '@/context/MapSettingsContext'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { PostPopupContent, SurveyPopupContent } from './MapPopups'
import PersonalMapLayer from './PersonalMapLayer'
import LocateControl from './LocateControl'
import FieldworkLayer from '@/features/fieldwork/components/FieldworkLayer'
import NearbyWaterLayer from '@/features/water/components/NearbyWaterLayer'
import { MapTopSlot, MapTopSlotProvider } from './MapTopSlot'
import { MapActionStack, MapActionStackProvider } from './MapActionStack'

const UNKNOWN_SPECIES = { color: '#6B7280', shape: 'teardrop' as const, glyph: '?' }

function getSpeciesInfo(species: string) {
  return getSpecies(species) || UNKNOWN_SPECIES
}

// FR-009 / REQ-224 FR-224-03: 種類別 SVG アイコン生成（LRU キャッシュ上限 20 件）。
// 色だけに依存せず、種ごとに「形（雫型 / 角丸四角）＋中央グリフ（ザ/ガ）」で区別する。
// → グレースケール変換・色覚多様性(P/D型)でも 2 種を判別できる（AC-03/AC-04）。
const ICON_CACHE_LIMIT = 20
const speciesIconCache = new Map()
function createSpeciesIcon(opts: { color: string; shape: 'teardrop' | 'roundedSquare'; glyph: string; animate?: boolean }) {
  const { color, shape, glyph, animate = false } = opts
  const cacheKey = `${shape}|${color}|${glyph}|${animate ? 'a' : ''}`
  if (speciesIconCache.has(cacheKey)) {
    // LRU: アクセス時に末尾へ移動
    const cached = speciesIconCache.get(cacheKey)
    speciesIconCache.delete(cacheKey)
    speciesIconCache.set(cacheKey, cached)
    return cached
  }
  // 形を種で変える：teardrop=雫型ピン / roundedSquare=角丸四角ピン。中央に白縁の濃色グリフ。
  const body =
    shape === 'roundedSquare'
      ? `<rect x="3" y="2" width="22" height="22" rx="7" fill="${color}" stroke="white" stroke-width="2"/>
         <path d="M14 34 L8 22 H20 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>`
      : `<path d="M14 0C8.477 0 4 4.477 4 10c0 7.5 10 26 10 26s10-18.5 10-26C24 4.477 19.523 0 14 0z"
           fill="${color}" stroke="white" stroke-width="2"/>`
  const glyphY = shape === 'roundedSquare' ? 13 : 11
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    ${body}
    <text x="14" y="${glyphY}" text-anchor="middle" dominant-baseline="central"
      font-size="11" font-weight="700" fill="white"
      font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${glyph}</text>
  </svg>`
  // REQ-265: アメリカザリガニ確認地点はさりげなく揺らす（軽量CSSアニメ）。
  // Leaflet はマーカー位置決めに .leaflet-marker-icon の transform を使うため、
  // アニメは「内側の span」に当てて外側の位置 transform と競合させない。
  // reduced-motion 尊重は globals.css の @media ルールが担う（静止にフォールバック）。
  const html = animate ? `<span class="zari-marker-wiggle">${svg}</span>` : svg
  const icon = L.divIcon({
    html,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  })
  // LRU: 上限超過時に最古のエントリを削除
  if (speciesIconCache.size >= ICON_CACHE_LIMIT) {
    const oldest = speciesIconCache.keys().next().value
    if (oldest !== undefined) speciesIconCache.delete(oldest)
  }
  speciesIconCache.set(cacheKey, icon)
  return icon
}

// 調査依頼アイコン（虫眼鏡 🔍）。色は SURVEY_URGENCY トークンと整合（FR-224-06）。
const surveyIconCache = new Map()
function createSurveyIcon(urgent: boolean) {
  const key = urgent ? 'urgent' : 'normal'
  if (surveyIconCache.has(key)) return surveyIconCache.get(key)
  const color = urgent ? '#EA580C' : '#D97706'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="13" fill="${color}" stroke="white" stroke-width="2.5"/>
    <circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="2"/>
    <line x1="16" y1="16" x2="21" y2="21" stroke="white" stroke-width="2" stroke-linecap="round"/>
  </svg>`
  const icon = L.divIcon({
    html: svg,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
  surveyIconCache.set(key, icon)
  return icon
}

/**
 * REQ-318 FR-318-01: クラスタ（複数地点の集約）マーカーのアイコン。
 *
 * これが無いと leaflet.markercluster の既定 `iconCreateFunction` が
 * `<div class="marker-cluster"><div><span>6</span></div></div>` を返す。
 * ところが globals.css は `leaflet/dist/leaflet.css` しか読んでおらず
 * `leaflet.markercluster` の CSS（MarkerCluster.css / MarkerCluster.Default.css）を
 * 一切読んでいないため、クラスタが「地図の上に浮く裸の数字」として描かれていた
 * （県全体ズームでは承認済み地点がほぼ 1 クラスタに集約されるので、
 *   「ピンが 1 件も無い地図」に見えるという実害があった）。
 *
 * 対策として CSS を追加読み込みするのではなく、**自前の divIcon で完結**させる。
 * 既定 CSS に依存しないので、CSS の読み込み順・パージ・将来の依存更新に影響されない。
 * 色はブランド赤（種別に依らない＝クラスタは「種の集合」なので種色を使わない）。
 * 白フチ 2px + 白の太字数字で、地図タイル（緑・水色・白）のどれに乗っても輪郭が立つ。
 * 白 on #dc2626 は 4.83:1（AA 4.5:1 を満たす・REQ-318 FR-318-05 のテストで固定）。
 */
const CLUSTER_COLOR = '#dc2626' // --color-brand-600（ブランド赤）と同値
function createClusterIcon(count: number) {
  // 桁数が増えても円からはみ出さないよう字送りを詰める（4 桁以上は 1 万件規模の想定外だが一応落とす）。
  const fontSize = count < 100 ? 15 : count < 1000 ? 13 : 11
  const label = count < 10000 ? String(count) : '9999+'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="${CLUSTER_COLOR}" stroke="white" stroke-width="2"/>
    <text x="20" y="20" text-anchor="middle" dominant-baseline="central"
      font-size="${fontSize}" font-weight="700" fill="white"
      font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${label}</text>
  </svg>`
  // className を空にして既定の `marker-cluster*` クラス（＝未読み込み CSS 前提）を付けない。
  // キャッシュしないのは、件数がズーム/フィルタごとに変わり cache key が発散するため
  // （markercluster 側もズームのたびにアイコンを作り直す設計）。
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

// leaflet.markercluster の型定義（@types/leaflet.markercluster）はこのリポジトリに無く、
// 新規依存も足さない方針のため、iconCreateFunction が受け取るクラスタの最小面だけ宣言する。
interface ClusterLike {
  getChildCount(): number
}

// 不在確認アイコン（灰色の ✕ マーカー）
const absenceIcon = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
    <circle cx="13" cy="13" r="12" fill="#9CA3AF" stroke="white" stroke-width="2"/>
    <line x1="8" y1="8" x2="18" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="18" y1="8" x2="8" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
})

// ヒートマップレイヤー
interface HeatmapLayerProps {
  posts: MapPost[]
}

function HeatmapLayer({ posts }: HeatmapLayerProps) {
  const map = useMap()
  const heatRef = useRef<L.Layer | null>(null)

  useEffect(() => {
    if (!map) return
    let cancelled = false

    async function loadAndRender() {
      // @ts-expect-error -- side-effect-only module; runtime augments L.heatLayer
      await import('leaflet.heat')
      if (cancelled) return

      // REQ-243: hidden 投稿（座標 NULL）はヒートマップからも除外する。
      // REQ-258: 一律 0.5 ではなく CPUE（捕獲努力量あたり密度）で重み付けする。
      //   heatWeight は info_type 基準に、個体数(count)と調査時間(survey_duration_minutes)が
      //   揃えば「1時間あたり確認数」で上振れさせる（上限クリップあり）。両方無ければ従来どおり
      //   info_type 基準。`absence`（不在確認）は 0 を返すため熱源に含めない（下の filter で除外）。
      const points = posts
        .filter(hasMapCoordinates)
        .map((p) => [p.lat, p.lng, heatWeight(p)] as [number, number, number])
        .filter((pt) => pt[2] > 0)
      if (heatRef.current) {
        map.removeLayer(heatRef.current)
      }
      if (points.length > 0) {
        heatRef.current = L.heatLayer(points as L.HeatLatLngTuple[], HEATMAP_CONFIG).addTo(map)
      }
    }

    loadAndRender()

    return () => {
      cancelled = true
      if (heatRef.current) {
        map.removeLayer(heatRef.current)
      }
    }
  }, [map, posts])

  return null
}

// コンテナリサイズ時に地図を再描画
function MapResizer() {
  const map = useMap()

  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])

  return null
}

// REQ-324: 初期表示を秋田県全域に合わせる。
// 従来は AKITA_CENTER / AKITA_ZOOM の固定値で、横長の画面（1440px）では左 35% が海になり
// 青森・岩手が主役に見えていた（UI 採点で 2 回指摘）。fitBounds なら画面比に応じて県全域が収まる。
// 余白は、上が地図コントロール、下が種別カード（bottom-20）と紹介カードに隠れないぶんを取る。
// ズームは整数のまま。整数刻みで引きすぎるのを防ぐ判定は下の InitialFit を参照。
// 最初の 1 回だけ（利用者の操作後に戻さない）。animate:false で BoundsWatcher の moveend を同期で流す。
function InitialFit({ initialBounds = AKITA_FIT_BOUNDS }: { initialBounds?: [[number, number], [number, number]] }) {
  const firstBounds = useRef(initialBounds)
  const map = useMap()

  useEffect(() => {
    const bounds = L.latLngBounds(firstBounds.current)
    const size = map.getSize()
    // 下の余白: 幅 640px 未満は紹介カード（初回訪問）と種別カードが重なるぶん 160px、それ以外は 96px
    const bottom = size.x < 640 ? 160 : 96
    // 余白込みで県全域が入る整数ズーム（Leaflet 既定の zoomSnap=1）。
    // 小数ズームは使わない（タイルの継ぎ目に 1px の線が出る＝実測）。
    const zFit = map.getBoundsZoom(bounds, false, L.point(24, 56 + bottom))
    // 1 段寄っても「余白なし」で県全域が画面に収まるなら寄る。1440×900 では zFit=8 だと東北全体が
    // 映るが、9 なら県が高さいっぱいに収まる。390px では 9 だと幅が足りないので 8 のまま。
    const zCloser = zFit + 1
    const nw = map.project(bounds.getNorthWest(), zCloser)
    const se = map.project(bounds.getSouthEast(), zCloser)
    const fits = se.x - nw.x <= size.x && se.y - nw.y <= size.y
    map.setView(bounds.getCenter(), fits ? zCloser : zFit, { animate: false })
  }, [map])

  return null
}

// バウンズ監視
interface BoundsWatcherProps {
  onBoundsChange: (bounds: L.LatLngBounds) => void
}

function BoundsWatcher({ onBoundsChange }: BoundsWatcherProps) {
  const map = useMap()

  useEffect(() => {
    onBoundsChange(map.getBounds())
  }, [map]) // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  })

  return null
}

export interface MapPost {
  id: string
  lat: number | null
  lng: number | null
  species: string
  info_type: string
  municipality?: string | null
  comment?: string | null
  created_at: string
  // REQ-258: 密度ヒートマップの CPUE 重み付けに使う個体数・調査時間（任意・未入力なら null）。
  count?: number | null
  survey_duration_minutes?: number | null
  // REQ-231: サーバー側逆ジオで付与された字レベル地名・近傍水系（任意・取得できた場合のみ表示）
  locality?: string | null
  water_body?: string | null
}

// 公開座標のNULLは非公開位置。0へ変換せず、Leafletへは範囲内の数値だけ渡す。
function hasMapCoordinates(post: MapPost): post is MapPost & { lat: number; lng: number } {
  return typeof post.lat === 'number' && typeof post.lng === 'number'
    && Number.isFinite(post.lat) && Number.isFinite(post.lng)
    && post.lat >= -90 && post.lat <= 90 && post.lng >= -180 && post.lng <= 180
}

export interface SurveyRequest {
  id: string
  lat: number | string
  lng: number | string
  municipality?: string | null
  reason?: string | null
  urgency?: string
  created_at: string
}

// 閉じたPopupにもReactのportalは作られる。日付・画像・経路リンクは開いている間だけ組み立てる。
function usePopupOpen() {
  const [open, setOpen] = useState(false)
  const eventHandlers = useMemo(() => ({
    popupopen: () => setOpen(true),
    popupclose: () => setOpen(false),
  }), [])
  return { open, eventHandlers }
}

const PostMarker = memo(function PostMarker({ post, position }: { post: MapPost & { lat: number; lng: number }; position: L.LatLngTuple }) {
  const { open, eventHandlers } = usePopupOpen()
  const sp = getSpeciesInfo(post.species)
  const icon = post.info_type === 'absence' ? absenceIcon : createSpeciesIcon({ color: sp.color, shape: sp.shape, glyph: sp.glyph, animate: post.species === 'american' })
  // 一覧をキーボード操作の代替経路とする既存仕様を維持する（REQ-202）。
  return (
    <Marker position={position} icon={icon} keyboard={false} eventHandlers={eventHandlers}>
      <Popup>{open && <PostPopupContent post={post} />}</Popup>
    </Marker>
  )
})

const SurveyMarker = memo(function SurveyMarker({ request, position }: { request: SurveyRequest; position: L.LatLngTuple }) {
  const { open, eventHandlers } = usePopupOpen()
  return (
    <Marker position={position} icon={createSurveyIcon(request.urgency === 'high')} keyboard={false} eventHandlers={eventHandlers}>
      <Popup>{open && <SurveyPopupContent request={request} position={position} />}</Popup>
    </Marker>
  )
})

const NO_SURVEY_REQUESTS: SurveyRequest[] = []

interface MapViewProps {
  /** マウント時のみ使用。取得待ちの場合は親で初回マウントを調整する。 */
  initialBounds?: [[number, number], [number, number]]
  posts: MapPost[]
  surveyRequests?: SurveyRequest[]
  onBoundsChange?: (bounds: L.LatLngBounds) => void
  boundsFilterEnabled: boolean
  boundsFilterCount: number
  onBoundsFilterOff?: () => void
}

function MapView({ initialBounds, posts, surveyRequests = NO_SURVEY_REQUESTS, onBoundsChange, boundsFilterEnabled, boundsFilterCount, onBoundsFilterOff }: MapViewProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showHeatmap, activeLayerId } = useMapSettings()
  const [showLegend, setShowLegend] = useState(false)
  const [viewportBounds, setViewportBounds] = useState<L.LatLngBounds | null>(null)

  const activeLayer = MAP_LAYERS.find((l) => l.id === activeLayerId) ?? MAP_LAYERS[0]!

  // REQ-191 (FR-191-06): ビューポート内の投稿のみをレンダリングしつつ、各マーカーの
  // position を [lat, lng] タプルとして事前計算しておく。レンダー毎に <Marker position={[...]}>
  // へ新規配列リテラルを渡すと可視マーカー全件の更新が走り得るため、派生データ側で安定化する。
  // （マーカーのDOM肥大化防止＝従来のカリングは維持）
  // 座標はデータ更新時だけ作り、パンで残ったマーカーにsetLatLngを再実行させない。
  const locatedPosts = useMemo(() => posts.filter(hasMapCoordinates)
    .map((post) => ({ post, position: [post.lat, post.lng] as L.LatLngTuple })), [posts])
  const visiblePosts = useMemo(() => {
    const extended = viewportBounds?.pad(0.3)
    return extended ? locatedPosts.filter(({ position }) => extended.contains(position)) : locatedPosts
  }, [locatedPosts, viewportBounds])

  // REQ-191 (FR-191-05): 調査依頼マーカーにも投稿と同等のビューポートカリングを適用する
  // （viewportBounds.pad(0.3) で画面外の依頼を描画しない）。あわせて position を事前計算して安定化（FR-191-06）。
  const locatedSurveyRequests = useMemo(() => surveyRequests
    .map((request) => ({ request, position: [Number(request.lat), Number(request.lng)] as L.LatLngTuple })), [surveyRequests])
  const visibleSurveyRequests = useMemo(() => {
    const extended = viewportBounds?.pad(0.3)
    return extended ? locatedSurveyRequests.filter(({ position }) => extended.contains(position)) : locatedSurveyRequests
  }, [locatedSurveyRequests, viewportBounds])

  const handleBoundsChange = (bounds: L.LatLngBounds) => {
    setViewportBounds(bounds)
    onBoundsChange?.(bounds)
  }

  return (
    <div className="relative flex w-full h-full flex-col">
      {/* REQ-330: 地図のすぐ上に差し込む帯の置き場（「希少種を表示中」の帯など）。空なら高さ 0 */}
      <MapTopSlot />
      <MapContainer
        center={AKITA_CENTER}
        zoom={AKITA_ZOOM}
        // REQ-323 FR-323-07: 帰属表示のリンクを 44px にする CSS をこの地図だけに効かせる目印
        // （globals.css の .zari-map-main）。ミニ地図には適用しない。
        className="w-full min-h-0 flex-1 zari-map-main"
      >
        <TileLayer
          key={activeLayer.id}
          url={activeLayer.url}
          attribution={activeLayer.attribution}
          maxZoom={activeLayer.maxZoom}
        />

        {showHeatmap ? (
          <HeatmapLayer posts={posts} />
        ) : (
          <MarkerClusterGroup
            chunkedLoading
            // REQ-318 FR-318-01: 既定アイコン（未読み込み CSS 前提）を使わせない。
            iconCreateFunction={(cluster: ClusterLike) => createClusterIcon(cluster.getChildCount())}
          >
            {visiblePosts.map(({ post, position }) => (
              <PostMarker key={post.id} post={post} position={position} />
            ))}
          </MarkerClusterGroup>
        )}

        {/* 調査依頼マーカー（クラスター外・ビューポートカリング適用: FR-191-05） */}
        {visibleSurveyRequests.map(({ request, position }) => (
          <SurveyMarker key={`sr-${request.id}`} request={request} position={position} />
        ))}

        <MapResizer />
        {/* REQ-331: 右下のボタンの入れ物。現在地・ピン・非公開で保存などは <MapAction> でここへ差し込む */}
        <MapActionStack />
        <LocateControl boundsFilterEnabled={boundsFilterEnabled} onBoundsFilterOff={onBoundsFilterOff} />
        {/* REQ-259 / REQ-264: 近くの水域レイヤー（ユーザー操作トリガのみ・ヒートマップ ON/OFF に依らず常時利用可） */}
        <NearbyWaterLayer />
        {/* REQ-329: ピンを立てて経路を調べる／非公開スポット（本人だけ）／クイック保存 */}
        <PersonalMapLayer key={`personal-${user?.id ?? 'signed-out'}`} userId={user?.id ?? null} />
        <FieldworkLayer key={`fieldwork-${user?.id ?? 'signed-out'}`} userId={user?.id ?? null} />
        <BoundsWatcher onBoundsChange={handleBoundsChange} />
        {/* BoundsWatcher の後に置く（moveend の購読が先に付いてから fitBounds を流す） */}
        <InitialFit initialBounds={initialBounds} />

        {/* 凡例（右上・折りたたみ式） */}
        <div
          className="leaflet-top leaflet-right"
          style={{ marginTop: '8px', marginRight: '8px' }}
        >
          <div className="leaflet-control flex flex-col items-end gap-1">
            <button
              onClick={() => setShowLegend(v => !v)}
              className="bg-white/90 backdrop-blur-xs rounded-xl px-3 min-h-11 shadow-md text-xs flex items-center gap-1 text-gray-700 hover:bg-white transition-colors"
              title={t('map.legend')}
            >
              🦞 {t('map.legend')} {showLegend ? '▲' : '▼'}
            </button>
            {showLegend && (
              <div className="bg-white/90 backdrop-blur-xs rounded-xl px-3 py-2 shadow-md text-xs space-y-1">
                {SPECIES.map((s) => (
                  <div key={s.value} className="flex items-center gap-1.5">
                    {/* 色＋形＋グリフのマーカー見本（地図上のマーカーと対応・色だけに依存しない凡例）
                        REQ-323 FR-323-05: ここだけは CSS 変数 `var(--species-*)` ではなく
                        `s.color`（＝ライト値）を使う。**この凡例パネルはダークでも白のまま**
                        （bg-white/90）なので、変数のダーク値 #56b4e9 を引くと白地 2.31:1 になり、
                        中のグリフ（白文字）も読めなくなる。値は trends/about と同じ 1 つで、
                        参照の仕方だけを面に合わせている（constants.ts の colorVar 参照）。 */}
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center justify-center w-5 h-5 shrink-0 text-[10px] font-bold text-white ${
                        s.shape === 'roundedSquare' ? 'rounded-md' : 'rounded-full'
                      }`}
                      style={{ backgroundColor: s.color }}
                    >
                      {s.glyph}
                    </span>
                    <Image src={s.image} alt="" aria-hidden="true" width={20} height={20} className="w-5 h-5 object-contain shrink-0" />
                    <span className="text-gray-700 whitespace-nowrap">{t(`species.${s.value}`)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 pt-1 border-t border-gray-200 mt-1">
                  <span className="text-base leading-none">🚫</span>
                  <span className="text-gray-500 whitespace-nowrap">{t('infoType.absence')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">🔍</span>
                  <span className="text-gray-500 whitespace-nowrap">{t('survey.legendLabel')}</span>
                </div>
                {/* REQ-329: 自分の非公開スポット（紫の錠前）。本人の地図にしか出ない。 */}
                {user && (
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full text-[10px] text-white" style={{ backgroundColor: '#7C3AED' }}>🔒</span>
                    <span className="text-gray-500 whitespace-nowrap">{t('map.spot.legend')}</span>
                  </div>
                )}
                {/* REQ-330: 希少種の記録（同じ紫と錠前で外形はひし形。「希少種を自分の地図に表示」を入れたときだけ地図に出る） */}
                {user && (
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="inline-flex items-center justify-center w-5 h-5 shrink-0">
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rotate-45 rounded-[2px]" style={{ backgroundColor: '#7C3AED' }}>
                        <span className="-rotate-45 text-[8px] leading-none">🔒</span>
                      </span>
                    </span>
                    <span className="text-gray-500 whitespace-nowrap">{t('fieldwork.marker.legend')}</span>
                  </div>
                )}
              </div>
            )}
            {/* REQ-258: ヒートマップ表示中は「観察の密度」を示すキャプション付き凡例を常時表示。
                折りたたみに隠さず、色の濃淡=報告の多寡（不在確認は除外）であることを明示する。 */}
            {showHeatmap && (
              <div className="bg-white/90 backdrop-blur-xs rounded-xl px-3 py-2 shadow-md text-xs text-gray-700" style={{ maxWidth: '180px' }}>
                <div className="font-medium mb-1 flex items-center gap-1">
                  🔥 {t('map.heatmapLegend.title')}
                </div>
                <div
                  aria-hidden="true"
                  className="h-2 rounded-full mb-0.5"
                  style={{ background: 'linear-gradient(to right, #2563eb, #22c55e, #eab308, #ef4444)' }}
                />
                <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                  <span>{t('map.heatmapLegend.low')}</span>
                  <span>{t('map.heatmapLegend.high')}</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug">{t('map.heatmapLegend.caption')}</p>
              </div>
            )}
          </div>
        </div>
      </MapContainer>

      {/* ヒートマップ・地図タイプはハンバーガーメニュー（DrawerMenu）で操作する。
          ここでは現在選択中のエリア絞り込みバッジのみ表示 */}
      {boundsFilterEnabled && (
        <div className="absolute bottom-20 md:bottom-6 left-3 z-400">
          <div className="flex items-center gap-1.5 bg-brand-600 text-white px-3 py-2.5 rounded-xl shadow-md text-xs font-medium">
            <span>{t('map.filterActive', { count: boundsFilterCount })}</span>
            <button
              onClick={onBoundsFilterOff}
              aria-label={t('filter.reset')}
              className="relative hover:bg-brand-700 rounded-full p-1 transition-colors flex items-center justify-center before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-w-[44px] before:min-h-[44px] before:content-['']"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// REQ-331: 右下ボタンの入れ物（MapActionStack）の DOM を、MapContainer の中の各レイヤーへ context で配る。
// provider を MapView の外側に置くので、MapContainer の子（各レイヤーの行）を包み直さずに済む。
function MapViewWithActionStack(props: MapViewProps) {
  return (
    <MapActionStackProvider>
      <MapTopSlotProvider>
        <MapView {...props} />
      </MapTopSlotProvider>
    </MapActionStackProvider>
  )
}

// REQ-191 (FR-191-03): props 不変時の再レンダーを抑止する。検索 1 打鍵などで親
// (HomeInteractive) が再レンダーしても、posts/surveyRequests/各ハンドラ(useCallback で安定化)が
// 同一参照なら MapView 以下の Leaflet ツリーを再レンダーしない。比較は React.memo の既定（浅い比較）。
export default memo(MapViewWithActionStack)
