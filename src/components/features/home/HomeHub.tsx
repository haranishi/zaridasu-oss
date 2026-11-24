'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Header from '@/components/layout/Header'
import BottomNav, { NAV_TABS, useNavTap } from '@/components/layout/BottomNav'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useOnboardingPostRequest } from '@/hooks/useOnboardingStatus'
import { trackEvent } from '@/lib/analytics'
import type { Gap } from '@/lib/homeGaps'
import { postPresetHref, type PostPreset } from '@/lib/postPreset'
import CampaignBanner from './CampaignBanner'
import HomeFeed from './HomeFeed'
import HomeGaps from './HomeGaps'
import HomeHero from './HomeHero'
import HomeResources from './HomeResources'
import styles from './home.module.css'

const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })
const HomeProfile = dynamic(() => import('./HomeProfile'), { loading: () => <div className={`${styles.profileCard} ${styles.profileSkeleton}`} aria-busy="true" /> })

function AuthEntry({ onAuth }: { onAuth: (mode: string) => void }) {
  const params = useSearchParams()
  const router = useRouter()
  const { user, loading } = useAuth()
  useEffect(() => {
    const mode = params.get('auth')
    if (loading || (mode !== 'login' && mode !== 'signup')) return
    const next = new URLSearchParams(params.toString())
    const from = next.get('from')
    try { if (from) sessionStorage.setItem('zaridasu:authFrom', JSON.stringify({ v: from, t: Date.now() })) } catch { /* Optional attribution. */ }
    next.delete('auth'); next.delete('from')
    router.replace(next.size ? `/?${next}` : '/', { scroll: false })
    if (!user) onAuth(mode)
  }, [params, router, user, loading, onAuth])
  return null
}

export default function HomeHub() {
  const { dark } = useTheme()
  const { user, loading: authLoading } = useAuth()
  const { t } = useTranslation()
  const router = useRouter()
  const [auth, setAuth] = useState<string | null>(null)
  const openAuth = useCallback((mode: string) => setAuth(mode), [])
  // 認証が確定するまでは未ログインとして描く。サーバーが出すHTMLにも見出しを含め、未ログインでは画面がずれない。
  const showHero = authLoading || !user
  // 会員は投稿画面へ、未ログインは登録画面へ。未ログインで記録しようとした回数を数える。登録後は投稿画面ではなくホームへ戻る。
  const startPost = useCallback((entry: string, preset?: PostPreset | null) => {
    if (user) { router.push(postPresetHref(preset)); return }
    trackEvent('post_intent', { entry })
    setAuth('signup')
  }, [user, router])
  const startFromHeader = useCallback(() => startPost('header'), [startPost])
  const startFromNav = useCallback(() => startPost('bottom_nav'), [startPost])
  const startFromOnboarding = useCallback(() => startPost('onboarding'), [startPost])
  const startFromHero = useCallback(() => startPost('home_hero'), [startPost])
  const startFromGap = useCallback((gap: Gap) => {
    trackEvent('home_gap', { gap: gap.kind })
    startPost('home_gap', gap.preset)
  }, [startPost])
  useOnboardingPostRequest(startFromOnboarding)
  const { isActive, handleTap } = useNavTap({ onPostClick: startFromNav, onLoginClick: openAuth })
  return <div className={`${styles.home} ${dark ? styles.dark : ''}`}>
    <Suspense fallback={null}><AuthEntry onAuth={openAuth} /></Suspense>
    <Header onPostClick={startFromHeader} onLoginClick={openAuth} onSurveyClick={() => router.push('/requests?create=1')} />
    <div className={`${styles.layout} ${showHero ? styles.layoutGuest : ''}`}>
      <aside className={styles.sidebar} aria-label={t('homeHub.navigation')}>
        <nav aria-label={t('header.mainNav')}>{NAV_TABS.map(tab => { const Icon = tab.icon; return <button type="button" key={tab.key} className={`${styles.sideTab} ${isActive(tab.path) ? styles.sideActive : ''}`} aria-current={isActive(tab.path) ? 'page' : undefined} aria-label={tab.key === 'post' ? t('bottomNav.postAction') : undefined} onClick={() => handleTap(tab)}><Icon size={20} /><span>{t(tab.labelKey)}</span></button> })}</nav>
        <p className={styles.caption}>{t('homeHub.tagline')}</p>
      </aside>
      <div className={styles.bannerArea}>
        {showHero && <HomeHero onSignup={startFromHero} />}
        <CampaignBanner />
      </div>
      <aside className={styles.profileArea} aria-label={t(user ? 'homeHub.myRecords' : 'homeHub.hintTitle')}>
        {user && <HomeProfile />}
        <div className={styles.desktopHint}><Info size={24} /><h2>{t('homeHub.hintTitle')}</h2><p className={styles.body}>{t('homeHub.hintDescription')}</p><Link href="/guide" className={styles.button}>{t('homeHub.recordingHints')}</Link></div>
      </aside>
      <div className={styles.content}><HomeFeed afterPickup={<HomeGaps onStart={startFromGap} />} /><HomeResources /></div>
    </div>
    <BottomNav onPostClick={startFromNav} onLoginClick={openAuth} />
    {auth && <AuthModal onClose={() => setAuth(null)} defaultTab={auth} />}
  </div>
}
