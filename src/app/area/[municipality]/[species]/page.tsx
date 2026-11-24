import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAnonClient } from '@/lib/supabase/anon'
import {
  countPublicPostsByMunicipalityAndSpecies,
  selectPublicPostCreatedAt,
  selectPublicPostsForCards,
} from '@/lib/data/posts'
import {
  MUNICIPALITY_DATA,
  getMunicipalityBySlug,
  SPECIES,
  getSpeciesBySlug,
  INFO_TYPES,
  BASE_URL,
  AREA_SPECIES_INDEX_MIN_POSTS,
} from '@/lib/constants'
import { SITE_NAME, safeJsonLd, speciesAboutLd } from '@/lib/seo'
import type { Species } from '@/types'
import AreaPageClient from '@/views/AreaPage'

type Props = {
  params: Promise<{ municipality: string; species: string }>
}

// REQ-228 FR-228-02 / AC-01: 2 種 × 24 市町村 = 48 通りを静的生成する（MUNICIPALITY_DATA × SPECIES の直積）。
export function generateStaticParams() {
  return MUNICIPALITY_DATA.flatMap((m) =>
    SPECIES.map((s) => ({ municipality: m.slug, species: s.value })),
  )
}

// REQ-228 FR-228-02 / NFR-228-01: 既存地域ページ・種ピラー・サイトマップと揃えて日次 ISR。
export const revalidate = 86400

