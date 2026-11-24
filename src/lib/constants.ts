import type { Species, InfoType } from '@/types/index'

// サイトURL（環境変数 or フォールバック）
// REQ-146: Server Component / API Route / Client いずれでも安全に評価できるよう
// `window.location.origin` フォールバックを排除し、SSR-safe な式に統一する。
// ランタイム window 由来の origin が必要な箇所は `getRuntimeOrigin()` を別途利用すること。
// 末尾スラッシュは付けない（canonical URL の組み立て側で `/foo` を連結する前提）。
export const BASE_URL: string = process.env.NEXT_PUBLIC_APP_URL || 'https://zaridasu.com'

// REQ-282 D-2: フィードバックフォーム（Google Forms）。Footer / DrawerMenu / AboutPage の
// 3箇所で参照する。フォーム差し替え時はここだけ変更する（直書き重複の再発禁止）。
export const FEEDBACK_FORM_URL = 'https://project-not-configured.invalid/form'

/** クライアントで実行中の場合は `window.location.origin`、SSR では `BASE_URL` を返す。 */
export function getRuntimeOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return BASE_URL
}

// 地図タイルレイヤー定義（OSM + 国土地理院）
export interface MapLayer {
  id: string
  labelKey: string
  url: string
  attribution: string
  maxZoom: number
}

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export const MAP_LAYERS: readonly MapLayer[] = [
  {
    id: 'osm',
    labelKey: 'map.layers.osm',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
  },
  {
    id: 'pale',
    labelKey: 'map.layers.pale',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
    maxZoom: 18,
  },
  {
    id: 'std',
    labelKey: 'map.layers.std',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
    maxZoom: 18,
  },
  {
    id: 'photo',
    labelKey: 'map.layers.photo',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',
    maxZoom: 18,
  },
] as const

// 起動時に表示する地図。既存の保存値も引き継ぎ、通常の切替では上書きしない。
export const MAP_LAYER_STORAGE_KEY = 'zaridasu_map_layer' as const

// 秋田県の中心座標・ズーム
export const AKITA_CENTER: [number, number] = [39.7186, 140.1023]
export const AKITA_ZOOM = 9 as const

// 秋田県のおおよその境界ボックス（現在地の自動設定に使用）
export const AKITA_BOUNDS = { latMin: 38.8, latMax: 40.7, lngMin: 139.5, lngMax: 141.8 } as const

// REQ-324: 初期表示の fitBounds に使う、県のおおよその実範囲（南北 38.87〜40.51・東西 139.69〜140.99）。
// AKITA_BOUNDS は検証用に広めに取ってあり（東端が岩手側まで）、そのまま合わせると東北全体が映る。
export const AKITA_FIT_BOUNDS: [[number, number], [number, number]] = [
  [38.87, 139.69],
  [40.51, 140.99],
]

// REQ-255: 投稿対象エリア（フォーカスする都道府県）。逆ジオコーディングで解決した県名がこれと
// 異なる位置には、投稿フォームで「ソフトな注意喚起」を出す（ハード制限はしない＝市民科学の
// 投稿は妨げない）。県内外の判定ヘルパは src/lib/area/targetArea.ts に集約する。
export const TARGET_PREFECTURE = '秋田県' as const

// 一覧取得のページサイズ
export const PAGE_SIZE = 50 as const

// REQ-209 FR-209-02: 管理画面（ログ/投稿/コメント）のページネーション件数。
// 一覧用 PAGE_SIZE（50）とは用途・値が異なるため別名で 1 箇所に集約する。
export const ADMIN_PAGE_SIZE = 20 as const

// REQ-224 FR-224-03: 種別は「色だけ」に依存させない。
// shape（マーカー/凡例の形）と glyph（白黒でも残る識別文字）を色に加えて持たせ、
// 地図マーカー・グラフ・凡例で色＋形＋文字の3点で区別できるようにする。
export type SpeciesMarkerShape = 'teardrop' | 'roundedSquare'

