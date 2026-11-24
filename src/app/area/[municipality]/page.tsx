import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAnonClient } from '@/lib/supabase/anon'
import {
  countPublicPostsByMunicipality,
  selectPublicPostCreatedAt,
  selectPublicPostsForCards,
} from '@/lib/data/posts'
import { MUNICIPALITY_DATA, getMunicipalityBySlug, SPECIES, INFO_TYPES, BASE_URL } from '@/lib/constants'
import { SITE_NAME, safeJsonLd, speciesAboutLd } from '@/lib/seo'
import AreaPageClient from '@/views/AreaPage'

type Props = {
  params: Promise<{ municipality: string }>
}

export async function generateStaticParams() {
  return MUNICIPALITY_DATA.map((m) => ({ municipality: m.slug }))
}

// REQ-162: 地域ページは投稿頻度に対して 1 時間ごとの再生成は過剰。SEO 上の鮮度要件は
// 「日次更新」で十分（地域別の出没傾向は時間単位では大きく変わらない）ため 24 時間へ延長し、
// Vercel 関数実行回数と Supabase 読み取りを削減する。
export const revalidate = 86400

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { municipality: slug } = await params
  const muni = getMunicipalityBySlug(slug)
  if (!muni) return { title: '地域が見つかりません' }

  // REQ-162: description 用の件数のみが必要なため head:true（行は転送しない）の count クエリを使う。
  // 本体クエリは limit(50) のため正確な総件数を持てず、件数取得はこの軽量クエリに分離するのが妥当
  // （head-count はデータ転送ゼロで安価）。結果として 1 自治体あたり head-count + 本体の 2 本に収まる。
  // REQ-186: anon クライアント(cookie 非依存)で ISR を成立させる。
  const supabase = createAnonClient()
  let count: number | null = null
  if (supabase) {
    const res = await countPublicPostsByMunicipality(supabase, muni.name)
    count = res.count
  }

  const title = `${muni.name}の外来生物情報`
  const postCountText = count != null && count > 0
    ? `現在${count}件の報告があります。`
    : ''
  const description = `秋田県${muni.name}のアメリカザリガニ・ウシガエル等の目撃・捕獲情報。${postCountText}最新の外来生物出没マップと統計データ。`

  return {
    title,
    description,
    alternates: { canonical: `/area/${slug}` },
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/area/${slug}`,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  }
}

export default async function AreaPage({ params }: Props) {
  const { municipality: slug } = await params
  const muni = getMunicipalityBySlug(slug)
  if (!muni) notFound()

  // REQ-186: anon クライアント(cookie 非依存)で ISR を成立させる。
  const supabase = createAnonClient()

  // 列の構成（REQ-231 の locality/water_body、REQ-243 の粗化座標）は lib/data/posts.ts が持つ。
  const { data: posts } = supabase
    ? await selectPublicPostsForCards(supabase)
        .eq('municipality', muni.name)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null }

  // REQ-229 FR-229-03 / NFR-229-01/04: Dataset の temporalCoverage と「総報告件数」は
  // 本体クエリ（limit(50)）では正確に表せないため、転送最小の軽量クエリで取得する。
  //  - 総件数: head:true（行非転送）の exact count（generateMetadata と同方式）。画面の「現在◯件」と一致。
  //  - 期間: created_at の最古/最新を order+limit(1) で 1 行ずつ取得（min/max 相当）。
  // 追加クエリは計 3 本（head-count + 最古 + 最新）。いずれも軽量で ISR(revalidate=86400) を崩さない。
  let totalCount: number | null = null
  let oldestCreatedAt: string | null = null
  let newestCreatedAt: string | null = null
  if (supabase) {
    const [countRes, oldestRes, newestRes] = await Promise.all([
      countPublicPostsByMunicipality(supabase, muni.name),
      selectPublicPostCreatedAt(supabase)
        .eq('municipality', muni.name)
        .order('created_at', { ascending: true })
        .limit(1),
      selectPublicPostCreatedAt(supabase)
        .eq('municipality', muni.name)
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    totalCount = countRes.count
    oldestCreatedAt = (oldestRes.data as { created_at: string }[] | null)?.[0]?.created_at ?? null
    newestCreatedAt = (newestRes.data as { created_at: string }[] | null)?.[0]?.created_at ?? null
  }

  // 種別ごとの件数
  const speciesCounts: Record<string, number> = {}
  const infoTypeCounts: Record<string, number> = {}
  // REQ-231: 字・水系を件数集計し、頻度の高い順に代表語彙を抽出（地名の羅列ではなく要約）。
  const localityCounts: Record<string, number> = {}
  const waterBodyCounts: Record<string, number> = {}
  for (const p of posts || []) {
    speciesCounts[p.species] = (speciesCounts[p.species] || 0) + 1
    infoTypeCounts[p.info_type] = (infoTypeCounts[p.info_type] || 0) + 1
    if (p.locality) localityCounts[p.locality] = (localityCounts[p.locality] || 0) + 1
    if (p.water_body) waterBodyCounts[p.water_body] = (waterBodyCounts[p.water_body] || 0) + 1
  }
  const topByCount = (counts: Record<string, number>, n: number): string[] =>
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  const topLocalities = topByCount(localityCounts, 5)
  const topWaterBodies = topByCount(waterBodyCounts, 5)

  // 隣接地域（距離が近い順に最大5つ）
  const nearbyMunicipalities = MUNICIPALITY_DATA
    .filter((m) => m.slug !== slug)
    .map((m) => ({
      ...m,
      distance: Math.sqrt((m.lat - muni.lat) ** 2 + (m.lng - muni.lng) ** 2),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)

  // JSON-LD
  // REQ-231 (FR-231-06 / AC-06): 付与済みの字・水系を spatialCoverage / keywords に供給する。
  // JSON-LD 設計の主担当は REQ-229 だが、本ページは「素材（字・水系）を参照可能な形で渡す」。
  const spatialCoverage: Record<string, unknown> = {
    '@type': 'Place',
    name: `秋田県${muni.name}`,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: muni.lat,
      longitude: muni.lng,
    },
  }
  if (topWaterBodies.length > 0) {
    // 代表水系を containsPlace（BodyOfWater）として供給（REQ-229 が拡張する素地）。
    spatialCoverage.containsPlace = topWaterBodies.map((w) => ({
      '@type': 'BodyOfWater',
      name: w,
    }))
  }
  const longtailKeywords = [...topLocalities, ...topWaterBodies].filter(Boolean).join(',')

  // REQ-229 FR-229-02: 当該自治体で実際に報告のある種のみを about（学名・sameAs つき Thing/Taxon）に出す。
  // 報告ゼロの種は含めない（提示していない事実を主張しない＝NFR-229-01）。
  const reportedSpeciesAbout = SPECIES
    .filter((s) => (speciesCounts[s.value] ?? 0) > 0)
    .map((s) => speciesAboutLd(s))

  // REQ-229 FR-229-03: temporalCoverage（実データの最古〜最新）。データ無しの自治体では出さない。
  const temporalCoverage =
    oldestCreatedAt && newestCreatedAt ? `${oldestCreatedAt}/${newestCreatedAt}` : null

  // REQ-229 FR-229-03 / NFR-229-01: variableMeasured は「画面に表示済みの集計」だけを出す。
  //  - 総報告件数: head-count(totalCount)。画面の「現在◯件」と一致。
  //  - 種別件数 / 情報種別件数: speciesCounts / infoTypeCounts（AreaPageClient で表示済み）。
  const organism = { '@type': 'Organization', name: SITE_NAME, url: BASE_URL }
  const variableMeasured: Record<string, unknown>[] = []
  if (totalCount != null) {
    variableMeasured.push({ '@type': 'PropertyValue', name: '報告件数', value: totalCount })
  }
  for (const s of SPECIES) {
    const c = speciesCounts[s.value] ?? 0
    if (c > 0) variableMeasured.push({ '@type': 'PropertyValue', name: `${s.label}の報告件数`, value: c })
  }
  for (const it of INFO_TYPES) {
    const c = infoTypeCounts[it.value] ?? 0
    if (c > 0) variableMeasured.push({ '@type': 'PropertyValue', name: `${it.label}の報告件数`, value: c })
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${muni.name}の外来生物出没情報`,
    description: `秋田県${muni.name}における外来生物（アメリカザリガニ・ウシガエル）の目撃・捕獲情報データセット`,
    url: `${BASE_URL}/area/${slug}`,
    spatialCoverage,
    // REQ-229 FR-229-04: メタ情報。inLanguage は本ページの出力言語(ja)。creator/maintainer は publisher と整合。
    // creativeWorkStatus: 市民科学による暫定・継続更新データである旨を正直に示す。
    // license / distribution は REQ-230（配布実体・ライセンス確定）まで出力しない（実在しない URL を書かない）。
    isAccessibleForFree: true,
    inLanguage: 'ja',
    creativeWorkStatus: '市民科学により継続的に収集される暫定データ',
    publisher: organism,
    creator: organism,
    maintainer: organism,
    keywords: `${muni.name},外来生物,アメリカザリガニ,ウシガエル,目撃情報,秋田県${longtailKeywords ? ',' + longtailKeywords : ''}`,
  }
  if (reportedSpeciesAbout.length > 0) jsonLd.about = reportedSpeciesAbout
  if (temporalCoverage) jsonLd.temporalCoverage = temporalCoverage
  if (variableMeasured.length > 0) jsonLd.variableMeasured = variableMeasured

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '地域別', item: `${BASE_URL}/area` },
      { '@type': 'ListItem', position: 3, name: muni.name, item: `${BASE_URL}/area/${slug}` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <AreaPageClient
        municipality={muni}
        posts={posts || []}
        speciesCounts={speciesCounts}
        infoTypeCounts={infoTypeCounts}
        nearbyMunicipalities={nearbyMunicipalities}
        speciesOptions={SPECIES.map(s => ({ value: s.value, label: s.label, color: s.color }))}
        infoTypeOptions={INFO_TYPES.map(t => ({ value: t.value, label: t.label, emoji: t.emoji }))}
      />
    </>
  )
}
