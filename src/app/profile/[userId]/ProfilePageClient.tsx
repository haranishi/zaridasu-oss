'use client'

import ProfilePage from '@/views/ProfilePage'

export default function ProfilePageClient({ userId }: { userId: string }) {
  return <ProfilePage userId={userId} />
}