export interface SpeciesOption {
  value: Species
  label: string
  /**
   * 種別データ色（地図/グラフ専用。ブランド赤とは役割が違う）。
   * REQ-224 FR-224-03/05: 旧「赤×緑」(#DC2626/#16A34A) は色覚多様性(P/D型)で
   * 最も識別困難なため、Wong 色覚安全パレットの「青×オレンジ」へ変更。
   * 値の正本は globals.css の --species-* トークン（ここはフォールバック確定値）。
   */
  color: string
  /**
   * REQ-323 FR-323-05: 同じ種別色を指す CSS 変数名（globals.css の `--species-*`）。
   *
   * ■ なぜ参照が 2 通りあるのか
   * 種別色は「テーマで反転する面（about のカード・trends のカード）」と
   * 「テーマに関係なく白い面（地図の凡例パネル・OG 画像・leaflet の divIcon）」の両方で使う。
   * 前者は CSS 変数（ダークで明色へ切り替わる）、後者は上の `color`（＝ライト値そのもの）で
   * ないと成り立たない。値は 1 つで、引き方だけが 2 通りある。
   *
   * ■ ズレたら落ちる
   * `color` と `var(colorVar)` のライト値が一致することは contrast.test.ts が
   * globals.css を実際に読んで固定する。実際にズレていた: CSS 側だけダーク値(#56b4e9)を
   * 持っていたのに画面は #0072B2 を直接描いており、ダークの slate-800 上で 2.82:1（3:1 未満）
   * だった。「トークンは直したのに画面は別の色」を検出できるのはこの結び付けだけ。
   */
  colorVar: `--species-${Species}`
  /** 地図マーカーの形（色だけでなく形で区別。FR-224-03） */
  shape: SpeciesMarkerShape
  /** 白黒でも残る1文字グリフ（マーカー中央/凡例に併記。色非依存の識別子） */
  glyph: string
  image: string
  emoji: string
  /**
   * REQ-229 FR-229-01: 学名（ICZN 表記＝属＋種小名）。構造化データ(JSON-LD)の
   * Thing/Taxon の alternateName および種ページ表示の唯一の出どころ。
   * 以前は AboutPage / useDetailSEO / species ページに分散ハードコードされていた。
   */
  scientificName: string
  /** 分類ランク（schema.org/Taxon の taxonRank 等に使用）。現状は全て種。 */
  rank: 'species'
  /**
   * REQ-229 FR-229-01 / NFR-229-03: 学名を権威 URI に紐付け、検索エンジン/LLM が
   * 和名・英名・学名を同一エンティティとして束ねられるようにする `sameAs` 配列。
   * 値は GBIF Species API・Wikidata で一次裏取り済み（誤同定回避）：
   *  - american  : Wikidata Q1133124（taxon name=Procambarus clarkii, P846=2227300）
   *                / GBIF taxonKey 2227300（status ACCEPTED, EXACT match）
   *  - bullfrog  : Wikidata Q159404（"Rana catesbeiana"。en="American bullfrog"/
   *                ja="ウシガエル" の Wikipedia を保有する正準エンティティ）と
   *                Q4667413（taxon name=Lithobates catesbeianus, P846=2427091）の両同義項目
   *                / GBIF taxonKey 2427091（Lithobates catesbeianus, status ACCEPTED。
   *                Rana catesbeiana=2427092 は同 key への HOMOTYPIC_SYNONYM）
   */
  sameAs: readonly string[]
}

export const SPECIES: readonly SpeciesOption[] = [
  // american=青(Wong blue)・雫型・グリフ「ザ」/ bullfrog=オレンジ(Wong vermillion)・角丸四角・グリフ「ガ」
  { value: 'american', label: 'アメリカザリガニ', color: '#0072B2', colorVar: '--species-american', shape: 'teardrop',      glyph: 'ザ', image: '/images/american.png', scientificName: 'Procambarus clarkii', rank: 'species', sameAs: ['https://www.wikidata.org/wiki/Q1133124', 'https://www.gbif.org/species/2227300'], emoji:'\uD83E\uDD9E' },
  { value: 'bullfrog', label: 'ウシガエル',       color: '#D55E00', colorVar: '--species-bullfrog', shape: 'roundedSquare', glyph: 'ガ', image: '/images/bullfrog.png', scientificName: 'Lithobates catesbeianus', rank: 'species', sameAs: ['https://www.wikidata.org/wiki/Q159404', 'https://www.wikidata.org/wiki/Q4667413', 'https://www.gbif.org/species/2427091'], emoji:'\uD83D\uDC38' },
]

export const DEFAULT_SPECIES_EMOJI = '\uD83D\uDDFA\uFE0F'

// REQ-238: \u7A2E\u5225\u306E value\u2192\u5B9A\u7FA9\u306E O(1) \u9006\u5F15\u304D\u30DE\u30C3\u30D7\u3002\u5404\u6240\u306B\u6563\u3063\u3066\u3044\u305F
// `SPECIES.find(s => s.value === x)` \u306E\u7DDA\u5F62\u30B9\u30AD\u30E3\u30F3\u3092\u3053\u306E\u30DE\u30C3\u30D7\u7D4C\u7531\u306E\u30D8\u30EB\u30D1\u306B\u7D71\u4E00\u3059\u308B
// \uFF08\u53EF\u8AAD\u6027 + \u5FAE\u30D1\u30D5\u30A9\u30FC\u30DE\u30F3\u30B9\u3002\u6319\u52D5\u306F find \u3068\u7B49\u4FA1\u3067\u3001\u672A\u77E5 value \u306F undefined\uFF09\u3002
export const SPECIES_BY_VALUE: ReadonlyMap<string, SpeciesOption> = new Map(
  SPECIES.map((s) => [s.value, s]),
)

/** \u7A2E\u5225 value \u304B\u3089 SpeciesOption \u3092\u53D6\u5F97\uFF08\u672A\u77E5\u306A\u3089 undefined\u3002`SPECIES.find` \u3068\u7B49\u4FA1\uFF09\u3002 */
export function getSpecies(value: string): SpeciesOption | undefined {
  return SPECIES_BY_VALUE.get(value)
}

