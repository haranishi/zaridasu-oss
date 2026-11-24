import type { Metadata } from 'next'
import { createAnonClient } from '@/lib/supabase/anon'
import { countPublicPosts } from '@/lib/data/posts'
import { safeJsonLd } from '@/lib/seo'
import { BASE_URL } from '@/lib/constants'
import jaTranslation from '@/locales/ja/translation.json'
import LandingPage, { type LpStats } from '@/views/LandingPage'

// REQ-176: LP は静的配信し、実績数値のみ日次（sitemap と同じ REQ-162 方針）で再生成する。
export const revalidate = 86400

const LP_TITLE = 'ザリダスとは - 見つけて、のせて、秋田の自然を守る無料マップ'
const LP_DESCRIPTION =
  'ザリガニやウシガエルを見つけたら、スマホで撮ってのせるだけ。AIが名前を当ててくれるから、生きものにくわしくなくても大丈夫。あなたの報告が秋田の自然を守ります。登録はずっと無料。'

export const metadata: Metadata = {
  title: { absolute: LP_TITLE },
  description: LP_DESCRIPTION,
  alternates: { canonical: '/lp' },
  // REQ-181: Next.js の metadata は openGraph/twitter をトップレベル単位で浅くマージするため、
  // 子(LP)で openGraph を定義すると親(root layout)の images/type/siteName/locale が丸ごと消える。
  // shallow merge で失われる値を明示的に再指定し、SNS/広告共有時のカードを正しく出力する。
  // REQ-206 (FR-206-04): LP 専用 OGP 画像 /og-image-lp.png(1200×630)に差し替え済み。
  openGraph: {
    type: 'website',
    siteName: 'ザリダス',
    locale: 'ja_JP',
    title: LP_TITLE,
    description: LP_DESCRIPTION,
    url: `${BASE_URL}/lp`,
    images: [{ url: '/og-image-lp.png', width: 1200, height: 630, alt: 'ザリダス - あなたの「見つけた」が、秋田の自然を守る。' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: LP_TITLE,
    description: LP_DESCRIPTION,
    images: ['/og-image-lp.png'],
  },
}

/**
 * REQ-176 API-176-01: 実績数値（承認済み投稿数・公開プロフィール数）を ISR 時に取得する。
 * `@/lib/supabase/server` は cookies() に依存して静的生成を妨げるため、
 * cookie 不要の anon クライアントを直接使う。取得失敗時は null（数値カード非表示）で
 * ページ描画自体は必ず成功させる（FR-176-01）。
 *
 * REQ-205 (FR-205-03): 取得失敗だけでなく「報告 0 件」のときも null を返す。閾値は
 * `totalPosts < LP_STATS_MIN_POSTS`（= 1。実質「1 件以上の報告があるとき」のみ数値カードを出す）。
 * 公開初期やデータ未投入期に「集まった報告 0 件」「参加している人 0 人」と表示すると
 * 「報告が集まっています」という見出しと矛盾し、社会的証明として逆効果になるため。
 */
const LP_STATS_MIN_POSTS = 1

async function fetchLpStats(): Promise<LpStats | null> {
  const supabase = createAnonClient()
  if (!supabase) return null
  try {
    const [posts, users] = await Promise.all([
      countPublicPosts(supabase),
      supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_public', true),
    ])
    if (posts.error || users.error) return null
    const totalPosts = posts.count ?? 0
    if (totalPosts < LP_STATS_MIN_POSTS) return null
    return { totalPosts, totalUsers: users.count ?? 0 }
  } catch {
    return null
  }
}

// REQ-141 と同様、SEO 用 JSON-LD は ja の静的辞書から SSG 時点で構築する。
// LP の FAQ は /about の FAQPage と質問が重複しない構成（NFR-176-15）。
const lpDictionary = (jaTranslation as { lp?: { faq?: Record<string, string> } }).lp?.faq ?? {}

const LP_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/lp`,
      url: `${BASE_URL}/lp`,
      name: LP_TITLE,
      description: LP_DESCRIPTION,
      inLanguage: 'ja',
      isPartOf: { '@id': `${BASE_URL}/#website` },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
        '@type': 'Question',
        name: lpDictionary[`q${n}`] ?? '',
        acceptedAnswer: {
          '@type': 'Answer',
          text: lpDictionary[`a${n}`] ?? '',
        },
      })),
    },
  ],
}

export default async function LpRoute() {
  const stats = await fetchLpStats()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(LP_JSON_LD) }}
      />
      <LandingPage stats={stats} />
    </>
  )
}
