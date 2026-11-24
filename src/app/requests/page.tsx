import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

// REQ-275 FR-275-02: index 対象・sitemap 掲載ページなのに自己参照 canonical が無く、
// 絞り込みクエリ付きURL（?species= 等）が重複インデックスされ得た。og:url も親の '/' を
// 継承していたため明示した。
// REQ-312 FR-312-03: ただし `openGraph: { url }` の**部分定義**が shallow merge を招き、
// 親の images / siteName / type / locale が丸ごと消えて OG画像なしの共有カードになっていた。
// buildPageMetadata へ一本化し、canonical・og:url の一致を保ったまま欠落を復元する。
// REQ-199 FR-199-02: root template の「| ザリダス」二重付与を避け、ブランドは1回だけ
// （titleAbsolute。og:title / twitter:title も同じ絶対タイトルで揃う）。
export const metadata: Metadata = buildPageMetadata({
  path: '/requests',
  title: '調査依頼一覧 | ザリダス',
  titleAbsolute: true,
  description: '秋田県内の外来種調査依頼を一覧で確認・絞り込みできます。',
})

export { default } from '@/views/SurveyRequestsListPage'
