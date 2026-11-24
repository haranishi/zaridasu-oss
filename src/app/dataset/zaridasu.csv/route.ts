/**
 * REQ-230 (FR-230-02 / FR-230-03 / FR-230-06): オープンデータ公開用 CSV 配布エンドポイント。
 *
 * - 公開（ログイン不要）・anon クライアント（cookie 非依存）で `status='approved'` のみ取得。
 * - **位置情報は粗化（COORD_DECIMALS=3 桁≒約111m グリッド）して出力し、生 lat/lng は出さない。**
 * - PII（user_id / メール / reporter_ip / accuracy / 自由記述 comment / photos）は一切含めない。
 *
 * 本ファイルは CSV・GeoJSON・/dataset ページで**粗化と列構成を一貫**させるための単一の正本
 * （single source of truth）として、共有ヘルパ（coarsenCoord / fetchPublicDataset /
 * DATASET_* 定数）を named export し、`zaridasu.geojson/route.ts` と `page.tsx` から再利用する。
 * NFR-230-02（粗化の一貫性・不可逆性）を 1 箇所のロジックで担保する。
 */
import { NextRequest } from 'next/server'
import { csvCell } from '@/lib/csv'
import { createAnonClient } from '@/lib/supabase/anon'
import { speciesLabel, infoTypeLabel, SPECIES, MUNICIPALITIES, BASE_URL } from '@/lib/constants'
import type { Species } from '@/types'
import type { Database } from '@/types/database.types'
import { logError } from '@/lib/errorHandler'
import { PUBLIC_POST_STATUS } from '@/lib/data/posts'

/**
 * REQ-245 FR-245-02: 1 リクエストで取得できる行数。Supabase `[api] max_rows`（config.toml:17）と
 * 一致させる。これを超える `.range()` を投げても PostgREST 側で max_rows 行に切られるため、
 * PAGE_SIZE は max_rows 以下（＝1000）でなければページングが破綻する。
 */
const DATASET_PAGE_SIZE = 1000

/**
 * REQ-245 FR-245-02 / FR-245-03: 公開データセット取得の絶対上限（安全弁）。
 * 市民科学 PF の現実的な承認件数を大きく上回る値。無制限ページングによる関数実行時間・
 * メモリ・DB 到達コストの暴発（DoS 相当）を防ぐ。**到達時は silent truncation にせず logError で
 * 警告**し、runbook（docs/runbooks/dataset-og-rate-limiting.md）に沿って上限見直し/プラットフォーム側
 * レート制限を検討する。
 */
const DATASET_MAX_ROWS = 100_000

// REQ-230 NFR-230-05: area/[municipality]（revalidate=86400）と同等の日次更新方針。
// 分布は時間単位で変わらないため日次キャッシュで egress / 関数実行を抑える。
export const revalidate = 86400

/**
 * REQ-230 FR-230-03 / NFR-230-02: 公開座標の粗化精度（小数点以下の桁数）。
 *
 * 3 桁 ≒ 約 111m グリッド。端末 GPS の生座標（数 m〜30m）から自宅・私有地・希少種の
 * 採集地点が特定できる精度を不可逆に落としつつ、種分布の地域傾向は残す妥協点。
 * 値を上げる（4 桁≒11m）と特定リスクが上がり、下げる（2 桁≒1.1km）と研究有用性が落ちる。
 */
export const COORD_DECIMALS = 3

/**
 * REQ-230 FR-230-03 / NFR-230-02: 緯度経度を COORD_DECIMALS 桁へ粗化する。
 *
 * `Math.round(v * 10^d) / 10^d` で下位桁を**捨てる不可逆な丸め**。粗化前の生座標は復元できない。
 * 不正値（null/undefined/NaN/Infinity）は null を返し、呼び出し側で当該行を除外させる
 * （壊れた座標を 0,0 等で公開しない）。
 */
export function coarsenCoord(value: number | null | undefined, decimals: number = COORD_DECIMALS): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** 粗化精度の人間向け説明（≒メートル）。/dataset ページとファイルヘッダで共有表記する。 */
export const COORD_PRECISION_LABEL = `小数第${COORD_DECIMALS}位（約111mグリッド）に粗化`
export const COORD_PRECISION_LABEL_EN = `coarsened to ${COORD_DECIMALS} decimal places (~111m grid)`

/** 公開データのライセンス（FR-230-04）。REQ-229 の Dataset.license に供給する確定値。 */
export const DATASET_LICENSE_NAME = 'CC BY 4.0'
export const DATASET_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'

