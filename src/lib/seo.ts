import type { Metadata } from 'next'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale/ja'
import { getSpecies, getInfoType, BASE_URL } from './constants'
import type { SpeciesOption } from './constants'

const SITE_NAME = 'ザリダス'
const DEFAULT_DESCRIPTION = '秋田県内の外来生物出没・分布情報をリアルタイムで確認・投稿できるマップサービス。アメリカザリガニ・ウシガエルの目撃・捕獲・痕跡情報を地図上で共有。'
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`
const DEFAULT_OG_IMAGE_ALT = 'ザリダス - 秋田県外来生物情報マップ'
/** OG 画像の推奨寸法（Twitter summary_large_image / Facebook 1.91:1）。 */
const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

export { SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_ALT, OG_IMAGE_SIZE }

/**
 * REQ-312 FR-312-05: 種ピラーページ（`/species/*`）のパンくずが指す親 `/about` の表示名。
 *
 * 従来は JSON-LD（本ファイル）と可視パンくず（`app/species/[species]/page.tsx`）が
 * それぞれ「種類図鑑」と**別々に手書き**されており、遷移先 `/about` の `<h1>`
 * （`src/views/AboutPage.tsx` の `t('about.title')` ＝「このサービスについて」）と食い違っていた。
 * Google のパンくずガイドラインは各項目名が遷移先ページを表すことを求めるため、
 * **遷移先の h1 と同じ語**をこの定数に集約し、JSON-LD と可視パンくずの両方をここから生成する。
 *
 * 名前が h1 と一致していることは `src/lib/__tests__/seo.test.ts` が
 * `ja/translation.json` の `about.title` と照合して機械的に固定している
 * （h1 側だけ変えるとテストが落ちる）。
 */
export const ABOUT_BREADCRUMB = { name: 'このサービスについて', path: '/about' } as const

/**
 * REQ-312 FR-312-01: ページ metadata（canonical / OG / Twitter カード）の生成を1箇所に集約する。
 *
 * ## 解く問題（なぜヘルパが要るのか）
 *
 * Next.js App Router の metadata は `openGraph` / `twitter` を**トップレベルのキー単位で
 * 浅くマージ（shallow merge）**する。この性質が2種類の欠陥を同時に生んでいた。
 *
 * 1. 子が `openGraph` を**定義しない**と、親（root layout）の openGraph が丸ごと継承される。
 *    root は `url: '/'` を固定で持つため、`/trends` `/ranking` … の og:url が全て
 *    サイトルートになり、og:url を正規URLとして扱うクローラでホームの重複になり得た。
 *    Next.js はページの `title` から og:title を**自動補完しない**ため og:title も同様。
 * 2. 逆に子が `openGraph: { url }` のように**部分定義**すると、親の
 *    `images` / `siteName` / `type` / `locale` は引き継がれず**消える**（`/requests` の実例）。
 *
 * つまり「書かない」も「一部だけ書く」も壊れる。**全フィールドを毎ページ手書きさせる方式は
 * 同じ事故を再生産する**ので、`path` を1つ受け取って
 * `alternates.canonical` と `openGraph.url` を**同じ値から**生成し、shallow merge で
 * 失われる `type` / `siteName` / `locale` / `images` を必ず埋めるヘルパに一本化する。
 * canonical と og:url を別々に書ける経路をコード上に残さないことが本ヘルパの目的である。
 *
 * ## Twitter カードの方針（FR-312-04 / 案 C-2 を採用）
 *
 * root layout の `twitter` は `title` / `description` を明示しているため、ページ側が
 * `twitter` を定義しない限りホームの文言がそのまま継承される（og:* からの自動フォールバックは
 * 親の値が既に入っているため発火しない）。
 * 案 C-1（root から `twitter.title` / `twitter.description` を外して og フォールバックに委ねる）は
 * 1箇所で済む一方、og:image を持たないページで twitter:image まで落ちる副作用があり、
 * root layout 全体の共有カードに影響する。本ヘルパは **og と twitter を同一の入力から
 * まとめて生成する**ため、C-2（ページ側で明示）でも二重記述にならない。
 * よって影響範囲の小さい C-2 を採る。
 *
 * @param path サイトルート相対のパス（`/trends` など。canonical と og:url の**唯一の出どころ**）。
 * @param title ページ固有タイトル。`titleAbsolute` が false のときは root の
 *   `title.template`（`%s | ザリダス`）が付くため、og:title 側も同じ形に揃える。
 * @param description ページ固有の説明。og:description / twitter:description にも使う。
 * @param titleAbsolute root template を通さない絶対タイトル（既にブランド名を含む場合）。
 *   REQ-199 FR-199-02 の「| ザリダス」二重付与回避と同じ用途。
 * @param ogImage ページ固有の OG 画像。省略時は `DEFAULT_OG_IMAGE`。
 */
