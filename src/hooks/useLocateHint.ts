'use client'

import { useEffect, useState } from 'react'
import { LOCATE_HINT, type FollowMode } from '@/lib/maps/locationFollow'

/** 現在地ボタンの横に出す、状態の説明（札）の種類。翻訳キーは map.locateHint.<種類> */
export type LocateHint = 'locating' | 'locatingSlow' | 'following' | 'paused'

/**
 * 状態の説明を出す時機を決める。状態が変わると札は消える（古い説明を残さない）。
 *
 * - 取得中：GPS が遅い端末では位置が届くまで10秒以上かかる。ボタンの明滅だけでは、押しても何も起きていないように見える
 *   （視覚評価3人・体験評価1人の全員が指摘）。3秒たっても来ないとき「取得しています」、10秒たつと「時間がかかっています」。
 * - 追従・一時停止：止め方（もう一度押す）や、地図を動かすと止まって、押すと戻ることは、ボタンの形だけでは読み取りにくい。
 *   どちらも最初の1回だけ数秒出す（毎回出すと、運転中に邪魔になる）。
 */
export function useLocateHint(mode: FollowMode): LocateHint | null {
  // 取得中の経過（0: 3秒未満 / 1: 3秒〜 / 2: 10秒〜）。取得中でなくなったら 0 に戻す
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  // 追従・一時停止の説明を出し終えたか。出し終える前に状態が変わったら、出し終えていないので、次の同じ状態でもう一度出る
  const [followingDone, setFollowingDone] = useState(false)
  const [pausedDone, setPausedDone] = useState(false)

  useEffect(() => {
    if (mode !== 'locating') return
    const slow = setTimeout(() => setStage(1), LOCATE_HINT.slowMs)
    const verySlow = setTimeout(() => setStage(2), LOCATE_HINT.verySlowMs)
    return () => {
      clearTimeout(slow)
      clearTimeout(verySlow)
      setStage(0)
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'following' || followingDone) return
    const timer = setTimeout(() => setFollowingDone(true), LOCATE_HINT.shownMs)
    return () => clearTimeout(timer)
  }, [mode, followingDone])

  useEffect(() => {
    if (mode !== 'paused' || pausedDone) return
    const timer = setTimeout(() => setPausedDone(true), LOCATE_HINT.shownMs)
    return () => clearTimeout(timer)
  }, [mode, pausedDone])

  if (mode === 'locating') return stage === 2 ? 'locatingSlow' : stage === 1 ? 'locating' : null
  if (mode === 'following' && !followingDone) return 'following'
  if (mode === 'paused' && !pausedDone) return 'paused'
  return null
}
