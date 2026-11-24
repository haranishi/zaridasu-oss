'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'

const MiniMap = dynamic(() => import('@/components/features/map/MiniMap'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })
import RouteLinks from '@/components/ui/RouteLinks'
import { ArrowLeft, Search, Clock, MapPin, Users, MessageCircle, Trash2, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useToastContext } from '@/context/ToastContext'
import { useSurveyRequest } from '@/hooks/survey/useSurveyRequests'
import { useSurveyResponses } from '@/hooks/survey/useSurveyResponses'
import { useSurveyRequestComments } from '@/hooks/survey/useSurveyRequestComments'
import { SURVEY_SPECIES, SURVEY_STATUS, DEFAULT_SPECIES_EMOJI } from '@/lib/constants'
import { logError } from '@/lib/errorHandler'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocales'
import EmptyState from '@/components/ui/EmptyState'
import ErrorAlert from '@/components/ui/ErrorAlert'

interface SurveyRequestPageProps {
  id: string
}

export default function SurveyRequestPage({ id }: SurveyRequestPageProps) {
  const router = useRouter()
  const { dark } = useTheme()
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const toast = useToastContext()
  // REQ-192 (FR-192-01/03): error を受け取り、取得失敗を「依頼が見つかりません」（空状態）と分離する。
  const { request, relatedPosts, loading, error: fetchError, fetchRequest } = useSurveyRequest(id)

  // REQ-087 Phase 3: 「協力する」軽量応答
  const {
    responses,
    count: responseCount,
    hasResponded,
    loading: responsesLoading,
    error: responsesError,
    respond,
    cancelResponse,
  } = useSurveyResponses(request?.id)
  const [responseSubmitting, setResponseSubmitting] = useState(false)

  // REQ-273 FR-273-04: クローズは再オープンUIが無い状態変更のため、(a) インライン確認
  // （投稿削除/コメント削除と同じ確認方針）、(b) try/catch＋失敗トースト、(c) 実行中 disabled を付ける。
  const [closeConfirming, setCloseConfirming] = useState(false)
  const [closing, setClosing] = useState(false)
  const handleCloseRequest = useCallback(async () => {
    if (closing || !request) return
    setClosing(true)
    try {
      const { supabase } = await import('@/lib/supabase/client')
      const { error } = await supabase
        .from('survey_requests')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', request.id)
      if (error) throw error
      setCloseConfirming(false)
      fetchRequest()
    } catch (err) {
      logError(err as Error, 'SurveyRequestPage:close')
      toast.error(t('survey.closeFailed'))
    } finally {
      setClosing(false)
    }
  }, [closing, request, fetchRequest, toast, t])

  // REQ-089 Phase 5: 依頼への直接コメント
  const {
    comments,
    loading: commentsLoading,
    error: commentsError,
    postComment,
    deleteComment,
  } = useSurveyRequestComments(request?.id)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  // REQ-207 FR-207-03: window.confirm を廃止しインライン確認に統一（CommentSection と同型）
  const [commentDeleteConfirmId, setCommentDeleteConfirmId] = useState<string | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authTab, setAuthTab] = useState('login')
  const [resumeRespondAfterLogin, setResumeRespondAfterLogin] = useState(false)

  // useSurveyRequest が内部で auto-fetch するため、ここでは追加の fetch は不要
  // （以前は重複呼び出し + fetchRequest 参照不安定で無限ループしていた）

  // REQ-086 Phase 2: 結果投稿フォームに依頼情報を引き継ぐ。
  // App Router では history state が消えるため sessionStorage を中継に使う。
  const seedSurveyRequestForPost = useCallback((target: NonNullable<typeof request>) => {
    try {
      const seed = {
        id: target.id,
        species: target.species,
        lat: target.lat,
        lng: target.lng,
        municipality: target.municipality,
        reason: target.reason,
      }
      window.sessionStorage.setItem('zaridasu:surveyRequestForPost', JSON.stringify(seed))
    } catch {
      /* sessionStorage 不可環境では引き継ぎ無しでホームへ */
    }
    router.push('/map')
  }, [router])

  useEffect(() => {
    if (!user || !request || !resumeRespondAfterLogin) return
    setResumeRespondAfterLogin(false)
    setShowAuthModal(false)
    seedSurveyRequestForPost(request)
  }, [user, request, resumeRespondAfterLogin, seedSurveyRequestForPost])

  const openAuthModal = (tab = 'login') => {
    setAuthTab(tab)
    setShowAuthModal(true)
  }

  const closeAuthModal = () => {
    setShowAuthModal(false)
    setResumeRespondAfterLogin(false)
  }

  const handleRespondClick = () => {
    if (!user) {
      setResumeRespondAfterLogin(true)
      openAuthModal('signup')
      return
    }
    if (!request) return
    seedSurveyRequestForPost(request)
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🔍</div>
          <p className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  // REQ-192 (FR-192-03/04): 取得失敗（エラー）は空状態（notFound）と分離し、再試行ボタンを提示する。
  // ErrorAlert は role="alert" を内蔵（REQ-195）。空状態文言（survey.notFound）は流用しない。
  if (fetchError) {
    return (
      <div className={`min-h-screen flex items-center justify-center px-6 ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="w-full max-w-sm space-y-3 text-center">
          <ErrorAlert message={t('common.loadError')} />
          <button
            type="button"
            onClick={() => { fetchRequest() }}
            className="text-sm font-bold px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors"
          >
            {t('common.retry')}
          </button>
          <div>
            <button onClick={() => router.push('/')} className="text-red-500 underline text-sm">{t('common.backToTop')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center space-y-3">
          <div className="text-4xl">🔍</div>
          <p className={dark ? 'text-slate-400' : 'text-gray-500'}>{t('survey.notFound')}</p>
          <button onClick={() => router.push('/')} className="text-red-500 underline text-sm">{t('common.backToTop')}</button>
        </div>
      </div>
    )
  }

  const speciesInfo = SURVEY_SPECIES.find(s => s.value === request.species)
  const statusInfo = SURVEY_STATUS.find(s => s.value === request.status)
  const isOwner = user?.id === request.user_id
  const profile = request.user_profiles

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'}`}>
      {/* ヘッダー */}
      <header className={`sticky top-0 z-40 border-b px-4 py-3 flex items-center gap-3 ${dark ? 'bg-slate-900/95 border-slate-800 backdrop-blur-md' : 'bg-white/95 border-gray-200 backdrop-blur-md'}`}>
        <button onClick={() => router.back()} aria-label={t('common.back')} className={`p-1 rounded-lg transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold flex items-center gap-2">
          <Search size={18} className="text-amber-500" />
          {t('survey.detailTitle')}
        </h1>
      </header>

      {/* 地図 */}
      <div className="h-48 sm:h-56">
        <MiniMap lat={request.lat} lng={request.lng} />
      </div>

      {/* REQ-091 / REQ-329: ここまでの経路（Google / Yahoo! / Apple）。依頼地点は約 111 m に粗化された公開座標 */}
      <div className="max-w-2xl mx-auto px-4 mt-3">
        <RouteLinks lat={Number(request.lat)} lng={Number(request.lng)} approximate dark={dark} />
      </div>

      {/* 本体 */}
      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* ステータス + メタ */}
        <div className={`rounded-xl p-4 space-y-3 ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}>
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${
              // REQ-325 FR-325-01: 閉じた状態のチップだけ gray-500 on gray-100 = 4.39:1 で AA 未満だった。
              // amber(4.51:1) / blue(5.49:1) は基準内なのでそのまま。gray-600 で 6.87:1。
              request.status === 'open' ? 'bg-amber-100 text-amber-700' :
              request.status === 'responded' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {statusInfo?.emoji} {t(`survey.status.${request.status}`)}
            </span>
            {request.urgency === 'urgent' && (
              <span className="text-xs font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full">
                🔴 {t('survey.urgencyUrgent')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {speciesInfo?.image && <Image src={speciesInfo.image} alt={speciesInfo.label ?? ''} width={24} height={24} className="w-6 h-6 object-contain" />}
            <span className="font-bold">
              {speciesInfo?.value === 'unknown' ? t('survey.speciesUnknown') : t(`species.${request.species}`)}
            </span>
          </div>

          <div className={`flex flex-wrap gap-x-4 gap-y-1 text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            {request.municipality && (
              <span className="flex items-center gap-1"><MapPin size={14} />{request.municipality}</span>
            )}
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {format(new Date(request.created_at), 'yyyy/M/d HH:mm', { locale: getDateLocale(i18n.language) })}
            </span>
          </div>
        </div>

        {/* 調査理由 */}
        <div className={`rounded-xl p-4 ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}>
          <h3 className={`text-sm font-semibold mb-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('survey.reasonLabel')}</h3>
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
            {request.reason}
          </p>
        </div>

        {/* 投稿者 */}
        {profile && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}>
            <span className="text-2xl">{profile.avatar_emoji || '🦞'}</span>
            <div>
              <p className="font-medium text-sm">{profile.display_name || t('survey.anonymous')}</p>
              <Link href={`/profile/${request.user_id}`} className="text-xs text-red-500 hover:underline">
                {t('survey.viewProfile')}
              </Link>
            </div>
          </div>
        )}

        {/* 関連投稿 */}
        {relatedPosts.length > 0 && (
          <div>
            <h3 className={`text-sm font-semibold mb-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              {t('survey.relatedPosts', { count: relatedPosts.length })}
            </h3>
            <div className="space-y-2">
              {relatedPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className={`block rounded-xl p-3 transition-colors ${dark ? 'bg-slate-900 border border-slate-800 hover:bg-slate-800' : 'bg-white border border-gray-100 shadow-xs hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true">{SURVEY_SPECIES.find(s => s.value === post.species)?.emoji ?? DEFAULT_SPECIES_EMOJI}</span>
                    <span className="font-medium">{t(`species.${post.species}`)}</span>
                    <span className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
                      {format(new Date(post.created_at), 'M/d', { locale: getDateLocale(i18n.language) })}
                    </span>
                  </div>
                  {post.comment && (
                    <p className={`text-xs mt-1 line-clamp-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{post.comment}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* REQ-087 Phase 3: 「協力する」軽量応答 */}
        <section
          aria-labelledby="responses-heading"
          className={`rounded-xl p-4 ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 id="responses-heading" className={`text-sm font-semibold flex items-center gap-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
              <Users size={14} />
              協力者 <span className="opacity-60">({responseCount})</span>
            </h3>
            {user && request.status !== 'closed' && !isOwner && (
              <button
                type="button"
                onClick={async () => {
                  if (responseSubmitting) return
                  setResponseSubmitting(true)
                  try {
                    if (hasResponded) await cancelResponse()
                    else await respond()
                  } catch (e) {
                    logError(e as Error, 'SurveyRequestPage:respond')
                    // REQ-193 (FR-193-03): 協力トグルの失敗を無通知にせずトーストで知らせる。
                    toast.error(t('survey.respondError'))
                  } finally {
                    setResponseSubmitting(false)
                  }
                }}
                disabled={responseSubmitting || responsesLoading}
                aria-pressed={hasResponded}
                className={`text-sm font-medium px-4 min-h-[44px] inline-flex items-center rounded-full border transition-colors disabled:opacity-50 ${
                  hasResponded
                    ? (dark ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-amber-100 border-amber-400 text-amber-700')
                    : (dark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50')
                }`}
              >
                {hasResponded ? '✓ 協力中' : '🙋 協力する'}
              </button>
            )}
          </div>
          {responsesError && (
            <p className="text-xs text-red-500 mb-2" role="alert">{responsesError}</p>
          )}
          {responses.length === 0 ? (
            // REQ-222 (FR-222-03): 否定形「まだ協力者はいません」→ 肯定形「協力者を募集中です」。
            <EmptyState icon="🙋" className="py-6" title={t('survey.respondersEmptyTitle')} />
          ) : (
            <ul className="flex flex-wrap gap-2">
              {responses.map((r) => (
                <li
                  key={r.id}
                  title={r.display_name ?? '匿名'}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                    dark ? 'bg-slate-800 text-slate-200' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <span>{r.avatar_emoji || '🦞'}</span>
                  <span className="max-w-32 truncate">{r.display_name || '匿名'}</span>
                </li>
              ))}
              {responseCount > responses.length && (
                <li className={`text-xs px-2 py-1 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                  ほか {responseCount - responses.length} 名
                </li>
              )}
            </ul>
          )}
        </section>

        {/* REQ-089 Phase 5: 依頼への直接コメント */}
        <section
          aria-labelledby="comments-heading"
          className={`rounded-xl p-4 ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}
        >
          <h3 id="comments-heading" className={`text-sm font-semibold mb-3 flex items-center gap-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
            <MessageCircle size={14} />
            コメント <span className="opacity-60">({comments.length})</span>
          </h3>

          {commentsError && (
            <p className="text-xs text-red-500 mb-2" role="alert">{commentsError}</p>
          )}

          {commentsLoading ? (
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`} role="status" aria-busy="true">{t('common.loading')}</p>
          ) : comments.length === 0 ? (
            // REQ-222 (FR-222-03): 否定形「まだコメントはありません」→ 肯定形「最初のコメントで応援しよう」。
            <EmptyState icon="💬" className="py-6" title={t('survey.commentsEmptyTitle')} />
          ) : (
            <ul className="space-y-3 mb-3">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="text-lg shrink-0" aria-hidden="true">{c.avatar_emoji || '🦞'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium truncate">{c.display_name || '匿名'}</span>
                      <span className={`text-[10px] ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
                        {formatDistanceToNowStrict(new Date(c.created_at), { locale: getDateLocale(i18n.language), addSuffix: true })}
                      </span>
                      {user?.id === c.user_id && (
                        commentDeleteConfirmId === c.id ? (
                          <span className="ml-auto flex items-center gap-1">
                            <span className={`text-[10px] ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('survey.commentDeleteConfirmPrompt')}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                setCommentDeleteConfirmId(null)
                                // REQ-193 (FR-193-03): コメント削除の失敗を無通知にせずトーストで知らせる。
                                try { await deleteComment(c.id) } catch (e) { logError(e as Error, 'SurveyRequestPage:deleteComment'); toast.error(t('survey.commentDeleteError')) }
                              }}
                              className="text-xs font-bold text-red-500 px-2.5 min-h-[44px] inline-flex items-center rounded-sm hover:bg-red-500/10"
                            >
                              {t('survey.commentDeleteConfirm')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommentDeleteConfirmId(null)}
                              // REQ-325 FR-325-01: hover 面が gray-100 なのに gray-400（2.31:1）だった。
                              className={`text-xs px-2.5 min-h-[44px] inline-flex items-center rounded-sm ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                              {t('survey.commentDeleteCancel')}
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCommentDeleteConfirmId(c.id)}
                            aria-label={t('survey.commentDeleteLabel')}
                            className={`ml-auto text-xs min-h-[44px] inline-flex items-center gap-1 ${dark ? 'text-slate-500 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}`}
                          >
                            <Trash2 size={14} /> {t('survey.commentDeleteLabel')}
                          </button>
                        )
                      )}
                    </div>
                    <p className={`text-sm whitespace-pre-wrap wrap-break-word ${dark ? 'text-slate-200' : 'text-gray-700'}`}>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {user && request.status !== 'closed' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                if (commentSubmitting) return
                setCommentError(null)
                setCommentSubmitting(true)
                try {
                  await postComment(commentDraft)
                  setCommentDraft('')
                } catch (err) {
                  setCommentError(err instanceof Error ? err.message : String(err))
                } finally {
                  setCommentSubmitting(false)
                }
              }}
              className="flex items-start gap-2"
            >
              <label htmlFor="survey-comment-input" className="sr-only">コメント本文</label>
              <textarea
                id="survey-comment-input"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="情報共有や質問を書く（500文字以内）"
                className={`flex-1 resize-none rounded-lg border px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-400 ${
                  dark ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-800'
                }`}
              />
              <button
                type="submit"
                disabled={commentSubmitting || commentDraft.trim().length === 0}
                className="shrink-0 inline-flex items-center gap-1 bg-amber-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-amber-600"
              >
                <Send size={12} /> 送信
              </button>
            </form>
          ) : !user ? (
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
              コメントするには{' '}
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="text-red-500 underline"
              >
                ログイン
              </button>
              が必要です
            </p>
          ) : (
            <p className={`text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>
              クローズ済みの依頼にはコメントできません
            </p>
          )}
          {commentError && (
            <p className="text-xs text-red-500 mt-2" role="alert">{commentError}</p>
          )}
        </section>

        {/* アクションボタン */}
        <div className="space-y-2 pb-8">
          {request.status !== 'closed' && (
            <button
              onClick={handleRespondClick}
              className="w-full bg-accent text-white font-bold py-3 rounded-xl hover:bg-(--color-accent-hover) transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
            >
              🔍 {t('survey.respond')}
            </button>
          )}
          {isOwner && request.status !== 'closed' && (
            closeConfirming ? (
              // REQ-273 FR-273-04: 誤タップ即クローズ防止のインライン確認。
              <div className={`rounded-xl border-2 p-3 space-y-2 ${dark ? 'border-slate-600' : 'border-gray-200'}`}>
                <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('survey.closeConfirm')}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleCloseRequest}
                    disabled={closing}
                    className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-60 ${dark ? 'bg-red-900/60 hover:bg-red-900 text-red-100' : 'bg-red-100 hover:bg-red-200 text-red-800'}`}
                  >
                    {closing ? t('common.loading') : t('survey.closeConfirmAction')}
                  </button>
                  <button
                    onClick={() => setCloseConfirming(false)}
                    disabled={closing}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-60 ${dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCloseConfirming(true)}
                className={`w-full py-3 rounded-xl font-medium text-sm border-2 transition-colors ${dark ? 'border-slate-600 text-slate-300 hover:bg-slate-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {t('survey.close')}
              </button>
            )
          )}
        </div>
      </div>
      {showAuthModal && (
        <AuthModal onClose={closeAuthModal} defaultTab={authTab} />
      )}
    </div>
  )
}
