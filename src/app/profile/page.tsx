import type { Metadata } from 'next'
import ProfilePageClient from './ProfilePageClient'

export const metadata: Metadata = {
  title: 'マイプロフィール',
  description: 'ザリダスのマイプロフィールページ。投稿履歴やバッジを確認できます。',
  robots: { index: false },
}

export default function ProfilePage() {
  return <ProfilePageClient />
}
