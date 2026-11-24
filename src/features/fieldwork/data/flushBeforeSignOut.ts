// REQ-330: ログアウトの前に、端末に残っている記録を送る（確認で「送ってからログアウト」を選んだとき）。
// 送るのは、調査の送信待ち（localStorage）と、圏外で保存した投稿の下書き（IndexedDB）と、
// 圏外で保存した非公開スポット（localStorage）の 3 つ。
// 別のタブやこの画面の送信が走っていれば、終わるのを少し待つ（すぐ「送れなかった」にしない）。
// 送り終えられなかった件数と理由を返す。0 でなければ呼び手はログアウトをやめる（送れない記録を黙って捨てない）。
// AuthContext から押したときだけ読み込む（全ページの共通部分を重くしない）。

import { insertPrivateSpot } from '@/lib/data/private-spots'
import { isNetworkError, readPendingSpots, removePendingSpot } from '@/lib/privateSpots'
import { supabase } from '@/lib/supabase/client'

import { errorReason } from '../lib/errors'
import { flushQueue, isFlushing, readQueue } from '../lib/queue'
import { sendQueuedItem } from './sendQueued'

/** 別の送信が終わるのを待つ長さ（ms）。 */
const WAIT_FOR_OTHER_SEND_MS = 15_000
const POLL_MS = 400

export interface SignOutFlushResult {
  /** 送り終えられなかった件数（送信待ち＋投稿の下書き＋非公開スポット）。 */
  left: number
  /** 残った理由。offline=電波が無い・途中で切れた、failed=上限など通信以外で送れない。 */
  reason: 'offline' | 'failed' | null
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function flushBeforeSignOut(userId: string): Promise<SignOutFlushResult> {
  let interrupted = false
  let failed = false
  const deadline = Date.now() + WAIT_FOR_OTHER_SEND_MS

  // 1. 調査の送信待ち。この画面の別の送信が送っている最中の項目は飛ばされるので、終わるまで待って送り直す
  for (;;) {
    const result = await flushQueue(
      userId,
      (item, save) => sendQueuedItem(supabase, item, save),
      isNetworkError,
      errorReason,
      { waitForOtherTabMs: WAIT_FOR_OTHER_SEND_MS }
    )
    if (result.interrupted) interrupted = true
    if (result.failed.length > 0) failed = true
    if (result.interrupted || !isFlushing(userId) || Date.now() > deadline) break
    await wait(POLL_MS)
  }
  // 送り直しても通らない失敗が書き残されている項目（上限など）
  const queueLeft = readQueue(userId)
  if (queueLeft.some((i) => i.lastError && i.lastError !== 'offline')) failed = true

  // 2. 圏外で保存した投稿の下書き（地点から作ったものは、送るときに近くの希少種を確かめ直す）
  let draftsLeft = 0
  try {
    const { getPendingPosts } = await import('@/lib/offlineStore')
    const { sendPendingPost } = await import('@/lib/offlineSend')
    for (const post of await getPendingPosts(userId)) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        interrupted = true
        draftsLeft++
        continue
      }
      if (!(await sendPendingPost(userId, post))) {
        draftsLeft++
        failed = true
      }
    }
  } catch {
    // IndexedDB が使えない端末。下書きは無い
  }

  // 3. 圏外で保存した非公開スポット。送れたものから端末から外す（座標が入るので、送れないまま消さない）
  let spotsLeft = 0
  for (const spot of readPendingSpots().filter((s) => s.userId === userId)) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      interrupted = true
      spotsLeft++
      continue
    }
    // 地図の画面が同じものを送っていて、先に端末から外れていたら送らない（二重にしない）
    if (!readPendingSpots().some((s) => s.localId === spot.localId)) continue
    try {
      await insertPrivateSpot(supabase, {
        userId,
        name: spot.name,
        note: spot.note,
        lat: spot.lat,
        lng: spot.lng,
        accuracy: spot.accuracy,
        recordedAt: spot.recordedAt,
      })
      removePendingSpot(spot.localId)
    } catch (err) {
      spotsLeft++
      if (isNetworkError(err)) interrupted = true
      else failed = true
    }
  }

  const left = readQueue(userId).length + draftsLeft + spotsLeft
  if (left === 0) return { left: 0, reason: null }
  const offline = interrupted || (typeof navigator !== 'undefined' && navigator.onLine === false)
  return { left, reason: offline ? 'offline' : failed ? 'failed' : 'offline' }
}
