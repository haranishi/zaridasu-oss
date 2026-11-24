/**
 * REQ-230 (FR-230-02 / FR-230-03 / NFR-230-03): オープンデータ公開用 GeoJSON 配布エンドポイント。
 *
 * RFC 7946 準拠の FeatureCollection。各 Feature は Point 幾何（**粗化座標** `[lng, lat]` 経度先）。
 * 粗化・approved 限定・PII 非含有のロジックは CSV ルート（zaridasu.csv/route.ts）の共有ヘルパを
 * 再利用し、CSV と完全に同一の粗化・列構成にする（NFR-230-02 一貫性）。
 */
import { NextRequest } from 'next/server'
import { BASE_URL } from '@/lib/constants'
import { PUBLIC_POST_STATUS } from '@/lib/data/posts'
import {
  fetchPublicDataset,
  parseDatasetFilters,
  type PublicDatasetRow,
  GEOJSON_PROPERTY_COLUMNS,
  COORD_DECIMALS,
  COORD_PRECISION_LABEL,
  COORD_PRECISION_LABEL_EN,
  DATASET_LICENSE_NAME,
  DATASET_LICENSE_URL,
} from '../zaridasu.csv/route'

// REQ-230 NFR-230-05: CSV と同じく日次更新方針。
export const revalidate = 86400

interface GeoJsonFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, string | number | null>
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  /** REQ-230 FR-230-03: 粗化済みである旨をトップレベル properties に明記する。 */
  properties: Record<string, string | number>
  features: GeoJsonFeature[]
}

/**
 * REQ-230 NFR-230-03: RFC 7946 では座標は [経度, 緯度]（lng, lat）順。
 * properties は CSV と同じ列（code 値 + ja ラベル）。PII・生座標・accuracy は含めない。
 *
 * REQ-310 FR-310-01: properties は CSV と**同一の列定義**（`DATASET_COLUMNS`）から導出する。
 * 座標列（lat_coarse / lng_coarse）は `inGeoJson: false` で除かれ、geometry.coordinates が担う
 * （CSV 14 列 vs GeoJSON 12 プロパティの差はこのフラグのみに由来する）。
 */
export function buildGeoJson(rows: PublicDatasetRow[]): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = rows.map((r) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      // 既に COORD_DECIMALS 桁へ粗化済みの値（fetchPublicDataset 内で coarsenCoord 適用済み）。
      coordinates: [r.lng, r.lat],
    },
    properties: Object.fromEntries(GEOJSON_PROPERTY_COLUMNS.map((c) => [c.header, c.get(r)])),
  }))

  return {
    type: 'FeatureCollection',
    properties: {
      title: 'ザリダス オープンデータ（外来生物 市民科学 観察データ / 秋田県）',
      license: DATASET_LICENSE_NAME,
      license_url: DATASET_LICENSE_URL,
      attribution: `ザリダス（出典 ${BASE_URL}/dataset）`,
      coordinate_precision: `${COORD_PRECISION_LABEL} / ${COORD_PRECISION_LABEL_EN}`,
      coordinate_decimals: COORD_DECIMALS,
      status_filter: PUBLIC_POST_STATUS,
      caveat: '市民科学による任意投稿（非悉皆・観察努力に偏りあり）。座標は正確な地点ではなく粗化済みです。',
      generated_at: new Date().toISOString(),
      record_count: features.length,
    },
    features,
  }
}

export async function GET(request: NextRequest) {
  const filters = parseDatasetFilters(request.nextUrl.searchParams)
  const rows = await fetchPublicDataset(filters)
  const geojson = buildGeoJson(rows)

  return new Response(JSON.stringify(geojson), {
    headers: {
      // REQ-230 FR-230-02 / NFR-230-03: GeoJSON の Content-Type。
      'Content-Type': 'application/geo+json',
      'Content-Disposition': 'attachment; filename="zaridasu-open-data.geojson"',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
