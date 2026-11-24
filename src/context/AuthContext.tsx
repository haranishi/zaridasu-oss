'use client'

import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState, useMemo, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'
import { isNetworkError } from '@/lib/privateSpots'
import { clearDraftsOnSignOut } from '@/hooks/posts/usePostDraft'
import {
  clearPendingPrivateSpots,
  clearPlanCache,
  clearQueue,
  countPendingPrivateSpots,
  countQueuedItems,
} from '@/features/fieldwork/lib/localData'

// REQ-330: 端末に送っていない記録が残っているときだけ出すログアウト前の確認。必要になったときだけ読み込む。
const SignOutUnsentDialog = lazy(() => import('@/features/fieldwork/components/SignOutUnsentDialog'))
// ログアウトに失敗したときの通知も、失敗したときだけ読む（通知の部品をここから静的に読まない。部品の中のコメント参照）
const SignOutFailedNotice = lazy(() => import('@/components/ui/SignOutFailedNotice'))

interface AuthContextValue {
  user: User | null
  loading: boolean
  /**
   * ログアウトする。確認で「やめる」を選んだ・送り切れなかった・ログアウトに失敗した（圏外でセッションが残った）
   * ときは false（ログインしたまま）。
   */
  signOut: () => Promise<boolean>
  deleteAccount: () => Promise<void>
  isAdmin: boolean
  isEmailConfirmed: boolean | null
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signOut: async () => true,
  deleteAccount: async () => {},
  isAdmin: false,
  isEmailConfirmed: null,
})

interface AuthProviderProps {
  children: React.ReactNode
}

/**
 * REQ-190: ユーザー実体が同一(id・email_confirmed_at・app_metadata.role が一致)の認証イベント
 * (TOKEN_REFRESHED やタブ復帰時の SIGNED_IN 等)では、Supabase が返す session.user が毎回別オブジェクト
 * でも参照を維持するための同一判定。これにより全 useAuth 消費者(約20コンポーネント)の不要な再レンダーと
 * 連鎖する再フェッチを防ぐ。サインアウト/サインイン/別ユーザー切替(id 変化)や、isAdmin/isEmailConfirmed の
 * 派生に使う属性(email_confirmed_at・role)の変化は「別ユーザー」として正しく検知する(FR-190-02)。
 */
function isSameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.email_confirmed_at === b.email_confirmed_at &&
    a.app_metadata?.role === b.app_metadata?.role
  )
}

/**
 * REQ-330: ログアウトで端末から消すその人のデータ。計画の控え（非公開の地点・希少種の記録の座標が入る）と
 * 投稿フォームの下書き。送信待ちと圏外の投稿の下書きはここでは消さない（ログアウト前に確認して、送るか破棄する）。
 */
function clearSignedOutUserData(userId: string): void {
  clearPlanCache(userId)
  clearDraftsOnSignOut(userId)
}

/** 圏外で保存した投稿の下書き（IndexedDB）の件数。数えられなければ 0。 */
async function countOfflineDrafts(userId: string): Promise<number> {
  try {
    const { getPendingCount } = await import('@/lib/offlineStore')
    return await getPendingCount(userId)
  } catch {
    return 0
  }
}

/** ログアウト前の確認の状態（ダイアログが答えを返すまで signOut の Promise を待たせる）。 */
interface UnsentPrompt {
  userId: string
  queued: number
  drafts: number
  resolve: (signedOut: boolean) => void
}

