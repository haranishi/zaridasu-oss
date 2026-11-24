import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { sendPendingPost } from '@/lib/offlineSend'
import {
  getPendingPosts,
  getPendingCount,
  getLegacyPendingPosts,
  deleteLegacyPendingPosts,
  updatePendingPost,
  deletePendingPost,
  type PendingPost,
} from '@/lib/offlineStore'

export interface SendProgress {
  current: number
  total: number
  success: number
  failed: number
}

export const SENDING_STALE_AFTER_MS = 5 * 60 * 1000

export function isStaleSending(post: PendingPost, now: number): boolean {
  if (post.status !== 'sending') return false
  if (
    post.sendingStartedAt === undefined ||
    !Number.isFinite(post.sendingStartedAt)
  ) {
    return true
  }
  return now - post.sendingStartedAt >= SENDING_STALE_AFTER_MS
}

// REQ-330（点検で見つかった穴）: 下書きは保存した利用者のものだけを表示し、送る。
// 同じ端末で別の人がログインしても、前の人の下書き（位置・写真）を見せず、その人の名義で送らない。
// 利用者で分ける前の古い下書き（userId なし）は持ち主が分からないので、勝手には送らない。中身（種・日付・写真）を
// 見せたうえで、確認を挟んで「自分のものとして送る」（自分の名義に移して送る）か「破棄」を選べるようにする。
export function useOfflineQueue() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [posts, setPosts] = useState<PendingPost[]>([])
  const [legacy, setLegacy] = useState<PendingPost[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<SendProgress | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  // FR-029: 送信排他制御
  const sendingRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      setLegacy(await getLegacyPendingPosts())
      if (!userId) {
        setPosts([])
        setPendingCount(0)
        return
      }
      let all = await getPendingPosts(userId)
      if (!sendingRef.current) {
        const now = Date.now()
        const stale = all.filter(
          (post): post is PendingPost & { id: number } =>
            post.id !== undefined && isStaleSending(post, now),
        )
        if (stale.length > 0) {
          await Promise.all(
            stale.map((post) =>
              updatePendingPost(post.id, {
                status: 'pending',
                sendingStartedAt: undefined,
                errorMessage: undefined,
              }),
            ),
          )
          const staleIds = new Set(stale.map((post) => post.id))
          all = all.map((post) =>
            post.id !== undefined && staleIds.has(post.id)
              ? {
                  ...post,
                  status: 'pending',
                  sendingStartedAt: undefined,
                  errorMessage: undefined,
                }
              : post,
          )
        }
      }
      setPosts(all)
      setPendingCount(all.length)
    } catch {
      // IndexedDB 未対応時は空
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(userId ? await getPendingCount(userId) : 0)
    } catch { /* ignore */ }
  }, [userId])

  /** 1件を送信（中身は lib/offlineSend.ts。ログアウト前の送信と同じ関数） */
  const sendOne = useCallback(
    async (post: PendingPost): Promise<boolean> => (user ? sendPendingPost(user.id, post) : false),
    [user],
  )

  /** 全件送信 */
  const sendAll = useCallback(async () => {
    if (sending || !user || sendingRef.current) return
    sendingRef.current = true
    setSending(true)

    const pending = (await getPendingPosts(user.id)).filter(p => p.status !== 'sending')
    const total = pending.length
    let success = 0
    let failed = 0

    for (const [i, post] of pending.entries()) {
      setProgress({ current: i + 1, total, success, failed })
      const ok = await sendOne(post)
      if (ok) success++
      else failed++
    }

    setProgress({ current: total, total, success, failed })
    await refresh()
    setSending(false)
    sendingRef.current = false
    setTimeout(() => setProgress(null), 2000)
  }, [sending, user, refresh, sendOne])

  /** 1件削除 */
  const remove = useCallback(async (id: number) => {
    await deletePendingPost(id)
    await refresh()
  }, [refresh])

  /** 持ち主の分からない古い下書きを全部破棄する */
  const discardLegacy = useCallback(async () => {
    await deleteLegacyPendingPosts()
    await refresh()
  }, [refresh])

  /**
   * 古い下書き 1 件を自分のものとして送る（確認は画面で済ませてから呼ぶ）。自分の名義に移してから送る。
   * 送れなかった（圏外など）ときも自分の下書きとして残る。送れたら true。
   */
  const claimLegacy = useCallback(async (id: number): Promise<boolean> => {
    if (!user) return false
    const target = (await getLegacyPendingPosts()).find((p) => p.id === id)
    if (!target) return false
    await updatePendingPost(id, { userId: user.id })
    const ok = await sendPendingPost(user.id, { ...target, userId: user.id })
    await refresh()
    return ok
  }, [user, refresh])

  /** 古い下書き 1 件を破棄する（確認は画面で済ませてから呼ぶ） */
  const discardLegacyOne = useCallback(async (id: number) => {
    const target = (await getLegacyPendingPosts()).find((p) => p.id === id)
    if (target) await deletePendingPost(id)
    await refresh()
  }, [refresh])

  return {
    posts,
    legacy,
    legacyCount: legacy.length,
    discardLegacy,
    claimLegacy,
    discardLegacyOne,
    loading,
    sending,
    progress,
    pendingCount,
    sendAll,
    remove,
    refresh,
    refreshCount,
  }
}