export interface PublicDatasetRow {
  id: string
  observed_at: string | null
  created_at: string
  species: string
  info_type: string
  municipality: string | null
  locality: string | null
  water_body: string | null
  /** 粗化済み緯度（COORD_DECIMALS 桁）。粗化に失敗した行は除外されるため非 null。 */
  lat: number
  /** 粗化済み経度（COORD_DECIMALS 桁）。 */
  lng: number
  count: number | null
  survey_method: 'structured' | 'opportunistic' | null
}

/** `posts` テーブルの実在する列名（DatasetColumn.select の妥当性をコンパイル時に検査するため）。 */
type PostsColumn = keyof Database['public']['Tables']['posts']['Row']

/**
 * REQ-310 FR-310-01: /dataset の「収録項目」表で 1 行にまとめる単位。
 *
 * **同じオブジェクト（参照が同一）を `doc` に指定した列は説明表の 1 行に集約される。**
 * `description` が必須フィールドなので、列を足すと必ず説明も一緒に書くことになり
 * 「説明の付いていない列」が構造的に発生しない。
 */
export interface DatasetColumnDoc {
  description: string
}

/**
 * REQ-310 FR-310-01: 公開データセットの 1 列の定義（**列に関する唯一の正本**）。
 *
 * ヘッダ名・SELECT 断片・値の取り出し方・GeoJSON への出し分け・利用者向け説明を 1 つのオブジェクトに束ね、
 * `SELECT_COLUMNS` / CSV ヘッダ / CSV 行 / GeoJSON `properties` / `/dataset` の説明表を**すべてここから導出**する。
 * ヘッダと値が同じ要素から出るため、列を挿入・並べ替えしても**ラベルと値がずれることが起こり得ない**
 * （従来はヘッダ配列と行組み立てが独立した 2 本のリストで、順序一致がコンパイル時に保証されていなかった）。
 */
export interface DatasetColumn {
  /** CSV ヘッダ名 兼 GeoJSON `properties` のキー。**配布済みデータとの互換キーなので改名・並べ替えをしない**。 */
  header: string
  /**
   * PostgREST に投げる `posts` の列名。`null` は DB 列を持たない導出列（ラベル等）。
   *
   * `PostsColumn` に縛ることで、存在しない列名を書くとコンパイルエラーになる
   * （SELECT がリテラル文字列だった頃に supabase-js の型推論が担っていた検査を、
   * 導出後も型で維持する。列の綴り間違いが実行時 500 になるのを防ぐ）。
   */
  select: PostsColumn | null
  /** 行から当該列の値を取り出す。CSV は `csvCell` を通し、GeoJSON はそのまま `properties` に入れる。 */
  get: (row: PublicDatasetRow) => string | number | null
  /**
   * GeoJSON の `properties` にも出すか。
   * 座標（lat_coarse / lng_coarse）は RFC 7946 の `geometry.coordinates` が持つため `false`。
   * **CSV 14 列と GeoJSON 12 プロパティの差は、このフラグだけで説明される。**
   */
  inGeoJson: boolean
  /** `/dataset` の説明表の行。同一オブジェクトを共有する列は 1 行にまとめられる。 */
  doc: DatasetColumnDoc
}

// 説明表で 1 行にまとめる列（code 値とラベルの対、緯度と経度）は同じ doc オブジェクトを共有する。
const DOC_ID: DatasetColumnDoc = { description: '投稿の一意な識別子（UUID）' }
const DOC_OBSERVED_AT: DatasetColumnDoc = { description: '観察日時（ISO 8601）。投稿時に申告された実際の観察時刻' }
const DOC_CREATED_AT: DatasetColumnDoc = { description: '投稿（登録）日時（ISO 8601）' }
const DOC_SPECIES: DatasetColumnDoc = { description: '種コード（american / bullfrog）と日本語ラベル' }
const DOC_INFO_TYPE: DatasetColumnDoc = {
  description: '情報種別コード（sighting / capture / trace / damage / absence）と日本語ラベル',
}
const DOC_MUNICIPALITY: DatasetColumnDoc = { description: '市区町村名（秋田県内）' }
const DOC_LOCALITY: DatasetColumnDoc = { description: '字（あざ）など、より細かい地名（付与できた場合のみ）' }
const DOC_WATER_BODY: DatasetColumnDoc = { description: '水系・河川・湖沼などの名称（付与できた場合のみ）' }
const DOC_COORD: DatasetColumnDoc = {
  description: `粗化済みの緯度・経度。${COORD_PRECISION_LABEL}。正確な地点ではありません`,
}
const DOC_COUNT: DatasetColumnDoc = { description: '観察された個体数（申告値。空欄あり）' }
const DOC_SURVEY_METHOD: DatasetColumnDoc = {
  description: '調査手法（structured=定点反復 / opportunistic=機会記録 / 空欄=旧データ）',
}

