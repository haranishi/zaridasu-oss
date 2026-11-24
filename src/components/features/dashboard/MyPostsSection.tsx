'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocales'
import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { getSpecies, getInfoType, QUERY_LIMITS } from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import { useDeletePost } from '@/hooks/posts/useDeletePost'
import { useEditPost } from '@/hooks/posts/useEditPost'
import type { Post } from '@/types'
import type { AIConcern } from '@/types/post'
// REQ-153: 編集/削除モーダルは editTarget/deleteTarget が非 null のときだけ描画されるため動的 import で分離。
const EditPostDialog = dynamic(() => import('@/components/modals/EditDialog'), { ssr: false })
const DeletePostDialog = dynamic(() => import('@/components/modals/DeleteDialog'), { ssr: false })
import AudioPlayer from '@/components/ui/AudioPlayer'
import { cardCls, muted, faint, pillCls, subheading } from '@/lib/themeClasses'
import { filterAdviceCodes, adviceLabelKey } from '@/lib/aiAdvice'
import EmptyState from '@/components/ui/EmptyState'
import { LoadingState, SkeletonRows } from '@/components/ui/Skeleton'

interface MyPostsSectionProps {
  dark: boolean
}

type MyPost = Post & {
  status?: string
  rejection_reason?: string | null
  rejection_message?: string | null
  audio_url?: string | null
  audio_duration_ms?: number | null
  ai_result?: {
    error?: boolean | string
    confidence?: number | null
    species_match?: boolean
    detected_species?: string
    notes?: string | null
    // REQ-215 FR-215-03: enum 配列（受信側で enum 外は除去済み）。
    concerns?: AIConcern[]
    // REQ-170/252: 投稿者向け撮影アドバイス（言語非依存コード）。低信頼度のとき本人にだけ表示。
    improvement_advice?: string[]
    image_quality?: 'good' | 'acceptable' | 'poor'
    audio_analysis?: {
      error?: string
      confidence?: number | null
      species_match?: boolean | null
      audio_quality?: 'good' | 'acceptable' | 'poor'
      detected_species?: string
      notes?: string | null
      concerns?: AIConcern[]
    } | null
  } | null
}

// 検出種コード → 日本語ラベル（ai_result.detected_species / audio_analysis.detected_species 用）
const DETECTED_SPECIES_LABEL: Record<string, string> = {
  bullfrog: 'ウシガエル',
  american: 'アメリカザリガニ',
  native_frog: '在来種のカエル',
  noise: 'ノイズ',
  other: 'その他',
  unclear: '判別不能',
}

// REQ-215 FR-215-03/04: concerns enum コード → 日本語ラベル。
// この map に無いコード（未知 enum）は表示しない（生コードを露出させない）。
const CONCERN_LABEL: Record<AIConcern, string> = {
  species_mismatch: '申告種と不一致の可能性',
  low_quality: '画質・音質が低い',
  inappropriate: '不適切な可能性',
  no_animal: '対象生物が写っていない可能性',
}

// concerns 配列を既知 enum ラベルだけに変換する（未知コードは除去）。
function concernLabels(concerns: AIConcern[] | undefined): string[] {
  if (!Array.isArray(concerns)) return []
  return concerns
    .filter((c): c is AIConcern => c in CONCERN_LABEL)
    .map((c) => CONCERN_LABEL[c])
}

