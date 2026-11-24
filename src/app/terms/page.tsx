import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import TermsPage from '@/views/TermsPage'

export const dynamic = 'force-static'

// REQ-312 FR-312-02: og:url / og:title / twitter:* の親継承を解消（buildPageMetadata へ一本化）。
export const metadata: Metadata = buildPageMetadata({
  path: '/terms',
  title: '利用規約',
  description: 'ザリダスの利用規約。本サービスのご利用にあたってのルールと条件を定めています。',
})

// REQ-141: views/TermsPage は Server Component 化済み。'use client' shim を経由せず直接マウントする。
export default function TermsRoute() {
  return <TermsPage />
}
