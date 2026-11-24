'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: login/signup/reset の各タブをフォーム単位で分割し、Turnstile まわりをフック化する（648行）。

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2, Camera, MessageCircle, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BrandMark from '@/components/layout/BrandMark'
import { supabase } from '@/lib/supabase/client'
import { signInWithGoogle } from '@/lib/auth/google'
import { useTheme } from '@/context/ThemeContext'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { validatePasswordStrength, passwordRuleChecks } from '@/lib/validation/password'
import { btnPrimaryCls, formInputCls } from '@/lib/formStyles'
import { useEmailResend } from '@/hooks/useEmailResend'
import { trackEvent } from '@/lib/analytics'
import { AUTH_FROM_STORAGE_KEY, AUTH_FROM_TTL_MS, toTrackingProps } from '@/lib/acquisition'

// REQ-212 FR-212-04 / NFR-212-05: Cloudflare Turnstile（Supabase Auth 組み込み CAPTCHA）。
// site key は公開値（NEXT_PUBLIC_*）。secret は Supabase Dashboard 側に保持し、クライアントには出さない。
// ★未設定（site key 空）なら CAPTCHA を完全にスキップ（fail-open）＝開発・未設定環境で壊さない。
//   Supabase 側で CAPTCHA を有効化しない限り captchaToken 無しでも Auth は通るため、
//   「site key 設定 ＋ Supabase Dashboard で CAPTCHA 有効化」の両方が揃って初めて強制される。
// npm 依存は追加せず、widget JS は <script> で動的ロードする（docs/security/captcha-setup.md 参照）。
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      theme?: 'light' | 'dark' | 'auto'
      callback?: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

// Turnstile スクリプトを一度だけ読み込む（複数モーダルでも 1 回）。失敗時は reject で fail-open に倒す。
let turnstileScriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve()
  if (turnstileScriptPromise) return turnstileScriptPromise
  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('turnstile load failed')))
      if (window.turnstile) resolve()
      return
    }
    const s = document.createElement('script')
    s.src = TURNSTILE_SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => {
      turnstileScriptPromise = null
      reject(new Error('turnstile load failed'))
    }
    document.head.appendChild(s)
  })
  return turnstileScriptPromise
}

const AUTH_ERROR_MAP = [
  { match: 'Invalid login credentials', key: 'auth.errors.invalidCredentials' },
  { match: 'Email not confirmed', key: 'auth.errors.emailNotConfirmed', showResend: true },
  // REQ-018D: Generic message to prevent email enumeration
  { match: 'already registered', key: 'auth.errors.invalidCredentials' },
  { match: 'Password should be at least', key: 'auth.errors.passwordTooShort' },
]

