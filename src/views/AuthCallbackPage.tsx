'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { validatePasswordStrength, PASSWORD_MIN_LENGTH } from '@/lib/validation/password'
import { formInputCls } from '@/lib/formStyles'
import { trackEvent } from '@/lib/analytics'
import { AUTH_FROM_STORAGE_KEY, AUTH_FROM_TTL_MS, toTrackingProps } from '@/lib/acquisition'

// REQ-182 (FR-182-01/03/06 / NFR-182-01): LP 流入元（sessionStorage キー zaridasu:authFrom）を
// CV 確定点で読み取り、確実に削除して返す（CV = sign_up が最終消費点）。
// 書き込み側（HomeInteractive）は `{ v: from, t: 書込時刻 }` で退避する。TTL（30分）超は破棄。
// 削除は from の有無に関わらず常に行い、残留による誤帰属（FR-182-06）を防ぐ。
// Google OAuth は同一タブでリダイレクト往復するため sessionStorage が保持され捕捉可能（FR-182-02）。
// 別タブ/別端末で開かれるメール確認リンクは sessionStorage 非共有のため from 復元不能（FR-182-05）。
// REQ-289 NFR-289-03: TTL とキー名は src/lib/acquisition.ts に集約した。
function consumeAuthFrom(): string | null {
  try {
    const raw = window.sessionStorage.getItem(AUTH_FROM_STORAGE_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(AUTH_FROM_STORAGE_KEY)
    const parsed = JSON.parse(raw) as { v?: unknown; t?: unknown }
    if (typeof parsed?.v !== 'string') return null
    if (typeof parsed.t === 'number' && Date.now() - parsed.t > AUTH_FROM_TTL_MS) return null
    return parsed.v
  } catch {
    return null
  }
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const { dark } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState('loading') // 'loading', 'recovery', 'confirmed', 'error'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    // PKCE flow: type は searchParams、implicit flow: type は hash に来る
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const type = searchParams.get('type') || hashParams.get('type')
    const errorCode = hashParams.get('error_code') || searchParams.get('error_code')
    const errorDescription = hashParams.get('error_description') || searchParams.get('error_description')

    if (errorCode) {
      setMode('error')
      if (errorCode === 'otp_expired') {
        setError(t('authCallback.errors.otpExpired'))
      } else {
        setError(errorDescription ? decodeURIComponent(errorDescription) : t('authCallback.errors.authFailed'))
      }
      return
    }

    if (type === 'recovery') {
      setMode('recovery')
      return
    }

    const isEmailConfirmation = type === 'signup' || type === 'email'
    const isOAuth = !type && !errorCode

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery')
      } else if (event === 'SIGNED_IN' && session) {
        if (isEmailConfirmation) {
          // GTM: メール確認による登録完了イベント（REQ-033）。REQ-232: trackEvent 経由（挙動不変）。
          // REQ-182 (FR-182-01): LP 経由（from=lp）を CV に付与。同一タブで完結する確認のみ復元可（FR-182-05）。
          const from = consumeAuthFrom()
          trackEvent('sign_up', { method: 'email', ...toTrackingProps(from) })
          setMode('confirmed')
          // 2026-10-19: 登録後の行き先はホーム（以前はマイページ）。投稿画面は自動で開かない。
          setTimeout(() => router.replace('/'), 3000)
        } else {
          if (isOAuth) {
            // REQ-033: created_atから60秒以内なら新規登録、それ以外はログイン
            const createdAt = new Date(session.user.created_at).getTime()
            const isNewUser = Date.now() - createdAt < 60_000
            // REQ-182 (FR-182-01/02): 新規(sign_up)には from を付与。login には付与しないが、
            // 残留窓を閉じるため from の有無に関わらず consumeAuthFrom で必ず削除する（FR-182-03）。
            const from = consumeAuthFrom()
            trackEvent(isNewUser ? 'sign_up' : 'login', { method: 'google', ...(isNewUser ? toTrackingProps(from) : {}) })
          }
          router.replace('/')
        }
      } else if (event === 'INITIAL_SESSION') {
        if (session && isOAuth) {
          // REQ-033: created_atから60秒以内なら新規登録、それ以外はログイン
          const createdAt = new Date(session.user.created_at).getTime()
          const isNewUser = Date.now() - createdAt < 60_000
          // REQ-182 (FR-182-01/02): OAuth 新規(sign_up)に from を付与。login には付与しないが
          // 残留窓を閉じるため from の有無に関わらず必ず削除する（FR-182-03）。
          const from = consumeAuthFrom()
          trackEvent(isNewUser ? 'sign_up' : 'login', { method: 'google', ...(isNewUser ? toTrackingProps(from) : {}) })
          router.replace('/')
        } else if (!session) {
          setMode('error')
          setError(t('authCallback.errors.invalidLink'))
        } else if (!isEmailConfirmation) {
          router.replace('/dashboard')
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [router, t])

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault()
    // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
    // disabled={isSubmitting} は state 反映前の連打にわずかな隙があるため、処理中なら即 return する。
    // 最終防衛はサーバー側（Supabase Auth updateUser は冪等）。
    if (isSubmitting) return
    // REQ-152: サインアップ経路と同一の強度ポリシー（共通関数）を適用する。
    const strength = validatePasswordStrength(password)
    if (!strength.valid) {
      setError(t(strength.messageKey!))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth.errors.passwordMismatch'))
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('authCallback.errors.updateFailed'))
      setIsSubmitting(false)
    }
  }

  if (mode === 'error') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'}`}>
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">🦞</div>
          <h1 className="text-lg font-bold">{t('authCallback.error.title')}</h1>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{error}</p>
          <div className="flex flex-col gap-2 pt-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Auth callback needs full reload */}
            <a
              href="/"
              className="inline-block bg-accent text-white font-bold py-2.5 px-6 rounded-xl text-sm hover:bg-(--color-accent-hover) transition-all"
            >
              {t('authCallback.error.backToTop')}
            </a>
            <p className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
              {t('authCallback.error.retryHint')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'recovery') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'}`}>
        <div className={`w-full max-w-sm rounded-2xl p-6 shadow-xl ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold">{t('authCallback.recovery.title')}</h1>
            <p className={`text-sm mt-2 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
              {t('authCallback.recovery.subtitle')}
            </p>
          </div>

          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div>
              <label htmlFor="authcb-password" className={`block text-xs font-semibold mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                {t('authCallback.recovery.passwordLabel')}
              </label>
              <input
                id="authcb-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t('auth.passwordMinLength')}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                enterKeyHint="next"
                aria-invalid={!!error}
                aria-describedby={error ? 'authcb-error' : undefined}
                className={formInputCls(dark)}
              />
            </div>
            <div>
              <label htmlFor="authcb-password-confirm" className={`block text-xs font-semibold mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                {t('authCallback.recovery.passwordConfirmLabel')}
              </label>
              <input
                id="authcb-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder={t('authCallback.recovery.passwordConfirmPlaceholder')}
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                enterKeyHint="go"
                aria-invalid={!!error}
                aria-describedby={error ? 'authcb-error' : undefined}
                className={formInputCls(dark)}
              />
            </div>

            {error && (
              <div id="authcb-error" role="alert" className="bg-red-500/10 text-red-500 text-xs px-3 py-2.5 rounded-xl border border-red-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-accent text-white font-bold py-3 rounded-xl hover:bg-(--color-accent-hover) disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" />{t('authCallback.recovery.submitting')}</>
              ) : (
                t('authCallback.recovery.submit')
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (mode === 'confirmed') {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'}`}>
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🎉</div>
          <h1 className="text-lg font-bold">{t('authCallback.confirmed.title')}</h1>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            {t('authCallback.confirmed.description')}
          </p>
          <p className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{t('authCallback.confirmed.redirecting')}</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Auth callback needs full reload */}
          <a
            href="/"
            className="inline-block bg-accent text-white font-bold py-2.5 px-6 rounded-xl text-sm hover:bg-(--color-accent-hover) transition-all"
          >
            {t('authCallback.confirmed.goToHome')}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className="text-center space-y-3">
        <Loader2 size={28} className="animate-spin text-red-500 mx-auto" />
        <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('authCallback.loading')}</p>
      </div>
    </div>
  )
}
