'use client'

// REQ-330: 端末の送信待ちを送る。送るのは online イベント・パネルを開いたとき・画面を開いた時点で残っていたとき。
// 同じ画面での二重送信は lib/queue.ts の flushQueue が防ぐ（送信中の client_id を飛ばす）。
// 利用者が替わったら FieldworkLayer ごと作り直される（MapView の key）ので、ここは userId を固定で扱う。

import { useCallback, useEffect, useRef, useState } from 'react'

import { logError } from '@/lib/errorHandler'
import { isNetworkError } from '@/lib/privateSpots'
import { supabase } from '@/lib/supabase/client'

import { sendQueuedItem } from '../data/sendQueued'
import { errorReason } from '../lib/errors'
import { enqueue as enqueueItem, flushQueue, readQueue, removeQueued, type QueueItem } from '../lib/queue'

export interface UseFieldworkQueueResult {
  items: QueueItem[]
  flushing: boolean
  /** 積む。端末に書けなかったら false。 */
  enqueue: (item: QueueItem) => boolean
  /** いま送る（圏外・空なら何もしない）。 */
  flush: () => Promise<void>
  /** 送れない項目を捨てる（画面の「破棄」）。 */
  discard: (clientId: string) => void
}

export function useFieldworkQueue(
  userId: string | null,
  options: { onSent?: () => void } = {}
): UseFieldworkQueueResult {
  const [items, setItems] = useState<QueueItem[]>(() => (userId ? readQueue(userId) : []))
  const [flushing, setFlushing] = useState(false)
  const onSentRef = useRef(options.onSent)
  useEffect(() => {
    onSentRef.current = options.onSent
  }, [options.onSent])

  const reload = useCallback(() => setItems(userId ? readQueue(userId) : []), [userId])

  const flush = useCallback(async () => {
    if (!userId) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    if (readQueue(userId).length === 0) return
    setFlushing(true)
    try {
      const result = await flushQueue(
        userId,
        (item, save) => sendQueuedItem(supabase, item, save),
        isNetworkError,
        errorReason
      )
      for (const failed of result.failed) logError(failed.error, 'useFieldworkQueue:flush')
      if (result.sent.length > 0) onSentRef.current?.()
    } finally {
      setFlushing(false)
      reload()
    }
  }, [userId, reload])

  // 電波が戻ったら送る
  useEffect(() => {
    const onOnline = () => {
      void flush()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  // 画面を開いた時点で残っていれば送る（つながった状態で開き直すと online イベントは来ないため）
  useEffect(() => {
    void flush()
  }, [flush])

  const enqueue = useCallback(
    (item: QueueItem) => {
      const ok = enqueueItem(item)
      reload()
      return ok
    },
    [reload]
  )

  const discard = useCallback(
    (clientId: string) => {
      if (!userId) return
      removeQueued(userId, clientId)
      reload()
    },
    [userId, reload]
  )

  return { items, flushing, enqueue, flush, discard }
}
