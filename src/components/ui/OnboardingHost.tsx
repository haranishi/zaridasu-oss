'use client'

import { useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { isRequiredOnboardingOpen, subscribeIntroOverlay, closeIntroStory, getIntroStoryRequest, subscribeIntroStory } from '@/lib/introStorage'

// / の page chunk に本体を含めない。起動元は要求だけを送る。
const OnboardingFlow = dynamic(() => import('@/components/onboarding/OnboardingFlow'), { ssr: false })

export default function OnboardingHost() {
  const router = useRouter()
  const pathname = usePathname()
  const request = useSyncExternalStore(subscribeIntroStory, getIntroStoryRequest, () => null)
  const required = useSyncExternalStore(subscribeIntroOverlay, isRequiredOnboardingOpen, () => false)
  if (required || !request) return null
  return <OnboardingFlow mode="optional" onClose={closeIntroStory} onMapClick={() => router.push('/map')} onPostClick={() => {
    if ((pathname === '/' || pathname === '/map') && request.onPostClick) {
      request.onPostClick()
      return
    }
    // URLで一度だけ意図を引き継ぐ。地図側で認証を待ってから投稿を開始する。
    router.push('/map?post=1')
  }} />
}
