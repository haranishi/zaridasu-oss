import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { Loader2, Send, Trash2, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getSpecies, getInfoType } from '@/lib/constants'
import { cardCls, faint, muted } from '@/lib/themeClasses'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { useToastContext } from '@/context/ToastContext'

interface PendingPostsSectionProps {
  dark: boolean
}

/** 保存した日時「2026/10/02 10:20」。 */
function formatSavedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function PendingPostsSection({ dark }: PendingPostsSectionProps) {
  const { posts, legacy, claimLegacy, discardLegacyOne, loading, sending, progress, sendAll, remove } = useOfflineQueue()
  const { t } = useTranslation()
  const toast = useToastContext()
  // REQ-197 FR-197-01/02: navigator.onLine の render 時直読みを廃し、共通フックで
  // online/offline イベントを購読。回線状態が変わると再レンダーされ、ボタンの
  // disabled / ラベルが追従する。
  const isOnline = useOnlineStatus()
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  // 古い下書きの確認（どの下書きで、送るのか破棄するのか）
  const [legacyConfirm, setLegacyConfirm] = useState<{ id: number; action: 'claim' | 'discard' } | null>(null)
  const [legacyBusy, setLegacyBusy] = useState<number | null>(null)

  // REQ-197 FR-197-04(b): 回線復帰通知ポリシー。自動送信は採用しない。
  // 理由: ① 下書きにはユーザーが「削除（明示破棄）」を保留しているものが含まれ得る、
  //       ② sendAll はログイン中ユーザー前提（未ログインでは no-op）であり、復帰直後に
  //          認証状態が確定している保証がない、③ 通信課金・誤送信の回避。
  // よってオフライン→オンライン遷移かつ未送信あり・送信中でないときに「送信できます」
  // トーストを出し、ユーザーの明示操作（ボタン）に委ねる。
  const wasOnlineRef = useRef(isOnline)
  useEffect(() => {
    const recovered = isOnline && !wasOnlineRef.current
    wasOnlineRef.current = isOnline
    if (recovered && posts.length > 0 && !sending) {
      toast.info(t('dashboard.canSendNow'))
    }
  }, [isOnline, posts.length, sending, toast, t])

  if (loading) return null
  if (posts.length === 0 && legacy.length === 0) return null

  const card = cardCls(dark)

  const runLegacy = async (id: number, action: 'claim' | 'discard') => {
    setLegacyBusy(id)
    try {
      if (action === 'claim') {
        const sent = await claimLegacy(id)
        toast.success(t(sent ? 'dashboard.legacyDraftsClaimed' : 'dashboard.legacyDraftsClaimedQueued'))
      } else {
        await discardLegacyOne(id)
        toast.success(t('dashboard.legacyDraftsDiscarded'))
      }
    } finally {
      setLegacyBusy(null)
      setLegacyConfirm(null)
    }
  }

  // REQ-330: 利用者で分ける前に保存された下書き（持ち主が分からない）。勝手には送らない。
  // 中身（種・日付・写真）を見せ、確認を挟んで「自分のものとして送る」か「破棄」を選べるようにする。
  const legacyNotice = legacy.length > 0 && (
    <div
      data-testid="pending-legacy-drafts"
      className={`${posts.length > 0 ? 'mt-3' : ''} space-y-2 rounded-xl border p-3 text-sm leading-relaxed ${dark ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-700'}`}
    >
      <p>{t('dashboard.legacyDrafts', { count: legacy.length })}</p>
      <ul className="space-y-2">
        {legacy.map((post) => {
          if (post.id == null) return null
          const id = post.id
          const sp = getSpecies(post.formData.species)
          const it = getInfoType(post.formData.infoType)
          const spLabel = sp ? t(`species.${sp.value}`) : t('dashboard.unknown')
          const thumb =
            post.photos[0] instanceof Blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(post.photos[0]) : null
          const confirming = legacyConfirm?.id === id ? legacyConfirm.action : null
          return (
            <li key={id} data-testid="pending-legacy-item" className={`rounded-lg border p-2.5 ${dark ? 'border-slate-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                {thumb && (
                  // eslint-disable-next-line @next/next/no-img-element -- 端末の blob URL は next/image に通せない
                  <img src={thumb} alt={t('dashboard.postThumbnailAlt')} width={48} height={48} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                    {spLabel}
                    {it && <span className={`ml-1.5 text-xs font-normal ${faint(dark)}`}>{it.emoji} {t(`infoType.${it.value}`)}</span>}
                  </p>
                  <p className={`text-xs ${faint(dark)}`}>
                    {formatSavedAt(post.createdAt)}
                    {post.formData.municipality && ` · ${post.formData.municipality}`}
                    {post.photos.length > 0 && ` · ${t('dashboard.photoCount', { count: post.photos.length })}`}
                  </p>
                </div>
              </div>
              {confirming ? (
                <div className="mt-2 space-y-2" role="alert">
                  <p>{t(confirming === 'claim' ? 'dashboard.legacyClaimConfirm' : 'dashboard.legacyDiscardConfirm')}</p>
                  {/* 並びは「左＝やめる・右＝実行」 */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLegacyConfirm(null)}
                      className={`min-h-11 rounded-lg border px-3 ${dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-700'}`}
                    >
                      {t('dashboard.cancelLabel')}
                    </button>
                    <button
                      type="button"
                      data-testid={confirming === 'claim' ? 'pending-legacy-claim-yes' : 'pending-legacy-discard-yes'}
                      disabled={legacyBusy === id || (confirming === 'claim' && !isOnline)}
                      onClick={() => void runLegacy(id, confirming)}
                      className={`min-h-11 flex-1 rounded-lg border-2 px-3 font-bold disabled:opacity-50 ${dark ? 'border-slate-200 text-slate-100' : 'border-gray-900 text-gray-900'}`}
                    >
                      {legacyBusy === id ? <Loader2 size={14} className="inline animate-spin" /> : null}{' '}
                      {t(confirming === 'claim' ? 'dashboard.legacyClaim' : 'dashboard.legacyDraftsDiscard')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="pending-legacy-claim"
                    onClick={() => setLegacyConfirm({ id, action: 'claim' })}
                    disabled={sending || legacyBusy !== null}
                    className={`min-h-11 rounded-lg border px-3 font-semibold disabled:opacity-50 ${dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-800'}`}
                  >
                    {t('dashboard.legacyClaim')}
                  </button>
                  <button
                    type="button"
                    data-testid="pending-legacy-discard"
                    onClick={() => setLegacyConfirm({ id, action: 'discard' })}
                    disabled={sending || legacyBusy !== null}
                    className={`min-h-11 rounded-lg border px-3 font-semibold disabled:opacity-50 ${dark ? 'border-slate-600 text-slate-200' : 'border-gray-300 text-gray-800'}`}
                  >
                    {t('dashboard.legacyDraftsDiscard')}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )

  if (posts.length === 0) return <div className={card}>{legacyNotice}</div>

  return (
    <div className={`${card} ring-2 ${dark ? 'ring-amber-500/30' : 'ring-amber-300'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-semibold flex items-center gap-2 ${dark ? 'text-amber-300' : 'text-amber-700'}`}>
          <Send size={15} />
          {t('dashboard.pendingDrafts', { count: posts.length })}
        </h3>
        <button
          onClick={sendAll}
          disabled={sending || !isOnline}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          {sending ? t('dashboard.sending') : isOnline ? t('dashboard.sendAll') : t('dashboard.offlineLabel')}
        </button>
      </div>

      {/* 送信プログレス */}
      {progress && (
        <div className={`mb-3 p-3 rounded-lg ${dark ? 'bg-slate-800' : 'bg-amber-50'}`}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className={muted(dark)}>{t('dashboard.sendingProgress', { current: progress.current, total: progress.total })}</span>
            <span className={dark ? 'text-slate-300' : 'text-gray-700'}>
              {progress.success > 0 && <span className="text-green-500">{t('dashboard.successCount', { count: progress.success })}</span>}
              {progress.failed > 0 && <span className="text-red-500 ml-2">{t('dashboard.failedCount', { count: progress.failed })}</span>}
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
            <div
              className="h-full rounded-full bg-linear-to-r from-amber-400 to-amber-600 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 下書き一覧 */}
      <div className="space-y-2">
        {posts.map(post => {
          const sp = getSpecies(post.formData.species)
          const it = getInfoType(post.formData.infoType)
          // REQ-183 FR-183-11: 既存 species.*/infoType.* キーで多言語化（constants.label 直表示を避ける）
          const spLabel = sp ? t(`species.${sp.value}`) : t('dashboard.unknown')
          const itLabel = it ? t(`infoType.${it.value}`) : ''
          const hasError = post.status === 'error'

          return (
            <div
              key={post.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                hasError
                  ? dark ? 'border-red-900/40 bg-red-950/20' : 'border-red-100 bg-red-50/50'
                  : post.status === 'sending'
                    ? dark ? 'border-amber-700/40 bg-amber-950/20' : 'border-amber-200 bg-amber-50/50'
                    : dark ? 'border-slate-700/40' : 'border-gray-100'
              }`}
              style={{ borderLeft: `3px solid ${sp?.color || '#6B7280'}` }}
            >
              <Image src={sp?.image || '/images/unknown.png'} alt={sp ? spLabel : t('dashboard.postImageAlt')} width={32} height={32} className="w-8 h-8 object-contain shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-sm font-medium ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                    {spLabel}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${dark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>
                    {it?.emoji} {itLabel}
                  </span>
                  {post.photos.length > 0 && (
                    <span className={`text-xs ${faint(dark)}`}>{t('dashboard.photoCount', { count: post.photos.length })}</span>
                  )}
                  {post.status === 'sending' && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      <Loader2 size={10} className="inline animate-spin mr-0.5" />{t('dashboard.sendingStatus')}
                    </span>
                  )}
                </div>
                {post.formData.municipality && (
                  <p className={`text-xs mt-0.5 ${faint(dark)}`}>{post.formData.municipality}</p>
                )}
                {hasError && post.errorMessage && (
                  <p className={`text-xs mt-0.5 flex items-center gap-1 ${dark ? 'text-red-400' : 'text-red-600'}`}>
                    {/* REQ-183 FR-183-04: useOfflineQueue は i18n キーを保持する。既知キーは t() で当該言語に
                        解決し、旧データ（生メッセージ）はそのまま表示する。 */}
                    <AlertCircle size={11} />{post.errorMessage.startsWith('dashboard.') ? t(post.errorMessage) : post.errorMessage}
                  </p>
                )}
                <p className={`text-xs mt-0.5 ${faint(dark)}`}>
                  {new Date(post.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* サムネイル — blob URL は next/image 非対応のため <img> 維持 */}
              {post.photos[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(post.photos[0])}
                  alt={t('dashboard.postThumbnailAlt')}
                  width={40}
                  height={40}
                  loading="lazy"
                  decoding="async"
                  className="hidden sm:block w-10 h-10 object-cover rounded-lg shrink-0"
                />
              )}

              {/* 削除 */}
              <div className="shrink-0">
                {post.id != null && deleteConfirm === post.id ? (
                  // REQ-330: 確認の並びは「左＝やめる・右＝実行」にそろえる（古い下書き・調査の確認と同じ）
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      // REQ-325 FR-325-01: hover 面が gray-100 なのに gray-400（2.31:1）だった。
                      className={`text-xs px-2 py-1 rounded-sm ${dark ? 'text-slate-400 hover:bg-slate-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      {t('dashboard.cancelLabel')}
                    </button>
                    <button
                      onClick={async () => { await remove(post.id!); setDeleteConfirm(null) }}
                      className="text-xs text-red-500 font-bold px-2 py-1 rounded-sm hover:bg-red-50"
                    >
                      {t('dashboard.deleteLabel')}
                    </button>
                  </div>
                ) : (
                  // REQ-318 FR-318-04: MyPostsSection と同型の「見えない削除アイコン」。
                  // light の text-gray-300(#d1d5db) は白カード上 1.47:1 でアイコンが事実上不可視。
                  // faint() トークン（light 4.8:1 / dark 7.0:1）へ寄せる。
                  <button
                    onClick={() => setDeleteConfirm(post.id ?? null)}
                    disabled={sending}
                    className={`p-2 rounded-lg transition-colors ${faint(dark)} ${dark ? 'hover:text-red-400 hover:bg-slate-700' : 'hover:text-red-600 hover:bg-red-50'} disabled:opacity-30`}
                    title={t('dashboard.deleteTitle')}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {legacyNotice}
    </div>
  )
}
