import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'
import PrivacyPage from '@/views/PrivacyPage'

export const dynamic = 'force-static'

// REQ-312 FR-312-02: og:url / og:title / twitter:* の親継承を解消（buildPageMetadata へ一本化）。
export const metadata: Metadata = buildPageMetadata({
  path: '/privacy',
  title: 'プライバシーポリシー',
  description: 'ザリダスのプライバシーポリシー。収集する情報・利用目的・第三者提供・Cookieの使用についての説明。',
})

// REQ-141: views/PrivacyPage は Server Component 化済み。'use client' shim を経由せず直接マウントする。
export default function PrivacyRoute() {
  return <PrivacyPage />
}
