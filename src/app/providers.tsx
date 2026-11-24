'use client'

import { useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ToastProvider } from '@/context/ToastContext'
import { MapSettingsProvider } from '@/context/MapSettingsContext'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import LoadingScreen from '@/components/ui/LoadingScreen'
import InstallBanner from '@/components/ui/InstallBanner'
// REQ-284 (FR-284-10 / AC-05): ストーリー本体のアプリ唯一のマウント先。
// どのページのメニューからでも開けるよう InstallBanner と同じ層に置く。
import OnboardingHost from '@/components/ui/OnboardingHost'
import OnboardingGate from '@/components/onboarding/OnboardingGate'
import WebVitalsReporter from '@/components/ui/WebVitalsReporter'
import { useTranslation } from 'react-i18next'
import { restoreClientLanguage } from '@/lib/i18n'
import { setErrorReporter } from '@/lib/errorHandler'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

const NON_EDITABLE_INPUT_TYPES = new Set(['button', 'hidden', 'image', 'reset', 'submit'])

export function hasUnsavedFormInput(root: ParentNode): boolean {
  const inputs = root.querySelectorAll<HTMLInputElement>('input')
  for (const input of inputs) {
    if (NON_EDITABLE_INPUT_TYPES.has(input.type)) continue
    if (input.type === 'file') {
      if ((input.files?.length ?? 0) > 0) return true
      continue
    }
    if (input.type === 'checkbox' || input.type === 'radio') {
      if (input.checked !== input.defaultChecked) return true
      continue
    }
    if (input.value !== input.defaultValue) return true
  }

  const textareas = root.querySelectorAll<HTMLTextAreaElement>('textarea')
  for (const textarea of textareas) {
    if (textarea.value !== textarea.defaultValue) return true
  }

  const editables = root.querySelectorAll<HTMLElement>(
    '[contenteditable]:not([contenteditable="false"])',
  )
  return Array.from(editables).some((element) => (element.textContent ?? '').trim().length > 0)
}

// REQ-099: 本番ビルドのみ Sentry に転送する。dev / preview では noopReporter のままにする。
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  void import('@/lib/sentryReporter').then(({ sentryReporter }) => {
    setErrorReporter(sentryReporter)
  })
}

/**
 * REQ-018 / REQ-197: オンライン復帰（offline→online 遷移）時に未送信通知。
 * 検知は useOnlineStatus に一元化し、ここでは遷移をトリガーに pending 件数を取得する。
 * REQ-330: 数えるのは今の利用者の下書きだけ（同じ端末の別の人の下書きを知らせない）。AuthProvider の内側に置く。
 */