// REQ-228 FR-228-01: \u7A2E\u00D7\u5730\u57DF\u30DA\u30FC\u30B8 `/area/[municipality]/[species]` \u306E `[species]` \u30B9\u30E9\u30C3\u30B0\u306F
// SpeciesOption.value\uFF08'american' / 'bullfrog'\uFF09\u3092\u305D\u306E\u307E\u307E URL \u30B9\u30E9\u30C3\u30B0\u306B\u6D41\u7528\u3059\u308B\uFF08\u8FFD\u52A0\u30D5\u30A3\u30FC\u30EB\u30C9\u4E0D\u8981\uFF09\u3002
// \u5024\u306F\u3059\u3079\u3066\u82F1\u5B57\u3067 URL \u30BB\u30FC\u30D5\u3067\u3042\u308A\u3001`getMunicipalityBySlug` \u3068\u540C\u5F62\u306E lookup \u30D8\u30EB\u30D1\u3067\u672A\u77E5\u30B9\u30E9\u30C3\u30B0\u3092\u5F3E\u304F\u3002
export function getSpeciesBySlug(slug: string): SpeciesOption | undefined {
  // value がそのまま URL スラッグ（FR-228-01）。逆引きは SPECIES_BY_VALUE と等価。
  return SPECIES_BY_VALUE.get(slug)
}

// REQ-228 FR-228-05 / NFR-228-02: \u7A2E\u00D7\u5730\u57DF\u30DA\u30FC\u30B8\u3092 index \u5BFE\u8C61\u306B\u3059\u308B\u6700\u5C0F\u5831\u544A\u4EF6\u6570\u3002
// \u3057\u304D\u3044\u5024\u300C\u672A\u6E80\u300D\u306E\u8584\u3044\u7D44\u307F\u5408\u308F\u305B\u306F noindex + \u89AA(/area/[municipality]) \u3078\u306E canonical \u3067\u9694\u96E2\u3057\u3001
// \u30B5\u30A4\u30C8\u30DE\u30C3\u30D7\u304B\u3089\u3082\u9664\u5916\u3059\u308B\uFF08scaled content abuse \u56DE\u907F\uFF09\u3002\u5352\u7814 PF \u521D\u671F\u306F\u30C7\u30FC\u30BF\u304C\u5C11\u306A\u3044\u305F\u3081 1 \u4EF6\u4EE5\u4E0A\u3067
// index \u89E3\u7981\u3068\u3057\u3001\u30C7\u30FC\u30BF\u84C4\u7A4D\u306B\u5FDC\u3058\u3066\u904B\u7528\u3067\u5F15\u304D\u4E0A\u3052\u53EF\u80FD\u306B\u3059\u308B\uFF08\u4F8B: 3 \u306B\u4E0A\u3052\u308B\u3068\u54C1\u8CEA\u30AC\u30FC\u30C9\u304C\u5F37\u307E\u308B\uFF09\u3002
export const AREA_SPECIES_INDEX_MIN_POSTS = 1 as const

export interface InfoTypeOption {
  value: InfoType
  label: string
  emoji: string
}

export const INFO_TYPES: readonly InfoTypeOption[] = [
  { value: 'sighting', label: '目撃', emoji: '👁️' },
  { value: 'capture', label: '捕獲', emoji: '🤲' },
  { value: 'trace', label: '痕跡', emoji: '🔍' },
  { value: 'damage', label: '農業被害', emoji: '⚠️' },
  { value: 'absence', label: '不在確認', emoji: '🚫' },
]

// REQ-238: 情報種別の value→定義の O(1) 逆引きマップ（SPECIES_BY_VALUE と同方針）。
export const INFO_TYPES_BY_VALUE: ReadonlyMap<string, InfoTypeOption> = new Map(
  INFO_TYPES.map((t) => [t.value, t]),
)

/** 情報種別 value から InfoTypeOption を取得（未知なら undefined。`INFO_TYPES.find` と等価）。 */
export function getInfoType(value: string): InfoTypeOption | undefined {
  return INFO_TYPES_BY_VALUE.get(value)
}

export const MUNICIPALITIES: readonly string[] = [
  '秋田市', '能代市', '横手市', '大館市', '男鹿市', '湯沢市',
  '鹿角市', '由利本荘市', '潟上市', '大仙市', '北秋田市',
  'にかほ市', '仙北市', '小坂町', '上小阿仁村', '藤里町',
  '三種町', '八峰町', '五城目町', '八郎潟町', '井川町',
  '大潟村', '美郷町', '羽後町', '東成瀬村',
]

export interface MunicipalityInfo {
  name: string
  slug: string
  lat: number
  lng: number
}

