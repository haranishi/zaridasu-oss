import { describe, it, expect } from 'vitest'
import {
  csvCell,
  buildCsv,
  DATASET_COLUMNS,
  GEOJSON_PROPERTY_COLUMNS,
  SELECT_COLUMNS,
  datasetColumnDocs,
  type PublicDatasetRow,
} from '../route'
import {
  DATASET_FIXTURE_ROWS,
  PUBLISHED_CSV_HEADERS,
  PUBLISHED_GEOJSON_PROPERTY_KEYS,
  FORBIDDEN_PUBLIC_KEYS,
  FORBIDDEN_SELECT_COLUMNS,
  parseCsvRecords,
  csvDataSection,
} from '../../__tests__/fixtures'

// REQ-244 FR-244-03 / AC-03: CSV フォーミュラインジェクション無害化の単体テスト。
// csvCell は数式先頭文字（= + - @ / TAB / CR）で始まる値に `'` を前置し、
// 表計算ソフトでの数式評価を封じる（多層防御の二次線）。通常値は不変（NFR-244-02）。
describe('csvCell (REQ-244 CSV formula-injection neutralization)', () => {
  it('= で始まる値は先頭に アポストロフィ が付く（HYPERLINK ペイロード）', () => {
    expect(csvCell('=HYPERLINK("https://evil.example")')).toBe(
      '"\'=HYPERLINK(""https://evil.example"")"',
    )
  })

  it('= 始まりでカンマ等を含まない値でも無害化される（引用は不要なので付かない）', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
  })

  it('+ / - / @ で始まる値も無害化される', () => {
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-cmd')).toBe("'-cmd")
    expect(csvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)")
  })

  it('TAB / CR で始まる値も無害化される（区切りとして誤解釈され得る先頭制御文字）', () => {
    // TAB は先頭に アポストロフィ が付くが /[",\n\r]/ に非該当なので引用は付かない
    expect(csvCell('\t=1')).toBe("'\t=1")
    // CR は アポストロフィ 前置後に /[",\n\r]/ へ該当するので二重引用符で囲われる
    expect(csvCell('\r=1')).toBe('"' + "'\r=1" + '"')
  })

  it('通常の地名（= 等で始まらない）は視覚的に変化しない（NFR-244-02）', () => {
    expect(csvCell('秋田市')).toBe('秋田市')
    expect(csvCell('雄物川')).toBe('雄物川')
    expect(csvCell('五城目町')).toBe('五城目町')
  })

  it('カンマ・引用符・改行を含む値の従来エスケープは壊れない', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })

  it('数値・null・undefined は従来どおり（null/undefined は空文字）', () => {
    expect(csvCell(39.72)).toBe('39.72')
    expect(csvCell(0)).toBe('0')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('buildCsv 経由でも自由文字列列（locality/water_body/municipality）が無害化される', () => {
    const row: PublicDatasetRow = {
      id: 'id-1',
      observed_at: '2026-06-01T00:00:00Z',
      created_at: '2026-06-01T00:00:00Z',
      species: 'american',
      info_type: 'sighting',
      municipality: '=cmd|calc',
      locality: '=1+1',
      water_body: '@evil',
      lat: 39.72,
      lng: 140.1,
      count: 1,
      survey_method: 'opportunistic',
    }
    const csv = buildCsv([row])
    const dataLine = csv.split('\n').find((l) => l.startsWith('id-1'))!
    expect(dataLine).toContain("'=cmd|calc")
    expect(dataLine).toContain("'=1+1")
    expect(dataLine).toContain("'@evil")
    // 生の数式先頭（前置アポストロフィなし）は出力に現れない
    expect(dataLine).not.toMatch(/,=cmd/)
    expect(dataLine).not.toMatch(/,=1\+1/)
    expect(dataLine).not.toMatch(/,@evil/)
  })
})