// REQ-182 (FR-182-06 / NFR-182-01): sessionStorage（キー zaridasu:authFrom）に退避された LP 流入元を
// TTL 付きで読み取る。書き込み側（HomeInteractive）は `{ v: from, t: 書込時刻 }` で保存する。
// 30 分超で読んだ場合は破棄して from を付与しない（離脱後の残留キーによる誤帰属を防ぐ）。
// 読み取り専用（ここでは削除しない＝CV = AuthCallbackPage の sign_up を最終消費点とする）。
// 別タブ/別端末で開かれるメール確認リンクは sessionStorage を共有しないため from 復元不能（FR-182-05）。
// REQ-289 NFR-289-03: TTL とキー名は src/lib/acquisition.ts に集約した（旧: ここと
// AuthCallbackPage.tsx に同じ値を二重定義していた）。
function readAuthFrom(): string | null {
  try {
    const raw = window.sessionStorage.getItem(AUTH_FROM_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { v?: unknown; t?: unknown }
    if (typeof parsed?.v !== 'string') return null
    if (typeof parsed.t === 'number' && Date.now() - parsed.t > AUTH_FROM_TTL_MS) {
      window.sessionStorage.removeItem(AUTH_FROM_STORAGE_KEY)
      return null
    }
    return parsed.v
  } catch {
    return null
  }
}

interface AuthModalProps {
  onClose: () => void
  defaultTab?: string
}

export default function AuthModal({ onClose, defaultTab = 'login' }: AuthModalProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [tab, setTab] = useState(defaultTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('')
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  const emailRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // REQ-212 FR-212-04: Turnstile widget の状態。site key 未設定なら captchaEnabled=false で完全 no-op。
  const captchaEnabled = TURNSTILE_SITE_KEY !== ''
  const captchaContainerRef = useRef<HTMLDivElement>(null)
  const captchaWidgetIdRef = useRef<string | null>(null)
  const captchaTokenRef = useRef<string>('')
  const [captchaReady, setCaptchaReady] = useState(false)
  const [captchaError, setCaptchaError] = useState(false)

  const resetCaptcha = useCallback(() => {
    captchaTokenRef.current = ''
    if (captchaEnabled && window.turnstile && captchaWidgetIdRef.current) {
      try {
        window.turnstile.reset(captchaWidgetIdRef.current)
      } catch {
        /* reset 失敗は致命的でない（次回送信で再評価） */
      }
    }
  }, [captchaEnabled])

  // Turnstile widget をマウント時に 1 回描画。token はコールバックで ref に貯める（再レンダー不要）。
  // 読み込み失敗時は captchaError=true にして「設定済みだが描画できない」状態をユーザーへ通知する
  // （fail-closed: enabled なのに widget が出ないなら送信できない＝bot 対策の趣旨を保つ）。
  useEffect(() => {
    if (!captchaEnabled) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !captchaContainerRef.current || !window.turnstile) return
        if (captchaWidgetIdRef.current) return
        captchaWidgetIdRef.current = window.turnstile.render(captchaContainerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: dark ? 'dark' : 'light',
          callback: (token: string) => {
            captchaTokenRef.current = token
            setCaptchaReady(true)
            setCaptchaError(false)
          },
          'expired-callback': () => {
            captchaTokenRef.current = ''
            setCaptchaReady(false)
          },
          'error-callback': () => {
            captchaTokenRef.current = ''
            setCaptchaReady(false)
            setCaptchaError(true)
          },
        })
      })
      .catch(() => {
        if (!cancelled) setCaptchaError(true)
      })
    return () => {
      cancelled = true
      if (window.turnstile && captchaWidgetIdRef.current) {
        try {
          window.turnstile.remove(captchaWidgetIdRef.current)
        } catch {
          /* unmount cleanup best-effort */
        }
        captchaWidgetIdRef.current = null
      }
    }
    // dark をトリガーに再描画しない（テーマ切替で widget を作り直すと token が消えるため）。マウント時のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captchaEnabled])

  // REQ-209 FR-209-01: メール再送（クールダウン・送信・文言）は共有フック useEmailResend に一本化。
  // 旧インライン実装（resendCooldownUntil state + setInterval + handleResend の ja 直書き）を廃止し、
  // localStorage 永続のクールダウンと i18n 文言を CommentSection 等と共有する。
  const { resendEmail, startCooldown, resendLoading, resendCooldownSec, resendMessage, resendError } = useEmailResend()

  // REQ-160: 共有フックに統一。tab 切替で focusable 要素が変わるため resetKey に tab を渡す。
  useFocusTrap(dialogRef, true, tab)
  useEscapeKey(onClose)
  useBodyScrollLock()

  function switchTab(newTab: string) {
    setTab(newTab)
    setError('')
    setMessage('')
    setUnconfirmedEmail('')
    setConfirmPassword('')
    setIsDuplicateEmail(false)
  }

  function switchToLogin() {
    setTab('login')
    setError('')
    setMessage('')
    setUnconfirmedEmail('')
    setConfirmPassword('')
    setIsDuplicateEmail(false)
  }

  function switchToReset() {
    setTab('reset')
    setError('')
    setMessage('')
    setUnconfirmedEmail('')
    setConfirmPassword('')
    setIsDuplicateEmail(false)
  }

  // REQ-209 FR-209-01: 再送は共有フックへ委譲。トリガー文脈（error/message ブロック）は維持したまま、
  // 再送結果は resendMessage / resendError（フック由来・i18n）として resendButton 直下に表示する。
  // フォーム全体の error/message を消すと resendButton ごと消えるためここでは触らない（フックが
  // resendMessage/resendError を都度初期化するので古い再送フィードバックは残らない）。
  function handleResend() {
    void resendEmail(unconfirmedEmail || email)
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError('')
    try {
      await signInWithGoogle()
    } catch {
      setError(t('auth.errors.googleFailed'))
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // REQ-223 FR-223-08: 二重送信の第一防衛＝送信ハンドラ先頭の同期ガード。
    // disabled={loading} は state 反映前の連打にわずかな隙があるため、処理中なら即 return する。
    // 最終防衛はサーバー側（Supabase Auth は冪等／重複サインアップは identities 空で検出）。
    if (loading) return

    // REQ-212 FR-212-04 / AC-04: CAPTCHA 有効時は token 必須。未取得（未操作 / 期限切れ / 描画失敗）
    // ならサーバーへ送らず弾く（bot の自動送信を成立させない）。未設定環境では captchaEnabled=false で素通り。
    const captchaToken = captchaEnabled ? captchaTokenRef.current : undefined
    if (captchaEnabled && !captchaToken) {
      setError(t(captchaError ? 'auth.errors.captchaUnavailable' : 'auth.errors.captchaRequired'))
      return
    }
    // Turnstile token は単回使用。今回の試行で消費したら必ず widget をリセットして次の token を要求する。
    const captchaOpts = captchaToken ? { captchaToken } : {}

    setLoading(true)
    setError('')
    setMessage('')
    setUnconfirmedEmail('')
    setIsDuplicateEmail(false)
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password, options: captchaOpts })
        if (error) throw error
        // GTM: メールログインイベント（REQ-033）。REQ-232: 送出口を trackEvent に統一（挙動不変）。
        trackEvent('login', { method: 'email' })
        onClose()
      } else if (tab === 'signup') {
        if (password !== confirmPassword) {
          setError(t('auth.errors.passwordMismatch'))
          return
        }

        // REQ-018A / REQ-152: パスワード強度は共通関数 validatePasswordStrength に集約。
        const strength = validatePasswordStrength(password)
        if (!strength.valid) {
          setError(t(strength.messageKey!))
          return
        }

        // REQ-292 FR-292-05(a): 送信前の check_email_exists RPC による重複事前チェックを廃止した。
        //   同 RPC は SECURITY DEFINER で auth.users を直接引くのに関数内の認可・レート制限・CAPTCHA 検証が
        //   一切無く、anon GRANT されていたため「公開 anon キーだけで任意の辞書を回し、登録ユーザー全員の
        //   メールの在・不在を確認できるオラクル」になっていた。REQ-241 はこの残余リスクを
        //   「Turnstile ＋ Auth レート制限」で受容していたが、Turnstile はこのウィジェットの token を
        //   signUp/signIn に渡すだけで RPC 呼び出しには介在せず、Auth のレート制限は /auth/v1/* にしか
        //   掛からない（PostgREST の /rest/v1/rpc/* には効かない）＝受容根拠が当該経路に存在しなかった。
        //   重複判定は下の signUp 後の identities 空判定（Supabase Auth の統一エラー）に一本化する。
        //   UX は「送信前に分かる」→「送信後に分かる」へ変わるが、文言・導線（ログイン/リセットリンク）は同じ。
        const { data: signUpData, error } = await supabase.auth.signUp({ email, password, options: captchaOpts })
        if (error) throw error

        if (!signUpData.user?.identities?.length) {
          setError(t('auth.errors.alreadyRegistered'))
          setIsDuplicateEmail(true)
          emailRef.current?.focus()
          return
        }

        // GTM: サインアップ送信イベント
        // REQ-176: LP 経由（/?auth=signup&from=lp）の場合は流入元を付与して CV を判別する
        // REQ-182 (FR-182-04): これは「確認メール送信」時点の途中イベントであり CV ではない。
        // ここでは読み取りのみとし削除しない（同一タブで完結する場合に最終 CV = AuthCallbackPage の
        // sign_up まで from を残すため）。残留は TTL（readAuthFrom）と CV/login 時の削除で閉じる。
        const authFrom = readAuthFrom()
        // REQ-232: 送出口を trackEvent に統一（イベント名・method・from は不変）。
        // REQ-289 FR-289-04: 台帳外の値は `other` へ丸め、元値は from_raw で併送する
        // （丸めるだけだと台帳の追加漏れに気づけないため）。
        trackEvent('sign_up_initiated', {
          method: 'email',
          ...toTrackingProps(authFrom),
        })

        setMessage(t('auth.emailSent'))
        setUnconfirmedEmail(email)
        // REQ-209 FR-209-01: サインアップ直後は送信せずクールダウンのみ開始（再送ボタンの連打防止）。
        startCooldown()
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
          ...captchaOpts,
        })
        if (error) throw error
        setMessage(t('auth.resetSent'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.error')
      const mapped = AUTH_ERROR_MAP.find(e => msg.includes(e.match))
      if (mapped) {
        if (mapped.showResend) setUnconfirmedEmail(email)
        if (msg.includes('already registered')) {
          setIsDuplicateEmail(true)
          emailRef.current?.focus()
        }
        setError(t(mapped.key))
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      // Turnstile token は単回使用。成否に関わらず消費済み token を破棄し widget を再チャレンジさせる。
      if (captchaEnabled) {
        setCaptchaReady(false)
        resetCaptcha()
      }
    }
  }

  // パスワード再設定は、ログインの「パスワードを忘れた方」から入る。新規登録と同じ重さのタブとして常時は並べず、開いている間だけ出す。
  const tabs = [
    { id: 'login', label: t('auth.tabs.login') },
    { id: 'signup', label: t('auth.tabs.signup') },
    ...(tab === 'reset' ? [{ id: 'reset', label: t('auth.tabs.reset') }] : []),
  ]

  // REQ-209 FR-209-02: 共有ヘルパーに集約（既定 = ブランド赤フォーカス）。
  const inputCls = formInputCls(dark)

  // REQ-209 FR-209-01: 再送ボタン＋その結果表示（resendMessage/resendError は useEmailResend 由来・i18n）。
  // 成功は緑・失敗は赤でボタン直下に出し、従来どおり再送のフィードバックをユーザーへ伝える。
  const resendButton = (
    <>
      <button
        type="button"
        onClick={handleResend}
        disabled={resendLoading || resendCooldownSec > 0}
        className="underline disabled:opacity-50 disabled:no-underline"
      >
        {resendLoading
          ? t('auth.resendEmailSending')
          : resendCooldownSec > 0
            ? t('auth.resendEmailCooldown', { sec: resendCooldownSec })
            : t('auth.resendEmail')}
      </button>
      {resendMessage && <p className="mt-1 text-emerald-400">{resendMessage}</p>}
      {resendError && <p className="mt-1 text-red-400">{resendError}</p>}
    </>
  )

  return (
    // REQ-160: Escape は useEscapeKey（document リスナ）で処理済み。非対話要素である背景の
    // クリック閉じを補助操作として残すため、キーボード相当操作と対話 role は追加しない。
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
      className={`fixed inset-0 z-430 flex items-center justify-center p-4 ${dark ? 'bg-black/75' : 'bg-black/50'} backdrop-blur-xs`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={dialogRef} className={`rounded-2xl shadow-2xl w-full max-w-sm max-h-[90dvh] overflow-y-auto ${dark ? 'bg-slate-900 border border-slate-700/60 shadow-black/60' : 'bg-white'
        }`}>
        {/* ヘッダー */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
          <h2 id="auth-dialog-title" className={`flex items-center gap-2 text-lg font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}><BrandMark className="h-6 w-6 shrink-0 rounded-md" />ザリダス</h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`rounded-full min-h-11 min-w-11 inline-flex items-center justify-center transition-colors ${dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* タブ */}
        {/* REQ-207 FR-207-06: RankingPage と同パターンで role=tablist/tab・aria-selected を付与 */}
        <div role="tablist" aria-label={t('auth.tabsLabel')} className={`flex border-b px-5 ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`auth-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls="auth-tabpanel"
              onClick={() => switchTab(tb.id)}
              className={`py-3 text-sm font-medium mr-4 border-b-2 transition-colors ${tab === tb.id
                ? (dark ? 'border-red-500 text-red-400' : 'border-red-600 text-red-600')
                : `border-transparent ${dark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-600 hover:text-gray-800'}`
                }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* フォーム */}
        {/* REQ-207 FR-207-06: タブと対応するパネル。aria-labelledby で現在のタブと関連付ける */}
        <div id="auth-tabpanel" role="tabpanel" aria-labelledby={`auth-tab-${tab}`} className="px-5 pt-5 space-y-4">
          {tab === 'signup' && (
            <div className={`rounded-xl p-3 space-y-1.5 ${dark ? 'bg-slate-800/60' : 'bg-red-50'}`}>
              <p className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{t('auth.signupRequired')}</p>
              {[
                { Icon: Camera, text: t('auth.signupBenefits.post') },
                { Icon: LayoutDashboard, text: t('auth.signupBenefits.dashboard') },
                { Icon: MessageCircle, text: t('auth.signupBenefits.comment') },
              ].map((b) => (
                <div key={b.text} className={`flex items-center gap-2 text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                  <b.Icon size={16} aria-hidden="true" className="shrink-0" />
                  <span>{b.text}</span>
                </div>
              ))}
            </div>
          )}

          {tab !== 'reset' && (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading || loading}
                aria-label={t('auth.googleLogin')}
                className={`w-full flex items-center justify-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${dark
                  ? 'bg-slate-800 border-slate-600/80 text-slate-200 hover:bg-slate-700 active:bg-slate-600'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                {googleLoading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                {t('auth.googleLogin')}
              </button>

              <div className="flex items-center gap-3">
                <div className={`flex-1 border-t ${dark ? 'border-slate-700' : 'border-gray-200'}`} />
                <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('auth.orDivider')}</span>
                <div className={`flex-1 border-t ${dark ? 'border-slate-700' : 'border-gray-200'}`} />
              </div>
            </>
          )}
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          <div>
            <label htmlFor="auth-email" className={`block text-sm font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('auth.email')}
            </label>
            <input
              id="auth-email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError('') }}
              onBlur={() => {
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  setEmailError(t('auth.errors.invalidEmail'))
                } else {
                  setEmailError('')
                }
              }}
              required
              placeholder="example@email.com"
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? 'auth-email-error' : undefined}
              className={`${inputCls}${emailError ? ' border-red-500' : ''}`}
            />
            {emailError && <p id="auth-email-error" className={`text-xs mt-1 ${dark ? 'text-red-400' : 'text-red-600'}`}>{emailError}</p>}
          </div>

          {tab !== 'reset' && (
            <div>
              <label htmlFor="auth-password" className={`block text-sm font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={tab === 'signup' ? t('auth.passwordMinLength') : '••••••••'}
                minLength={tab === 'signup' ? 8 : 6}
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                enterKeyHint={tab === 'signup' ? 'next' : 'go'}
                className={inputCls}
              />
              {tab === 'signup' && password.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {passwordRuleChecks(password).map((req) => (
                    <p key={req.key} className={`text-xs flex items-center gap-1 ${req.met ? (dark ? 'text-green-400' : 'text-green-700') : dark ? 'text-slate-400' : 'text-gray-500'}`}>
                      <span>{req.met ? '✓' : '○'}</span>
                      <span>{t(`auth.passwordRules.${req.key}`)}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'signup' && (
            <div>
              <label htmlFor="auth-password-confirm" className={`block text-sm font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                {t('auth.passwordConfirm')}
              </label>
              <input
                id="auth-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder={t('auth.passwordConfirmPlaceholder')}
                minLength={8}
                autoComplete="new-password"
                enterKeyHint="go"
                className={inputCls}
              />
            </div>
          )}

          {error && (
            <div className="space-y-2">
              <ErrorAlert message={error} />
              {unconfirmedEmail && (
                <div className="text-sm text-red-400 px-3">
                  {resendButton}
                </div>
              )}
              {isDuplicateEmail && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-red-400 px-3">
                  <button
                    type="button"
                    onClick={switchToLogin}
                    className="underline hover:no-underline"
                  >
                    {t('auth.goToLogin')}
                  </button>
                  <button
                    type="button"
                    onClick={switchToReset}
                    className="underline hover:no-underline"
                  >
                    {t('auth.goToReset')}
                  </button>
                </div>
              )}
            </div>
          )}

          {message && (
            // REQ-195 (FR-195-03): 成功メッセージ（メール送信完了等）を role="status" + aria-live="polite"
            // でスクリーンリーダーへ通知する。成功通知は緊急度が低いため polite を用いる（NFR-195-01）。
            <div
              role="status"
              aria-live="polite"
              className="bg-emerald-500/10 text-emerald-400 text-sm px-3 py-2.5 rounded-xl border border-emerald-500/20 space-y-2"
            >
              <p>{message}</p>
              {unconfirmedEmail && resendButton}
            </div>
          )}

          {/* REQ-212 FR-212-04: Turnstile widget。site key 未設定なら captchaEnabled=false で何も描画しない
              （開発・未設定環境では従来どおり CAPTCHA 無しで動作）。読み込み失敗時は説明文を出す。 */}
          {captchaEnabled && (
            <div>
              <div ref={captchaContainerRef} className="flex justify-center" />
              {captchaError && (
                <p role="alert" className="mt-1 text-center text-xs text-red-400">
                  {t('auth.errors.captchaUnavailable')}
                </p>
              )}
            </div>
          )}

          {tab === 'signup' && (
            <p className={`text-center text-xs ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
              {t('auth.consent.lead')}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline">{t('footer.terms')}</a>
              {t('auth.consent.and')}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">{t('footer.privacy')}</a>
              {t('auth.consent.tail')}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || (captchaEnabled && !captchaReady)}
            className={`${btnPrimaryCls} w-full font-bold py-3 flex items-center justify-center gap-2`}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" />{t('auth.processing')}</>
            ) : (
              tab === 'login' ? t('auth.submitLogin') : tab === 'signup' ? t('auth.submitSignup') : t('auth.submitReset')
            )}
          </button>

          {tab === 'login' && (
            <p className={`text-center text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
              <button
                type="button"
                onClick={() => switchTab('reset')}
                className={`underline transition-colors ${dark ? 'hover:text-slate-400' : 'hover:text-gray-600'}`}
              >
                {t('auth.forgotPasswordLink')}
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
