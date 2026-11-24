import type { Metadata } from 'next'
import { createAnonClient } from '@/lib/supabase/anon'
import { MUNICIPALITY_DATA, BASE_URL } from '@/lib/constants'
import { safeJsonLd, buildPageMetadata } from '@/lib/seo'
import AreaListPageClient from '@/views/AreaListPage'

export const revalidate = 3600

// REQ-312 FR-312-02: og:url / og:title / twitter:* の親継承を解消（buildPageMetadata へ一本化）。
export const metadata: Metadata = buildPageMetadata({
  path: '/area',
  title: '地域別外来生物情報',
  description: '秋田県の市区町村別外来生物（アメリカザリガニ・ウシガエル）の出没・分布情報一覧。',
})

export default async function AreaListPage() {
  // REQ-186: anon クライアント(cookie 非依存)で ISR(revalidate=3600)を実効化する。
  const supabase = createAnonClient()

  // REQ-143: 全件 SELECT → アプリ側ループの集計を Postgres 側 GROUP BY に置き換える。
  // get_municipality_post_counts は anon に EXECUTE 付与済み(schema.sql)。
  const { data: counts } = supabase
    ? await supabase.rpc('get_municipality_post_counts')
    : { data: null }
  const rows = (counts ?? []) as Array<{ municipality: string; post_count: number | string }>
  const countMap = new Map<string, number>(
    rows.map((row) => [row.municipality, Number(row.post_count)]),
  )

  const municipalities = MUNICIPALITY_DATA.map((m) => ({
    ...m,
    postCount: countMap.get(m.name) ?? 0,
  })).sort((a, b) => b.postCount - a.postCount)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '地域別', item: `${BASE_URL}/area` },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <AreaListPageClient municipalities={municipalities} />
    </>
  )
}
