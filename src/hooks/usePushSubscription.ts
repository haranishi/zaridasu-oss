'use client'

/**
 * REQ-237 FR-237-02/04: Web Push 購読フック。
 *
 * 既存の Service Worker（providers.tsx で /sw.js を登録済み）の上に PushManager 購読を載せる。
 * メール（REQ-234）と相補的な「即時」リエンゲージ・チャネル。
 *
 * 設計（許諾 UX / FR-237-04・AC-04）:
 *   - 初回訪問では何もしない。`subscribe()` を呼ぶのは「価値が伝わったタイミング」（例: 設定トグル ON、
 *     初回投稿完了後など）に呼び出し側が決める（プリプロンプト → ブラウザ許諾の二段の後段）。
 *   - 一度ブラウザで拒否（denied）された場合は localStorage に記録し、自動再要求しない（しつこくしない）。
 *
 * セキュリティ（NFR-237-01 / REQ-211）:
 *   - クライアントが触るのは VAPID「公開鍵」のみ（NEXT_PUBLIC_VAPID_PUBLIC_KEY）。
 *     秘密鍵はサーバー専用（Edge Function Secrets）。本フックは秘密鍵を一切扱わない。
 *
 * iOS/Safari 制約（NFR-237-02）:
 *   - iOS の Web Push は「ホーム画面に追加した PWA（standalone 表示）」でのみ動作する。
 *     未対応環境では supported=false / unsupportedReason を返し、UI 側でメール（REQ-234）へ誘導する。
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

/** 拒否を記録して自動再要求しないための localStorage キー（FR-237-04）。 */
const DENIED_KEY = 'zaridasu:push:denied'

/** UI 側がフォールバック表示を切り替えるための非対応理由。 */
export type UnsupportedReason = null | 'no_api' | 'ios_needs_pwa' | 'no_vapid_key'

export interface UsePushSubscriptionResult {
  /** この環境で Web Push が使えるか（false ならメールへフォールバック / NFR-237-02）。 */
  supported: boolean
  unsupportedReason: UnsupportedReason
  /** 現在この端末で購読済みか。 */
  subscribed: boolean
  /** ブラウザ通知許諾の状態（'default' | 'granted' | 'denied'）。SSR/未対応時は 'default'。 */
  permission: NotificationPermission
  /** 処理中（多重押下防止用）。 */
  busy: boolean
  /** 購読を作成/保存する（プリプロンプト後に呼ぶ）。成功で true。 */
  subscribe: () => Promise<boolean>
  /** 購読を解除して DB から無効化する。 */
  unsubscribe: () => Promise<void>
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** base64url の VAPID 公開鍵を applicationServerKey 用の Uint8Array に変換する。 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** iOS（iPhone/iPad）かどうか（standalone PWA 判定と併用）。 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  // iPadOS 13+ は Mac を騙るためタッチ可能な Mac も iOS 扱いにする。
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return iOSDevice || iPadOS
}

/** standalone（ホーム追加 PWA）で起動しているか。 */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari は navigator.standalone、その他は display-mode: standalone。
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  const mq = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return iosStandalone || mq
}

function computeSupport(): { supported: boolean; reason: UnsupportedReason } {
  if (typeof window === 'undefined') return { supported: false, reason: 'no_api' }
  const hasApi =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  if (!hasApi) {
    // iOS で API が無いのは「ホーム追加 PWA で開いていない」のが典型（NFR-237-02）。
    if (isIOS() && !isStandalone()) return { supported: false, reason: 'ios_needs_pwa' }
    return { supported: false, reason: 'no_api' }
  }
  // iOS は standalone PWA でないと push が動かない。
  if (isIOS() && !isStandalone()) return { supported: false, reason: 'ios_needs_pwa' }
  if (!VAPID_PUBLIC_KEY) return { supported: false, reason: 'no_vapid_key' }
  return { supported: true, reason: null }
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const { user } = useAuth()
  const [{ supported, reason }, setSupport] = useState<{ supported: boolean; reason: UnsupportedReason }>(
    { supported: false, reason: 'no_api' },
  )
  const [subscribed, setSubscribed] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [busy, setBusy] = useState(false)

  // マウント後にのみ環境判定（SSR では window/navigator が無い）。
  useEffect(() => {
    const s = computeSupport()
    setSupport(s)
    if (typeof Notification !== 'undefined') setPermission(Notification.permission)
    if (!s.supported) return
    let cancelled = false
    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) setSubscribed(!!sub)
      } catch { /* 取得失敗は未購読扱い */ }
    })()
    return () => { cancelled = true }
  }, [])

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !user) return false
    setBusy(true)
    try {
      // 既に denied なら自動では出さない（呼び出し側がプリプロンプトで案内する想定 / FR-237-04）。
      let perm = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
      if (perm === 'default') {
        perm = await Notification.requestPermission()
        setPermission(perm)
      }
      if (perm !== 'granted') {
        if (perm === 'denied' && typeof localStorage !== 'undefined') {
          localStorage.setItem(DENIED_KEY, '1') // 拒否を記録（再要求しない / AC-04）
        }
        return false
      }
      if (typeof localStorage !== 'undefined') localStorage.removeItem(DENIED_KEY)

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      }

      // 購読を user_profiles の本人行に紐づけて保存（RLS で本人のみ / FR-237-03）。
      const json = sub.toJSON()
      const keys = json.keys ?? {}
      const endpoint = json.endpoint ?? sub.endpoint
      if (!endpoint || !keys.p256dh || !keys.auth) return false

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
          enabled: true,
          last_seen_at: new Date().toISOString(),
          last_failed_at: null,
        },
        { onConflict: 'user_id,endpoint' },
      )
      if (error) return false

      // チャネルの opt-in を有効化（メール=REQ-234 とは別軸 / FR-237-06）。
      await supabase
        .from('user_profiles')
        .update({
          notify_push_post_status: true,
          notify_push_comment: true,
          notify_push_nearby: true,
        })
        .eq('id', user.id)

      setSubscribed(true)
      return true
    } catch {
      return false
    } finally {
      setBusy(false)
    }
  }, [supported, user])

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!user) return
    setBusy(true)
    try {
      let endpoint: string | undefined
      if (supported) {
        try {
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            endpoint = sub.endpoint
            await sub.unsubscribe()
          }
        } catch { /* 解除失敗でも DB 側は無効化する */ }
      }

      // DB 側: この端末の購読行を削除し、push opt-in をすべて切る。
      let del = supabase.from('push_subscriptions').delete().eq('user_id', user.id)
      if (endpoint) del = del.eq('endpoint', endpoint)
      await del
      await supabase
        .from('user_profiles')
        .update({
          notify_push_post_status: false,
          notify_push_comment: false,
          notify_push_nearby: false,
        })
        .eq('id', user.id)

      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }, [supported, user])

  return { supported, unsupportedReason: reason, subscribed, permission, busy, subscribe, unsubscribe }
}
