import type { Metadata } from 'next'
import { countPublicPostsByUser } from '@/lib/data/posts'
import { createClient } from '@/lib/supabase/server'
import { SITE_NAME } from '@/lib/seo'
import ProfilePageClient from './ProfilePageClient'

type Props = {
  params: Promise<{ userId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params
  const supabase = await createClient()

  // Fetch user profile data
  // REQ-246: .single() は select 結果が配列型でないと既定ジェネリックが never に潰れるため、
  // 取得列の行形状を明示する（display_name/avatar_emoji のみ）。
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('display_name, avatar_emoji')
    .eq('id', userId)
    .single<{ display_name: string | null; avatar_emoji: string | null }>()

  // Fetch post count for this user
  const { count } = await countPublicPostsByUser(supabase, userId)

  const displayName = profile?.display_name || '匿名ユーザー'
  const postCountText = count != null ? `${count}件の投稿` : ''
  const description = postCountText
    ? `${displayName}さんのプロフィール。${postCountText}の活動実績があります。`
    : `${displayName}さんのプロフィール。投稿履歴・バッジ・活動実績を確認できます。`

  return {
    title: `${displayName}のプロフィール`,
    description,
    robots: { index: false },
    openGraph: {
      type: 'profile',
      title: `${displayName}のプロフィール | ${SITE_NAME}`,
      description,
      url: `/profile/${userId}`,
    },
    twitter: {
      card: 'summary',
      title: `${displayName}のプロフィール | ${SITE_NAME}`,
      description,
    },
  }
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params
  return <ProfilePageClient userId={userId} />
}
