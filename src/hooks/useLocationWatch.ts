'use client'

import { useEffect, useEffectEvent } from 'react'
import { FOLLOW, toErrorKind, toFix, type Fix, type FollowErrorKind } from '@/lib/maps/locationFollow'

interface Options {
  /** false のあいだは位置を取らない（許可も求めない） */
  enabled: boolean
  onFix: (fix: Fix) => void
  onError: (kind: FollowErrorKind) => void
}

/**
 * 端末の位置を継続して取る（watchPosition）。
 *
 * - ページが隠れたら止め、見える状態に戻ったら取り直す。電池を使わないためと、
 *   iOS では裏から戻ったあとに監視が止まったままになることがあるため。
 * - 止めたあとに遅れて届いたコールバックは渡さない（世代の番号で見分ける）。
 * - 位置はコールバックで渡すだけで、ここでは保存も送信もしない。
 */
export function useLocationWatch({ enabled, onFix, onError }: Options): void {
  // 最新のコールバックを、取得を取り直さずに呼ぶ
  const emitFix = useEffectEvent(onFix)
  const emitError = useEffectEvent(onError)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return
    const geolocation = navigator.geolocation
    let watchId: number | null = null
    let generation = 0

    const start = () => {
      if (watchId !== null) return
      const mine = ++generation
      watchId = geolocation.watchPosition(
        (position) => {
          const fix = toFix(position)
          if (mine === generation && fix) emitFix(fix)
        },
        (error) => {
          if (mine === generation) emitError(toErrorKind(error.code))
        },
        FOLLOW.geolocation,
      )
    }
    const stop = () => {
      if (watchId === null) return
      geolocation.clearWatch(watchId)
      watchId = null
      generation++
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [enabled])
}
