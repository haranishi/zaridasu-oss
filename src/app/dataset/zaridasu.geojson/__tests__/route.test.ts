/**
 * REQ-310 FR-310-03 / AC-03: `buildGeoJson` のテスト（従来 geojson 側にはテストが無かった）。
 *
 * 守る不変条件は 3 つ。
 * 1. RFC 7946 の座標順（`[lng, lat]`）— 反転すると地図上で秋田県が中国大陸に出る
 * 2. `properties` のキー集合が CSV と同じ列定義から導出され、配布済みの 12 キーと一致すること
 * 3. `properties` に生座標・PII・accuracy が入らないこと（route.ts のコメントで宣言している不変条件）
 */
import { describe, it, expect } from 'vitest'
import { buildGeoJson } from '../route'
import {
  COORD_DECIMALS,
  DATASET_LICENSE_NAME,
  DATASET_LICENSE_URL,
  GEOJSON_PROPERTY_COLUMNS,
} from '../../zaridasu.csv/route'
import { PUBLIC_POST_STATUS } from '@/lib/data/posts'
import {
  DATASET_FIXTURE_ROWS,
  PUBLISHED_GEOJSON_PROPERTY_KEYS,
  FORBIDDEN_PUBLIC_KEYS,
} from '../../__tests__/fixtures'

describe('buildGeoJson (REQ-310 FR-310-03)', () => {
  const geojson = buildGeoJson(DATASET_FIXTURE_ROWS)

  /** n 番目の Feature（存在しなければ即座に分かるように投げる）。 */
  const featureAt = (index: number) => {
    const feature = geojson.features[index]
    if (!feature) throw new Error(`features[${index}] が存在しない`)
    return feature
  }

  it('RFC 7946 の FeatureCollection / Point 形状である', () => {
    expect(geojson.type).toBe('FeatureCollection')
    expect(geojson.features).toHaveLength(DATASET_FIXTURE_ROWS.length)
    for (const f of geojson.features) {
      expect(f.type).toBe('Feature')
      expect(f.geometry.type).toBe('Point')
      expect(f.geometry.coordinates).toHaveLength(2)
    }
  })

  it('geometry.coordinates が [lng, lat] の順である（RFC 7946 は経度先）', () => {
    expect(featureAt(0).geometry.coordinates).toEqual([140.1, 39.72])
    expect(featureAt(1).geometry.coordinates).toEqual([0, -0.001])
    expect(featureAt(2).geometry.coordinates).toEqual([141.25, 40.5])
    // 秋田県の経度(≒140)が緯度(≒39)より大きい＝先頭が経度であることの意味的な確認。
    const coordinates = featureAt(0).geometry.coordinates
    expect(coordinates[0]).toBeGreaterThan(coordinates[1])
  })

  it('properties のキー集合が列定義から導出された期待集合と一致する（順序も含む）', () => {
    const derived = GEOJSON_PROPERTY_COLUMNS.map((c) => c.header)
    for (const f of geojson.features) {
      expect(Object.keys(f.properties)).toEqual(derived)
      expect(Object.keys(f.properties)).toEqual([...PUBLISHED_GEOJSON_PROPERTY_KEYS])
    }
  })

  it('properties に生座標・PII・accuracy が含まれない', () => {
    for (const f of geojson.features) {
      for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
        expect(f.properties).not.toHaveProperty(forbidden)
      }
      // 座標は geometry が持つ。properties 側に粗化座標も置かない（二重表現を作らない）。
      expect(f.properties).not.toHaveProperty('lat_coarse')
      expect(f.properties).not.toHaveProperty('lng_coarse')
    }
  })

  it('各 properties の値が行の値どおりである（CSV と同じ列定義由来なので値も一致する）', () => {
    expect(featureAt(0).properties).toEqual({
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
      count: 3,
      survey_method: 'structured',
    })
  })

  it('null は JSON の null のまま保たれる（CSV の空文字と違い型が落ちない）', () => {
    expect(featureAt(1).properties).toEqual({
      id: 'row-nulls',
      observed_at: null,
      created_at: '2026-06-03T00:00:00.000Z',
      species_code: 'bullfrog',
      species_label_ja: 'ウシガエル',
      info_type_code: 'absence',
      info_type_label_ja: '不在確認',
      municipality: null,
      locality: null,
      water_body: null,
      count: null,
      survey_method: null,
    })
  })

  it('CSV の無害化（前置アポストロフィ）を GeoJSON 側へ持ち込まない（JSON は数式評価されない）', () => {
    const props = featureAt(2).properties
    expect(props.municipality).toBe('=cmd|calc')
    expect(props.water_body).toBe('@evil')
    expect(props.locality).toBe('a,b"c\nd')
  })

  it('トップレベル properties にライセンス・粗化・収録条件のメタが載る（REQ-230 FR-230-03/04）', () => {
    expect(geojson.properties.license).toBe(DATASET_LICENSE_NAME)
    expect(geojson.properties.license_url).toBe(DATASET_LICENSE_URL)
    expect(geojson.properties.coordinate_decimals).toBe(COORD_DECIMALS)
    expect(geojson.properties.status_filter).toBe(PUBLIC_POST_STATUS)
    expect(geojson.properties.record_count).toBe(DATASET_FIXTURE_ROWS.length)
    expect(typeof geojson.properties.generated_at).toBe('string')
  })

  it('リファクタ前（列定義の単一ソース化以前）と同一の features を出力する', () => {
    // 単一ソース化コミット直前の実装が出力した JSON をそのまま貼った golden（generated_at は非決定なので除外）。
    expect(JSON.stringify(geojson.features)).toBe(
      JSON.stringify([
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [140.1, 39.72] },
          properties: {
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
            count: 3,
            survey_method: 'structured',
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, -0.001] },
          properties: {
            id: 'row-nulls',
            observed_at: null,
            created_at: '2026-06-03T00:00:00.000Z',
            species_code: 'bullfrog',
            species_label_ja: 'ウシガエル',
            info_type_code: 'absence',
            info_type_label_ja: '不在確認',
            municipality: null,
            locality: null,
            water_body: null,
            count: null,
            survey_method: null,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [141.25, 40.5] },
          properties: {
            id: 'row-injection',
            observed_at: '2026-01-31T23:59:59.000Z',
            created_at: '2026-02-01T00:00:00.000Z',
            species_code: 'unknown-species',
            species_label_ja: 'unknown-species',
            info_type_code: 'unknown-type',
            info_type_label_ja: 'unknown-type',
            municipality: '=cmd|calc',
            locality: 'a,b"c\nd',
            water_body: '@evil',
            count: 0,
            survey_method: 'opportunistic',
          },
        },
      ]),
    )
  })

  it('0 行でも RFC 7946 として妥当な空の FeatureCollection になる', () => {
    const empty = buildGeoJson([])
    expect(empty.type).toBe('FeatureCollection')
    expect(empty.features).toEqual([])
    expect(empty.properties.record_count).toBe(0)
  })
})
