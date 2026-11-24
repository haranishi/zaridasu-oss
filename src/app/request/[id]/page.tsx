import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAnonClient } from '@/lib/supabase/anon'
import { SITE_NAME, DEFAULT_OG_IMAGE } from '@/lib/seo'
import { getSpecies } from '@/lib/constants'
import SurveyRequestPageClient from './SurveyRequestPageClient'

type Props = {
  params: Promise<{ id: string }>
}

export const revalidate = 300

/**
 * REQ-198 (FR-198-02 / NFR-198-01): generateMetadata と RSC 本体の両方から呼べる存在確認クエリ。
 * `/post/[id]` の getPostForDetail と同様に React `cache()` でリクエストスコープの de-dup を行い、
 * メタデータ生成と本体描画で survey_requests を二重に叩かないようにする。
 */
const getSurveyRequest = cache(async (id: string) => {
  // REQ-186: anon クライアント(cookie 非依存)で ISR(revalidate=300)を実効化する。
  // survey_requests の SELECT RLS は USING(true)(公開)なので anon で取得可能。
  const supabase = createAnonClient()
  if (!supabase) return null
  const { data } = await supabase
    .from('survey_requests')
    .select('id, species, municipality, reason, urgency, status, created_at')
    .eq('id', id)
    .single()
  return data
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const request = await getSurveyRequest(id)

  if (!request) {
    return {
      title: '調査依頼が見つかりません',
      description: '秋田県内の外来生物に関する調査依頼の詳細情報と関連する投稿を確認できます。',
    }
  }

  const speciesLabel = getSpecies(request.species)?.label ?? '不明な種'
  const location = request.municipality ?? '秋田県'
  const title = `${location}の${speciesLabel}調査依頼`
  const reasonSnippet = request.reason
    ? request.reason.slice(0, 100) + (request.reason.length > 100 ? '...' : '')
    : `${location}で${speciesLabel}に関する調査が依頼されています。`
  const description = `${location}での${speciesLabel}に関する調査依頼。${reasonSnippet}`

  return {
    title,
    description,
    alternates: { canonical: `/request/${id}` },
    openGraph: {
      type: 'article',
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/request/${id}`,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'ザリダス - 秋田県外来生物情報マップ' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  }
}

export default async function SurveyRequestPage({ params }: Props) {
  const { id } = await params

  // REQ-198 (FR-198-02): DB に存在しない依頼 ID は真の 404 + noindex に寄せる。
  // survey_requests の SELECT RLS は USING (true)（全件公開）なので、ここでの null は
  // 「存在しない（または取得できない）」ことのみを意味する。cache() により上の
  // generateMetadata と取得は共有され、二重クエリにはならない（NFR-198-01）。
  const request = await getSurveyRequest(id)
  if (!request) notFound()

  return <SurveyRequestPageClient id={id} />
}