/**
 * REQ-230 FR-230-06 / REQ-310 FR-310-01: 公開データセットの列（**この配列の順序が配布物の列順**）。
 *
 * PII（user_id / reporter_ip / メール）・高精度手がかり（accuracy）・自由記述（comment）・
 * 画像 URL（photos）は**列自体を持たない**（SELECT もしないので取得すらしない）。
 * REQ-243: 生 lat/lng は anon から列 GRANT で剥奪済み。公開レベル反映済みの display_lat/display_lng を
 * 取得し、`fetchPublicDataset` が coarsenCoord で 3 桁へ丸める（coarsened は冪等、precise でも公開データは
 * 3 桁に統一、hidden は NULL → 行除外）。
 *
 * **既に配布済みのオープンデータとの互換性のため、既存列の並び・名前・値の意味を変えないこと。**
 * 列の追加は末尾に足す（研究利用側の集計を壊さないため）。
 */
export const DATASET_COLUMNS: readonly DatasetColumn[] = [
  { header: 'id', select: 'id', get: (r) => r.id, inGeoJson: true, doc: DOC_ID },
  { header: 'observed_at', select: 'observed_at', get: (r) => r.observed_at, inGeoJson: true, doc: DOC_OBSERVED_AT },
  { header: 'created_at', select: 'created_at', get: (r) => r.created_at, inGeoJson: true, doc: DOC_CREATED_AT },
  { header: 'species_code', select: 'species', get: (r) => r.species, inGeoJson: true, doc: DOC_SPECIES },
  // ラベル列は DB に無い導出値（select: null）。i18n に依存しない安定キー（code）と人間向け ja ラベルを両方出す。
  { header: 'species_label_ja', select: null, get: (r) => speciesLabel(r.species), inGeoJson: true, doc: DOC_SPECIES },
  { header: 'info_type_code', select: 'info_type', get: (r) => r.info_type, inGeoJson: true, doc: DOC_INFO_TYPE },
  {
    header: 'info_type_label_ja',
    select: null,
    get: (r) => infoTypeLabel(r.info_type),
    inGeoJson: true,
    doc: DOC_INFO_TYPE,
  },
  { header: 'municipality', select: 'municipality', get: (r) => r.municipality, inGeoJson: true, doc: DOC_MUNICIPALITY },
  { header: 'locality', select: 'locality', get: (r) => r.locality, inGeoJson: true, doc: DOC_LOCALITY },
  { header: 'water_body', select: 'water_body', get: (r) => r.water_body, inGeoJson: true, doc: DOC_WATER_BODY },
  // 座標は GeoJSON では geometry.coordinates が持つため properties には出さない（inGeoJson: false）。
  { header: 'lat_coarse', select: 'display_lat', get: (r) => r.lat, inGeoJson: false, doc: DOC_COORD },
  { header: 'lng_coarse', select: 'display_lng', get: (r) => r.lng, inGeoJson: false, doc: DOC_COORD },
  { header: 'count', select: 'count', get: (r) => r.count, inGeoJson: true, doc: DOC_COUNT },
  { header: 'survey_method', select: 'survey_method', get: (r) => r.survey_method, inGeoJson: true, doc: DOC_SURVEY_METHOD },
]

/** REQ-310 FR-310-01: GeoJSON `properties` に出す列（座標は geometry 側なので除く）。 */
export const GEOJSON_PROPERTY_COLUMNS: readonly DatasetColumn[] = DATASET_COLUMNS.filter((c) => c.inGeoJson)

/**
 * REQ-230 FR-230-06: 公開配布物に含める列のみを SELECT する（列定義から導出）。
 * 導出列（select: null）は DB に問い合わせない。
 * テストが**配布互換の SELECT 文字列**を固定できるよう named export する。
 */
export const SELECT_COLUMNS = DATASET_COLUMNS.map((c) => c.select)
  .filter((s): s is PostsColumn => s !== null)
  .join(', ')

/**
 * REQ-310 FR-310-01: `/dataset` の「収録項目」表を列定義から導出する。
 *
 * `doc` の参照が同じ列を 1 行にまとめ、行名はヘッダを ' / ' で連結して作る
 * （例: `species_code / species_label_ja`）。`doc` は必須フィールドなので**説明の付いていない列は存在し得ない**。
 * Map は挿入順を保つため、表の行順は列定義の並び（＝配布物の列順）と一致する。
 */