export default function MyPostsSection({ dark }: MyPostsSectionProps) {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
  const [myPosts, setMyPosts] = useState<MyPost[]>([])
  const [myPostsLoading, setMyPostsLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<MyPost | null>(null)
  const [editTarget, setEditTarget] = useState<MyPost | null>(null)

  const fetchMyPosts = useCallback(async () => {
    if (!user) return
    setMyPostsLoading(true)
    // REQ-103: マイ投稿で実際に参照する列のみを取得（PII 列漏洩防止 + egress 削減）
    const { data } = await supabase
      .from('posts')
      .select('id, created_at, species, info_type, municipality, comment, photos, count, observed_at, status, rejection_reason, rejection_message, audio_url, audio_duration_ms, ai_result')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(QUERY_LIMITS.myPosts)
    // RLSにより自分の投稿は全ステータス取得できる
    // REQ-155: as unknown as の二段キャストを単一キャストに（data は未型付けクライアント由来）
    setMyPosts((data as MyPost[] | null) ?? [])
    setMyPostsLoading(false)
  }, [user])

  useEffect(() => { fetchMyPosts() }, [fetchMyPosts])

  const { deleting, error: deleteError, handleDelete: doDelete } = useDeletePost(deleteTarget, {
    onDeleted: () => { setDeleteTarget(null); fetchMyPosts() },
  })

  const { saving: editSaving, error: editError, clearError: clearEditError, saveEdit } = useEditPost(editTarget, {
    onSuccess: () => { setEditTarget(null); fetchMyPosts() },
  })

  return (
    <div className={cardCls(dark)}>
      <h2 className={`text-sm font-semibold mb-4 ${subheading(dark)}`}>{t('myPosts.title')}</h2>

      {myPostsLoading ? (
        <LoadingState>
          <SkeletonRows rows={3} />
        </LoadingState>
      ) : myPosts.length === 0 ? (
        <EmptyState
          className="py-8"
          title={t('myPosts.empty')}
          description={t('empty.contributionDesc')}
          action={{ label: t('empty.postCta'), href: '/' }}
        />
      ) : (
        <div className="space-y-2">
          {myPosts.map((post) => {
            const sp = getSpecies(post.species)
            const it = getInfoType(post.info_type)
            // REQ-183 FR-183-11: 既存 species.*/infoType.* キーで多言語化（constants.label 直表示を避ける）
            const spLabel = sp ? t(`species.${sp.value}`) : t('dashboard.unknown')
            const itLabel = it ? t(`infoType.${it.value}`) : ''
            return (
              <div
                key={post.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  post.status === 'rejected'
                    ? dark ? 'border-red-900/40 bg-red-950/20' : 'border-red-100 bg-red-50/50'
                    : post.status === 'pending'
                      ? dark ? 'border-amber-900/40 bg-amber-950/20' : 'border-amber-100 bg-amber-50/50'
                      : dark ? 'border-slate-700/40 hover:bg-slate-700/30' : 'border-gray-100 hover:bg-gray-50'
                }`}
                style={{ borderLeft: `3px solid ${sp?.color || '#6B7280'}` }}
              >
                <Image src={sp?.image || '/images/unknown.png'} alt={spLabel} width={32} height={32} className="w-8 h-8 object-contain shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{spLabel}</span>
                    <span className={pillCls(dark)}>{it?.emoji} {itLabel}</span>
                    {post.municipality && <span className={`text-xs ${faint(dark)}`}>{post.municipality}</span>}
                    {/* ステータスバッジ
                        REQ-325 FR-325-01: バッジは全部「淡い面の上の文字」なのに、白地用の弱い色が
                        混ざっていた（gray-400 on gray-100 = 2.31:1 / gray-500 on gray-100 = 4.39:1 /
                        red-600 on red-100 = 3.95:1）。淡い面に載る文字は muted 以上に揃える
                        （gray-600 = 6.87:1 / brand-700 on red-100 = 5.30:1）。
                        amber-700 on amber-100(4.51:1) と green-700 on green-100(4.57:1) は基準内なので触らない。 */}
                    {post.status === 'pending' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{t('dashboard.statusPending')}</span>
                    )}
                    {post.status === 'rejected' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-brand-700 font-medium">{t('dashboard.statusRejected')}</span>
                    )}
                    {post.status === 'approved' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{t('dashboard.statusApproved')}</span>
                    )}
                    {/* AI判定バッジ（画像） */}
                    {(post.photos?.length ?? 0) > 0 && (() => {
                      const ai = post.ai_result
                      if (!ai)
                        return <span key="ai" className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t('dashboard.aiJudging')}</span>
                      if (ai.error) return null
                      const confidence = ai.confidence != null ? Math.round(ai.confidence * 100) : null
                      if (ai.species_match === true && (ai.confidence ?? 0) >= 0.75)
                        return <span key="ai" className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{t('dashboard.aiConfirmed', { confidence })}</span>
                      if (ai.species_match === false)
                        return <span key="ai" className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{t('dashboard.aiMismatch')}</span>
                      return <span key="ai" className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t('dashboard.aiUnclear')}</span>
                    })()}
                    {/* AI判定バッジ（音声）— REQ-079 連携 */}
                    {post.audio_url && (() => {
                      const audio = post.ai_result?.audio_analysis
                      if (!audio)
                        return <span key="audio-ai" className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t('dashboard.audioJudging')}</span>
                      if (audio.error) return null
                      const confidence = audio.confidence != null ? Math.round(audio.confidence * 100) : null
                      if (audio.species_match === true && (audio.confidence ?? 0) >= 0.75)
                        return <span key="audio-ai" className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{t('dashboard.audioConfirmed', { confidence })}</span>
                      if (audio.species_match === false)
                        return <span key="audio-ai" className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{t('dashboard.audioMismatch')}</span>
                      if (audio.audio_quality === 'poor')
                        return <span key="audio-ai" className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{t('dashboard.audioPoorQuality')}</span>
                      return <span key="audio-ai" className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{t('dashboard.audioUnclear')}</span>
                    })()}
                  </div>
                  {/* AI 判定の根拠（画像・音声 両方あれば並列） */}
                  {(() => {
                    const ai = post.ai_result
                    if (!ai || ai.error) return null
                    // REQ-215 FR-215-03/04: concerns は既知 enum ラベルだけに変換（未知コード除去）。
                    const imageConcernLabels = concernLabels(ai.concerns)
                    const audioConcernLabels = concernLabels(ai.audio_analysis?.concerns)
                    const hasImageReason =
                      (post.photos?.length ?? 0) > 0 &&
                      (ai.detected_species || ai.notes || imageConcernLabels.length > 0)
                    const hasAudioReason =
                      !!post.audio_url &&
                      !!ai.audio_analysis &&
                      !ai.audio_analysis.error &&
                      (ai.audio_analysis.detected_species || ai.audio_analysis.notes || audioConcernLabels.length > 0)
                    if (!hasImageReason && !hasAudioReason) return null
                    return (
                      <div
                        className={`mt-1.5 rounded-md px-2 py-1.5 text-[11px] leading-relaxed ${
                          dark ? 'bg-slate-800/60 text-slate-300' : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        {hasImageReason && (() => {
                          const detectedLabel = ai.detected_species ? (DETECTED_SPECIES_LABEL[ai.detected_species] ?? ai.detected_species) : null
                          const conf = ai.confidence != null ? Math.round(ai.confidence * 100) : null
                          return (
                            <div>
                              <span className="font-medium">🤖 {t('dashboard.aiImageReasonPrefix')}</span>
                              {detectedLabel && (
                                <>: {detectedLabel}{conf != null && ` (${t('dashboard.aiConfidenceShort', { confidence: conf })})`}</>
                              )}
                              {ai.notes && <div className="opacity-90">└ {ai.notes}</div>}
                              {imageConcernLabels.length > 0 && (
                                <div className={dark ? 'text-amber-400' : 'text-amber-700'}>⚠ {imageConcernLabels.join(' / ')}</div>
                              )}
                              {/* REQ-252: 低信頼度（<75%）のとき、投稿者本人へ前向きな撮影アドバイスを軽く提示。
                                  コード→文言・フィルタは共有ヘルパ（DetailPage と同一）で再利用（DRY）。 */}
                              {(() => {
                                const adviceCodes = filterAdviceCodes(ai.improvement_advice)
                                if (adviceCodes.length === 0 || ai.confidence == null || ai.confidence >= 0.75) return null
                                return (
                                  <div className={`mt-1 ${dark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                                    💡 {t('detail.aiAdviceIntro')}
                                    <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                                      {adviceCodes.map((c) => <li key={c}>{t(adviceLabelKey(c))}</li>)}
                                    </ul>
                                  </div>
                                )
                              })()}
                            </div>
                          )
                        })()}
                        {hasAudioReason && (() => {
                          const audio = ai.audio_analysis!
                          const detectedLabel = audio.detected_species ? (DETECTED_SPECIES_LABEL[audio.detected_species] ?? audio.detected_species) : null
                          const conf = audio.confidence != null ? Math.round(audio.confidence * 100) : null
                          const qualityLabel = audio.audio_quality
                            ? t(`dashboard.audioQuality.${audio.audio_quality}`)
                            : null
                          return (
                            <div className={hasImageReason ? 'mt-1' : ''}>
                              <span className="font-medium">🎤 {t('dashboard.aiAudioReasonPrefix')}</span>
                              {detectedLabel && (
                                <>: {detectedLabel}{conf != null && ` (${t('dashboard.aiConfidenceShort', { confidence: conf })})`}</>
                              )}
                              {qualityLabel && <> / {qualityLabel}</>}
                              {audio.notes && <div className="opacity-90">└ {audio.notes}</div>}
                              {audioConcernLabels.length > 0 && (
                                <div className={dark ? 'text-amber-400' : 'text-amber-700'}>⚠ {audioConcernLabels.join(' / ')}</div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}
                  {/* REQ-080/083: 音声プレビュー */}
                  {post.audio_url && (
                    <div className="mt-1.5">
                      <AudioPlayer
                        src={post.audio_url}
                        durationMs={post.audio_duration_ms ?? null}
                        className="w-full max-w-xs"
                      />
                    </div>
                  )}
                  {/* 却下理由の表示 */}
                  {post.status === 'rejected' && post.rejection_reason && (
                    <p className={`text-xs mt-1 ${dark ? 'text-red-400' : 'text-red-600'}`}>
                      {t('dashboard.rejectionReason', { reason: post.rejection_reason })}
                      {post.rejection_message && ` — ${post.rejection_message}`}
                    </p>
                  )}
                  {post.comment && <p className={`text-xs truncate mt-0.5 ${muted(dark)}`}>{post.comment}</p>}
                  <p className={`text-xs mt-0.5 ${faint(dark)}`}>
                    {format(new Date(post.created_at), 'yyyy/M/d HH:mm', { locale: getDateLocale(i18n.language) })}
                  </p>
                </div>
                {post.photos?.[0] && (
                  <Image src={post.photos[0]} alt={t('dashboard.postPhotoAlt')} width={48} height={48} className="hidden sm:block w-12 h-12 object-cover rounded-xl shrink-0" />
                )}
                {/* REQ-318 FR-318-04: 編集/削除アイコンのライト色 text-gray-300(#d1d5db) は
                    白カード上 1.47:1。ラベルの無いアイコンボタンなので、これは「装飾が薄い」ではなく
                    「機能が見えない」＝操作不能に等しい。トークン参照の faint()（light 4.8:1）へ。
                    ダーク側の slate-400 も同値のトークンへ寄せ、生クラスの直書きをやめる。 */}
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <Link href={`/post/${post.id}`} className="text-xs text-blue-400 hover:underline">{t('myPosts.detail')}</Link>
                  <button
                    onClick={() => { clearEditError(); setEditTarget(post) }}
                    className={`transition-colors p-2 sm:p-1.5 rounded-lg ${faint(dark)} ${dark ? 'hover:text-slate-200 hover:bg-slate-700' : 'hover:text-gray-700 hover:bg-gray-100'}`}
                    title={t('dashboard.editTitle')}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(post)}
                    className={`transition-colors p-2 sm:p-1.5 rounded-lg ${faint(dark)} ${dark ? 'hover:text-red-400 hover:bg-slate-700' : 'hover:text-red-600 hover:bg-red-50'}`}
                    title={t('dashboard.deletePostTitle')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteTarget && (
        <DeletePostDialog
          post={deleteTarget}
          onConfirm={doDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
          dark={dark}
          error={deleteError}
        />
      )}
      {editTarget && (
        <EditPostDialog
          post={editTarget}
          onSave={saveEdit}
          onCancel={() => { setEditTarget(null); clearEditError() }}
          saving={editSaving}
          dark={dark}
          error={editError}
        />
      )}
    </div>
  )
}