export const MUNICIPALITY_DATA: readonly MunicipalityInfo[] = [
  { name: '秋田市', slug: 'akita-shi', lat: 39.7200, lng: 140.1025 },
  { name: '能代市', slug: 'noshiro-shi', lat: 40.2126, lng: 140.0268 },
  { name: '横手市', slug: 'yokote-shi', lat: 39.3113, lng: 140.5533 },
  { name: '大館市', slug: 'odate-shi', lat: 40.2713, lng: 140.5641 },
  { name: '男鹿市', slug: 'oga-shi', lat: 39.8867, lng: 139.8480 },
  { name: '湯沢市', slug: 'yuzawa-shi', lat: 39.1651, lng: 140.4948 },
  { name: '鹿角市', slug: 'kazuno-shi', lat: 40.2133, lng: 140.7880 },
  { name: '由利本荘市', slug: 'yurihonjo-shi', lat: 39.3862, lng: 140.0489 },
  { name: '潟上市', slug: 'katagami-shi', lat: 39.8879, lng: 140.0355 },
  { name: '大仙市', slug: 'daisen-shi', lat: 39.4505, lng: 140.4766 },
  { name: '北秋田市', slug: 'kitaakita-shi', lat: 40.2296, lng: 140.3680 },
  { name: 'にかほ市', slug: 'nikaho-shi', lat: 39.2026, lng: 139.9079 },
  { name: '仙北市', slug: 'semboku-shi', lat: 39.6975, lng: 140.5667 },
  { name: '小坂町', slug: 'kosaka-machi', lat: 40.3341, lng: 140.7371 },
  { name: '上小阿仁村', slug: 'kamikoani-mura', lat: 40.0544, lng: 140.3247 },
  { name: '藤里町', slug: 'fujisato-machi', lat: 40.3513, lng: 140.0863 },
  { name: '三種町', slug: 'mitane-cho', lat: 40.0367, lng: 140.0459 },
  { name: '八峰町', slug: 'happo-cho', lat: 40.3412, lng: 140.0490 },
  { name: '五城目町', slug: 'gojome-machi', lat: 39.9446, lng: 140.1133 },
  { name: '八郎潟町', slug: 'hachirogata-machi', lat: 39.9419, lng: 140.0699 },
  { name: '井川町', slug: 'ikawa-machi', lat: 39.9017, lng: 140.0935 },
  { name: '大潟村', slug: 'ogata-mura', lat: 39.9500, lng: 140.0300 },
  { name: '美郷町', slug: 'misato-cho', lat: 39.4317, lng: 140.5500 },
  { name: '羽後町', slug: 'ugo-machi', lat: 39.2077, lng: 140.4783 },
  { name: '東成瀬村', slug: 'higashinaruse-mura', lat: 39.1800, lng: 140.6500 },
]

export function getMunicipalityBySlug(slug: string): MunicipalityInfo | undefined {
  return MUNICIPALITY_DATA.find(m => m.slug === slug)
}

export function getMunicipalitySlug(name: string): string | undefined {
  return MUNICIPALITY_DATA.find(m => m.name === name)?.slug
}

export interface PeriodOption {
  value: string
  label: string
}

export const PERIODS: readonly PeriodOption[] = [
  { value: '7', label: '直近1週間' },
  { value: '30', label: '直近1ヶ月' },
  { value: '90', label: '直近3ヶ月' },
  { value: '0', label: '全期間' },
]

export interface Badge {
  min: number
  label: string
  emoji: string
  desc: string
}

// REQ-248 FR-248-06: しきい値は「承認済み（検証済み）投稿数」で数える。
// 以前は stats.myTotal（未承認/却下を含む全投稿数）で駆動しており、未検証投稿を数えて
// しまう Goodhart ホールがあった。ダッシュボードはこのラダーを承認済み数で駆動する。
export const BADGES: readonly Badge[] = [
  { min: 1,  label: 'はじめの一歩',   emoji: '🥉', desc: '承認された初投稿' },
  { min: 5,  label: '探索者',         emoji: '🥈', desc: '承認5件を達成' },
  { min: 10, label: 'ザリガニハンター', emoji: '🥇', desc: '承認10件を達成' },
  { min: 30, label: '秋田の目',        emoji: '🏆', desc: '承認30件を達成' },
]

// ── REQ-248: 貢献レベル / 経験値（XP）エンジンのクライアント定数 ──
// レベル曲線の「単一ソース」。DB（supabase/schema.sql「12-1. 貢献レベル/XP エンジン」の
// xp_for_level / level_for_xp）と厳密に同期させる。XP 自体の算出・付与は DB 権威（改竄不能）で
// 行い、クライアントは get_user_progress の返す xp/level/進捗を表示するだけ。ここはレベル境界の
// 表示計算（例: 任意 xp からのレベル逆算やしきい値表示）用に同じ式を持たせる。
export const XP_LEVEL_COEFF = 25 as const
// DB の xp_daily_cap() と同期（表示・ドキュメント用。実際の上限適用は DB 側）。
export const XP_DAILY_CAP = 120 as const

