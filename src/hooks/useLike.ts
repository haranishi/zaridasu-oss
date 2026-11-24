import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { trackEvent } from '@/lib/analytics'

interface UseLikeResult {
  likeCount: number
  liked: boolean
  likeLoading: boolean
  emailNotice: boolean
  /**
   * REQ-226 (FR-226-02): いいねが「未→済」に成立するたびに増えるカウンタ。
   * 呼び出し側はこの値の増加を pop アニメ（transform: scale）の 1 回再生トリガーに使う。
   * 取り消し（済→未）や失敗ロールバックでは増えないため、連打でも pop が破綻しない。
   */
  likePulse: number
  /**
   * いいねの ON/OFF を切り替える。
   * REQ-193 (FR-193-01 / NFR-193-02): フックは Toast へ直接依存せず、戻り値で成否を呼び出し側へ通知する。
   * REQ-226 (FR-226-01): 楽観的 UI 化。押下時にまず liked/likeCount を即時更新し、その後サーバへ反映、
   *   失敗時に元値へロールバックする（無言で握りつぶさず、呼び出し側が false を見てトースト表示）。
   * @returns `true` = 成功 / `false` = 失敗（catch で元値へロールバック後、サーバ値へ再同期済み）。
   *          未ログイン・メール未確認・連続クリック排他で処理を行わなかった場合も `true` を返す
   *          （呼び出し側は失敗トーストを出すかを文脈で判断する。DetailPage は onRequireAuth 経路を除外する）。
   */
  toggleLike: (onRequireAuth?: () => void) => Promise<boolean>
}

/**
 * REQ-113: PostgREST embed で詳細ページの初期 likes を seed するための型。
 * `posts.select('*, likes(id, user_id)')` の戻り値をそのまま渡せる。
 */
export interface LikeSeed {
  id: string
  user_id: string | null
}

/**
 * useLike(postId, initialLikes)
 *
 * @param initialLikes - undefined: 親が seed しない（自前で fetch する）
 *                     - null: 親が seed する予定だが、まだ取得中（fetch をスキップして待機）
 *                     - LikeSeed[]: 親が embed で取得した likes をそのまま渡す（fetch スキップ）
 */
export function useLike(postId: string, initialLikes?: LikeSeed[] | null): UseLikeResult {
  const { user, isEmailConfirmed } = useAuth()
  const [likeCount, setLikeCount] = useState(() => initialLikes?.length ?? 0)
  const [liked, setLiked] = useState(() =>
    !!(initialLikes && user && initialLikes.some((l) => l.user_id === user.id)),
  )
  const [likeLoading, setLikeLoading] = useState(false)
  const [emailNotice, setEmailNotice] = useState(false)
  // REQ-226 (FR-226-02): 「未→済」成立ごとに +1。UI 側はこの増加を pop アニメの 1 回トリガーに使う。
  const [likePulse, setLikePulse] = useState(0)
  const togglingRef = useRef(false)
  // REQ-113: 親から initialLikes が（undefined ではなく）何らかの形で渡されている場合は、
  //          自前 fetch を一切行わずに seed を信頼する（null の間は「待機中」として何もしない）。
  const useSeed = initialLikes !== undefined

  useEffect(() => {
    if (useSeed) {
      // seed モード: initialLikes が確定したら state を同期、まだ null（取得中）なら何もしない
      if (initialLikes) {
        setLikeCount(initialLikes.length)
        setLiked(!!(user && initialLikes.some((l) => l.user_id === user.id)))
      }
      return
    }
    async function fetchLikes() {
      const { count } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', postId)
      setLikeCount(count || 0)
      if (user) {
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', postId)
          .eq('user_id', user.id)
          .maybeSingle()
        setLiked(!!data)
      }
    }
    fetchLikes()
  }, [postId, user, useSeed, initialLikes])

  async function toggleLike(onRequireAuth?: () => void): Promise<boolean> {
    // REQ-193 (FR-193-01): 以下の no-op 経路は「失敗」ではない（専用 UX が別途存在する）ため true を返す。
    // - 未ログイン: onRequireAuth でログインモーダルを開く
    // - メール未確認: emailNotice で別バナー表示
    // - 連続クリック排他: 進行中の処理に委ねる
    if (!user) { onRequireAuth?.(); return true }
    if (isEmailConfirmed === false) {
      setEmailNotice(true)
      return true
    }
    // FR-027: 連続クリック排他制御（REQ-226 でも維持：楽観更新の二重発火を防ぐ）
    if (togglingRef.current) return true
    togglingRef.current = true
    setLikeLoading(true)

    // REQ-226 (FR-226-01): 楽観的更新。サーバ応答を待たず、押下時点の状態を退避してから
    //   liked/likeCount を即時反映する（CommentSection.handleDelete と同型の prev 退避 → setState →
    //   失敗時ロールバックのパターン。React 19 の useOptimistic は「pending 中だけ表示し settle で
    //   base へ戻る」モデルで、ここでは確定値そのものを楽観更新したいため、本フックでは
    //   snapshot-rollback を採用してリポジトリの楽観 UI 作法とする / NFR-226-04）。
    const wasLiked = liked
    if (wasLiked) {
      setLiked(false)
      setLikeCount((c) => c - 1)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      // FR-226-02: 「未→済」成立の瞬間に pop を 1 回だけトリガー（ロック内なので多重発火しない）。
      setLikePulse((p) => p + 1)
    }

    try {
      if (wasLiked) {
        const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)
        if (error) throw error
        // REQ-232 (FR-232-03): いいね取り消し。post_id（高カーディナリティ）は送らない。
        trackEvent('like', { action: 'unlike' })
      } else {
        const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id })
        if (error) throw error
        // REQ-232 (FR-232-03): いいね。post_id（高カーディナリティ）は送らない。
        trackEvent('like', { action: 'like' })
      }
      return true
    } catch {
      // REQ-226 (FR-226-01 / NFR-226-03): まず楽観値を押下前へロールバックし、続けてサーバ実値へ
      //   再同期して楽観値とサーバ確定値の乖離を残さない（無言で消えない＝呼び出し側が false で通知）。
      setLiked(wasLiked)
      setLikeCount((c) => (wasLiked ? c + 1 : c - 1))
      const { count } = await supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', postId)
      setLikeCount(count || 0)
      if (user) {
        const { data } = await supabase.from('likes').select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle()
        setLiked(!!data)
      }
      // REQ-193 (FR-193-01 / NFR-193-02): サーバ値へ再同期した上で失敗を戻り値で通知する。
      // フックは Toast へ直接依存せず、呼び出し側（DetailPage 等）が false を見て toast.error(t('like.error')) を出す。
      return false
    } finally {
      setLikeLoading(false)
      togglingRef.current = false
    }
  }

  return { likeCount, liked, likeLoading, emailNotice, likePulse, toggleLike }
}
