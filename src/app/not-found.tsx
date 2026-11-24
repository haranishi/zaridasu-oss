import type { Metadata } from 'next'
import NotFoundPage from '@/views/NotFoundPage'

// REQ-275 FR-275-07: 従来は 'use client' で metadata を export できず、404 の <title> が
// ルート既定「ザリダス - 秋田県外来生物情報マップ」のままだった。Server Component 化して
// タイトルを明示する（NotFoundPage 自体は従来どおり Client Component）。
export const metadata: Metadata = {
  title: 'ページが見つかりません',
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return <NotFoundPage />
}