/** レベル L に到達するのに必要な累積 XP（DB xp_for_level(L)=25*(L-1)*L と同一式）。 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return XP_LEVEL_COEFF * (level - 1) * level
}

/** 累積 XP からレベルを算出（DB level_for_xp と同一式・整数補正付き）。 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1
  // L = floor((C + sqrt(C^2 + 4*C*xp)) / (2C)), C=XP_LEVEL_COEFF
  let level = Math.floor(
    (XP_LEVEL_COEFF + Math.sqrt(XP_LEVEL_COEFF * XP_LEVEL_COEFF + 4 * XP_LEVEL_COEFF * xp)) /
      (2 * XP_LEVEL_COEFF),
  )
  if (level < 1) level = 1
  while (xpForLevel(level + 1) <= xp) level++
  while (level > 1 && xpForLevel(level) > xp) level--
  return level
}

// ── REQ-249: 段階的機能解放（レベル連動アンロック）の宣言的定義 ──
//
// 【最重要原則：市民科学ファースト】中核の貢献機能は「絶対にゲートしない」。
//   投稿・写真添付・位置取得(GPS)・種選択・地図閲覧・コメント・通報は、レベルに関わらず
//   常時利用可能でなければならない（データ収集を減らさないため）。したがってそれらは
//   この表に「載せない」＝未登録キー＝常時解放（isUnlocked が true）で表現する。
//   ゲート対象は「体験を豊かにする拡張・見た目(コスメ)・高度な分析・コレクション」のみ。
//   品質向上・習熟の道具（定点観察 survey_method='structured' / GPS 精度）も、参入障壁に
//   しないため意図的に「非ゲート」に据える（早期＝常時解放）。
//
// 【enforcement の粒度（FR-249-04 / NFR-249-02）】
//   - 'client': クライアント判定（useUnlocks の条件レンダリング）で十分。改竄されても実害は
//     「見た目/自分の・既に公開済みデータの早期利用」に留まり、他者の保護データや課金には触れない。
//   - 'server': 解放が保護データの書き込みや容量/課金に関わるため、DB(RLS/RPC)・middleware でも
//     二重に強制する必要がある。REQ-250 のコレクション（水槽/図鑑の永続化＝書き込み）が該当。
//   ここで 'server' と印を付けた機能を実装する REQ は、UI ゲートに加えサーバー認可を必ず併設する。
//
// 【段階（初期案・運用調整可）】早期=品質/習熟の道具、中盤=コスメ/自己表現、長期=コレクション/演出。
//   数値はしきい値を「ゆるく」置き、既存の活動的な貢献者（REQ-248 でレベルが実績から back-fill 済み）が
//   これまで使えた機能を剥奪されない（NFR-249-03）。新規登録直後の Lv1 のみが軽くゲートされる。
export interface FeatureUnlock {
  /** 解放に必要な貢献レベル（REQ-248）。この表に載らないキー＝常時解放（中核貢献など）。 */
  level: number
  /** 機能名の i18n ラベルキー（4言語で提供）。 */
  labelKey: string
  /** クライアント判定で足りるか、サーバー強制も要るか。 */
  enforcement: 'client' | 'server'
}

// 単一ソース：機能キー → {解放レベル, i18nラベル, enforcement}。REQ-250/251 は行を足すだけで拡張できる。
export const FEATURE_UNLOCKS = {
  // 早期（拡張／高度分析）——現状 UI に接続済みのゲート
  heatmap:              { level: 2, labelKey: 'unlocks.features.heatmap',              enforcement: 'client' },
  // 中盤（コスメ／自己表現）——現状 UI に接続済みのゲート
  avatar_emoji_plus:    { level: 2, labelKey: 'unlocks.features.avatar_emoji_plus',    enforcement: 'client' },
  // 早期（高度分析）——宣言のみ（将来 FilterBar/trends 詳細に接続予定）
  map_filters_advanced: { level: 3, labelKey: 'unlocks.features.map_filters_advanced', enforcement: 'client' },
  // 中盤（自分データの持ち出し）——現状 UI に接続済みのゲート。CSV は「既に公開済み」の投稿列
  //   （粗化座標・PII/精度なし・RLS 準拠）のみを出力するため client 判定で十分（改竄でも公開データの早期取得のみ）。
  csv_export:           { level: 4, labelKey: 'unlocks.features.csv_export',           enforcement: 'client' },
  // 長期（コスメ）——宣言のみ（REQ-251）
  profile_frame:        { level: 5, labelKey: 'unlocks.features.profile_frame',        enforcement: 'client' },
  // 長期（コレクション）——宣言のみ（REQ-250）。水槽/図鑑は状態を永続化＝書き込みのため server 強制が必須。
  collection:           { level: 5, labelKey: 'unlocks.features.collection',           enforcement: 'server' },
  // 長期（演出）——宣言のみ（REQ-251）
  animation_themes:     { level: 6, labelKey: 'unlocks.features.animation_themes',     enforcement: 'client' },
} as const satisfies Record<string, FeatureUnlock>

/** アンロック対象の機能キー（中核貢献はここに含めない＝常時解放）。 */
export type FeatureKey = keyof typeof FEATURE_UNLOCKS

// ── REQ-250: コレクション（図鑑・水槽）の宣言的定数 ──
//
// 図鑑（dex）の「埋まり具合」は DB 権威の get_user_collection（承認済み投稿から導出・改竄不能）が返す
// info_types_seen / municipalities_seen / verified_count と、下記の総数（INFO_TYPES=5 / MUNICIPALITIES=25）で描く。
// 水槽（aquarium）の容量・デコレーションは「DB 権威の level（REQ-248 get_user_progress）」から算出する。
//   level 自体が改竄不能なので、useUnlocks と同じく「定数マップ × 改竄不能な level」で十分に権威的
//   （所有状態＝ user_collection の書き込みはトリガーのみ＝サーバー強制。REQ-249 collection=enforcement:'server'）。

/** 図鑑カードのコンテキスト軸の総数（種ごとにこの分だけ埋まり得る）。 */
export const DEX_INFO_TYPE_TOTAL: number = INFO_TYPES.length          // 5
export const DEX_MUNICIPALITY_TOTAL: number = MUNICIPALITIES.length   // 25