/** 確認から「送る」「破棄」を選んだ結果。ok 以外はログインしたまま（ダイアログに理由を出す）。 */
export type SignOutOutcome = 'ok' | 'offline' | 'failed' | 'signOutFailed'

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  // ログアウトに失敗した回数（失敗のたびに通知を 1 回出す。出したら null に戻す）
  const [signOutFailed, setSignOutFailed] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [unsentPrompt, setUnsentPrompt] = useState<UnsentPrompt | null>(null)
  // signOut / deleteAccount を作り直さずに今の利用者を読むための写し
  const userIdRef = useRef<string | null>(null)
  // 確認を出している間（または確認の前の数え上げの間）の signOut の Promise。2 回目はこれを返し、確認を二重に出さない
  const pendingSignOutRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUser = session?.user ?? null
      userIdRef.current = nextUser?.id ?? null
      setUser((prev) => (isSameUser(prev, nextUser) ? prev : nextUser))
      setLoading(false)
    }).catch((err) => {
      logError(err, 'AuthContext:getSession')
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // REQ-330: どの経路のログアウト（別のタブ・管理画面の時間切れ・期限切れ）でも、前の人の控えと下書きを消す
      if (event === 'SIGNED_OUT' && userIdRef.current) clearSignedOutUserData(userIdRef.current)
      // REQ-190: 実体が同じなら参照を維持(TOKEN_REFRESHED 等での全画面再レンダー連鎖を防ぐ)
      const nextUser = session?.user ?? null
      userIdRef.current = nextUser?.id ?? null
      setUser((prev) => (isSameUser(prev, nextUser) ? prev : nextUser))
    })

    return () => subscription.unsubscribe()
  }, [])

  /**
   * ログアウトを実行する。auth-js は、トークンが切れたまま圏外にいるとセッションを消さずに error を返すので、
   * 返った error とセッションの残りを見て、ログアウトできたかを確かめる。できたときだけ端末の控えと下書きを消す。
   */
  const finishSignOut = useCallback(async (userId: string | null): Promise<boolean> => {
    let failed = false
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        const { data } = await supabase.auth.getSession()
        failed = !!data.session
      }
    } catch (err) {
      logError(err, 'AuthContext:signOut')
      failed = true
    }
    if (failed) return false
    if (userId) clearSignedOutUserData(userId)
    return true
  }, [])

  const signOut = useCallback((): Promise<boolean> => {
    if (pendingSignOutRef.current) return pendingSignOutRef.current
    const run = async (): Promise<boolean> => {
      const userId = userIdRef.current
      // 調査の送信待ちに、圏外で保存した非公開スポット（座標が入る）の送信待ちも含める
      const queued = userId ? countQueuedItems(userId) + countPendingPrivateSpots(userId) : 0
      const drafts = userId ? await countOfflineDrafts(userId) : 0
      if (userId && (queued > 0 || drafts > 0)) {
        // 送っていない記録があれば確認を出す（送ってから出る／破棄して出る／やめる）。答えはダイアログが返す
        return new Promise<boolean>((resolve) => setUnsentPrompt({ userId, queued, drafts, resolve }))
      }
      const ok = await finishSignOut(userId)
      if (!ok) setSignOutFailed((n) => (n ?? 0) + 1)
      return ok
    }
    const promise = run().finally(() => {
      pendingSignOutRef.current = null
    })
    pendingSignOutRef.current = promise
    return promise
  }, [finishSignOut])

  const deleteAccount = useCallback(async () => {
    const userId = userIdRef.current
    let photosRemoved = false
    if (userId) {
      // REQ-330: 希少種の写真は表を消しても置き場に実体が残るので、退会の前に Storage API で消す。
      // 消せなかったら退会を止める（写真だけが持ち主のいないまま残るのを防ぐ。やり直してもらう）。
      // ただし置き場そのものが無い環境（希少種の機能が入っていない）は、消す写真も無いので進める。
      try {
        const { removeAllOwnRarePhotos } = await import('@/features/fieldwork/data/rarePhotos')
        if (userIdRef.current !== userId) throw new Error(t('account.deletePhotosFailed'))
        await removeAllOwnRarePhotos(supabase, userId)
        photosRemoved = true
      } catch (err) {
        const { isMissingBucketError } = await import('@/features/fieldwork/data/rarePhotos')
        if (!isMissingBucketError(err)) {
          if (!isNetworkError(err)) logError(err, 'AuthContext:deleteAccount:rarePhotos')
          throw new Error(t('account.deletePhotosFailed'), { cause: err })
        }
        logError(err, 'AuthContext:deleteAccount:rarePhotosBucket')
      }
      // Water reports also use private Storage objects, which a database cascade cannot remove.
      if (userIdRef.current !== userId) throw new Error(t('account.deletePhotosFailed'))
      try {
        const { removeAllOwnWaterPhotos } = await import('@/features/water/data/photos')
        if (userIdRef.current !== userId) throw new Error(t('account.deletePhotosFailed'))
        await removeAllOwnWaterPhotos(supabase, userId)
        photosRemoved = true
      } catch (err) {
        const { isMissingBucketError } = await import('@/features/fieldwork/data/rarePhotos')
        if (!isMissingBucketError(err)) {
          if (!isNetworkError(err)) logError(err, 'AuthContext:deleteAccount:waterPhotos')
          throw new Error(t('account.deletePhotosFailed'), { cause: err })
        }
        logError(err, 'AuthContext:deleteAccount:waterPhotosBucket')
      }
    }
    if (userIdRef.current !== userId) throw new Error(t('account.deletePhotosFailed'))
    const { error } = await supabase.rpc('delete_own_account')
    if (error) {
      // 写真を消したあとで退会に失敗したら、そのことを伝える（記録は消えた写真を指したままになるため）
      if (photosRemoved) throw new Error(t('account.deleteFailedPhotosRemoved'), { cause: error })
      throw error
    }
    if (userId) {
      // 退会したら、この端末に残したその人のものを全部消す（送信待ち・控え・下書き・圏外の投稿の下書き）
      clearQueue(userId)
      clearPendingPrivateSpots(userId)
      clearSignedOutUserData(userId)
      try {
        const { deletePendingPostsOf } = await import('@/lib/offlineStore')
        await deletePendingPostsOf(userId)
      } catch (err) {
        logError(err, 'AuthContext:deleteAccount:offlineDrafts')
      }
    }
    if (userIdRef.current === userId) await supabase.auth.signOut()
  }, [t])

  const settleUnsent = useCallback((prompt: UnsentPrompt, signedOut: boolean) => {
    setUnsentPrompt(null)
    prompt.resolve(signedOut)
  }, [])

  const isAdmin = user?.app_metadata?.role === 'admin'
  const isEmailConfirmed = user ? !!user.email_confirmed_at : null

  const value = useMemo(() => ({
    user, loading, signOut, deleteAccount, isAdmin, isEmailConfirmed,
  }), [user, loading, signOut, deleteAccount, isAdmin, isEmailConfirmed])

  return (
    <AuthContext.Provider value={value}>
      {children}
      {signOutFailed !== null && (
        <Suspense fallback={null}>
          <SignOutFailedNotice nonce={signOutFailed} onShown={() => setSignOutFailed(null)} />
        </Suspense>
      )}
      {unsentPrompt && (
        <Suspense fallback={null}>
          <SignOutUnsentDialog
            queued={unsentPrompt.queued}
            drafts={unsentPrompt.drafts}
            onSend={async (): Promise<SignOutOutcome> => {
              const { flushBeforeSignOut } = await import('@/features/fieldwork/data/flushBeforeSignOut')
              const { left, reason } = await flushBeforeSignOut(unsentPrompt.userId)
              if (left > 0) return reason === 'failed' ? 'failed' : 'offline'
              if (!(await finishSignOut(unsentPrompt.userId))) return 'signOutFailed'
              settleUnsent(unsentPrompt, true)
              return 'ok'
            }}
            onDiscard={async (): Promise<SignOutOutcome> => {
              // 破棄はログアウトできてから行う（失敗したのに送信待ちだけが消える、を防ぐ）
              if (!(await finishSignOut(unsentPrompt.userId))) return 'signOutFailed'
              clearQueue(unsentPrompt.userId)
              clearPendingPrivateSpots(unsentPrompt.userId)
              try {
                const { deletePendingPostsOf } = await import('@/lib/offlineStore')
                await deletePendingPostsOf(unsentPrompt.userId)
              } catch (err) {
                logError(err, 'AuthContext:signOut:offlineDrafts')
              }
              settleUnsent(unsentPrompt, true)
              return 'ok'
            }}
            onCancel={() => settleUnsent(unsentPrompt, false)}
          />
        </Suspense>
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
