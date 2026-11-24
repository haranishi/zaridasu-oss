'use client'

// REQ-329: 自分の非公開スポット（クイック保存）の一覧・保存・削除・名前変更。
// 圏外で保存したものは端末内キュー（lib/privateSpots.ts）に置き、オンラインに戻ったら自動送信する。
// 地図（MapView の遅延チャンク）からだけ使う。ホームの初期チャンクに載せないこと（10 KB 予算）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  deletePrivateSpot,
  insertPrivateSpot,
  renamePrivateSpot,
  selectOwnPrivateSpots,
  type PrivateSpot,
} from '@/lib/data/private-spots'
import {
  enqueuePendingSpot,
  isNetworkError,
  readPendingSpots,
  removePendingSpot,
  type PendingPrivateSpot,
} from '@/lib/privateSpots'
import { logError } from '@/lib/errorHandler'

export interface PrivateSpotInput {
  name: string
  note: string | null
  lat: number
  lng: number
  accuracy: number | null
}

/** saved=保存済み / queued=圏外のため端末に保存（あとで自動送信） / error=保存できない */
export type SaveSpotResult =
  | { status: 'saved' }
  | { status: 'queued' }
  | { status: 'error'; reason: 'login' | 'rateLimit' | 'queueFull' | 'failed' }

export interface UsePrivateSpotsResult {
  spots: PrivateSpot[]
  pending: PendingPrivateSpot[]
  save: (input: PrivateSpotInput) => Promise<SaveSpotResult>
  remove: (id: string) => Promise<void>
  removePending: (localId: string) => void
  rename: (id: string, name: string) => Promise<void>
}

function ownPending(userId: string | null): PendingPrivateSpot[] {
  return userId ? readPendingSpots().filter((s) => s.userId === userId) : []
}

// A keyed map layer remounts on account changes. Share only outstanding writes,
// not displayed state, so A → B → A cannot insert one queued item twice.
const pendingWrites = new Map<string, Promise<PrivateSpot>>()

function sendPendingSpot(p: PendingPrivateSpot): Promise<PrivateSpot> {
  const key = JSON.stringify([p.userId, p.localId])
  const existing = pendingWrites.get(key)
  if (existing) return existing
  const writing = insertPrivateSpot(supabase, {
    userId: p.userId,
    name: p.name,
    note: p.note,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    recordedAt: p.recordedAt,
  }).then((saved) => {
    removePendingSpot(p.localId)
    return saved
  }).finally(() => {
    pendingWrites.delete(key)
  })
  pendingWrites.set(key, writing)
  return writing
}