export function buildPageMetadata({
  path,
  title,
  description,
  titleAbsolute = false,
  ogImage,
}: {
  path: string
  title: string
  description: string
  titleAbsolute?: boolean
  ogImage?: { url: string; alt?: string; width?: number; height?: number }
}): Metadata {
  if (!path.startsWith('/')) {
    throw new Error(`buildPageMetadata: path はサイトルート相対（先頭 '/'）で指定してください: ${path}`)
  }
  if (path.length > 1 && path.endsWith('/')) {
    throw new Error(`buildPageMetadata: path の末尾に '/' を付けないでください（canonical が揺れます）: ${path}`)
  }

  // og:title は `<title>` の解決結果と一致させる。root の template は `%s | ザリダス`。
  const cardTitle = titleAbsolute ? title : `${title} | ${SITE_NAME}`
  const image = {
    url: ogImage?.url ?? DEFAULT_OG_IMAGE,
    alt: ogImage?.alt ?? DEFAULT_OG_IMAGE_ALT,
    width: ogImage?.width ?? OG_IMAGE_SIZE.width,
    height: ogImage?.height ?? OG_IMAGE_SIZE.height,
  }

  return {
    title: titleAbsolute ? { absolute: title } : title,
    description,
    // canonical と og:url は同じ `path` から作る。片方だけ書き換える余地を残さない。
    alternates: { canonical: path },
    openGraph: {
      // shallow merge で親から引き継がれないため**必ず**再指定する（問題B の再発防止）。
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ja_JP',
      title: cardTitle,
      description,
      url: path,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: cardTitle,
      description,
      images: [image.url],
    },
  }
}

/**
 * JSON-LD を安全にシリアライズする。
 * `</script>` によるスクリプト注入を防ぐため、すべての `<` を Unicode エスケープに置換する。
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

/**
 * REQ-229 FR-229-02/05: 種を指す JSON-LD `about` ノード（Thing/Taxon）を生成する。
 * 和名（`name`）＋学名（`alternateName`）＋権威 URI（`sameAs`＝Wikidata/GBIF）を持たせ、
 * 検索エンジン/LLM が和名・英名・学名を同一エンティティとして認識できるようにする。
 *
 * SSR（generatePostSEO）・クライアント（useDetailSEO）・地域 Dataset の `about` で
 * 共通利用し、3 者の構造ドリフトを防ぐ（AC-05）。学名・sameAs の出どころは
 * `SPECIES` 種マスタ（constants.ts／一次裏取り済み）に一元化されている。
 *
 * @param species `SPECIES` の要素（マスタ）。
 * @param nameLabel 出力する和名ラベル。i18n 等で表示名を差し替えたい場合に指定（省略時はマスタの `label`）。
 */
export function speciesAboutLd(
  species: Pick<SpeciesOption, 'label' | 'scientificName' | 'sameAs'>,
  nameLabel?: string,
): { '@type': [string, string]; name: string; alternateName: string; sameAs: string[] } {
  return {
    // Taxon は bioschemas 拡張。未対応エンジンでも Thing として解釈される。
    '@type': ['Thing', 'Taxon'],
    name: nameLabel ?? species.label,
    alternateName: species.scientificName,
    sameAs: [...species.sameAs],
  }
}

/**
 * 投稿データから SEO メタデータを生成する（Server Component の generateMetadata 用）
 */
