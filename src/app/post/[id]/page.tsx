import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generatePostSEO, safeJsonLd, SITE_NAME, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE } from '@/lib/seo'
import DetailPageClient from './DetailPageClient'
import type { DetailPost } from '@/types/post'
import type { LikeSeed } from '@/hooks/useLike'

type Props = {
  params: Promise<{ id: string }>
}

/**
 * REQ-140: 詳細ページが SSR・JSON-LD・Client 初期表示に必要とする最大列セット。
 * comments / likes は PostgREST embed で同じラウンドトリップに同梱する（REQ-113）。
 * これにより `/post/[id]` 1 リクエスト = posts への 1 クエリへ集約できる。
 */
// REQ-231: locality/water_body/is_on_water/elevation_m を含める。地名表示（DetailPageClient）と
// REQ-229 の Dataset/Place JSON-LD への素材供給用（全列 NULL 許容・未付与でも壊れない）。
// REQ-243: 生 lat/lng は anon/authenticated から列 GRANT で剥奪済み。公開用の粗化列 display_lat/display_lng を
// lat/lng へエイリアスして受ける（所有者の正確座標は DetailPage が get_my_post_location RPC で別途取得）。
const POST_DETAIL_COLUMNS = `id, created_at, lat:display_lat, lng:display_lng, location_disclosure, species, info_type, municipality, locality, water_body, is_on_water, elevation_m, comment, photos, user_id, is_anonymous, is_official, count, observed_at, status, rejection_message, weather, temperature, humidity, audio_url, audio_duration_ms, ai_result, comments(id, post_id, user_id, content, is_admin, created_at), likes(id, user_id)`

interface InitialComment {
  id: string
  post_id: string
  user_id: string
  content: string
  is_admin: boolean
  created_at: string
}

export interface DetailPostBundle {
  post: DetailPost | null
  comments: InitialComment[]
  likes: LikeSeed[]
}

/**
 * REQ-140: 同一リクエスト内では post を 1 回だけ取得するため React `cache()` で de-dup する。
 * - `generateMetadata` と RSC 本体の両方からこの関数を呼んでも、Supabase は 1 リクエストにつき 1 回しか叩かれない。
 * - `cache()` はリクエストスコープの dedupe であり、クロスリクエストキャッシュではない（その点では現状の dynamic 挙動を変えない）。
 */
const getPostForDetail = cache(async (id: string): Promise<DetailPostBundle> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(POST_DETAIL_COLUMNS)
    .eq('id', id)
    .single<DetailPost & { comments?: InitialComment[] | null; likes?: LikeSeed[] | null }>()

  if (!data) return { post: null, comments: [], likes: [] }

  // embed を切り出してから post 本体を分離
  const { comments, likes, ...postRest } = data
  return {
    post: postRest as DetailPost,
    comments: comments ?? [],
    likes: likes ?? [],
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const { post } = await getPostForDetail(id)

  if (!post) {
    return {
      title: '投稿が見つかりません',
      description: DEFAULT_DESCRIPTION,
    }
  }

  const { seoTitle, seoDescription } = generatePostSEO(post)

  // Use the post's comment (first 100 chars) as description, fall back to SEO-generated description
  const commentDescription = post.comment
    ? post.comment.slice(0, 100) + (post.comment.length > 100 ? '...' : '')
    : seoDescription
  // Use the post's first photo as OGP image, fall back to default
  const ogImageUrl = post.photos?.[0] || DEFAULT_OG_IMAGE

  return {
    title: seoTitle,
    description: commentDescription,
    alternates: { canonical: `/post/${id}` },
    openGraph: {
      type: 'article',
      title: `${seoTitle} | ${SITE_NAME}`,
      description: commentDescription,
      url: `/post/${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: seoTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${seoTitle} | ${SITE_NAME}`,
      description: commentDescription,
      images: [ogImageUrl],
    },
  }
}

export default async function PostDetailPage({ params }: Props) {
  const { id } = await params

  // REQ-140: generateMetadata と同じ cache() を使うので、ここでは Supabase を再度叩かない。
  const { post, comments, likes } = await getPostForDetail(id)

  // REQ-198 (FR-198-01 / FR-198-03): post が null = 「DB に存在しない」または
  // RLS `moderated_read`（status='approved' OR 本人 OR 管理者）で行が見えないケース。
  // 後者には第三者（匿名クローラ含む）から見た rejected / pending が含まれるため、
  // ここで notFound() を呼ぶことで存在しない・非公開 URL をすべて真の 404 + noindex に寄せる。
  // 所有者・管理者は RLS が行を返すので 200 のまま（DetailPage の pending/rejected バナーで対応）。
  if (!post) notFound()

  // notFound() は never を返すため、ここでは post が non-null に絞り込まれている。
  const { jsonLd, breadcrumbLd } = generatePostSEO(post)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbLd) }} />
      <DetailPageClient
        id={id}
        initialPost={post}
        initialComments={comments}
        initialLikes={likes}
      />
    </>
  )
}