export function usePrivateSpots(userId: string | null): UsePrivateSpotsResult {
  // Identity is per account transition, including A → B → A. Old promises must
  // not regain permission merely because the same user signs in again.
  const scope = useMemo(() => ({ userId }), [userId])
  const activeScope = useRef<typeof scope | null>(null)
  const flushingRef = useRef<typeof scope | null>(null)
  const [state, setState] = useState<{
    scope: typeof scope
    spots: PrivateSpot[]
    pending: PendingPrivateSpot[]
  }>({ scope, spots: [], pending: [] })
  const isCurrent = useCallback(() => activeScope.current === scope, [scope])

  useEffect(() => {
    activeScope.current = scope
    return () => { activeScope.current = null }
  }, [scope])

  const setSpots = useCallback((update: (previous: PrivateSpot[]) => PrivateSpot[]) => {
    if (!isCurrent()) return
    setState((previous) => {
      if (!isCurrent()) return previous
      const current = previous.scope === scope ? previous : { scope, spots: [], pending: [] }
      return { ...current, spots: update(current.spots) }
    })
  }, [scope, isCurrent])

  const setPending = useCallback((update: (previous: PendingPrivateSpot[]) => PendingPrivateSpot[]) => {
    if (!isCurrent()) return
    setState((previous) => {
      if (!isCurrent()) return previous
      const current = previous.scope === scope ? previous : { scope, spots: [], pending: [] }
      return { ...current, pending: update(current.pending) }
    })
  }, [scope, isCurrent])

  /** 端末に溜まった分を送る。圏外のままなら途中でやめ、次の online で再開する。 */
  const flush = useCallback(async () => {
    if (!userId || !isCurrent() || flushingRef.current === scope) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    flushingRef.current = scope
    try {
      for (const p of ownPending(userId)) {
        if (!isCurrent()) break
        try {
          const saved = await sendPendingSpot(p)
          setSpots((prev) => [saved, ...prev.filter((spot) => spot.id !== saved.id)])
        } catch (err) {
          // 送り直しても通らない失敗（上限到達など）も、利用者の記録を黙って捨てない。キューに残して次回へ。
          if (!isNetworkError(err)) logError(err, 'usePrivateSpots:flush')
          break
        }
      }
    } finally {
      if (flushingRef.current === scope) flushingRef.current = null
      setPending(() => ownPending(userId))
    }
  }, [userId, scope, isCurrent, setSpots, setPending])

  useEffect(() => {
    let cancelled = false
    setSpots(() => [])
    setPending(() => ownPending(userId))
    if (!userId) {
      return
    }
    ;(async () => {
      const { data, error } = await selectOwnPrivateSpots(supabase, userId)
      if (cancelled || !isCurrent()) return
      if (error) logError(error, 'usePrivateSpots:load')
      else setSpots(() => data ?? [])
      await flush()
    })()
    return () => { cancelled = true }
  }, [userId, flush, isCurrent, setSpots, setPending])

  useEffect(() => {
    const onOnline = () => { void flush() }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  const save = useCallback(
    async (input: PrivateSpotInput): Promise<SaveSpotResult> => {
      if (!userId || !isCurrent()) return { status: 'error', reason: 'login' }
      const recordedAt = new Date().toISOString()
      const queue = (): SaveSpotResult => {
        if (!isCurrent()) return { status: 'error', reason: 'login' }
        const queued = enqueuePendingSpot({ userId, ...input, recordedAt })
        if (!queued) return { status: 'error', reason: 'queueFull' }
        // A loading flush may already have read the newly queued item. Use the
        // stored queue as the authority instead of appending it to that snapshot.
        setPending(() => ownPending(userId))
        return { status: 'queued' }
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return queue()
      try {
        const saved = await insertPrivateSpot(supabase, { userId, ...input, recordedAt })
        if (!isCurrent()) return { status: 'error', reason: 'login' }
        setSpots((prev) => [saved, ...prev])
        return { status: 'saved' }
      } catch (err) {
        if (isNetworkError(err)) return queue()
        logError(err, 'usePrivateSpots:save')
        const code = (err as { code?: string } | null)?.code
        return { status: 'error', reason: code === 'P0001' ? 'rateLimit' : 'failed' }
      }
    },
    [userId, isCurrent, setSpots, setPending]
  )

  const remove = useCallback(async (id: string) => {
    if (!userId || !isCurrent()) return
    await deletePrivateSpot(supabase, id)
    setSpots((prev) => prev.filter((s) => s.id !== id))
  }, [userId, isCurrent, setSpots])

  const removePending = useCallback((localId: string) => {
    if (!isCurrent() || !ownPending(userId).some((spot) => spot.localId === localId)) return
    removePendingSpot(localId)
    setPending((prev) => prev.filter((s) => s.localId !== localId))
  }, [userId, isCurrent, setPending])

  const rename = useCallback(async (id: string, name: string) => {
    if (!userId || !isCurrent()) return
    await renamePrivateSpot(supabase, id, { name })
    setSpots((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)))
  }, [userId, isCurrent, setSpots])

  // Hide the previous account synchronously, before the loading effect runs.
  return {
    spots: state.scope === scope ? state.spots : [],
    pending: state.scope === scope ? state.pending : [],
    save, remove, removePending, rename,
  }
}