/** コレクション（図鑑・水槽）が解放される貢献レベル（FEATURE_UNLOCKS.collection と同値・単一ソース）。 */
export const COLLECTION_UNLOCK_LEVEL: number = FEATURE_UNLOCKS.collection.level  // 5

export interface AquariumDecoration {
  /** デコレーション識別子（安定キー）。 */
  key: string
  /** 設置が解放される貢献レベル。 */
  level: number
  /** i18n ラベルキー（4言語）。 */
  labelKey: string
  /** 装飾の絵文字（色非依存の識別子・SVG/CSS のみで軽量）。 */
  emoji: string
}

// 水槽デコレーション：レベルで段階解放（REQ-249 の容量/デコ解放をレベルにマップ）。コスメのみ＝実害なし。
export const AQUARIUM_DECORATIONS: readonly AquariumDecoration[] = [
  { key: 'sand',      level: 5, labelKey: 'collection.decorations.sand',      emoji: '🏖️' }, // 🏖️ 砂底
  { key: 'plant',     level: 6, labelKey: 'collection.decorations.plant',     emoji: '🌿' },       // 🌿 水草
  { key: 'rock',      level: 8, labelKey: 'collection.decorations.rock',      emoji: '🪨' },       // 🪨 岩
  { key: 'driftwood', level: 10, labelKey: 'collection.decorations.driftwood', emoji: '🪵' },      // 🪵 流木
] as const

/**
 * 水槽の容量（同時に泳がせられる個体スロット数）。DB 権威の level から算出。
 * 解放前（level<COLLECTION_UNLOCK_LEVEL または不明）は 0。Lv5=2、以後 2 レベルごとに +1、上限 6。
 */
export function aquariumCapacity(level: number | null | undefined): number {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < COLLECTION_UNLOCK_LEVEL) return 0
  return Math.min(6, 2 + Math.floor((level - COLLECTION_UNLOCK_LEVEL) / 2))
}

/** その level で設置解放済みのデコレーション一覧。 */
export function unlockedDecorations(level: number | null | undefined): readonly AquariumDecoration[] {
  if (typeof level !== 'number' || !Number.isFinite(level)) return []
  return AQUARIUM_DECORATIONS.filter((d) => level >= d.level)
}

// ── 投稿制限 ──
export const MAX_PHOTOS = 3 as const
export const MAX_FILE_SIZE: number = 5 * 1024 * 1024 // 5MB
// 原本は選択時に縮小する。Storage の保存上限とは別に、端末で扱う入力を制限する。
export const MAX_INPUT_IMAGE_SIZE: number = 25 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
export const MAX_COMMENT_LENGTH = 500 as const
export const COUNT_MIN = 1 as const
export const COUNT_MAX = 999 as const

// REQ-213 FR-213-07: 入力検証の長さ上限・範囲を 1 箇所に集約し、zod スキーマ
// （src/lib/validation/schemas.ts）と DB CHECK 制約（supabase/schema.sql）の双方が
// 同じ定数を参照できるようにして検証ドリフトを防ぐ。値の正本は DB CHECK 制約であり、
// ここはそれに一致させる（DB より厳しくしない）。
// 通報コメント長（reports.comment <= 500、schema.sql:286）。UI の旧 maxLength 300 ではなく DB 値 500 に統一。
export const MAX_REPORT_COMMENT_LENGTH = 500 as const
// 調査依頼コメント本文長（survey_request_comments.body BETWEEN 1 AND 500、migration:8）
export const MAX_SURVEY_REQUEST_COMMENT_LENGTH = 500 as const
// プロフィール表示名（user_profiles.display_name BETWEEN 1 AND 20、schema.sql:1248）
export const PROFILE_DISPLAY_NAME_MIN = 1 as const
export const PROFILE_DISPLAY_NAME_MAX = 20 as const
// プロフィール自己紹介（user_profiles.bio <= 100、schema.sql:1250）
export const PROFILE_BIO_MAX = 100 as const
// 定点サイト名（survey_sites.name BETWEEN 1 AND 100、schema.sql:1709）
export const SURVEY_SITE_NAME_MIN = 1 as const
export const SURVEY_SITE_NAME_MAX = 100 as const
// 定点サイトメモ（survey_sites.notes <= 500、schema.sql:1714）
export const SURVEY_SITE_NOTES_MAX = 500 as const
// REQ-329: 非公開スポット（private_spots.name は前後の空白を除いて 1〜60 / note <= 500）
export const PRIVATE_SPOT_NAME_MAX = 60 as const
export const PRIVATE_SPOT_NOTE_MAX = 500 as const
// 調査時間（分）（posts.survey_duration_minutes 1〜480、schema.sql:1237）
export const SURVEY_DURATION_MIN = 1 as const
export const SURVEY_DURATION_MAX = 480 as const
// 湿度（posts.humidity 0〜100、schema.sql:37）
export const HUMIDITY_MIN = 0 as const
export const HUMIDITY_MAX = 100 as const
// 緯度経度の物理範囲（posts/survey_requests/survey_sites の lat/lng CHECK と一致）。
// アプリの実用上は AKITA_BOUNDS で更に絞り込むが、DB が保証する物理範囲も定数化しておく。
export const LAT_MIN = -90 as const
export const LAT_MAX = 90 as const
export const LNG_MIN = -180 as const
export const LNG_MAX = 180 as const

