import type { Metadata } from 'next'
import { safeJsonLd, buildPageMetadata } from '@/lib/seo'
import jaTranslation from '@/locales/ja/translation.json'
import AboutPage from '@/views/AboutPage'

export const dynamic = 'force-static'

// REQ-312 FR-312-02: og:url / og:title / twitter:* の親継承を解消（buildPageMetadata へ一本化）。
// title が3主題混在（使い方・種類図鑑・外来種法）で種ピラーの親として弱い点の抜本解決
// （`/species` インデックス新設）は REQ-227 のスコープ。本REQでは文言を変えない。
export const metadata: Metadata = buildPageMetadata({
  path: '/about',
  title: '使い方・種類図鑑・外来種法',
  description: 'ザリダスの使い方、アメリカザリガニ・ウシガエルの種類図鑑、外来生物法に関する情報をまとめています。',
})

/**
 * REQ-141: FAQ JSON-LD は SSR / SSG 時点で出力するため、Client の useTranslation 経由ではなく
 * 静的辞書（ja の translation.json）から構築する。検索エンジンには日本語の FAQPage を提示する。
 * クライアント側の言語切替で FAQ 表示が切り替わっても SEO 用 JSON-LD は ja のままで問題ない。
 */
const faqDictionary = (jaTranslation as { about?: { faq?: Record<string, string> } }).about?.faq ?? {}

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [1, 2, 3, 4, 5].map((n) => ({
    '@type': 'Question',
    name: faqDictionary[`q${n}`] ?? '',
    acceptedAnswer: {
      '@type': 'Answer',
      text: faqDictionary[`a${n}`] ?? '',
    },
  })),
}

export default function AboutRoute() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(FAQ_JSON_LD) }}
      />
      <AboutPage />
    </>
  )
}