// REQ-310 FR-310-01 / AC-01: 公開列の並びは DATASET_COLUMNS 1 本に集約され、
// SELECT_COLUMNS / CSV ヘッダ / CSV 行 / GeoJSON properties / /dataset の説明表がすべてそこから導出される。
describe('DATASET_COLUMNS (REQ-310 公開列定義の単一ソース)', () => {
  it('CSV ヘッダの並びが配布済みデータと同一である（列名・順序を変えない）', () => {
    expect(DATASET_COLUMNS.map((c) => c.header)).toEqual(PUBLISHED_CSV_HEADERS)
  })

  it('SELECT_COLUMNS が列定義から導出され、配布時の SELECT 文字列と完全一致する', () => {
    // REQ-243: 生 lat/lng ではなく display_lat/display_lng を取り、ラベル列（導出値）は SELECT しない。
    expect(SELECT_COLUMNS).toBe(
      'id, observed_at, created_at, species, info_type, municipality, locality, water_body, display_lat, display_lng, count, survey_method',
    )
  })

  it('GeoJSON properties 用の列は座標 2 列を除いた 12 列である（CSV 14 列との差はこの 2 列だけ）', () => {
    expect(GEOJSON_PROPERTY_COLUMNS.map((c) => c.header)).toEqual(PUBLISHED_GEOJSON_PROPERTY_KEYS)
    expect(GEOJSON_PROPERTY_COLUMNS).toHaveLength(12)
    expect(DATASET_COLUMNS).toHaveLength(14)
    // 除外されているのは座標列のみ（他の列が黙って GeoJSON から落ちていない）。
    const excluded = DATASET_COLUMNS.filter((c) => !c.inGeoJson).map((c) => c.header)
    expect(excluded).toEqual(['lat_coarse', 'lng_coarse'])
  })

  it('PII・生座標・高精度手がかりを公開キーに持たない（REQ-230 FR-230-06 / AC-06）', () => {
    const headers = DATASET_COLUMNS.map((c) => c.header)
    for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
      expect(headers).not.toContain(forbidden)
    }
  })

  it('PII・生座標・自由記述・画像 URL を SELECT すらしない（REQ-230 FR-230-06 / REQ-243）', () => {
    const selects: string[] = DATASET_COLUMNS.flatMap((c) => (c.select === null ? [] : [c.select]))
    for (const forbidden of FORBIDDEN_SELECT_COLUMNS) {
      expect(selects).not.toContain(forbidden)
    }
    // 座標は必ず公開レベル反映済みの display_* から取る（生 lat/lng を使わない）。
    expect(selects).toContain('display_lat')
    expect(selects).toContain('display_lng')
  })

  it('すべての列に説明が付いている（説明表が静かに陳腐化しない）', () => {
    const documentedHeaders = new Set<string>()
    for (const doc of datasetColumnDocs()) {
      expect(doc.description.length).toBeGreaterThan(0)
      for (const header of doc.name.split(' / ')) documentedHeaders.add(header)
    }
    expect([...documentedHeaders].sort()).toEqual([...PUBLISHED_CSV_HEADERS].sort())
  })

  it('説明表は code/label の対を 1 行にまとめた 11 行のまま（/dataset の表示が変わらない）', () => {
    expect(datasetColumnDocs().map((d) => d.name)).toEqual([
      'id',
      'observed_at',
      'created_at',
      'species_code / species_label_ja',
      'info_type_code / info_type_label_ja',
      'municipality',
      'locality',
      'water_body',
      'lat_coarse / lng_coarse',
      'count',
      'survey_method',
    ])
  })
})