// REQ-172: GPS 位置精度（水平精度・メートル）の品質しきい値。
// 種分布モデリング（SDM）では 30m 以下が最低要件（Grady et al. 2026）。
// accuracy <= GOOD は良好(success)、GOOD < accuracy <= WARN は注意(warning)、WARN < accuracy は警告(error)。
// REQ-224 FR-224-05: 表示は色＋アイコン＋テキストの3点セット（緑/黄/赤の素朴な対比に依存しない）。
export const GPS_ACCURACY_GOOD_M = 30 as const
export const GPS_ACCURACY_WARN_M = 50 as const
export const SPAM_LIMIT_POSTS = 5 as const
export const SPAM_LIMIT_WINDOW_MS: number = 24 * 60 * 60 * 1000
export const SPAM_KEY = 'zarigani_submit_timestamps' as const

// ── メール再送クールダウン ──
export const RESEND_COOLDOWN_MS: number = 3 * 60 * 1000

// ── ヒートマップ ──
export const HEATMAP_CONFIG = { radius: 25, blur: 15, maxZoom: 17 } as const

// REQ-258: 密度ヒートマップの強度重み（info_type ごとの「確認の強さ」）。
// 以前は全投稿を一律 0.5 で熱源化していたが、それでは「不在確認（＝見つからなかった地点）」まで
// ホットスポット化してしまい密度表現として誤り。ここで意味のある重みを与える：
//   capture/sighting=強、damage=中、trace=弱、absence=0（熱源に含めない）。
// ※過度な作り込みはしない軽い重み付け。未知の info_type は将来の追加でも点が消えないよう既定値 0.5。
export const HEATMAP_INTENSITY_BY_INFO_TYPE: Readonly<Record<string, number>> = {
  capture: 1.0,   // 捕獲＝直接確認（最も強い）
  sighting: 0.7,  // 目撃＝直接確認
  damage: 0.5,    // 農業被害＝間接だが在を示唆
  trace: 0.3,     // 痕跡＝弱い間接確認
  absence: 0,     // 不在確認＝熱源に含めない（呼び出し側で 0 を除外）
} as const

const HEATMAP_DEFAULT_INTENSITY = 0.5 as const

/**
 * REQ-258: 投稿の info_type から密度ヒートマップの強度（0〜1）を返す。
 * `absence`（不在確認）は 0＝熱源に含めない。呼び出し側で 0 の点を除外すること。
 * 未知の info_type は既定値（0.5）にフォールバックし、点が消えないようにする。
 */
export function heatIntensity(infoType: string): number {
  const w = HEATMAP_INTENSITY_BY_INFO_TYPE[infoType]
  return w === undefined ? HEATMAP_DEFAULT_INTENSITY : w
}

// REQ-258: CPUE（Catch Per Unit Effort＝捕獲努力量あたりの密度）の正規化基準。
// 「1時間あたり何匹確認できたか」を密度の代理指標とし、この基準値で最大熱(1.0)へ正規化する。
// 値は極端値の暴発を抑える上限クリップ用の目安（アメリカザリガニで 1時間 20 匹前後は高密度）。
// 卒研 PF 初期はデータが少ないため保守的な基準を置き、蓄積に応じて運用で調整可能にする。
export const CPUE_HOT_PER_HOUR = 20 as const
// 調査時間（努力量）が無く個体数だけのとき、この個体数で最大熱に達する（努力量ありより緩やかな代理）。
export const CPUE_COUNT_HOT = 30 as const

/**
 * REQ-258: 投稿 1 件の密度ヒートマップ重み（0〜1）を CPUE で補正して返す。
 * leaflet.heat の既定 max=1.0 と同スケールに収め、既存の色帯・凡例をそのまま使えるようにする。
 *
 * ラダー（上から優先。返り値は必ず [0,1] にクリップ）：
 *   1. absence（不在確認・heatIntensity=0）→ 0（熱源に含めない）。
 *   2. count>0 かつ survey_duration_minutes>0 → CPUE ベース。
 *        cpuePerHour = count * 60 / survey_duration_minutes（1時間あたり確認数）
 *        weight = max(info_type 基準, cpuePerHour / CPUE_HOT_PER_HOUR)
 *        ＝努力量/個体数を入れても info_type 基準より暗くはしない（正直な少数報告を罰しない）。
 *   3. count>0（努力量なし）→ max(info_type 基準, count / CPUE_COUNT_HOT) の緩やかな個体数スケール。
 *   4. count も努力量も無い → info_type 基準強度（heatIntensity）にフォールバック。
 * ＝「count/努力量があれば密度で上振れ、無ければ従来どおり」。absence=0 は全ラダーで維持。
 */
