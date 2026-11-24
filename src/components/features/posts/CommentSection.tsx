'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { ShieldCheck, Trash2, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { useEmailResend } from '@/hooks/useEmailResend'
import { getDateLocale } from '@/lib/dateLocales'
import { MAX_COMMENT_LENGTH } from '@/lib/constants'
import { commentInputSchema } from '@/lib/validation/schemas'
import { btnRetryCls } from '@/lib/formStyles'
import { faint } from '@/lib/themeClasses'
import { useTranslation } from 'react-i18next'
import { logError } from '@/lib/errorHandler'
import { trackEvent } from '@/lib/analytics'
import EmptyState from '@/components/ui/EmptyState'
import ErrorAlert from '@/components/ui/ErrorAlert'

interface CommentRecord {
  id: string
  post_id: string
  user_id: string
  content: string
  is_admin: boolean
  created_at: string
}

interface CommentSectionProps {
  postId: string
  onLoginClick: () => void
  onSignupClick: () => void
  /**
   * REQ-113: 親が PostgREST embed で取得済みの初期コメント。
   * 渡された場合、初回マウント時の fetch をスキップして round-trip を 1 回節約する。
   */
  initialComments?: CommentRecord[] | null
}

export default function CommentSection({ postId, onLoginClick, onSignupClick, initialComments }: CommentSectionProps) {
  const { user, isAdmin, isEmailConfirmed } = useAuth()
  const { dark } = useTheme()
  const toast = useToastContext()
  const { t, i18n } = useTranslation()
  // REQ-209 FR-209-03: date-fns ロケールは dateLocales の getDateLocale に一本化（未知言語は ja）。
  const dateLocale = getDateLocale(i18n.language)
  const { resendEmail, resendLoading, resendCooldownSec, resendMessage, resendError } = useEmailResend()
  const [comments, setComments] = useState<CommentRecord[]>(() => {
    if (!initialComments) return []
    // created_at ASC で安定化（embed 経由は順序未保証のため）
    return [...initialComments].sort((a, b) => a.created_at.localeCompare(b.created_at))
  })
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // REQ-226 (FR-226-04): 楽観的に追加した自分のコメント行だけ ease-out 入場（fade-up）させる。
  //   初期ロードや他者のコメントには付与しない（一覧全体がアニメしないように id で限定）。
  //   reduced-motion 時は globals.css のグローバル @media が animation を潰し即時表示になる。
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(() => new Set())
  // REQ-192 (FR-192-02): コメント取得失敗を「コメントはまだありません」（空状態）と分離するための
  // 専用エラー state。`if (!error) setComments(...)` の暗黙握りつぶしを廃止する。
  const [fetchError, setFetchError] = useState<string | null>(null)
  // REQ-207 FR-207-02: 誤タップ即削除を防ぐインライン確認（PendingPostsSection と同型）
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  // REQ-113: 親から initialComments が渡された場合のみ初回 fetch をスキップ
  const skipInitialFetchRef = useRef<boolean>(!!initialComments)

  const fetchComments = useCallback(async () => {
    // REQ-103: 表示で利用する列のみを取得（egress 削減 + 将来の PII 列漏洩予防）
    setFetchError(null)
    const { data, error: fetchErr } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, is_admin, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
    // REQ-192: 成功時のみ反映。失敗時は専用 state へ載せ、空状態に化けさせない。
    if (fetchErr) {
      setFetchError(fetchErr.message)
    } else {
      setComments((data as CommentRecord[]) || [])
    }
  }, [postId])

  useEffect(() => {
    if (skipInitialFetchRef.current) {
      skipInitialFetchRef.current = false
      return
    }
    fetchComments()
  }, [fetchComments])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // REQ-273 FR-273-05: Enter連打による楽観コメントの二重append＋二重insertを防ぐ
    // 同期ガード（useLike の togglingRef / PostForm の if (loading) return と同方針）。
    if (submitting) return
    const trimmed = content.trim()
    if (!trimmed || !user) return
    // REQ-213 FR-213-05 / AC-03: insert 前に共有 zod スキーマで content 長を検証する
    //   （DB は char_length(content) <= 500。従来は trim 後の空判定のみで長さ上限の
    //   クライアント検証が無かった＝textarea maxLength のみで開発者ツールで回避可能だった）。
    //   ⚠️ クライアント側の「第一の網」。最終防御は comments の DB CHECK 制約 + RLS（schema.sql）。
    const parsed = commentInputSchema.safeParse({ content: trimmed })
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'validation.generic'))
      return
    }
    setSubmitting(true)
    setError(null)

    // REQ-226 (FR-226-03): 楽観的 UI。insert 完了を待たず、自分のコメントを一覧へ即時 append する。
    //   handleDelete（prev 退避 → setState → 失敗時 setComments(prev)）と同型の楽観 UI 作法。
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimistic: CommentRecord = {
      id: tempId,
      post_id: postId,
      user_id: user.id,
      content: trimmed,
      is_admin: isAdmin,
      created_at: new Date().toISOString(),
    }
    setComments((prev) => [...prev, optimistic])
    // FR-226-04: この行だけ入場アニメ対象に登録する。
    setAnimatedIds((prev) => new Set(prev).add(tempId))
    setContent('')

    // REQ-132 Phase 1: insert 後に id を取得し notify-comment へ渡す。
    // 本文はもう payload に乗せない (Edge Function 側で DB から再取得)。
    const { data: inserted, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content: trimmed,
        is_admin: isAdmin,
      })
      .select('id')
      .single()

    if (error) {
      // REQ-226 (FR-226-03 / NFR-226-03): 失敗時は楽観行を取り除き、入力内容を復元し、error トーストで通知する。
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setAnimatedIds((prev) => { const next = new Set(prev); next.delete(tempId); return next })
      setContent(trimmed)
      setError(t('comment.error'))
      toast.error(t('comment.error'))
    } else {
      // REQ-232 (FR-232-03): コメント投稿成功。本文・PII は送らない。
      trackEvent('comment_post', { is_admin: isAdmin })
      // REQ-226 (FR-226-03): 楽観行の一時 id を確定 id で置換する。
      //   blanket な fetchComments() は行わない＝楽観 append と整合し重複表示が起きない（NFR-226-03）。
      //   また round-trip を 1 回節約できる（確定 id の置換だけで一覧は正しい状態に収束する）。
      if (inserted?.id) {
        const confirmedId = inserted.id
        setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: confirmedId } : c)))
        setAnimatedIds((prev) => {
          if (!prev.has(tempId)) return prev
          const next = new Set(prev); next.delete(tempId); next.add(confirmedId); return next
        })
        // REQ-132: notify-comment は確定 id 取得後に限り従来どおり実行する。
        supabase.functions.invoke('notify-comment', {
          body: { comment_id: confirmedId },
        }).catch((err) => logError(err, 'notify-comment'))
      }
      // FR-226-05 (b): 控えめな成功トースト。いいねは視覚 pop で足りるためトーストを出さないのに対し、
      //   コメントは入場アニメに加えて「届いた」確証を polite リージョン（Toast.tsx）で軽く伝える。
      toast.success(t('achievement.commentPosted'))
    }
    setSubmitting(false)
  }

  async function handleDelete(commentId: string) {
    setDeleteConfirmId(null)
    const prev = comments
    setComments((c) => c.filter((x) => x.id !== commentId))
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (error) {
      // REQ-193 (FR-193-02): 楽観的更新をロールバックしつつ、無通知だった失敗をトーストで通知する。
      setComments(prev)
      toast.error(t('comment.deleteError'))
    }
  }

  const canDelete = (comment: CommentRecord) => isAdmin || comment.user_id === user?.id

  return (
    <div className={`rounded-2xl shadow-xs p-4 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`}>
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={16} className={dark ? 'text-slate-400' : 'text-gray-400'} />
        <h3 className={`text-sm font-semibold ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
          {t('comment.title')}{comments.length > 0 && <span className={`ml-1 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>({comments.length})</span>}
        </h3>
      </div>

      {/* コメント一覧 */}
      {/* REQ-192 (FR-192-03/04): 取得失敗（エラー）は空状態と分離し、再試行ボタンを提示する。
          ErrorAlert は role="alert" を内蔵（REQ-195）。空状態の文言（emptyTitle）は流用しない。 */}
      {fetchError ? (
        <div className="py-2 space-y-2">
          <ErrorAlert message={t('common.loadError')} />
          <button
            type="button"
            onClick={() => { fetchComments() }}
            className={`text-xs px-3 py-1.5 rounded-lg ${btnRetryCls(dark)}`}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : comments.length === 0 ? (
        // REQ-222 (FR-222-03): 否定形「まだコメントはありません」→ 肯定形の軽い空状態。
        // コメントは投稿フォームが直下にあるため過度な CTA は付けない。
        <EmptyState icon="💬" className="py-6" title={t('comment.emptyTitle')} />
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              onAnimationEnd={() => {
                // FR-226-04: 入場アニメ完了後は対象集合から外す（再レンダーで再生されないように）。
                if (animatedIds.has(comment.id)) {
                  setAnimatedIds((prev) => { const next = new Set(prev); next.delete(comment.id); return next })
                }
              }}
              className={`rounded-xl p-3 text-sm ${animatedIds.has(comment.id) ? 'animate-fade-up' : ''} ${
                comment.is_admin
                  ? dark ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-blue-50 border border-blue-200'
                  : dark ? 'bg-slate-800' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {comment.is_admin && (
                    <span className="flex items-center gap-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                      <ShieldCheck size={11} />
                      {t('comment.officialBadge')}
                    </span>
                  )}
                  {/* REQ-325 FR-325-01: このコメント枠は通常 gray-50 だが、公式コメントだけ
                      blue-50(#eff6ff) になる。gray-500 は blue-50 上 4.44:1 で AA を割るので gray-600
                      （6.94:1）にする。「面が条件で変わる要素は、いちばん濃い面に合わせる」。 */}
                  <span className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                    {format(new Date(comment.created_at), 'yyyy/M/d HH:mm', { locale: dateLocale })}
                  </span>
                </div>
                {canDelete(comment) && (
                  deleteConfirmId === comment.id ? (
                    <div className="flex items-center gap-1">
                      <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-600'}`}>{t('comment.deleteConfirmPrompt')}</span>
                      {/* REQ-040 系 a11y: 可視テキスト（削除/取消）が短く曖昧なため明示的な aria-label を付与。
                          label-content-name-mismatch 回避のため aria-label は可視テキストを内包する文言にする。 */}
                      <button
                        type="button"
                        onClick={() => handleDelete(comment.id)}
                        aria-label={t('comment.deleteConfirmAria')}
                        className="text-xs text-red-500 font-bold px-2 py-1 rounded-sm hover:bg-red-500/10"
                      >
                        {t('comment.deleteConfirm')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(null)}
                        aria-label={t('comment.deleteCancelAria')}
                        // REQ-325 FR-325-01: hover 面が gray-100 なのに gray-400（2.31:1）だった。
                        className={`text-xs px-2 py-1 rounded-sm ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        {t('comment.deleteCancel')}
                      </button>
                    </div>
                  ) : (
                    // REQ-318 FR-318-04: 自分のコメントの削除アイコン。light の text-gray-300 は
                    // 1.47:1 で「アイコンがあること自体が見えない」。faint() トークンへ寄せる。
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(comment.id)}
                      className={`transition-colors ${faint(dark)} ${dark ? 'hover:text-red-400' : 'hover:text-red-600'}`}
                      aria-label={t('comment.deleteLabel')}
                    >
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
              <p className={`whitespace-pre-wrap leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{comment.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* 投稿フォーム */}
      {user ? (
        isEmailConfirmed === false ? (
          <div className={`rounded-xl border p-4 space-y-2 ${
            dark ? 'bg-amber-900/20 border-amber-600/40' : 'bg-amber-50 border-amber-200'
          }`}>
            <p className={`text-sm font-bold ${dark ? 'text-amber-200' : 'text-amber-900'}`}>
              {t('comment.emailRequired')}
            </p>
            <p className={`text-xs ${dark ? 'text-amber-300/70' : 'text-amber-700'}`}>
              {t('comment.emailRequiredDesc')}
            </p>
            {resendMessage && <p className="text-xs text-green-500 font-medium">{resendMessage}</p>}
            {resendError && <p className="text-xs text-red-500 font-medium">{resendError}</p>}
            <button
              onClick={() => resendEmail(user.email ?? '')}
              disabled={resendLoading || resendCooldownSec > 0}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                dark ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-200' : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
              }`}
            >
              {resendLoading ? t('comment.resendSending') : resendCooldownSec > 0 ? t('comment.resendCooldown', { sec: resendCooldownSec }) : t('comment.resendEmail')}
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          {isAdmin && (
            <div className="flex items-center gap-1.5 text-xs text-blue-500 font-medium">
              <ShieldCheck size={13} />
              {t('comment.adminPosting')}
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('comment.placeholder')}
            maxLength={MAX_COMMENT_LENGTH}
            rows={3}
            className={`w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-red-400 focus:border-transparent ${
              dark
                ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500'
                : 'border-gray-200 text-gray-700'
            }`}
          />
          <div className="flex items-center justify-between">
            <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{content.length}/{MAX_COMMENT_LENGTH}</span>
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                type="submit"
                disabled={!content.trim() || submitting}
                className="bg-red-600 text-white text-sm px-4 py-1.5 rounded-lg font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? t('comment.submitting') : t('comment.submit')}
              </button>
            </div>
          </div>
        </form>
        )
      ) : (
        <div className={`rounded-xl border p-4 space-y-3 ${
          dark ? 'bg-slate-800/60 border-slate-700' : 'border-red-100 bg-linear-to-br from-red-50 to-rose-50'
        }`}>
          <div className="text-center">
            <p className={`text-sm font-bold mb-0.5 ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{t('comment.loginRequired')}</p>
            <p className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('comment.loginRequiredDesc')}</p>
          </div>
          <div className={`flex flex-col gap-1.5 rounded-lg p-3 ${dark ? 'bg-slate-700/50' : 'bg-white/70'}`}>
            <div className={`flex items-center gap-2 text-xs ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
              <span className="text-base">💬</span>
              <span>{t('comment.benefit1')}</span>
            </div>
            <div className={`flex items-center gap-2 text-xs ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
              <span className="text-base">📊</span>
              <span>{t('comment.benefit2')}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSignupClick}
              className="flex-1 bg-accent text-white text-sm font-bold py-2.5 rounded-xl hover:bg-(--color-accent-hover) transition-all shadow-xs shadow-red-500/20 active:scale-[0.98]"
            >
              {t('comment.signup')}
            </button>
            <button
              onClick={onLoginClick}
              className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${
                dark ? 'text-slate-400 border-slate-600 hover:bg-slate-700' : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t('comment.login')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
