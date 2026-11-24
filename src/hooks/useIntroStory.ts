'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { trackEvent } from '@/lib/analytics'
import {
  acquireIntroOverlay,
  isRequiredOnboardingOpen,
  deferIntroForSession,
  isIntroOverlayOpen,
  markIntroOptedOut,
  requestIntroStory,
  shouldShowIntroPrompt,
  subscribeIntroOverlay,
} from '@/lib/introStorage'

/**
 * REQ-284: 誘いポップアップ（IntroPrompt）の表示判定とストレージ書き込み。
 *
 * FR-284-03: 出現はページ表示から 5 秒後。SignupBanner（3秒）・InstallBanner（15秒）と
 * 同時に画面へ出さないため、表示中は FR-284-14 の共有ストアで両バナーを抑止する。
 */
export const INTRO_PROMPT_DELAY_MS = 5 * 1000

export interface UseIntroStoryOptions {
  /** ストーリー最終画面［投稿してみる］の遷移先。 */
  onPostClick?: () => void
}

export interface UseIntroStoryResult {
  /** 誘いポップアップを表示中か */
  promptOpen: boolean
  /** ［読んでみる］。ストーリー本体は providers の OnboardingHost が開く。 */
  openStory: () => void
  /** ［あとで］= この訪問中だけ非表示（FR-284-04 / AC-03） */
  dismissForSession: () => void
  /** ［今後表示しない］= 恒久 opt-out（FR-284-04 / AC-02） */
  optOut: () => void
}

export function useIntroStory({ onPostClick }: UseIntroStoryOptions = {}): UseIntroStoryResult {
  // NFR: SSR と初回描画では必ず false。localStorage 参照は useEffect で行い、
  // サーバー側の ReferenceError とハイドレーション不一致を防ぐ（achievement.ts と同方針）。
  const [promptOpen, setPromptOpen] = useState(false)
  const required = useSyncExternalStore(subscribeIntroOverlay, isRequiredOnboardingOpen, () => false)

  useEffect(() => {
    // FR-284-02: opt-out / 読了 / 当セッションの［あとで］のいずれかがあれば出さない。
    if (!shouldShowIntroPrompt()) return
    const timer = setTimeout(() => {
      if (!shouldShowIntroPrompt() || isIntroOverlayOpen()) return
      setPromptOpen(true)
      // FR-284-16: 誘いポップアップの表示回数。
      trackEvent('intro_prompt_shown')
    }, INTRO_PROMPT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  // FR-284-14: 誘いポップアップ表示中も SignupBanner / InstallBanner を出さない。
  useEffect(() => {
    if (!promptOpen) return
    return acquireIntroOverlay()
  }, [promptOpen])

  const openStory = useCallback(() => {
    setPromptOpen(false)
    requestIntroStory({ onPostClick })
    trackEvent('intro_open', { source: 'prompt' })
  }, [onPostClick])

  const dismissForSession = useCallback(() => {
    deferIntroForSession()
    setPromptOpen(false)
  }, [])

  const optOut = useCallback(() => {
    markIntroOptedOut()
    trackEvent('intro_optout', { source: 'prompt' })
    setPromptOpen(false)
  }, [])

  return { promptOpen: promptOpen && !required, openStory, dismissForSession, optOut }
}

/**
 * FR-284-14: 紹介系オーバーレイ（誘い or ストーリー）が表示中かを購読する。
 * SignupBanner / InstallBanner が「多重ポップアップ禁止」の判定に使う。
 */
export function useIntroOverlayOpen(): boolean {
  return useSyncExternalStore(subscribeIntroOverlay, isIntroOverlayOpen, () => false)
}

/**
 * 「紹介系オーバーレイを表示中」であることを宣言する（マウント中だけカウントを持つ）。
 * useBodyScrollLock の参照カウントとは独立で、body のスタイルには触れない。
 */
export function useIntroOverlayLock(active = true): void {
  useEffect(() => {
    if (!active) return
    return acquireIntroOverlay()
  }, [active])
}
