'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'
import ErrorAlert from '@/components/ui/ErrorAlert'
import LoadingButton from '@/components/ui/LoadingButton'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes
const STORAGE_KEY = 'admin_login_attempts'

interface LoginAttempts {
  count: number
  lockedAt: number | null
}

function getAttempts(): LoginAttempts {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { count: 0, lockedAt: null }
    return JSON.parse(raw) as LoginAttempts
  } catch {
    return { count: 0, lockedAt: null }
  }
}

function saveAttempts(attempts: LoginAttempts) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempts))
}

function clearAttempts() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  // REQ-137: middleware が Supabase 障害等で fail-closed redirect した場合に表示するフラグ
  const authUnavailable = searchParams?.get('reason') === 'auth_unavailable'

  // REQ-018B: Check lockout state on mount and tick for countdown
  useEffect(() => {
    const attempts = getAttempts()
    if (attempts.lockedAt) {
      const unlockTime = attempts.lockedAt + LOCKOUT_MS
      if (Date.now() < unlockTime) {
        setLockedUntil(unlockTime)
      } else {
        clearAttempts()
      }
    }
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= lockedUntil) {
        clearAttempts()
        setLockedUntil(null)
        setError('')
      }
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  const remainingMinutes = lockedUntil
    ? Math.max(1, Math.ceil((lockedUntil - now) / 60_000))
    : 0

  const isLocked = lockedUntil !== null && Date.now() < lockedUntil

  // sessionStorage の試行カウンタは **UX 用の即時フィードバック専用**であり、認可の根拠ではない
  // （DevTools / 別ブラウザ / SDK 直叩きで消せる）。真のサーバー側記録は REQ-292 で
  // Supabase の Password Verification Attempt Hook（public.admin_login_password_attempt）へ移した。
  // ロックに到達したら true を返す（呼び出し側のエラー表示分岐に使う）。
  const recordFailedAttempt = useCallback((): boolean => {
    const attempts = getAttempts()
    const newCount = attempts.count + 1
    if (newCount >= MAX_ATTEMPTS) {
      const lockedAt = Date.now()
      saveAttempts({ count: newCount, lockedAt })
      setNow(lockedAt)
      setLockedUntil(lockedAt + LOCKOUT_MS)
      return true
    }
    saveAttempts({ count: newCount, lockedAt: null })
    return false
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isLocked) return
    // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
    // disabled（LoadingButton の loading）は state 反映前の連打にわずかな隙があるため、処理中なら即 return する。
    // 最終防衛はサーバー側（Supabase Auth のレート制限 ＋ REQ-292 の Auth Hook による記録）。
    if (loading) return
    setError('')
    setLoading(true)
    try {
      // REQ-292 FR-292-02: ログイン前の admin_login_check / 失敗時の admin_login_record(false) は廃止した。
      //   理由: どちらも anon から呼べる SECURITY DEFINER で、
      //     - admin_login_record は p_success を呼び出し側が申告するだけだったため、anon キーで
      //       {"p_email":"<管理者>","p_success":true} を 1 回投げれば試行カウンタが DELETE され
      //       ロックアウトを無制限に回避できた（問題A）。
      //     - 任意メールの email_hash / attempt_count を持つ login_failed 行を audit_logs へ無制限に
      //       注入できた（append-only なので管理者にも消せない。問題C）。
      //     - admin_login_check は任意メールのロック状態を問い合わせられ、管理者メールの当て推量に使えた。
      //   そもそも攻撃者は /auth/v1/token を直接叩くため、フロント経由の記録ではロックは一度も
      //   発火しなかった（問題B）。記録はサーバー側イベント（Password Verification Attempt Hook =
      //   public.admin_login_password_attempt）へ移し、両 RPC は anon から REVOKE した。
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        // 失敗の記録はサーバー側（Auth Hook）が行う。ここでは UX 用のローカル表示のみ更新する。
        const locked = recordFailedAttempt()
        // ロック時は isLocked バナーが admin.login.rateLimited を表示するため error は出さない（重複回避）。
        if (!locked) setError(t('admin.login.error'))
      } else {
        // 成功記録 + login_success 監査。
        // REQ-292 FR-292-03: この呼び出しは signInWithPassword 成功**後**＝authenticated として行う。
        //   関数側は auth.uid() が実在し、その uid のメールが p_email と一致することを要求するため、
        //   他人のメールを申告してカウンタを消したり admin_id=NULL の login_success を作ることはできない。
        // REQ-149 / 監査漏れ対策: fire-and-forget をやめて await し、失敗は握り潰さず logError
        // （Sentry/console）へ記録する。監査記録の失敗でログイン自体を止めはしない（UX 優先）が、
        // リダイレクト前に記録の完了を待ち、欠落を検知できるようにする。
        try {
          const { error: recordError } = await supabase.rpc('admin_login_record', {
            p_email: email,
            p_success: true,
          })
          if (recordError) {
            // PII（メール）は埋め込まず固定ラベルのみ。Sentry 側 scrub もあるが渡さない方針。
            logError(recordError, 'AdminLoginPage:admin_login_record')
          }
        } catch (recordErr) {
          logError(recordErr, 'AdminLoginPage:admin_login_record')
        }
        clearAttempts()
        router.refresh()
        router.push('/admin')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🦞</div>
          <h1 className="text-xl font-bold text-gray-800">{t('admin.login.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('admin.login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authUnavailable && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2.5 rounded-lg"
            >
              {t('admin.login.authUnavailable', {
                defaultValue: '認証サービスに一時的にアクセスできません。再度お試しください。',
              })}
            </div>
          )}
          {isLocked && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-lg">
              {t('admin.login.rateLimited', { minutes: remainingMinutes })}
            </div>
          )}
          <div>
            <label htmlFor="admin-login-email" className="block text-sm font-medium text-gray-700 mb-1">{t('admin.login.email')}</label>
            <input
              id="admin-login-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={isLocked}
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="admin-login-password" className="block text-sm font-medium text-gray-700 mb-1">{t('admin.login.password')}</label>
            <input
              id="admin-login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              disabled={isLocked}
              autoComplete="current-password"
              enterKeyHint="go"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="••••••••"
            />
          </div>

          <ErrorAlert message={error} />

          <LoadingButton
            type="submit"
            loading={loading}
            disabled={isLocked}
            loadingText={t('admin.login.submitting')}
            className="w-full bg-gray-800 text-white rounded-lg py-2 text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('admin.login.submit')}
          </LoadingButton>
        </form>

        <div className="mt-6 text-center">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="text-xs text-gray-400 hover:text-gray-600">{t('admin.login.backToSite')}</a>
        </div>
      </div>
    </div>
  )
}
