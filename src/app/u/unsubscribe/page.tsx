import type { Metadata } from 'next'
import UnsubscribeClient from '@/views/UnsubscribePage'

// REQ-234 FR-234-03: List-Unsubscribe / 本文リンクの着地点（配信停止公開ルート）。
// ログイン不要・署名(不透明)トークン検証のみ。検索エンジンには出さない。
export const metadata: Metadata = {
  title: 'メール配信停止',
  robots: { index: false, follow: false },
  alternates: { canonical: '/u/unsubscribe' },
}

// トークンはユーザ固有のため静的化しない。
export const dynamic = 'force-dynamic'

export default function UnsubscribePage() {
  return <UnsubscribeClient />
}
