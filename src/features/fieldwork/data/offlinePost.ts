// REQ-330（2 周目の点検）: 圏外で投稿の下書き（IndexedDB）に入った「いた」を、電波が戻って送るときの保護と地点とのつなぎ。
//
// 圏外では DB に確かめられないので、地点から開いたフォームの下書きは「地点から作った」印（地点 id）を持つ。
// 送るとき（マイページの送信 useOfflineQueue）に、その位置の近く（300 m）とその地点に自分の希少種の記録が
// 無いかを確かめ、あれば位置を非公開にする。確かめられなければ伏せる側に倒す。送れたら地点とつなぐ（AC-06）。
// マイページから押したときだけ読み込む（動的 import。マイページのチャンクを重くしない）。

import { isNetworkError } from '@/lib/privateSpots'

import { enqueue, newClientId } from '../lib/queue'
import { hasOwnRareNear } from './rareSightings'
import { linkStopPost } from './stopPosts'
import { setStopStatus } from './stops'
import type { FieldworkClient } from './shared'

/**
 * 位置を非公開にすべきか（近くに自分の希少種の記録がある、または確かめられない）。
 * 通信の失敗は投げる（送らずに残し、あとで送り直す）。
 */
export async function mustHideOfflinePost(
  client: FieldworkClient,
  userId: string,
  point: { lat: number; lng: number },
  stopId: string
): Promise<boolean> {
  try {
    return await hasOwnRareNear(client, userId, point, stopId)
  } catch (err) {
    if (isNetworkError(err)) throw err
    return true
  }
}

/**
 * 送れた投稿を地点とつなぎ、地点を「済み」にする。通信が切れたら調査の送信待ち（link）に積んで続きを任せる。
 * 地点が消えた・自分の地点でないときは、つながずに終える（投稿はできている）。
 */
export async function linkOfflinePost(
  client: FieldworkClient,
  userId: string,
  stopId: string,
  postId: string,
  at: string = new Date().toISOString()
): Promise<'linked' | 'queued' | 'skipped'> {
  try {
    await linkStopPost(client, { userId, stopId, postId, kind: 'sighting' })
    await setStopStatus(client, stopId, 'done', at)
    return 'linked'
  } catch (err) {
    if (isNetworkError(err)) {
      return enqueue({ type: 'link', clientId: newClientId(), userId, at, stopId, postId, kind: 'sighting' }) ? 'queued' : 'skipped'
    }
    return 'skipped'
  }
}
