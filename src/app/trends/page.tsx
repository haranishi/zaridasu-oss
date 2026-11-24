import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const revalidate = 3600 // Revalidate every hour

// REQ-312 FR-312-02: canonical / og:url / og:title / twitter:* を buildPageMetadata に一本化。
// 従来は openGraph 未定義で root layout の `url: '/'` とホームのタイトルを丸ごと継承していた。
export const metadata: Metadata = buildPageMetadata({
  path: '/trends',
  title: 'トレンド・統計',
  description: '秋田県の外来生物出没情報の月別推移・種類別分布・市区町村ランキングなどの統計データ。',
})

export { default } from '@/views/TrendsPage'
