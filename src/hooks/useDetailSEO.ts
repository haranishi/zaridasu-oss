import { format } from 'date-fns'
import { getSpecies, getInfoType, BASE_URL } from '@/lib/constants'
import type { SpeciesOption, InfoTypeOption } from '@/lib/constants'
import { getDateLocale } from '@/lib/dateLocales'
import { speciesAboutLd } from '@/lib/seo'
import { useTranslation } from 'react-i18next'

interface PostLike {
  id: string
  species: string
  info_type: string
  municipality: string | null
  created_at: string
  comment: string | null
  photos: string[] | null
  /** REQ-243/REQ-310: `display_lat` 由来。`location_disclosure='hidden'` では NULL で届く。 */
  lat: number | null
  /** REQ-243/REQ-310: `display_lng` 由来。`location_disclosure='hidden'` では NULL で届く。 */
  lng: number | null
}

interface UseDetailSEOResult {
  seoTitle: string
  seoDescription: string
  jsonLd: Record<string, unknown> | null
  breadcrumbLd: Record<string, unknown> | null
  // REQ-209 FR-209-04: ローカル並行型(SpeciesEntry/InfoTypeEntry)を廃し、constants の正本型を直接返す。
  species: SpeciesOption | null
  infoType: InfoTypeOption | null
}

/**
 * DetailPage の SEO データ（タイトル・description・JSON-LD）を生成するフック
 */
export function useDetailSEO(post: PostLike | null): UseDetailSEOResult {
  const { t, i18n } = useTranslation()
  const currentLang = i18n.language || 'ja'
  // REQ-209 FR-209-03: date-fns ロケールマップは dateLocales の getDateLocale に一本化（未知言語は ja）。
  const dateLocale = getDateLocale(currentLang)

  if (!post) return { seoTitle: '', seoDescription: '', jsonLd: null, breadcrumbLd: null, species: null, infoType: null }

  // REQ-229: マスタ(SpeciesOption)を直接引き、学名・sameAs の単一の出どころにする。
  // REQ-209 FR-209-04: マスタ型をそのまま使い、as unknown as の二段キャストを廃止。
  const speciesMaster: SpeciesOption | null = getSpecies(post.species) ?? null
  const species = speciesMaster
  const infoType: InfoTypeOption | null = getInfoType(post.info_type) ?? null

  const speciesLabelText = species?.label ? t(`species.${post.species}`) : t('detail.unknown')
  const infoTypeLabelText = infoType?.label ? t(`infoType.${post.info_type}`) : ''

  const seoTitle = t('detail.seoTitle', {
    species: speciesLabelText,
    infoType: infoTypeLabelText,
    municipality: post.municipality ?? '',
  })

  const dateStr = format(new Date(post.created_at), 'PPP', { locale: dateLocale })
  const commentSnippet = post.comment
    ? post.comment.slice(0, 80) + (post.comment.length > 80 ? '…' : '')
    : t('detail.seoDescriptionFallback')

  const seoDescription = t('detail.seoDescription', {
    municipality: post.municipality ?? '',
    species: speciesLabelText,
    infoType: infoTypeLabelText,
    date: dateStr,
    comment: commentSnippet,
  })

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('detail.breadcrumbHome'), item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: seoTitle, item: `${BASE_URL}/post/${post.id}` },
    ],
  }

  // REQ-310 FR-310-04 / FR-310-05: SSR（src/lib/seo.ts の generatePostSEO）と同一のガード。
  // `location_disclosure='hidden'` の投稿は lat/lng（display_lat/display_lng 由来）が NULL で届き、
  // `Number(null) === 0` のため素通しすると geo 0,0（ギニア湾沖）を出力してしまう。
  // 有限数のときだけ geo キーを出す（address は市区町村が有効な情報なので残す）。
  // 規約: nullable な DB 値を `Number()` に通した結果をそのまま座標に入れないこと。
  const lat = post.lat != null ? Number(post.lat) : null
  const lng = post.lng != null ? Number(post.lng) : null
  const geo =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng }
      : null

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Report',
    '@id': `${BASE_URL}/post/${post.id}`,
    name: seoTitle,
    description: seoDescription,
    datePublished: post.created_at,
    url: `${BASE_URL}/post/${post.id}`,
    ...(post.photos?.[0] && { image: post.photos[0] }),
    // REQ-229 FR-229-05 / AC-05: SSR(generatePostSEO) と同一形の about を出す
    // （和名 name ＋学名 alternateName ＋ sameAs(Wikidata/GBIF)）。表示名は i18n の和名。
    about: speciesMaster
      ? speciesAboutLd(speciesMaster, speciesLabelText)
      : { '@type': 'Thing', name: speciesLabelText },
    contentLocation: {
      '@type': 'Place',
      name: post.municipality ? `${t('detail.locationPrefix')}${post.municipality}` : t('detail.locationPrefix'),
      address: {
        '@type': 'PostalAddress',
        addressRegion: t('detail.locationPrefix'),
        addressLocality: post.municipality ?? '',
        addressCountry: currentLang === 'ja' ? 'JP' : undefined,
      },
      ...(geo && { geo }),
    },
    publisher: {
      '@type': 'Organization',
      name: t('about.serviceTitle'),
      url: BASE_URL,
    },
  }

  return { seoTitle, seoDescription, jsonLd, breadcrumbLd, species, infoType }
}