export function datasetColumnDocs(): Array<{ name: string; description: string }> {
  const groups = new Map<DatasetColumnDoc, string[]>()
  for (const column of DATASET_COLUMNS) {
    const headers = groups.get(column.doc)
    if (headers) headers.push(column.header)
    else groups.set(column.doc, [column.header])
  }
  return [...groups].map(([doc, headers]) => ({ name: headers.join(' / '), description: doc.description }))
}

export interface DatasetFilters {
  from?: string | null
  to?: string | null
  species?: string | null
  municipality?: string | null
}

/** 妥当な日付文字列のみを返す（不正値は null）。後段の `new Date(...).toISOString()` の RangeError を防ぐ。 */
function validDate(v: string | null): string | null {
  if (!v) return null
  return Number.isNaN(new Date(v).getTime()) ? null : v
}

/** クエリ文字列を許可値で検証した DatasetFilters に正規化する（未知の種・自治体・不正日付は無視＝全件）。 */
export function parseDatasetFilters(searchParams: URLSearchParams): DatasetFilters {
  const species = searchParams.get('species')
  const municipality = searchParams.get('municipality')
  return {
    from: validDate(searchParams.get('from')),
    to: validDate(searchParams.get('to')),
    species: species && SPECIES.some((s) => s.value === species) ? species : null,
    municipality: municipality && MUNICIPALITIES.includes(municipality) ? municipality : null,
  }
}

/**
 * REQ-230 FR-230-02 / NFR-230-01 / NFR-230-02:
 * approved のみをサーバ側 anon クライアントで取得し、**粗化済み・PII 非含有**の行配列にして返す。
 * 粗化に失敗（座標が壊れている）した行は除外する。env 未設定時は空配列（fail-open）。
 */
