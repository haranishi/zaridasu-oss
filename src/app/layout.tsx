import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { safeJsonLd } from '@/lib/seo'
import { BASE_URL } from '@/lib/constants'
import { isProductionDeployment } from '@/lib/deploymentEnvironment'
import { Providers } from './providers'
import { RootMain } from '@/components/layout/RootMain'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'ザリダス - 秋田県外来生物情報マップ',
    template: '%s | ザリダス',
  },
  description: '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有できます。',
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    siteName: 'ザリダス',
    title: 'ザリダス - 秋田県外来生物情報マップ',
    description: '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有できます。',
    url: '/',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ザリダス - 秋田県外来生物情報マップ',
    description: '秋田県外来生物出没・分布情報マップ。アメリカザリガニやウシガエルの目撃・捕獲情報をリアルタイムで共有できます。',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    // REQ-199 FR-199-05: iOS は apple-touch-icon の SVG 非対応。180×180 PNG・単一出力に。
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && {
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    },
  }),
}

// REQ-268 FR-268-01: viewport-fit=cover を明示し、iOS ノッチ端末で env(safe-area-inset-*) を
// 有効化する（Header/BottomNav/PostForm 等のセーフエリア余白の前提）。拡大禁止（maximumScale/
// userScalable）は WCAG 1.4.4 のため設定しない。themeColor は手書き meta から本 export に一本化。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#dc2626',
}

const siteUrl = BASE_URL

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="search" type="application/opensearchdescription+xml" title="ザリダス" href="/opensearch.xml" />
        {/* トップの地図タイル(LCP)取得を前倒しする。Leafletは a/b/c の3サブドメインへ分散するため全てに張る */}
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" />
        <link rel="preconnect" href="https://b.tile.openstreetmap.org" />
        <link rel="preconnect" href="https://c.tile.openstreetmap.org" />
        {isProductionDeployment() && process.env.NEXT_PUBLIC_GTM_ID && (
          <Script
            id="gtm-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${process.env.NEXT_PUBLIC_GTM_ID}');`,
            }}
          />
        )}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ザリダス" />
        {/* REQ-199 FR-199-05: 手書き apple-touch-icon link を削除し、metadata.icons.apple(PNG)へ一本化 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': `${siteUrl}/#website`,
                  url: `${siteUrl}/`,
                  name: 'ザリダス',
                  description: '秋田県外来生物出没・分布情報マップ',
                  inLanguage: 'ja',
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/map?q={search_term_string}` },
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@type': 'Organization',
                  '@id': `${siteUrl}/#organization`,
                  name: 'ザリダス',
                  url: `${siteUrl}/`,
                  logo: { '@type': 'ImageObject', url: `${siteUrl}/icon-512.svg` },
                  description: '秋田県の外来生物出没・分布情報を収集・共有するプロジェクト',
                  areaServed: {
                    '@type': 'AdministrativeArea',
                    name: '秋田県',
                    addressCountry: 'JP',
                  },
                },
                {
                  '@type': 'WebApplication',
                  '@id': `${siteUrl}/#app`,
                  name: 'ザリダス',
                  url: `${siteUrl}/`,
                  description: '秋田県内の外来生物出没・分布情報をリアルタイムで確認・投稿できるマップサービス。アメリカザリガニ・ウシガエルの目撃・捕獲情報を地図上で共有できます。',
                  applicationCategory: 'EnvironmentalApplication',
                  operatingSystem: 'Web',
                  offers: { '@type': 'Offer', price: '0', priceCurrency: 'JPY' },
                  publisher: { '@id': `${siteUrl}/#organization` },
                  areaServed: {
                    '@type': 'AdministrativeArea',
                    name: '秋田県',
                    addressRegion: 'Akita',
                    addressCountry: 'JP',
                  },
                  keywords: '外来生物,秋田県,外来種,アメリカザリガニ,ウシガエル,分布マップ,目撃情報',
                },
              ],
            }),
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        {isProductionDeployment() && process.env.NEXT_PUBLIC_GTM_ID && (
          <noscript
            dangerouslySetInnerHTML={{
              __html: `<iframe src="https://www.googletagmanager.com/ns.html?id=${process.env.NEXT_PUBLIC_GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
            }}
          />
        )}
        {/* REQ-187: 本文ランドマークは RootMain が出し分ける。通常ページは
            <main id="main-content"> で包み、/lp はビュー側が自前で header(banner)/
            main/footer(contentinfo) をトップレベル landmark として描画するため包まない。 */}
        <Providers><RootMain>{children}</RootMain></Providers>
      </body>
    </html>
  )
}
