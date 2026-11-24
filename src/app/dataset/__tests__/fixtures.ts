/**
 * REQ-310: CSV / GeoJSON の出力を固定するための共有フィクスチャ。
 *
 * CSV テストと GeoJSON テストが**同じ行**を使うことで、「CSV と GeoJSON が同一の列定義から
 * 導出されている」ことを両側の期待値の対応関係として読めるようにする。
 * 網羅している性質: 全項目あり／全 nullable が null／CSV 無害化と引用が必要な値／未知の種・情報種別。
 */
import type { PublicDatasetRow } from '../zaridasu.csv/route'

export const DATASET_FIXTURE_ROWS: PublicDatasetRow[] = [
  // 全項目が埋まった標準的な行。
  {
    id: 'row-full',
    observed_at: '2026-06-01T09:30:00.000Z',
    created_at: '2026-06-02T01:02:03.000Z',
    species: 'american',
    info_type: 'sighting',
    municipality: '秋田市',
    locality: '広面字鍋沼',
    water_body: '雄物川',
    lat: 39.72,
    lng: 140.1,
    count: 3,
    survey_method: 'structured',
  },
  // nullable な列がすべて null の行。負値座標（先頭 `-` は CSV 数式トリガー）も含む。
  {
    id: 'row-nulls',
    observed_at: null,
    created_at: '2026-06-03T00:00:00.000Z',
    species: 'bullfrog',
    info_type: 'absence',
    municipality: null,
    locality: null,
    water_body: null,
    lat: -0.001,
    lng: 0,
    count: null,
    survey_method: null,
  },
  // REQ-244: 数式インジェクション・区切り文字・改行を含む値。未知コードはラベル未解決でコードのまま出る。
  {
    id: 'row-injection',
    observed_at: '2026-01-31T23:59:59.000Z',
    created_at: '2026-02-01T00:00:00.000Z',
    species: 'unknown-species',
    info_type: 'unknown-type',
    municipality: '=cmd|calc',
    locality: 'a,b"c\nd',
    water_body: '@evil',
    lat: 40.5,
    lng: 141.25,
    count: 0,
    survey_method: 'opportunistic',
  },
]

/**
 * REQ-310 AC-01 / 対象外方針: **既に配布済み**の CSV 列の並び（14 列）。
 * 研究利用側が既にこの並びで集計しているため、リファクタで 1 バイトも変えてはならない。
 * この配列は列定義（`DATASET_COLUMNS`）とは独立に手書きしてある＝実装の写しではなく「配布物の契約」。
 */
export const PUBLISHED_CSV_HEADERS: readonly string[] = [
  'id',
  'observed_at',
  'created_at',
  'species_code',
  'species_label_ja',
  'info_type_code',
  'info_type_label_ja',
  'municipality',
  'locality',
  'water_body',
  'lat_coarse',
  'lng_coarse',
  'count',
  'survey_method',
]

/** REQ-310: 既に配布済みの GeoJSON `properties` のキー（12 個。座標は geometry 側なので持たない）。 */
export const PUBLISHED_GEOJSON_PROPERTY_KEYS: readonly string[] = PUBLISHED_CSV_HEADERS.filter(
  (h) => h !== 'lat_coarse' && h !== 'lng_coarse',
)

/**
 * REQ-310 / REQ-230 FR-230-06: 公開配布物の**出力キー**に決して現れてはならない名前。
 * `display_lat` / `display_lng` は取得元の列名であって公開キー名ではない
 * （公開キーは粗化済みであることが分かる `lat_coarse` / `lng_coarse`）。
 */
export const FORBIDDEN_PUBLIC_KEYS: readonly string[] = [
  'lat',
  'lng',
  'display_lat',
  'display_lng',
  'accuracy',
  'comment',
  'photos',
  'audio_url',
  'user_id',
  'reporter_ip',
  'email',
  'is_anonymous',
  'location_disclosure',
]

/**
 * REQ-230 FR-230-06: **取得すらしてはならない** DB 列（PII・高精度手がかり・自由記述・画像 URL・生座標）。
 * 出力段で落とすのではなく SELECT に載せないことが方針（REQ-243 で生 lat/lng は列 GRANT からも剥奪済み）。
 */
export const FORBIDDEN_SELECT_COLUMNS: readonly string[] = [
  'lat',
  'lng',
  'accuracy',
  'comment',
  'photos',
  'audio_url',
  'user_id',
  'reporter_ip',
  'is_anonymous',
]

/**
 * CSV テキストをレコード配列へパースする（RFC 4180 相当の最小実装）。
 * 引用符内のカンマ・改行・エスケープ済み二重引用符を正しく扱うので、**セル位置**の検証に使える。
 */
export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n') {
      record.push(field)
      field = ''
      records.push(record)
      record = []
    } else {
      field += ch
    }
  }
  record.push(field)
  records.push(record)
  return records
}

/** ライセンス等のコメント行（`#` 始まり）を落として、ヘッダ行以降だけを返す。 */
export function csvDataSection(csv: string): string {
  const lines = csv.split('\n')
  const headerIndex = lines.findIndex((l) => !l.startsWith('#'))
  return lines.slice(headerIndex).join('\n')
}