// REQ-228 FR-228-03: 当該市町村×種の承認済み件数（head-count・行非転送で安価）。
// description と空ページ判定（FR-228-04/05）の双方に使う。anon クライアントで ISR を成立させる（REQ-186）。
async function fetchSpeciesAreaCount(municipalityName: string, speciesValue: Species): Promise<number | null> {
  const supabase = createAnonClient()
  if (!supabase) return null
  const res = await countPublicPostsByMunicipalityAndSpecies(supabase, municipalityName, speciesValue)
  return res.count
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { municipality: slug, species: speciesSlug } = await params
  const muni = getMunicipalityBySlug(slug)
  const sp = getSpeciesBySlug(speciesSlug)
  if (!muni || !sp) return { title: 'ページが見つかりません' }

  const count = await fetchSpeciesAreaCount(muni.name, sp.value)

  // REQ-228 FR-228-06 / FR-228-11: 市町村名＋種名を主語にし、種ピラー(/species)・親地域ページと実質重複させない。
  // root template `%s | ザリダス`(layout.tsx) が後置されるため title に「ザリダス」を二重化しない。
  const title = `${muni.name}の${sp.label}情報`
  const postCountText = count != null && count > 0 ? `現在${count}件の報告があります。` : ''
  const description = `秋田県${muni.name}の${sp.label}の目撃・捕獲・痕跡情報。${postCountText}最新の出没マップと統計データ。`

  // REQ-228 FR-228-04/05 / NFR-228-02/04: しきい値未満（薄いページ）は index 対象から外す。
  // 隔離方式は (iii) noindex + 親 /area/[municipality] への canonical を採用：
  //  - robots noindex で当該ページ自体を index 対象から外し（scaled content abuse 回避）、
  //  - canonical を親地域ページへ向け「独立 index 対象ではなく親の一部」という意図を明確化する。
  // しきい値以上は自分自身を canonical にし、robots は既定(index 可)。1 ページ内で index 可/noindex は同居しない。
  const isIndexable = count != null && count >= AREA_SPECIES_INDEX_MIN_POSTS
  const selfUrl = `/area/${slug}/${speciesSlug}`
  const canonical = isIndexable ? selfUrl : `/area/${slug}`

  return {
    title,
    description,
    alternates: { canonical },
    ...(isIndexable ? {} : { robots: { index: false } }),
    openGraph: {
      type: 'website',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: selfUrl,
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  }
}

export default async function AreaSpeciesPage({ params }: Props) {
  const { municipality: slug, species: speciesSlug } = await params
  const muni = getMunicipalityBySlug(slug)
  const sp = getSpeciesBySlug(speciesSlug)
  if (!muni || !sp) notFound()

  // REQ-186: anon クライアント(cookie 非依存)で ISR を成立させる。
  const supabase = createAnonClient()

  // REQ-228 FR-228-03: 本体一覧は地域ページのクエリに `.eq('species', …)` を 1 つ足した形
  // （status='approved' AND municipality=muni.name AND species=sp.value、created_at desc、limit(50)）。
  const { data: posts } = supabase
    ? await selectPublicPostsForCards(supabase)
        .eq('municipality', muni.name)
        .eq('species', sp.value)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: null }

  // REQ-228 FR-228-04 / NFR-228-01: 総件数（head-count）と期間（最古/最新）を軽量クエリで取得。
  // 件数は JSON-LD の variableMeasured・canonical/robots 判定と一致させる（generateMetadata と同方式）。
  let totalCount: number | null = null
  let oldestCreatedAt: string | null = null
  let newestCreatedAt: string | null = null
  if (supabase) {
    const [countRes, oldestRes, newestRes] = await Promise.all([
      countPublicPostsByMunicipalityAndSpecies(supabase, muni.name, sp.value),
      selectPublicPostCreatedAt(supabase)
        .eq('municipality', muni.name)
        .eq('species', sp.value)
        .order('created_at', { ascending: true })
        .limit(1),
      selectPublicPostCreatedAt(supabase)
        .eq('municipality', muni.name)
        .eq('species', sp.value)
        .order('created_at', { ascending: false })
        .limit(1),
    ])
    totalCount = countRes.count
    oldestCreatedAt = (oldestRes.data as { created_at: string }[] | null)?.[0]?.created_at ?? null
    newestCreatedAt = (newestRes.data as { created_at: string }[] | null)?.[0]?.created_at ?? null
  }

  // 情報種別ごとの件数（本ページは種で絞り込み済みのため speciesCounts は当該種のみ）。
  const infoTypeCounts: Record<string, number> = {}
  const localityCounts: Record<string, number> = {}
  const waterBodyCounts: Record<string, number> = {}
  for (const p of posts || []) {
    infoTypeCounts[p.info_type] = (infoTypeCounts[p.info_type] || 0) + 1
    if (p.locality) localityCounts[p.locality] = (localityCounts[p.locality] || 0) + 1
    if (p.water_body) waterBodyCounts[p.water_body] = (waterBodyCounts[p.water_body] || 0) + 1
  }
  const speciesCounts: Record<string, number> = { [sp.value]: (posts || []).length }
  const topByCount = (counts: Record<string, number>, n: number): string[] =>
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  const topLocalities = topByCount(localityCounts, 5)
  const topWaterBodies = topByCount(waterBodyCounts, 5)

  // 隣接地域（距離が近い順に最大5つ）。同種の種×地域ページへ誘導する（クラスタの面を広げる）。
  const nearbyMunicipalities = MUNICIPALITY_DATA
    .filter((m) => m.slug !== slug)
    .map((m) => ({
      ...m,
      distance: Math.sqrt((m.lat - muni.lat) ** 2 + (m.lng - muni.lng) ** 2),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)

  // REQ-228 FR-228-08: 同一市町村のもう一方の種ページ（親→子の双方向リンクの片側）。
  const otherSpecies = SPECIES.find((s) => s.value !== sp.value)

  // REQ-228 FR-228-07: JSON-LD（Dataset + BreadcrumbList）を種×地域版にする。
  // Dataset の name/description/keywords に種名を含め、BreadcrumbList は 4 階層
  // （ホーム → 地域別 → 市町村 → 種）にする。深掘り（学名 sameAs 等）は speciesAboutLd を流用。
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
    spatialCoverage.containsPlace = topWaterBodies.map((w) => ({
      '@type': 'BodyOfWater',
      name: w,
    }))
  }
  const longtailKeywords = [...topLocalities, ...topWaterBodies].filter(Boolean).join(',')

  // 報告のある種のみ about に出す（提示していない事実を主張しない）。本ページは当該種で絞っているため、
  // 件数>0 のときだけ当該種の about（学名・sameAs つき）を付ける。
  const reportedSpeciesAbout =
    (totalCount ?? 0) > 0 ? [speciesAboutLd(sp)] : []

  const temporalCoverage =
    oldestCreatedAt && newestCreatedAt ? `${oldestCreatedAt}/${newestCreatedAt}` : null

  const organism = { '@type': 'Organization', name: SITE_NAME, url: BASE_URL }
  const variableMeasured: Record<string, unknown>[] = []
  if (totalCount != null) {
    variableMeasured.push({ '@type': 'PropertyValue', name: `${sp.label}の報告件数`, value: totalCount })
  }
  for (const it of INFO_TYPES) {
    const c = infoTypeCounts[it.value] ?? 0
    if (c > 0) variableMeasured.push({ '@type': 'PropertyValue', name: `${it.label}の報告件数`, value: c })
  }

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${muni.name}の${sp.label}出没情報`,
    description: `秋田県${muni.name}における${sp.label}（${sp.scientificName}）の目撃・捕獲・痕跡情報データセット`,
    url: `${BASE_URL}/area/${slug}/${speciesSlug}`,
    spatialCoverage,
    isAccessibleForFree: true,
    inLanguage: 'ja',
    creativeWorkStatus: '市民科学により継続的に収集される暫定データ',
    publisher: organism,
    creator: organism,
    maintainer: organism,
    keywords: `${muni.name},${sp.label},${sp.scientificName},外来生物,目撃情報,秋田県${longtailKeywords ? ',' + longtailKeywords : ''}`,
  }
  if (reportedSpeciesAbout.length > 0) jsonLd.about = reportedSpeciesAbout
  if (temporalCoverage) jsonLd.temporalCoverage = temporalCoverage
  if (variableMeasured.length > 0) jsonLd.variableMeasured = variableMeasured

  // REQ-228 FR-228-07 / AC-05: BreadcrumbList をホーム → 地域別 → 市町村 → 種の 4 階層にする。
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '地域別', item: `${BASE_URL}/area` },
      { '@type': 'ListItem', position: 3, name: muni.name, item: `${BASE_URL}/area/${slug}` },
      { '@type': 'ListItem', position: 4, name: sp.label, item: `${BASE_URL}/area/${slug}/${speciesSlug}` },
    ],
  }

  const linkClass =
    'rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />

      {/* REQ-228 FR-228-08 / FR-228-11 / AC-06: 種×地域ページからの内部リンク（クエリ・ファンアウト対応）。
          - 親地域 /area/[municipality]（地域総合・index 対象）
          - 同一市町村のもう一方の種ページ /area/[municipality]/[otherSpecies]
          - 種ピラー /species/[species]（REQ-227。ハブ＆スポークの「この種について詳しく」リンク）
          いずれも canonical=自分自身の index 対象ページへ向け、noindex の薄いページへリンクを集中させない。 */}
      <nav
        aria-label={`${muni.name}の${sp.label}に関する関連ページ`}
        className="mx-auto max-w-3xl px-4 pt-4"
      >
        <div className="flex flex-wrap gap-2">
          <Link href={`/area/${slug}`} className={linkClass}>
            {muni.name}の外来生物情報（まとめ）
          </Link>
          {otherSpecies && (
            <Link href={`/area/${slug}/${otherSpecies.value}`} className={linkClass}>
              {muni.name}の{otherSpecies.label}情報
            </Link>
          )}
          {/* REQ-227 種ピラー。REQ-227 実装済みのため有効化（ハブへオーソリティを返す）。 */}
          <Link href={`/species/${sp.value}`} className={linkClass}>
            {sp.label}について詳しく →
          </Link>
        </div>
      </nav>

      {/* 既存 AreaPageClient を再利用。当該種のみに絞った posts / speciesCounts を渡すことで
          「種×地域」のローカルビュー（地図・一覧・統計・近隣地域）をそのまま提供する（NFR-228-03 を壊さない）。 */}
      <AreaPageClient
        municipality={muni}
        posts={posts || []}
        speciesCounts={speciesCounts}
        infoTypeCounts={infoTypeCounts}
        nearbyMunicipalities={nearbyMunicipalities}
        speciesOptions={[{ value: sp.value, label: sp.label, color: sp.color }]}
        infoTypeOptions={INFO_TYPES.map((t) => ({ value: t.value, label: t.label, emoji: t.emoji }))}
      />
    </>
  )
}
