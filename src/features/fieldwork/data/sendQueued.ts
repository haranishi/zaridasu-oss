// REQ-330: 送信待ちの 1 件を DB へ送る。lib/queue.ts の flushQueue に渡す送り手。
//
// どれも送り直しても増えないように作ってある。
//   - 希少種の記録: client_id の一意制約（insertRareSighting が入っていた行を返す）
//   - つながり: 主キー（地点, 投稿）。2 回目は 'existing'
//   - 不在の投稿: 作れた投稿の id を項目に書き残し、送り直しでは作らない。作る直前に近くの希少種を DB で確かめる
//   - 状態・非公開化: 同じ値を書くだけ
// 希少種の記録が送れたら、近くの地点につながる自分の投稿を非公開にする（protect.ts）。

import { recordAbsence } from './absence'
import { hideLinkedPostsNear } from './protect'
import { insertRareKeepingRecord } from './rareSightings'
import { linkStopPost } from './stopPosts'
import { setStopStatus, updateStop } from './stops'
import type { FieldworkClient } from './shared'
import type { QueueItem } from '../lib/queue'

export async function sendQueuedItem(
  client: FieldworkClient,
  item: QueueItem,
  save: (patch: Partial<QueueItem>) => void
): Promise<void> {
  switch (item.type) {
    case 'absence': {
      const postIds = { ...(item.postIds ?? {}) }
      await recordAbsence(
        client,
        {
          userId: item.userId,
          stopId: item.stopId,
          species: item.species,
          surveyDurationMinutes: item.surveyDurationMinutes,
          lat: item.lat,
          lng: item.lng,
          accuracy: item.accuracy,
          locationSource: item.locationSource,
          locationPrivate: item.locationPrivate,
          observedOn: item.observedOn,
          at: item.at,
        },
        {
          postIds,
          onPosted: (species, postId) => {
            postIds[species] = postId
            save({ postIds: { ...postIds } })
          },
        }
      )
      return
    }
    case 'status':
      if (item.note !== undefined) await updateStop(client, item.stopId, { note: item.note })
      await setStopStatus(client, item.stopId, item.status, item.at)
      return
    case 'rare': {
      const { stopDropped } = await insertRareKeepingRecord(client, {
        userId: item.userId,
        clientId: item.clientId,
        stopId: item.stopId,
        speciesKey: item.speciesKey,
        speciesLabel: item.speciesLabel,
        count: item.count,
        note: item.note,
        lat: item.lat,
        lng: item.lng,
        accuracy: item.accuracy,
        locationSource: item.locationSource,
        observedAt: item.observedAt,
        photoPaths: [],
      })
      const stopId = stopDropped ? null : item.stopId
      if (stopId) await setStopStatus(client, stopId, 'done', item.at)
      await hideLinkedPostsNear(client, item.userId, { lat: item.lat, lng: item.lng }, stopId)
      return
    }
    case 'link':
      await linkStopPost(client, { userId: item.userId, stopId: item.stopId, postId: item.postId, kind: item.kind })
      await setStopStatus(client, item.stopId, 'done', item.at)
      return
    case 'protect':
      await hideLinkedPostsNear(client, item.userId, { lat: item.lat, lng: item.lng }, item.rareStopId)
      return
  }
}
