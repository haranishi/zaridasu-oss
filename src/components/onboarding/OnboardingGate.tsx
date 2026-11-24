'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus'
import { acquireIntroOverlay, closeIntroStory, writeSession } from '@/lib/introStorage'

const OnboardingFlow = dynamic(() => import('./OnboardingFlow'), { ssr: false })

export default function OnboardingGate() {
  const { user } = useAuth()
  const pathname = usePathname()
  // メール確認・パスワード再設定など、認証手続きを先に完了できるようにする。
  const isAuthRoute = /^\/auth(?:\/|$)/.test(pathname ?? '')
  // REQ-325: 管理画面（/admin）では必須オンボーディングを出さない。運用の画面を塞がないため
  // （CI の admin-gemini-banner.spec は admin をモックしており、ここで出すとバナーの操作を遮った）。
  if (!user || isAuthRoute || (pathname ?? '').startsWith('/admin')) return null
  // ログアウトで子を破棄し、次回ログインには「あとで」を持ち越さない。
  return <UserGate key={user.id} userId={user.id} />
}

function UserGate({ userId }: { userId: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { loading, done, error } = useOnboardingStatus(userId)
  const [dismissed, setDismissed] = useState(false)
  const open = !loading && !done && !error && !dismissed
  useEffect(() => {
    if (!open) return
    closeIntroStory()
    return acquireIntroOverlay(true)
  }, [open])
  if (!open) return null
  return <OnboardingFlow mode="required" onClose={() => setDismissed(true)} onMapClick={() => router.push('/map')} onPostClick={() => {
    if (pathname === '/map') {
      writeSession('zaridasu_onboarding_post_v1', '1')
      window.dispatchEvent(new Event('zaridasu:onboarding-post'))
    } else router.push('/map?post=1')
  }} />
}