function PendingDraftsNotice({ isOffline }: { isOffline: boolean }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [pendingNotice, setPendingNotice] = useState('')
  const wasOfflineRef = useRef(isOffline)
  useEffect(() => {
    const recovered = !isOffline && wasOfflineRef.current
    wasOfflineRef.current = isOffline
    if (!recovered || !userId) return
    let cancelled = false
    void (async () => {
      try {
        const { getPendingCount } = await import('@/lib/offlineStore')
        const count = await getPendingCount(userId)
        if (!cancelled && count > 0) {
          setPendingNotice(`未送信の下書きが${count}件あります。マイページから送信できます。`)
          setTimeout(() => setPendingNotice(''), 8000)
        }
      } catch { /* IndexedDB 未対応時は無視 */ }
    })()
    return () => { cancelled = true }
  }, [isOffline, userId])

  if (!pendingNotice || isOffline) return null
  return (
    <button
      type="button"
      className="fixed top-0 left-0 right-0 z-50 bg-success text-success-fg text-center text-sm py-2 px-4 shadow-md cursor-pointer border-0 flex items-center justify-center gap-1.5"
      onClick={() => setPendingNotice('')}
      aria-label={t('common.close', { defaultValue: '閉じる' })}
    >
      <span aria-hidden="true">📤</span>
      <span>{pendingNotice}</span>
    </button>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)
  // REQ-197 FR-197-03: navigator.onLine 直読み + 独自イベント購読を共通フックへ統合。
  const isOffline = !useOnlineStatus()

  // Supabase auth リンクがルートページに来た場合 /auth/callback へリダイレクト
  useEffect(() => {
    if (window.location.pathname !== '/') return
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const searchParams = new URLSearchParams(window.location.search)
    const type = hashParams.get('type') || searchParams.get('type')
    const error = hashParams.get('error') || searchParams.get('error')
    if (type === 'recovery' || error) {
      window.location.replace(`/auth/callback${window.location.search}${window.location.hash}`)
    }
  }, [])

  useEffect(() => {
    // 初回マウント時に言語復元を待ってからフェードアウト開始（言語切替によるCLSと人工的な待機をともに削減）
    // REQ-209 FR-209-08: rAF コールバックの戻り値は破棄され useEffect のクリーンアップにならない。
    // rAF ハンドルと timer を useEffect 本体で控え、return するクリーンアップで両方を解放する
    // （アンマウントがフェード開始前なら rAF を、開始後なら removeTimer を確実にキャンセルする）。
    //
    // REQ-326: **rAF だけに頼らない。** 背景タブでは rAF が発火しないため、検索結果からの
    // 中クリック等で開くとローディングが載ったままになる（2026-09-14 に実測：6 秒時点で
    // フェードのクラスすら付かず、地図タイルは 40 枚描画済み）。同じ解除をタイマーからも
    // 起こし、先に来た方で 1 回だけ進める。
    let removeTimer: ReturnType<typeof setTimeout> | undefined
    let rafId: number | undefined
    let started = false
    const start = () => {
      if (started) return
      started = true
      setFadeOut(true)
      removeTimer = setTimeout(() => setLoading(false), 400)
    }
    void restoreClientLanguage().finally(() => {
      if (!started) {
        rafId = requestAnimationFrame(start)
      }
    })
    const fallbackTimer = setTimeout(start, 800)
    return () => {
      started = true
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      clearTimeout(fallbackTimer)
      if (removeTimer !== undefined) clearTimeout(removeTimer)
    }
  }, [])

  // Service Worker 登録
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // REQ-267 FR-267-01: 初回インストール（controller: null → clients.claim() で獲得）でも
      // controllerchange は発火するため、登録開始「前」の制御状態を捕捉しておく。
      // 既にコントローラがいた場合＝真のSW更新への切替のときだけリロードし、初回訪問での
      // 無条件フルリロード（帯域浪費・表示ちらつき・E2E のナビゲーション競合）を避ける。
      const hadController = Boolean(navigator.serviceWorker.controller)
      let refreshing = false // controllerchange の多重発火による二重リロード防止

      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((registration) => {
          registration.update().catch(() => undefined)

          navigator.serviceWorker.addEventListener('controllerchange', () => {
            // 新しいSWが有効化されたら最新アセットを取得する（真の更新時のみ）
            if (!hadController || refreshing) return
            if (hasUnsavedFormInput(document)) return
            refreshing = true
            window.location.reload()
          })
        })
        .catch((err) => {
          console.warn('Service Worker registration failed:', err) // eslint-disable-line no-console
        })
    }
  }, [])

  return (
    <ErrorBoundary>
      <WebVitalsReporter />
      {loading && <LoadingScreen fadeOut={fadeOut} />}
      <ThemeProvider>
        <ToastProvider>
          <InstallBanner />
          <AuthProvider>
            <OnboardingHost />
            <OnboardingGate />
            {/* REQ-224 FR-224-05: 状態バナーは色＋アイコン＋テキストの3点セット。
                色はセマンティック状態トークン（warning/success）でコントラストを担保。 */}
            {isOffline && (
              <div className="fixed top-0 left-0 right-0 z-50 bg-warning text-warning-fg text-center text-sm py-2 px-4 shadow-md flex items-center justify-center gap-1.5">
                <span aria-hidden="true">⚠️</span>
                <span>{t('app.offline')}</span>
              </div>
            )}
            <PendingDraftsNotice isOffline={isOffline} />
            <MapSettingsProvider>
              {children}
            </MapSettingsProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