export function heatWeight(post: {
  info_type?: string | null
  count?: number | null
  survey_duration_minutes?: number | null
}): number {
  const base = heatIntensity(post.info_type ?? '')
  if (base <= 0) return 0 // absence（不在確認）等は熱源に含めない
  const count =
    typeof post.count === 'number' && Number.isFinite(post.count) && post.count > 0 ? post.count : null
  const durationMin =
    typeof post.survey_duration_minutes === 'number' &&
    Number.isFinite(post.survey_duration_minutes) &&
    post.survey_duration_minutes > 0
      ? post.survey_duration_minutes
      : null

  let weight = base
  if (count !== null && durationMin !== null) {
    const cpuePerHour = (count * 60) / durationMin
    weight = Math.max(base, cpuePerHour / CPUE_HOT_PER_HOUR)
  } else if (count !== null) {
    weight = Math.max(base, count / CPUE_COUNT_HOT)
  }
  // 上限クリップ（極端値の暴発を抑え、既存スケール[0,1]に収める）
  return Math.min(1, Math.max(0, weight))
}

// ── 近くの水域レイヤー（REQ-259 / REQ-264） ──
// クライアントが `/api/nearby-water`（サーバー側 Overpass プロキシ）から取得した水域(池・湖)を
// 青系の塗り/輪郭で強調表示するための設定。radiusM は「近く」の既定半径（サーバー側 MAX_RADIUS_M=3000 以内）。
// style は Leaflet の PathOptions（L.geoJSON の style に渡す）。
export const NEARBY_WATER_CONFIG = {
  radiusM: 1500,
  style: {
    color: '#1d4ed8', // 輪郭（濃い青）
    weight: 2,
    fillColor: '#3b82f6', // 塗り（青）
    fillOpacity: 0.35,
    opacity: 0.9,
  },
} as const

// ── クエリ上限 ──
export const QUERY_LIMITS = {
  posts: 2000,
  municipality: 1000,
  recentPosts: 7,
  municipalityRankTop: 10,
  myPosts: 50,
  adminMunicipalityTop: 7,
  adminMaxMonths: 12,
} as const

// ── 調査依頼 ──
export interface SurveySpeciesOption {
  value: Species | 'unknown'
  label: string
  color: string
  image: string | null
  emoji?: string
}

// REQ-224 FR-224-06: 旧 #F59E0B は「不明(種)」「通常(緊急度)」「募集中(状態)」の3用途で
// 同一値に多重使用され、色から意味が一意に逆引きできなかった。用途別に分離し
// （--state-species-unknown / --state-urgency-* / --state-survey-*）、値も衝突しないよう調整する。
// 「不明(種)」は種色の無彩フォールバック（--species-unknown）に寄せ、amber 群と切り離す。
export const SURVEY_SPECIES: readonly SurveySpeciesOption[] = [
  ...SPECIES,
  { value: 'unknown', label: '不明', color: '#6B7280', image: null },
]

export interface UrgencyOption {
  value: string
  label: string
  color: string
}

// 緊急度: 通常=amber-600 / 急ぎ=orange-600。マーカーは白縁付きで濃色でも視認可。
// 値の正本は --state-urgency-normal / --state-urgency-urgent（FR-224-06）。
export const SURVEY_URGENCY: readonly UrgencyOption[] = [
  { value: 'normal', label: '通常', color: '#D97706' },
  { value: 'urgent', label: '急ぎ', color: '#EA580C' },
]

export interface SurveyStatusOption {
  value: string
  label: string
  color: string
  emoji: string
}

// 調査状態: 募集中=amber-600 / 対応あり=info青 / 解決済み=gray。色＋絵文字＋テキストの3点で識別。
// 値の正本は --state-survey-open / --state-survey-responded / --state-survey-closed（FR-224-06）。
// REQ-322 FR-322-03: 「対応あり」の青は #0369A1（sky-700）だったが、種別色の青 #0072B2 と
// 見分けがつかないまま別の意味を担っていた。青は 1 系統（#0072B2）へ統合する。
// 識別は色ではなく絵文字＋ラベル（🔵 対応あり）で行う（REQ-224 の原則）。
export const SURVEY_STATUS: readonly SurveyStatusOption[] = [
  { value: 'open', label: '募集中', color: '#D97706', emoji: '🟡' },
  { value: 'responded', label: '対応あり', color: '#0072B2', emoji: '🔵' },
  { value: 'closed', label: '解決済み', color: '#4B5563', emoji: '⚫' },
]
export const MAX_SURVEY_REASON_LENGTH = 300 as const
export const SURVEY_DAILY_LIMIT = 3 as const

// ── 天気カテゴリ ──
export const WEATHER_CATEGORIES = ['sunny', 'cloudy', 'overcast', 'rainy', 'snowy', 'thunderstorm', 'unknown'] as const

export function speciesLabel(v: string): string { return SPECIES_BY_VALUE.get(v)?.label ?? v }
export function infoTypeLabel(v: string): string { return INFO_TYPES_BY_VALUE.get(v)?.label ?? v }

/** REQ-325: 地域回答に対応する初期表示範囲（南西・北東）。 */
export const REGION_FIT_BOUNDS: Record<'akita_city' | 'north' | 'central' | 'south' | 'other', [[number, number], [number, number]]> = {
  akita_city: [[39.55, 139.95], [39.85, 140.35]],
  north: [[39.95, 139.69], [40.51, 140.99]],
  central: [[39.35, 139.69], [39.95, 140.60]],
  south: [[38.87, 139.90], [39.40, 140.99]],
  other: AKITA_FIT_BOUNDS,
}
