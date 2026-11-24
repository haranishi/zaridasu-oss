'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: 情報カード群（メタ/位置/天気/AI判定）とコメント/共有アクションをセクション分割する（722行）。

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/dateLocales'
import PhotoViewer from '@/components/ui/PhotoViewer'
import CommentSection from '@/components/features/posts/CommentSection'
import LikeShareSection from '@/components/features/posts/LikeShareSection'
import AudioPlayer from '@/components/ui/AudioPlayer'
import RouteLinks from '@/components/ui/RouteLinks'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useToastContext } from '@/context/ToastContext'
import dynamic from 'next/dynamic'
// REQ-278 FR-278-02: AuthModal は未ログインで「いいね/コメント」した時だけ開くため
// 遅延ロードする（HomePage 等と同方針）。/post/[id] は SNS 共有の主要着地ページ型で、
// 静的 import だと大半の閲覧者に不要な 648 行＋Turnstile 関連が初期 JS に同梱されていた。
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })
const DetailMap = dynamic(
  () => import('react-leaflet').then(mod => {
    const { MapContainer, TileLayer, CircleMarker } = mod
    return { default: ({ lat, lng }: { lat: number; lng: number }) => (
      <MapContainer center={[lat, lng]} zoom={14} scrollWheelZoom={false} className="w-full h-full rounded-xl" style={{ zIndex: 0 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} />
        <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ fillColor: '#DC2626', color: 'white', weight: 2, fillOpacity: 0.9 }} />
      </MapContainer>
    )}
  }),
  { ssr: false, loading: () => <div className="w-full h-full bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" /> }
)
// REQ-153: 通報/編集モーダルは showReport / showEdit が true のときだけ描画されるため動的 import で初期バンドルから分離。
const ReportModal = dynamic(() => import('@/components/modals/ReportModal'), { ssr: false })
const EditDialog = dynamic(() => import('@/components/modals/EditDialog'), { ssr: false })
import { logError } from '@/lib/errorHandler'
import { useLike } from '@/hooks/useLike'
import type { LikeSeed } from '@/hooks/useLike'
import { useEditPost } from '@/hooks/posts/useEditPost'
import { useDetailSEO } from '@/hooks/useDetailSEO'
import { trackEvent } from '@/lib/analytics'
import Breadcrumb from '@/components/ui/Breadcrumb'
import { getMunicipalitySlug, OSM_ATTRIBUTION } from '@/lib/constants'
import { filterAdviceCodes, adviceLabelKey } from '@/lib/aiAdvice'
import { ArrowLeft, MapPin, Calendar, Tag, Flag, ShieldCheck, User, Star, Pencil, Clock, XCircle, Lock } from 'lucide-react'
import { WEATHER_ICONS } from '@/lib/weatherIcons'
import { supabase } from '@/lib/supabase/client'
import { selectPostDetailById } from '@/lib/data/posts'
import { hideOwnPostLocation } from '@/lib/data/posts-write'
import type { DetailPost } from '@/types/post'

interface InitialComment {
  id: string
  post_id: string
  user_id: string
  content: string
  is_admin: boolean
  created_at: string
}

interface DetailPageProps {
  id: string
  /**
   * REQ-140: RSC 側で取得した投稿を seed として渡せる経路。
   * - `initialPost` が現在の `id` と一致する場合は Client 側 fetch を完全にスキップする。
   * - SPA 遷移などで `initialPost?.id !== id` の場合は従来通り `useEffect` で fetch する。
   */
  initialPost?: DetailPost | null
  initialComments?: InitialComment[] | null
  initialLikes?: LikeSeed[] | null
}