export function generatePostSEO(post: {
  id: string
  species: string
  info_type: string
  municipality?: string | null
  comment?: string | null
  created_at: string
  /** REQ-243/REQ-310: `display_lat` 由来。`location_disclosure='hidden'` では NULL で届く。 */
  lat: number | null
  /** REQ-243/REQ-310: `display_lng` 由来。`location_disclosure='hidden'` では NULL で届く。 */
  lng: number | null
  photos?: string[] | null
}) {
  const species = getSpecies(post.species)
  const infoType = getInfoType(post.info_type)

  const speciesLabel = species?.label ?? '不明'
  const infoTypeLabel = infoType?.label ?? ''

  const seoTitle = `${speciesLabel}の${infoTypeLabel}情報${post.municipality ? ` - ${post.municipality}` : ''}`

  const dateStr = format(new Date(post.created_at), 'PPP', { locale: ja })
  const commentSnippet = post.comment
    ? post.comment.slice(0, 80) + (post.comment.length > 80 ? '…' : '')
    : `${speciesLabel}の${infoTypeLabel}に関する報告です。`

  const seoDescription = `${post.municipality ?? '秋田県'}で${speciesLabel}の${infoTypeLabel}が報告されました（${dateStr}）。${commentSnippet}`

  const ogImage = post.photos?.[0] || DEFAULT_OG_IMAGE

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: seoTitle, item: `${BASE_URL}/post/${post.id}` },
    ],
  }

  // REQ-310 FR-310-04 / FR-310-05: 座標は**有限数のときだけ** geo として出す。
  //
  // `location_disclosure='hidden'` の投稿は `display_lat`/`display_lng` が NULL（schema.sql の
  // `CASE ... WHEN 'hidden' THEN NULL`）で届く。`Number(null) === 0` のため素通しすると
  // `{"latitude":0,"longitude":0}`（ギニア湾沖）という**明確に誤った座標**を構造化データとして
  // 検索エンジン・リッチリザルト検証ツール・データセット消費側（LLM 含む）へ配布してしまう。
  // 座標が無いときは geo キー自体を出さない（`contentLocation.address` は市区町村が有効な情報なので残す）。
  //
  // 規約: **nullable な DB 値を `Number()` に通した結果をそのまま座標に入れないこと。**
  // JSON-LD へ新たに座標を足すときも、この `Number.isFinite` ガードを必ず通す。
  // 同型の実装がクライアント側 `src/hooks/useDetailSEO.ts` にもある（片方だけ直すと 0,0 が残る）。
  const lat = post.lat != null ? Number(post.lat) : null
  const lng = post.lng != null ? Number(post.lng) : null
  const geo =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng }
      : null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Report',
    '@id': `${BASE_URL}/post/${post.id}`,
    name: seoTitle,
    description: seoDescription,
    datePublished: post.created_at,
    url: `${BASE_URL}/post/${post.id}`,
    ...(post.photos?.[0] && { image: post.photos[0] }),
    // REQ-229 FR-229-05: 種を学名・sameAs(Wikidata/GBIF) つきの Thing/Taxon でマークアップ。
    // マスタに無い種（不明等）は最小の Thing にフォールバックする。
    about: species
      ? speciesAboutLd(species, speciesLabel)
      : { '@type': 'Thing', name: speciesLabel },
    contentLocation: {
      '@type': 'Place',
      name: post.municipality ? `秋田県${post.municipality}` : '秋田県',
      address: {
        '@type': 'PostalAddress',
        addressRegion: '秋田県',
        addressLocality: post.municipality ?? '',
        addressCountry: 'JP',
      },
      ...(geo && { geo }),
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: BASE_URL,
    },
  }

  return { seoTitle, seoDescription, ogImage, jsonLd, breadcrumbLd, speciesLabel, infoTypeLabel }
}

/**
 * REQ-227: 種別ピラーページ用の最小 JSON-LD（BreadcrumbList + 種を主題にした WebPage.about）。
 * Dataset 化・学名 sameAs(Wikidata/GBIF) は REQ-229 のスコープのため本ヘルパには含めない。
 */
export function generateSpeciesSEO(species: { value: string; label: string; scientificName?: string }) {
  const url = `${BASE_URL}/species/${species.value}`
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${BASE_URL}/` },
      // REQ-312 FR-312-05: 旧「種類図鑑」は遷移先 /about の h1 と別名だった。
      // 可視パンくず（app/species/[species]/page.tsx）と同一定数から生成する。
      { '@type': 'ListItem', position: 2, name: ABOUT_BREADCRUMB.name, item: `${BASE_URL}${ABOUT_BREADCRUMB.path}` },
      { '@type': 'ListItem', position: 3, name: species.label, item: url },
    ],
  }
  const aboutLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: `${species.label}とは`,
    inLanguage: 'ja',
    isPartOf: { '@id': `${BASE_URL}/#website` },
    about: {
      '@type': 'Thing',
      name: species.label,
      ...(species.scientificName ? { alternateName: species.scientificName } : {}),
    },
  }
  return { breadcrumbLd, aboutLd }
}
