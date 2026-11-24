'use client'

import DetailPage from '@/views/DetailPage'
import type { DetailPost } from '@/types/post'
import type { LikeSeed } from '@/hooks/useLike'

interface InitialComment {
  id: string
  post_id: string
  user_id: string
  content: string
  is_admin: boolean
  created_at: string
}

interface DetailPageClientProps {
  id: string
  /**
   * REQ-140: RSC 側で de-dup 取得した投稿・コメント・いいねを seed として渡す。
   * - `initialPost === null` の場合は「投稿が見つからない」or「Client にフォールバック fetch させたい」シーン。
   *   後者の動作は DetailPage 側で吸収（`initialPost?.id !== id` のときだけ fetch）する。
   */
  initialPost?: DetailPost | null
  initialComments?: InitialComment[] | null
  initialLikes?: LikeSeed[] | null
}

export default function DetailPageClient({ id, initialPost, initialComments, initialLikes }: DetailPageClientProps) {
  return (
    <DetailPage
      id={id}
      initialPost={initialPost ?? null}
      initialComments={initialComments ?? null}
      initialLikes={initialLikes ?? null}
    />
  )
}