export default function DetailPage({ id, initialPost, initialComments: initialCommentsProp, initialLikes: initialLikesProp }: DetailPageProps) {
  const { dark } = useTheme()
  const { t, i18n } = useTranslation()
  const dateLocale = getDateLocale(i18n.language)
  const { user, isEmailConfirmed } = useAuth()
  const toast = useToastContext()
  // REQ-140: RSC seed があれば初期 state に直接乗せる。Client fetch をスキップして LCP を改善する。
  const hasSeed = !!initialPost && initialPost.id === id
  const [post, setPost] = useState<DetailPost | null>(hasSeed ? initialPost : null)
  // REQ-113: PostgREST embed で同一 round-trip で取得した関連データ
  const [initialComments, setInitialComments] = useState<InitialComment[] | null>(hasSeed ? (initialCommentsProp ?? []) : null)
  const [initialLikes, setInitialLikes] = useState<LikeSeed[] | null>(hasSeed ? (initialLikesProp ?? []) : null)
  const { likeCount, liked, likeLoading, emailNotice, likePulse, toggleLike } = useLike(id, initialLikes)
  const [loading, setLoading] = useState(!hasSeed)
  // REQ-192 (FR-192-05): Client fallback fetch の失敗を post=null（=「見つかりません」空状態）とは
  // 別の state で表現し、エラー UI + 再試行へ反映する。一時障害を「投稿が存在しない」と誤表示しない。
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authTab, setAuthTab] = useState('login')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  // REQ-243: 所有者は自分の投稿の正確座標を get_my_post_location RPC で取得して表示に使う
  // （非所有者は post.lat/lng の粗化/非公開値のまま）。
  const [ownerCoords, setOwnerCoords] = useState<{ lat: number; lng: number } | null>(null)
  // REQ-329: 投稿者が後から位置を非公開にする（一方向なので確認を挟む）
  const [confirmHide, setConfirmHide] = useState(false)
  const [hiding, setHiding] = useState(false)

  function openAuth(tab = 'login') {
    setAuthTab(tab)
    setShowAuth(true)
  }

  // REQ-192 (FR-192-04/05): 再試行ボタンから呼べるよう fallback fetch を useCallback 化する。
  // signal はアンマウント/再フェッチ時のキャンセル用。NFR-192-01: アボート時は state を更新しない。
  const loadPost = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setFetchError(null)
    // 列の構成（REQ-103 の最小列、REQ-113 の comments/likes 結合、REQ-243 の粗化座標）は
    // lib/data/posts.ts が持つ。所有者の正確座標は下の useEffect が
    // get_my_post_location RPC で取得して上書きする。
    const { data, error } = await selectPostDetailById(supabase, id)
    if (signal?.aborted) return
    if (error) {
      // REQ-192 (FR-192-05): 握りつぶさず fetchError に載せ、エラー UI + 再試行で回復可能にする。
      // PGRST116（0 行 = 該当なし）は「見つかりません」空状態なのでエラー扱いしない。
      if ((error as { code?: string }).code === 'PGRST116') {
        setPost(null)
      } else {
        logError(error, 'DetailPage:fetchPost')
        setFetchError(error.message)
      }
    } else if (data) {
      // embeds を切り出してから post 本体を state にセットする
      // REQ-155 / REQ-209 FR-209-04: supabase-js は select 文字列から行形状を推論するが、
      // Database 型が未配線（database.types.ts は最小限の手書き型）のため各列は any 推論となり、
      // さらに PostgREST embed（comments(id, post_id, user_id, content, is_admin, created_at) / likes(...)）を含むこの行は DetailPost と構造的に
      // 重ならない。よって unknown 経由のキャストが構造上必要。参照側は select で列挙した範囲のみ使用する。
      const { comments, likes, ...postRest } = data as unknown as DetailPost & {
        comments?: InitialComment[] | null
        likes?: LikeSeed[] | null
      }
      setInitialComments(comments ?? [])
      setInitialLikes(likes ?? [])
      setPost(postRest as DetailPost)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    // REQ-140: RSC seed が現在の id と一致するなら Client 側の fetch をスキップする（通常経路）。
    // 不一致（SPA 遷移など）の場合は従来通り fallback fetch を実行する。
    if (post && post.id === id) {
      return
    }
    const controller = new AbortController()
    loadPost(controller.signal)
    return () => controller.abort()
    // post.id を依存にすると seed を後から差し替えたとき再 fetch が走る。
    // 通常はマウント時 + id 変化時だけで十分なので依存は id（loadPost 経由）のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // REQ-243: 投稿所有者のときだけ正確座標を取得して地図・座標表示を生精度にする。
  // 非所有者には post.lat/lng（display_lat/lng＝粗化 or NULL）のまま表示する。
  useEffect(() => {
    const ownerId = post?.user_id
    if (!post || !user || !ownerId || user.id !== ownerId) {
      setOwnerCoords(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.rpc('get_my_post_location', { p_post_id: post.id })
        if (cancelled) return
        const row = Array.isArray(data) ? data[0] : null
        if (row && row.lat != null && row.lng != null) {
          setOwnerCoords({ lat: Number(row.lat), lng: Number(row.lng) })
        }
      } catch { /* 取得失敗時は粗化表示のままにする */ }
    })()
    return () => { cancelled = true }
  }, [post, user])

  const { saving: editSaving, error: editError, clearError: clearEditError, saveEdit } = useEditPost(post, {
    onSuccess: (fields: Record<string, unknown>) => {
      setPost(prev => prev ? { ...prev, ...fields } : prev)
      setShowEdit(false)
    },
  })

  // Rules of Hooks: すべてのフック呼び出しを条件付きリターンより前に配置する
  const { species, infoType } = useDetailSEO(post)

  // REQ-232 (FR-232-03): AI 判定カードが「結果あり・エラーでない」状態で描画されたら 1 回だけ計測。
  // confidence は 0–49/50–74/75–100 でバケット化（生値は送らない・高カーディナリティ回避）。
  const aiViewTrackedRef = useRef<string | null>(null)
  useEffect(() => {
    const ai = post?.ai_result
    const hasPhotos = (post?.photos?.length ?? 0) > 0
    if (!post || !hasPhotos || !ai || ai.error) return
    if (aiViewTrackedRef.current === post.id) return
    aiViewTrackedRef.current = post.id
    const pct = ai.confidence != null ? Math.round(ai.confidence * 100) : null
    const confidence_bucket = pct == null ? 'unknown' : pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low'
    trackEvent('ai_identify_view', {
      species_match: ai.species_match === true,
      confidence_bucket,
    })
  }, [post])

  async function handleHideLocation() {
    if (!post || hiding) return
    setHiding(true)
    try {
      await hideOwnPostLocation(supabase, post.id)
      setPost(prev => (prev ? { ...prev, location_disclosure: 'hidden' } : prev))
      setConfirmHide(false)
      toast.success(t('detail.hideLocation.done'))
    } catch (err) {
      logError(err, 'DetailPage:hideLocation')
      toast.error(t('detail.hideLocation.failed'))
    } finally {
      setHiding(false)
    }
  }

  function handleLike() {
    // REQ-193 (FR-193-01): toggleLike は失敗時にサーバ値へ再同期した上で false を返す。
    // ここで戻り値を見て無通知を解消する（成功・未ログイン・メール未確認・連打抑止は true）。
    void toggleLike(() => openAuth('signup')).then((ok) => {
      if (!ok) toast.error(t('like.error'))
    })
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-dvh ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🦞</div>
          <div className={`text-sm ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('detail.loading')}</div>
        </div>
      </div>
    )
  }

  const isOwner = user && post && post.user_id && user.id === post.user_id

  // REQ-192 (FR-192-03/05): 取得失敗（エラー）は「投稿が見つかりません」（空状態）と分離し、
  // エラー UI + 再試行ボタンを提示する。ErrorAlert は role="alert" を内蔵（REQ-195）。
  if (fetchError) {
    return (
      <div className={`flex flex-col items-center justify-center h-dvh gap-4 px-6 ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <ErrorAlert message={t('common.loadError')} className="max-w-sm w-full" />
        <button
          type="button"
          onClick={() => { loadPost() }}
          className="text-sm font-bold px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors"
        >
          {t('common.retry')}
        </button>
        <Link href="/map" className="text-red-500 hover:underline text-sm font-medium flex items-center gap-1">
          <ArrowLeft size={14} /> {t('detail.backToMap')}
        </Link>
      </div>
    )
  }

  if (!post) {
    return (
      <div className={`flex flex-col items-center justify-center h-dvh gap-4 ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
        <div className="text-4xl">😢</div>
        <p className={dark ? 'text-slate-400' : 'text-gray-500'}>{t('detail.notFound')}</p>
        <Link href="/map" className="text-red-500 hover:underline text-sm font-medium flex items-center gap-1">
          <ArrowLeft size={14} /> {t('detail.backToMap')}
        </Link>
      </div>
    )
  }

  const card = `rounded-2xl shadow-xs p-5 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`
  const muted = dark ? 'text-slate-400' : 'text-gray-600'
  const faint = dark ? 'text-slate-400' : 'text-gray-500'
  const divider = dark ? 'border-slate-700/60' : 'border-gray-100'

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* ヘッダー */}
      <header
        className={`px-4 flex items-center gap-3 sticky top-0 z-10 h-12 border-b ${
          dark
            ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80'
            : 'bg-white/95 backdrop-blur-md border-gray-200'
        }`}
        style={{ paddingTop: 'max(0px, env(safe-area-inset-top, 0px))' }}
      >
        <Link
         href="/map"
          aria-label={t('common.back')}
          className={`p-2 -ml-1 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className={`font-bold text-base ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('detail.title')}</h1>
        {isOwner && (
          <button
            onClick={() => { clearEditError(); setShowEdit(true) }}
            className={`ml-auto flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              dark ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <Pencil size={14} />
            {t('detail.edit')}
          </button>
        )}
      </header>

      <Breadcrumb items={[{ label: species ? t('detail.breadcrumbSpeciesInfo', { species: t(`species.${post.species as string}`), infoType: t(`infoType.${post.info_type as string}`) }) : t('detail.title') }]} />

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* ステータスバナー（pending / rejected の場合のみ表示） */}
        {post.status === 'pending' && (
          <div className={`flex items-start gap-3 rounded-xl p-4 ${
            dark ? 'bg-amber-900/30 border border-amber-700/40' : 'bg-amber-50 border border-amber-200'
          }`}>
            <Clock size={20} className="shrink-0 text-amber-500 mt-0.5" />
            <div>
              <p className={`text-sm font-bold ${dark ? 'text-amber-300' : 'text-amber-700'}`}>
                {t('detail.pendingNotice')}
              </p>
              <p className={`text-xs mt-1 ${dark ? 'text-amber-400/70' : 'text-amber-600'}`}>
                {t('detail.pendingNoticeDesc')}
              </p>
            </div>
          </div>
        )}
        {post.status === 'rejected' && (
          <div className={`flex items-start gap-3 rounded-xl p-4 ${
            dark ? 'bg-red-900/30 border border-red-700/40' : 'bg-red-50 border border-red-200'
          }`}>
            <XCircle size={20} className="shrink-0 text-red-500 mt-0.5" />
            <div>
              <p className={`text-sm font-bold ${dark ? 'text-red-300' : 'text-red-700'}`}>
                {t('detail.rejectedNotice')}
              </p>
              {post.rejection_message && (
                <p className={`text-xs mt-1 ${dark ? 'text-red-400/70' : 'text-red-600'}`}>
                  {t('detail.rejectedReason', { reason: post.rejection_message })}
                </p>
              )}
              <p className={`text-xs mt-1 ${dark ? 'text-red-400/50' : 'text-red-500'}`}>
                {t('detail.rejectedHint')}
              </p>
            </div>
          </div>
        )}

        {/* メイン情報カード */}
        <div className={card} style={{ borderLeft: `4px solid ${species?.color || '#6B7280'}` }}>
          <div className="flex items-center gap-3 mb-4">
            <Image
              src={(species?.image || '/images/unknown.png') as string}
              alt={species ? t(`species.${post.species as string}`) : t('detail.unknown')}
              width={36}
              height={36}
              className="w-9 h-9 object-contain shrink-0"
            />
            <h2 className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
              {species ? t(`species.${post.species as string}`) : t('detail.unknown')}
            </h2>
            <span className={`ml-auto text-sm px-3 py-1 rounded-full whitespace-nowrap ${
              dark ? 'bg-slate-800 text-slate-400' : 'bg-gray-100 text-gray-600'
            }`}>
              {infoType?.emoji as React.ReactNode} {infoType ? t(`infoType.${post.info_type as string}`) : ''}
            </span>
          </div>

          <div className="space-y-2.5">
            {post.observed_at && (
              <div className={`flex items-center gap-2.5 text-sm ${muted}`}>
                <Calendar size={15} className={`shrink-0 ${faint}`} />
                <span>{t('detail.observedAt', { date: format(new Date(post.observed_at), 'yyyy/M/d (EEE)', { locale: dateLocale }) })}</span>
              </div>
            )}
            <div className={`flex items-center gap-2.5 text-sm ${muted}`}>
              <Calendar size={15} className={`shrink-0 ${faint}`} />
              <span>{t('detail.postedAt', { date: format(new Date(post.created_at), 'yyyy/M/d (EEE) HH:mm', { locale: dateLocale }) })}</span>
            </div>

            {post.municipality && (
              <div className={`flex items-center gap-2.5 text-sm ${muted}`}>
                <MapPin size={15} className={`shrink-0 ${faint}`} />
                <span>{t('detail.location', { municipality: post.municipality })}</span>
              </div>
            )}

            {post.count != null && (
              <div className={`flex items-center gap-2.5 text-sm ${muted}`}>
                <span className={faint}>🦞</span>
                <span>{t('detail.count', { count: post.count })}</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 text-sm">
              {!post.is_anonymous ? (
                <>
                  <ShieldCheck size={15} className="shrink-0 text-blue-400" />
                  <span className="text-blue-400 font-medium">{t('detail.verified')}</span>
                  <span className={`text-sm ${faint}`}>— {t('detail.verifiedDesc')}</span>
                </>
              ) : (
                <>
                  <User size={15} className={`shrink-0 ${faint}`} />
                  <span className={faint}>{t('detail.anonymous')}</span>
                </>
              )}
            {post.is_official && (
              <span className="flex items-center gap-1 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-medium ml-1">
                <Star size={11} fill="white" />
                {t('detail.official')}
              </span>
            )}
            </div>
          </div>

          {post.comment && (
            <div className={`mt-4 pt-4 border-t ${divider}`}>
              <div className={`flex items-center gap-1.5 text-sm font-semibold mb-2 ${faint}`}>
                <Tag size={13} />
                {t('detail.comment')}
              </div>
              <p className={`text-sm whitespace-pre-wrap leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                {post.comment}
              </p>
            </div>
          )}
        </div>

        {/* 写真 */}
        {post.photos && post.photos.length > 0 && (
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('detail.photos')}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {post.photos.map((url: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setViewerIndex(i)}
                  className="relative block aspect-square overflow-hidden rounded-xl hover:opacity-90 transition-opacity cursor-zoom-in"
                  aria-label={t('detail.expandPhoto', { n: i + 1 })}
                >
                  <Image src={url} alt={t('detail.expandPhoto', { n: i + 1 })} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* REQ-080/083: 音声プレビュー（approved または所有者のみ表示） */}
        {post.audio_url && (post.status === 'approved' || isOwner) && (
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('audio.sectionTitle')}</h3>
            <AudioPlayer
              src={post.audio_url}
              durationMs={(post as { audio_duration_ms?: number | null }).audio_duration_ms ?? null}
              className="w-full"
            />
          </div>
        )}

        {/* AI判定カード */}
        {(post.photos?.length ?? 0) > 0 && (() => {
          const ai = post.ai_result
          if (!ai) return (
            <div className={card}>
              <h3 className={`text-sm font-semibold mb-2 ${faint}`}>{t('detail.aiJudgment')}</h3>
              <p className={`text-sm ${faint}`}>{t('detail.aiJudging')}</p>
            </div>
          )
          // REQ-170: 投稿者本人には解析失敗時も前向きなガイダンスを表示（第三者には従来どおり非表示）
          if (ai.error) {
            if (!isOwner) return null
            return (
              <div className={card}>
                <h3 className={`text-sm font-semibold mb-2 ${faint}`}>{t('detail.aiFeedbackTitle')}</h3>
                <p className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                  {t('detail.aiErrorOwnerBody')}
                </p>
              </div>
            )
          }
          const confidence = ai.confidence != null ? Math.round(ai.confidence * 100) : null
          const isMatch = ai.species_match === true
          const isMismatch = ai.species_match === false
          // REQ-170/252: 既知のアドバイスコードのみ表示（共有ヘルパで重複排除 / NFR-170-03）
          const adviceCodes = filterAdviceCodes(ai.improvement_advice)
          const DETECTED_LABEL: Record<string, string> = { american: t('detail.aiSpeciesAmerican'), bullfrog: t('detail.aiSpeciesBullfrog'), other: t('detail.aiSpeciesOther'), unclear: t('detail.aiSpeciesUnclear') }
          const QUALITY_LABEL: Record<string, string> = { good: t('detail.aiQualityGood'), acceptable: t('detail.aiQualityAcceptable'), poor: t('detail.aiQualityPoor') }
          return (
            <div className={card}>
              <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('detail.aiJudgment')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={faint}>{t('detail.aiDetectedSpecies')}</span>
                  <span className={`font-medium ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                    {ai.detected_species ? (DETECTED_LABEL[ai.detected_species] ?? ai.detected_species) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={faint}>{t('detail.aiSpeciesMatch')}</span>
                  <span className={isMatch ? 'text-green-500 font-medium' : isMismatch ? 'text-red-500 font-medium' : faint}>
                    {isMatch ? t('detail.aiMatchYes') : isMismatch ? t('detail.aiMatchNo') : t('detail.unknown')}
                  </span>
                </div>
                {confidence != null && (
                  <div className="flex items-center justify-between gap-4">
                    <span className={faint}>{t('detail.aiConfidence')}</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-24 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
                        <div
                          className={`h-full rounded-full ${confidence >= 75 ? 'bg-green-500' : confidence >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                      <span className={`font-medium ${dark ? 'text-slate-200' : 'text-gray-700'}`}>{confidence}%</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className={faint}>{t('detail.aiImageQuality')}</span>
                  <span className={dark ? 'text-slate-300' : 'text-gray-700'}>{ai.image_quality ? (QUALITY_LABEL[ai.image_quality] ?? ai.image_quality) : '—'}</span>
                </div>
              </div>
              {/* REQ-215 FR-215-04: notes は Gemini 生成の自由文（=ユーザー投稿画像由来コンテンツ）。
                  第三者（非所有者）には公開せず、本人にのみ表示する。第三者には上の enum 由来の
                  定型表示（検出種・一致・信頼度・画質）のみが見える。 */}
              {isOwner && ai.notes && (
                <p className={`mt-3 pt-3 border-t text-xs leading-relaxed ${divider} ${faint}`}>{ai.notes}</p>
              )}
              {/* Per-photo AI results */}
              {ai.per_photo && ai.per_photo.length > 1 && (
                <div className={`mt-3 pt-3 border-t ${divider}`}>
                  <p className={`text-xs font-medium mb-2 ${faint}`}>{t('detail.aiPerPhotoTitle', { analyzed: ai.analyzed_count, total: ai.photo_count })}</p>
                  <div className="flex gap-2">
                    {ai.per_photo.map((ph: { confidence?: number | null; species_match?: boolean | null; error?: string }, i: number) => {
                      const phConf = ph.confidence != null ? Math.round(ph.confidence * 100) : null
                      return (
                        <div key={i} className={`flex-1 text-center rounded-lg p-2 ${dark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                          <p className={`text-xs ${faint}`}>#{i + 1}</p>
                          {ph.error ? (
                            <p className="text-xs text-red-400">{t('detail.aiPerPhotoError')}</p>
                          ) : (
                            <>
                              {phConf != null && (
                                <p className={`text-sm font-bold tabular-nums ${phConf >= 70 ? 'text-green-500' : phConf >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {phConf}%
                                </p>
                              )}
                              <p className="text-xs">
                                {ph.species_match === true ? '✅' : ph.species_match === false ? '❌' : '—'}
                              </p>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* REQ-170: 投稿者本人向け 説明付き教育的フィードバック（肯定的トーン・第三者には非表示） */}
              {isOwner && (adviceCodes.length > 0 || isMismatch) && (
                <div className={`mt-3 pt-3 border-t ${divider}`}>
                  <p className={`text-xs font-semibold mb-1.5 ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                    {isMismatch ? t('detail.aiMismatchTitle') : t('detail.aiFeedbackTitle')}
                  </p>
                  {isMismatch && (
                    <p className={`text-xs leading-relaxed mb-1.5 ${faint}`}>
                      {t('detail.aiMismatchBody', {
                        detected: ai.detected_species ? (DETECTED_LABEL[ai.detected_species] ?? ai.detected_species) : t('detail.unknown'),
                      })}
                    </p>
                  )}
                  {adviceCodes.length > 0 && (
                    <>
                      <p className={`text-xs mb-1 ${faint}`}>{t('detail.aiAdviceIntro')}</p>
                      <ul className={`list-disc pl-5 space-y-0.5 text-xs ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                        {adviceCodes.map((c) => (
                          <li key={c}>{t(adviceLabelKey(c))}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
              <p className={`mt-2 text-xs italic ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{t('detail.aiNote')}</p>
            </div>
          )
        })()}

        {/* 天気情報カード */}
        {post.weather && (
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('weather.sectionTitle')}</h3>
            <div className={`flex items-center gap-3 text-sm ${muted}`}>
              {WEATHER_ICONS[post.weather] ?? WEATHER_ICONS.unknown}
              <span className="font-medium">{t(`weather.${post.weather}`)}</span>
              {post.temperature != null && (
                <span className="text-xs">{post.temperature}°C</span>
              )}
              {post.humidity != null && (
                <span className="text-xs">{t('weather.humidity', { value: post.humidity })}</span>
              )}
            </div>
          </div>
        )}

        {/* 地図 */}
        {/* REQ-243: 表示座標は「所有者の正確座標(ownerCoords) → post.lat/lng(粗化)」の順で解決する。
            hidden 記録では非所有者に座標が無い（NULL）ため、地図の代わりに非公開の案内を出す。 */}
        {(() => {
          const rawLat = ownerCoords ? ownerCoords.lat : (post.lat != null ? Number(post.lat) : null)
          const rawLng = ownerCoords ? ownerCoords.lng : (post.lng != null ? Number(post.lng) : null)
          const coarse = !ownerCoords && post.location_disclosure === 'coarsened'
          if (rawLat == null || rawLng == null || !Number.isFinite(rawLat) || !Number.isFinite(rawLng)) {
            return (
              <div className={card}>
                <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('detail.foundAt')}</h3>
                <p className={`text-sm ${faint}`}>{t('detail.locationHidden')}</p>
              </div>
            )
          }
          const mapLat: number = rawLat
          const mapLng: number = rawLng
          const hidden = post.location_disclosure === 'hidden'
          return (
            <div className={card}>
              <h3 className={`text-sm font-semibold mb-3 ${faint}`}>{t('detail.foundAt')}</h3>
              {/* REQ-329: 非公開の記録を本人が見ているとき。地図と座標は本人（と運営）にだけ見えている。 */}
              {isOwner && hidden && (
                <p className={`flex items-start gap-1.5 text-xs mb-3 rounded-lg px-3 py-2 ${dark ? 'bg-violet-500/15 text-violet-200' : 'bg-violet-50 text-violet-800'}`}>
                  <Lock size={13} aria-hidden="true" className="shrink-0 mt-0.5" />
                  {t('detail.hideLocation.ownerNotice')}
                </p>
              )}
              <div className="h-64 rounded-xl overflow-hidden">
                <DetailMap lat={mapLat} lng={mapLng} />
              </div>
              <p className={`text-xs mt-2 ${faint}`}>
                {t('detail.coordinates', { lat: mapLat.toFixed(5), lng: mapLng.toFixed(5) })}
                {coarse && <span className="ml-1">（{t('detail.coordinatesCoarse')}）</span>}
              </p>
              {/* REQ-091 / REQ-329: ここまでの経路（Google / Yahoo! / Apple） */}
              <RouteLinks lat={mapLat} lng={mapLng} approximate={coarse} dark={dark} className="mt-3" />
              {/* REQ-329: 投稿者は後から位置を非公開にできる（公開へは戻せないので確認を挟む） */}
              {isOwner && !hidden && (
                <div className={`mt-4 pt-3 border-t ${divider}`}>
                  {confirmHide ? (
                    <div role="alert" className="space-y-2">
                      <p className={`text-xs leading-relaxed ${muted}`}>{t('detail.hideLocation.confirm')}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => { void handleHideLocation() }}
                          disabled={hiding}
                          className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl text-sm font-semibold bg-violet-700 hover:bg-violet-800 text-white disabled:opacity-50"
                        >
                          <Lock size={14} aria-hidden="true" />
                          {t('detail.hideLocation.confirmYes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmHide(false)}
                          className={`min-h-11 px-4 rounded-xl text-sm font-medium border ${dark ? 'border-slate-600 text-slate-300' : 'border-gray-300 text-gray-700'}`}
                        >
                          {t('detail.hideLocation.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmHide(true)}
                      className={`inline-flex items-center gap-1.5 min-h-11 text-sm font-medium ${dark ? 'text-violet-300 hover:text-violet-200' : 'text-violet-700 hover:text-violet-800'}`}
                    >
                      <Lock size={14} aria-hidden="true" />
                      {t('detail.hideLocation.button')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* コメント */}
        <div id="comments" className="scroll-mt-20" />
        <CommentSection
          postId={post.id}
          onLoginClick={() => openAuth('login')}
          onSignupClick={() => openAuth('signup')}
          initialComments={initialComments}
        />

        {/* いいね・シェア */}
        {/* REQ-236: シェア導線は id（content_id / UTM パス）と municipality だけを必要とするため
            DetailPost 全体ではなく必要列のみ渡す（不要列の流し込み回避）。 */}
        <LikeShareSection
          post={{ id: post.id, municipality: post.municipality }}
          species={species ?? undefined}
          infoType={infoType ?? undefined}
          likeCount={likeCount}
          liked={liked}
          likeLoading={likeLoading}
          emailNotice={emailNotice}
          likePulse={likePulse}
          isEmailConfirmed={isEmailConfirmed ?? undefined}
          user={user}
          onLike={handleLike}
        />

        {/* この地域の情報リンク */}
        {post.municipality && getMunicipalitySlug(post.municipality) && (
          <div className={card}>
            <Link
              href={`/area/${getMunicipalitySlug(post.municipality)}`}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 font-medium transition-colors"
            >
              <MapPin size={14} />
              {t('detail.areaOtherInfo', { municipality: post.municipality })}
            </Link>
          </div>
        )}

        {/* REQ-227 FR-227-04: 種ピラー(/species/[species])への内部リンク（投稿→ピラーへオーソリティ集約）。
            species は getSpecies(post.species) 解決済みのマスタ。ピラーページが存在する既知種のときだけ表示し、
            URL スラッグ・表示名は SPECIES（species.value / i18n species.*）を単一の真実とする（NFR-227-02）。 */}
        {species && (
          <div className={card}>
            <Link
              href={`/species/${species.value}`}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-400 font-medium transition-colors"
            >
              <Tag size={14} />
              {t('detail.speciesMoreInfo', { species: t(`species.${species.value}`) })}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between py-3">
          <Link
           href="/map"
            className="flex items-center gap-1.5 text-red-500 hover:text-red-400 text-sm font-medium transition-colors"
          >
            <ArrowLeft size={14} />
            {t('detail.back')}
          </Link>
          <button
            onClick={() => setShowReport(true)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${dark ? 'text-slate-400 hover:text-red-400' : 'text-gray-500 hover:text-red-500'}`}
          >
            <Flag size={13} />
            {t('detail.report')}
          </button>
        </div>
      </div>

      {showReport && <ReportModal postId={post.id} onClose={() => setShowReport(false)} />}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} defaultTab={authTab} />}
      {showEdit && (
        <EditDialog
          post={post as { id: string; species: string; info_type: string; municipality?: string | null; comment?: string | null; count?: number | null; observed_at?: string | null; photos?: string[] | null }}
          onSave={saveEdit}
          onCancel={() => setShowEdit(false)}
          saving={editSaving}
          dark={dark}
          error={editError}
        />
      )}
      {viewerIndex !== null && (post.photos?.length ?? 0) > 0 && (
        <PhotoViewer
          photos={post.photos as string[]}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}
