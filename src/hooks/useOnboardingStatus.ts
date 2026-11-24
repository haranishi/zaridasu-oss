'use client'

import { useEffect, useMemo, useState } from 'react'
import { readLocal, readSession, writeSession } from '@/lib/introStorage'
import { supabase } from '@/lib/supabase/client'
import { ONBOARDING_COMPLETED_EVENT, isRegion, regionBounds, type Region } from '@/lib/onboarding'

export interface OnboardingStatus {
  loading: boolean
  done: boolean
  region: Region | null
  /** nullでない場合も利用を妨げないこと。未完了と取得失敗を区別する。 */
  error: string | null
}

export const ONBOARDING_STATUS_TIMEOUT_MS = 8_000

const EMPTY: OnboardingStatus = { loading: false, done: false, region: null, error: null }

/** userIdごとにマウント中1回取得。失敗を完了扱いせず、古いユーザーの応答も捨てる。 */
export function useOnboardingStatus(userId: string | null | undefined): OnboardingStatus {
  const [state, setState] = useState<{ userId: typeof userId; status: OnboardingStatus } | null>(null)

  // ログアウト→同じIDで再ログインした場合も、前回の完了状態を再利用しない。
  if (state && state.userId !== userId) setState(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    const controller = new AbortController()
    let completed = false
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const onCompleted = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; region?: unknown }>).detail
      if (detail?.userId !== userId || !isRegion(detail.region)) return
      completed = true
      clearTimeout(timer)
      controller.abort()
      setState({ userId, status: { ...EMPTY, done: true, region: detail.region } })
    }
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, onCompleted)
    const finish = (status: OnboardingStatus) => {
      if (active && !completed && !timedOut) setState({ userId, status })
    }
    async function fetchStatus() {
      if (!navigator.onLine) {
        finish({ ...EMPTY, error: 'offline' })
        return
      }
      timer = setTimeout(() => {
        finish({ ...EMPTY, error: 'timeout' })
        timedOut = true
        controller.abort()
      }, ONBOARDING_STATUS_TIMEOUT_MS)
      try {
        const { data, error } = await supabase.from('user_onboarding')
          .select('region').eq('user_id', userId!).abortSignal(controller.signal).maybeSingle()
        if (error) throw error
        finish({ ...EMPTY, done: data !== null, region: data?.region ?? null })
      } catch (error) {
        finish({ ...EMPTY, error: error instanceof Error ? error.message : 'onboarding_fetch_failed' })
      } finally {
        clearTimeout(timer)
      }
    }
    void fetchStatus()
    return () => {
      active = false
      clearTimeout(timer)
      window.removeEventListener(ONBOARDING_COMPLETED_EVENT, onCompleted)
      controller.abort()
    }
  }, [userId])

  if (!userId) return EMPTY
  if (state?.userId !== userId) return { ...EMPTY, loading: true }
  return state.status
}

/** 地域取得前の県全域fitを避ける。Gateと同じ共有モジュールに置き、/ の予算を守る。 */
export function useOnboardingMapBounds(userId: string | null | undefined) {
  const status = useOnboardingStatus(userId)
  const [guestRegion, setGuestRegion] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const update = () => setGuestRegion(readLocal('zaridasu_onboarding_region_v1'))
    update()
    setReady(true)
    window.addEventListener(ONBOARDING_COMPLETED_EVENT, update)
    return () => window.removeEventListener(ONBOARDING_COMPLETED_EVENT, update)
  }, [])
  const region = userId ? status.region : guestRegion
  const initialBounds = useMemo(() => regionBounds(region), [region])
  return { initialBounds, loading: !ready || status.loading }
}

/** 別ページのGateからもホームの投稿フォームへ接続する。 */
export function useOnboardingPostRequest(onPost: () => void) {
  useEffect(() => {
    const open = () => {
      if (readSession('zaridasu_onboarding_post_v1') !== '1') return
      writeSession('zaridasu_onboarding_post_v1', '0')
      onPost()
    }
    open()
    window.addEventListener('zaridasu:onboarding-post', open)
    return () => window.removeEventListener('zaridasu:onboarding-post', open)
  }, [onPost])
}