export async function fetchPublicDataset(filters: DatasetFilters = {}): Promise<PublicDatasetRow[]> {
  const supabase = createAnonClient()
  if (!supabase) return []

  const rows: PublicDatasetRow[] = []

  // REQ-245 FR-245-02: レンジ指定のページネーションで **全件** 取得する。
  // 従来は単発クエリ（limit 無し）で、承認投稿が max_rows（=1000）を超えると PostgREST が黙って
  // 1000 行に切り詰め、CSV/GeoJSON が不完全になっていた（オープンデータの再現性を損なう）。
  // 短いページ（< DATASET_PAGE_SIZE）が返るまで offset を進め、DATASET_MAX_ROWS を絶対上限とする。
  for (let offset = 0; offset < DATASET_MAX_ROWS; offset += DATASET_PAGE_SIZE) {
    // Supabase のクエリビルダは await 後に再利用できないため、ページごとに組み直す。
    let query = supabase
      .from('posts')
      .select(SELECT_COLUMNS)
      .eq('status', PUBLIC_POST_STATUS)

    if (filters.from) query = query.gte('created_at', new Date(filters.from).toISOString())
    if (filters.to) {
      const toDate = new Date(filters.to)
      toDate.setDate(toDate.getDate() + 1) // 終了日を含める（< 翌日 0 時）
      query = query.lt('created_at', toDate.toISOString())
    }
    // parseDatasetFilters が SPECIES で検証済み（未知値は null）のため enum へ狭める。
    if (filters.species) query = query.eq('species', filters.species as Species)
    if (filters.municipality) query = query.eq('municipality', filters.municipality)

    // 安定ページングのため一意キー id を第 2 ソートに加える。observed_at は重複・NULL を含み
    // 単独では総順序が一意に定まらず、ページ境界で行の重複・欠落が起き得る（再現性の破綻）。
    const { data, error } = await query
      .order('observed_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + DATASET_PAGE_SIZE - 1)

    // 途中失敗は既存方針どおり fail-open（取得済みの分だけ返す。初回失敗なら空配列）。
    if (error || !data) break

    // REQ-310 FR-310-01: SELECT_COLUMNS が列定義からの導出（＝リテラル型でない `string`）になったため、
    // supabase-js は select 文字列から行の型を推論できず data を GenericStringError[] とみなす。
    // 直後の各フィールドは元々個別に `as` で読み出しており PostgREST の推論に依存していないので、
    // unknown 経由の再解釈で実害はない（安全性は下の逐一の型注釈と PublicDatasetRow が担保する）。
    for (const p of data as unknown as Array<Record<string, unknown>>) {
      // REQ-243 / NFR-230-02: 公開レベル反映済みの display_lat/lng を粗化してからのみ採用。
      // hidden 記録は display_* が NULL のため coarsenCoord が null を返し、行が除外される（座標非公開）。
      const lat = coarsenCoord(p.display_lat as number | null)
      const lng = coarsenCoord(p.display_lng as number | null)
      if (lat == null || lng == null) continue
      rows.push({
        id: String(p.id),
        observed_at: (p.observed_at as string | null) ?? null,
        created_at: String(p.created_at),
        species: String(p.species),
        info_type: String(p.info_type),
        municipality: (p.municipality as string | null) ?? null,
        locality: (p.locality as string | null) ?? null,
        water_body: (p.water_body as string | null) ?? null,
        lat,
        lng,
        count: (p.count as number | null) ?? null,
        survey_method: (p.survey_method as PublicDatasetRow['survey_method']) ?? null,
      })
    }

    // 短いページ＝最終ページ。ここで全件取得完了。
    if (data.length < DATASET_PAGE_SIZE) break

    // フルページのまま絶対上限に達した＝続きが残っている可能性が高い。silent truncation を避け警告する。
    if (offset + DATASET_PAGE_SIZE >= DATASET_MAX_ROWS) {
      logError(
        new Error(
          `fetchPublicDataset: reached DATASET_MAX_ROWS cap (${DATASET_MAX_ROWS}); dataset may be truncated. ` +
            `See docs/runbooks/dataset-og-rate-limiting.md`,
        ),
        'dataset:fetchPublicDataset',
      )
    }
  }

  return rows
}

// REQ-244 FR-244-03: CSV セルのエスケープ（数式先頭文字の無害化＋引用）。実装は lib/csv.ts に移した
// （管理画面の CSV でも同じ規則を使うため・REQ-329）。挙動は移す前と同一で、テストのためここからも export する。
export { csvCell }

/** REQ-310 FR-310-01: CSV ヘッダ行は列定義から導出する（行組み立てと同じ配列を走査するので位置ずれが起きない）。 */
const CSV_HEADERS: readonly string[] = DATASET_COLUMNS.map((c) => c.header)

/** REQ-230 NFR-230-03: 機械処理が `#` 始まりのメタ行を読み飛ばせるよう、ヘッダ前にコメント行を置く。 */
function csvLicenseHeader(updatedISO: string, rowCount: number): string {
  return [
    `# ザリダス オープンデータ（外来生物 市民科学 観察データ / 秋田県）`,
    `# License: ${DATASET_LICENSE_NAME} ${DATASET_LICENSE_URL}`,
    `# Attribution: ザリダス（出典 ${BASE_URL}/dataset）`,
    `# Coordinates: ${COORD_PRECISION_LABEL} / ${COORD_PRECISION_LABEL_EN}`,
    `# Note: 市民科学による任意投稿（非悉皆・観察努力に偏りあり）。status=approved のみ収録。座標は正確な地点ではありません。`,
    `# Generated: ${updatedISO} / Records: ${rowCount}`,
  ].join('\n')
}

/**
 * REQ-230 NFR-230-03: 機械可読性のため UTF-8（BOM 無し）・カンマ区切り・ヘッダ行付き。
 * species/info_type はコード値（機械用）とラベル（人間用 ja）を両方出す（i18n に依存しない安定キー）。
 *
 * REQ-310 FR-310-01: ヘッダ行もデータ行も `DATASET_COLUMNS` を同じ順に走査して作る。
 * ヘッダ名と値が同一要素（header / get）から出るため、**列の挿入で両者がずれることが起こらない**。
 */
export function buildCsv(rows: PublicDatasetRow[]): string {
  const updatedISO = new Date().toISOString()
  const lines: string[] = [csvLicenseHeader(updatedISO, rows.length)]
  lines.push(CSV_HEADERS.join(','))
  for (const r of rows) {
    lines.push(DATASET_COLUMNS.map((c) => csvCell(c.get(r))).join(','))
  }
  return lines.join('\n')
}

export async function GET(request: NextRequest) {
  const filters = parseDatasetFilters(request.nextUrl.searchParams)
  const rows = await fetchPublicDataset(filters)
  const csv = buildCsv(rows)

  return new Response(csv, {
    headers: {
      // REQ-230 FR-230-02: CSV の Content-Type。
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zaridasu-open-data.csv"',
      // 日次の鮮度（NFR-230-05）。CDN で再検証しつつ陳腐化を許容。
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
