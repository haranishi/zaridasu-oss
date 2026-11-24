import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { RESEND_COOLDOWN_MS } from '@/lib/constants'

const COOLDOWN_KEY = 'email_resend_cooldown_until'

interface UseEmailResendResult {
  resendEmail: (email: string) => Promise<void>
  /**
   * REQ-209 FR-209-01: 確認メールの「再送信」ではなく「初回送信直後」（例: サインアップ成功時）に
   * 連打防止のクールダウンだけ開始したいときに使う。送信は行わず期限の seed のみ行う。
   */
  startCooldown: () => void
  resendLoading: boolean
  resendCooldownSec: number
  resendMessage: string
  resendError: string
}

/**
 * REQ-178: クールダウン期限を localStorage から安全に読み取る。
 * SSR（サーバー実行時）には `localStorage` が存在しないため `typeof window` で
 * ガードし、無効・例外時（プライベートモード等）も try/catch でクールダウン 0
 * （= 期限なし）にフォールバックして、再送信機能の主要部を壊さない。
 */
function readCooldownUntil(): number {
  if (typeof window === 'undefined') return 0
  try {
    const stored = window.localStorage.getItem(COOLDOWN_KEY)
    return stored ? Number(stored) : 0
  } catch {
    return 0
  }
}

/**
 * REQ-178 / NFR-178-01: 初回レンダー（SSR・およびクライアントのハイドレーション）では
 * 常に 0（クールダウンなし）を返す。サーバーとクライアントの初回出力を一致させ、
 * `resendCooldownSec` のハイドレーション不整合を避ける。localStorage の実値は
 * マウント後の useEffect で補正する。
 */
function getInitialCooldownUntil(): number {
  return 0
}

/** REQ-178: localStorage への書き込みも同様にガード + try/catch で囲む。 */
function writeCooldownUntil(until: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(COOLDOWN_KEY, String(until))
  } catch {
    // localStorage が使えない環境（プライベートモード等）では永続化を諦め、
    // 当該セッション内のクールダウン（cooldownUntil state）のみで動作させる。
  }
}

export function useEmailResend(): UseEmailResendResult {
  const { t } = useTranslation()
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [resendError, setResendError] = useState('')
  const [now, setNow] = useState(Date.now())
  // REQ-178: 旧来はレンダー本体で `localStorage.getItem` を無ガード実行していたため
  // SSR で `ReferenceError: localStorage is not defined` を投げていた。
  // useState の遅延初期化に移し、初回レンダーは常に 0（クールダウンなし）。
  // localStorage の実値はマウント後の useEffect で補正する（下記）。
  const [cooldownUntil, setCooldownUntil] = useState<number>(getInitialCooldownUntil)

  const resendCooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

  // REQ-178 / NFR-178-01: サーバーは cooldownUntil=0 でレンダーするため、初回マウント後に
  // localStorage の保存値へ補正してクライアントの挙動（残秒の復元）を維持する。
  // ハイドレーション後の setState なので不整合の警告は出ない。
  useEffect(() => {
    const stored = readCooldownUntil()
    setCooldownUntil((prev) => (prev === stored ? prev : stored))
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (resendCooldownSec <= 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [resendCooldownSec])

  // REQ-209 FR-209-01: クールダウン期限を localStorage + state へ反映する共通処理。
  function applyCooldown() {
    const until = Date.now() + RESEND_COOLDOWN_MS
    writeCooldownUntil(until)
    setCooldownUntil(until)
    setNow(Date.now())
  }

  // REQ-209 FR-209-01: 送信せずクールダウンのみ開始（サインアップ成功直後の連打防止に使用）。
  function startCooldown() {
    applyCooldown()
  }

  async function resendEmail(email: string) {
    if (!email || resendCooldownSec > 0) return
    setResendLoading(true)
    setResendError('')
    setResendMessage('')
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw error
      applyCooldown()
      // REQ-209 FR-209-01: 文言は i18n キーで供給する（ja 直書きを廃止し 4 言語整合）。
      setResendMessage(t('auth.emailResent'))
    } catch {
      setResendError(t('auth.errors.resendFailed'))
    } finally {
      setResendLoading(false)
    }
  }

  return { resendEmail, startCooldown, resendLoading, resendCooldownSec, resendMessage, resendError }
}