// REQ-310 FR-310-02 / AC-02: ヘッダと行の**位置対応**を固定する。
// DATASET_COLUMNS の並びを意図的にずらすと、下の期待値（配布済みの契約）と食い違って fail する。
describe('buildCsv の列対応 (REQ-310 FR-310-02)', () => {
  const csv = buildCsv(DATASET_FIXTURE_ROWS)
  const records = parseCsvRecords(csvDataSection(csv))
  const headerRecord = records[0] ?? []
  const dataRecords = records.slice(1)

  /** n 行目のデータ行を「ヘッダ名 → セル値」の対応表にする（＝セル位置の検証）。 */
  const cellsOf = (index: number): Record<string, string> => {
    const record = dataRecords[index] ?? []
    return Object.fromEntries(headerRecord.map((header, i) => [header, record[i] ?? '']))
  }

  it('ヘッダ行が配布済みの 14 列である', () => {
    expect(headerRecord).toEqual([...PUBLISHED_CSV_HEADERS])
  })

  it('ヘッダの列数とすべてのデータ行の列数が一致する（引用符内のカンマ・改行を含む行も）', () => {
    expect(dataRecords).toHaveLength(DATASET_FIXTURE_ROWS.length)
    for (const record of dataRecords) {
      expect(record).toHaveLength(headerRecord.length)
    }
  })

  it('各セル位置の値がヘッダ名どおりである（1 行分すべてのヘッダ → 値の対応）', () => {
    const cells = cellsOf(0)
    expect(cells).toEqual({
      id: 'row-full',
      observed_at: '2026-06-01T09:30:00.000Z',
      created_at: '2026-06-02T01:02:03.000Z',
      species_code: 'american',
      species_label_ja: 'アメリカザリガニ',
      info_type_code: 'sighting',
      info_type_label_ja: '目撃',
      municipality: '秋田市',
      locality: '広面字鍋沼',
      water_body: '雄物川',
      lat_coarse: '39.72',
      lng_coarse: '140.1',
      count: '3',
      survey_method: 'structured',
    })
  })

  it('nullable 列がすべて null の行でも、空セルの位置が保たれる', () => {
    const cells = cellsOf(1)
    expect(cells).toEqual({
      id: 'row-nulls',
      observed_at: '',
      created_at: '2026-06-03T00:00:00.000Z',
      species_code: 'bullfrog',
      species_label_ja: 'ウシガエル',
      info_type_code: 'absence',
      info_type_label_ja: '不在確認',
      municipality: '',
      locality: '',
      water_body: '',
      // 負値は先頭 `-` が数式トリガーのため REQ-244 の前置アポストロフィが付く（従来動作）。
      lat_coarse: "'-0.001",
      lng_coarse: '0',
      count: '',
      survey_method: '',
    })
  })

  it('カンマ・引用符・改行を含む値でも、後続列の位置がずれない', () => {
    const cells = cellsOf(2)
    expect(cells.locality).toBe('a,b"c\nd')
    expect(cells.water_body).toBe("'@evil")
    expect(cells.lat_coarse).toBe('40.5')
    expect(cells.survey_method).toBe('opportunistic')
  })

  it('リファクタ前（列定義の単一ソース化以前）と 1 バイトも変わらない CSV を出力する', () => {
    // 単一ソース化コミット直前の実装が出力したテキストをそのまま貼った golden。
    // 公開済みオープンデータの互換性（列名・列順・値の表現・エスケープ）を固定する。
    expect(csvDataSection(csv)).toBe(
      [
        'id,observed_at,created_at,species_code,species_label_ja,info_type_code,info_type_label_ja,municipality,locality,water_body,lat_coarse,lng_coarse,count,survey_method',
        'row-full,2026-06-01T09:30:00.000Z,2026-06-02T01:02:03.000Z,american,アメリカザリガニ,sighting,目撃,秋田市,広面字鍋沼,雄物川,39.72,140.1,3,structured',
        "row-nulls,,2026-06-03T00:00:00.000Z,bullfrog,ウシガエル,absence,不在確認,,,,'-0.001,0,,",
        'row-injection,2026-01-31T23:59:59.000Z,2026-02-01T00:00:00.000Z,unknown-species,unknown-species,unknown-type,unknown-type,\'=cmd|calc,"a,b""c\nd",\'@evil,40.5,141.25,0,opportunistic',
      ].join('\n'),
    )
  })

  it('ヘッダ行の前にライセンス等の `#` メタ行が残っている（REQ-230 NFR-230-03）', () => {
    const lines = csv.split('\n')
    const headerIndex = lines.findIndex((l) => !l.startsWith('#'))
    expect(headerIndex).toBe(6)
    expect(lines[headerIndex]).toBe(PUBLISHED_CSV_HEADERS.join(','))
    expect(lines.slice(0, headerIndex).join('\n')).toContain('# License: CC BY 4.0')
    expect(lines.slice(0, headerIndex).join('\n')).toContain(`/ Records: ${DATASET_FIXTURE_ROWS.length}`)
  })

  it('0 行でもヘッダ行だけは出る（空データセットが列定義を失わない）', () => {
    const records = parseCsvRecords(csvDataSection(buildCsv([])))
    expect(records).toHaveLength(1)
    expect(records[0]).toEqual([...PUBLISHED_CSV_HEADERS])
  })
})
