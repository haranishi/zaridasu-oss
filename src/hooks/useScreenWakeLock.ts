'use client'

import { useEffect } from 'react'

/**
 * 使っているあいだ、画面を点けたままにする。
 *
 * 追従中に画面が自動で消えると、ブラウザが位置の更新を止めて、点がまた動かなくなる。
 * ページが隠れると OS が解放するので、見える状態に戻ったら取り直す。
 * 非対応・省電力・拒否で取れなくても追従は続けるので、失敗は黙って諦める。
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return
    const wakeLock = navigator.wakeLock
    let sentinel: WakeLockSentinel | null = null
    let requesting = false
    let cancelled = false

    const release = (target: WakeLockSentinel | null) => {
      try {
        void target?.release().catch(() => {})
      } catch {
        // 解放の失敗は、できることがない
      }
    }
    const acquire = async () => {
      // 隠れた状態の要求は失敗する。見える状態になるまで待つ
      if (requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      requesting = true
      try {
        const next = await wakeLock.request('screen')
        if (cancelled) release(next)
        else sentinel = next
      } catch {
        // 次に見えたときに取り直す
      } finally {
        requesting = false
      }
    }
    const onVisibilityChange = () => { void acquire() }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      release(sentinel)
      sentinel = null
    }
  }, [active])
}
