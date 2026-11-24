'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Loader2, Edit2, FileText, MessageCircle, MapPin, ChevronDown, ChevronUp, Download, Trash2, AlertTriangle } from 'lucide-react'
import BottomNav from '@/components/layout/BottomNav'
import { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Header from '@/components/layout/Header'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useStats } from '@/hooks/useStats'
import { useProfile, useBadgeDefinitions } from '@/hooks/useProfile'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import KPISection from '@/components/features/dashboard/KPISection'
import ProgressJourney from '@/components/features/dashboard/ProgressJourney'
import CSVExportSection from '@/components/features/dashboard/CSVExportSection'
import MyPostsSection from '@/components/features/dashboard/MyPostsSection'
import PendingPostsSection from '@/components/features/dashboard/PendingPostsSection'
import EmailVerificationBanner from '@/components/features/dashboard/EmailVerificationBanner'
import Footer from '@/components/layout/Footer'
import EditProfileModal from '@/components/modals/EditProfileModal'
import { pageBg, cardCls, faint } from '@/lib/themeClasses'
import { LoadingState, Skeleton } from '@/components/ui/Skeleton'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { btnRetryCls } from '@/lib/formStyles'

// 活動の記録（草）は、描画するときに別のチャンクから読む。マイページの初期JS（予算24 kB）を増やさない。
const ActivityGrass = dynamic(() => import('@/components/features/dashboard/ActivityGrass'), {
  ssr: false,
  loading: () => <div className={cardCls()} style={{ minHeight: 232 }} aria-busy="true" />,
})

// --- アカウント削除確認モーダル ---
interface DeleteAccountModalProps {
  onConfirm: () => Promise<void>
  onClose: () => void
  dark: boolean
}

function DeleteAccountModal({ onConfirm, onClose, dark }: DeleteAccountModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEscapeKey(onClose)
  useFocusTrap(dialogRef)

  const handleDelete = async () => {
    setDeleting(true)
    setError('')
    try {
      await onConfirm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('account.deleteError'))
      setDeleting(false)
    }
  }

  const cardBg = dark ? 'bg-slate-900 border-slate-700/60' : 'bg-white border-gray-200'

  return (
    <div className="fixed inset-0 z-430 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        className="fixed inset-0 bg-black/50 cursor-default border-0 p-0"
        onClick={onClose}
      />
      <div ref={dialogRef} className={`relative w-full max-w-sm rounded-2xl border shadow-xl p-5 space-y-4 ${cardBg}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-red-500" />
          <h3 id="delete-account-title" className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('account.deleteTitle')}</h3>
        </div>

        <div className={`text-sm space-y-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
          <p>{t('account.deleteWarning')}</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>{t('account.deleteKeepPosts')}</li>
            <li>{t('account.deleteRemoveProfile')}</li>
            <li>{t('account.deleteIrreversible')}</li>
          </ul>
        </div>

        <div>
          <label htmlFor="delete-account-confirm" className={`block text-sm font-medium mb-1 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
            {t('account.deleteConfirmLabel')}
          </label>
          <input
            id="delete-account-confirm"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={t('account.deleteConfirmPlaceholder')}
            className={`w-full px-3 py-2 rounded-lg border text-base md:text-sm ${dark ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-gray-300 text-gray-800'}`}
          />
        </div>

        {error && (
          <p className="text-sm text-red-500" role="alert">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border ${dark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || confirmText !== t('account.deleteConfirmWord')}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? t('account.deleting') : t('account.deleteButton')}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- メインページ ---
export default function DashboardPage() {
  const { user, loading: authLoading, deleteAccount, isEmailConfirmed } = useAuth()
  const { dark } = useTheme()
  const { t } = useTranslation()
  const router = useRouter()
  // REQ-273 FR-273-01: 統計の取得失敗を無視せず、全体統計セクションで再試行可能にする。
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useStats({ months: 6, userId: user?.id })
  const { profile, loading: profileLoading, updateProfile } = useProfile(user?.id)
  const allBadges = useBadgeDefinitions()
  const [editing, setEditing] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [authLoading, user, router])

  if (authLoading || profileLoading) {
    return (
      <LoadingState className={`min-h-screen ${pageBg(dark)}`}>
        <div className="h-14 border-b border-(--color-border)" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {/* プロフィールカード相当 */}
          <div className={cardCls(dark)}>
            <div className="flex items-start gap-4">
              <Skeleton className="w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
          {/* 投稿リスト相当 */}
          <div className={cardCls(dark)}>
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </LoadingState>
    )
  }

  if (!user) return null

  const maskedEmail = user.email
    ? user.email[0] + '***@' + user.email.split('@')[1]
    : ''

  const card = cardCls(dark)
  const muted = dark ? 'text-slate-400' : 'text-gray-600'
  const heading = dark ? 'text-slate-200' : 'text-gray-700'
  const earnedIds = new Set((profile?.badges ?? []).map((b: string | { id: string }) => typeof b === 'string' ? b : b.id))

  return (
    <div className={`min-h-screen ${pageBg(dark)}`}>
      <Header
        onPostClick={() => router.push('/map?post=1')}
        onLoginClick={mode => router.push(`/?auth=${mode}`)}
        onSurveyClick={() => router.push('/requests?create=1')}
      />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* メール認証バナー */}
        {isEmailConfirmed === false && (
          <EmailVerificationBanner email={user.email ?? ''} maskedEmail={maskedEmail} dark={dark} />
        )}

        {/* プロフィールカード */}
        {profile && (
          <div className={card}>
            <div className="flex items-start gap-4">
              <span className="text-4xl">{profile.avatar_emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-bold truncate ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                    {profile.display_name as React.ReactNode}
                  </h2>
                  <button
                    onClick={() => setEditing(true)}
                    aria-label={t('profilePage.editTitle')}
                    // REQ-325 FR-325-01: hover 面が gray-100 になるのに gray-400 のままで 2.31:1
                    //（UI 部品 3:1 も割る）。編集アイコンは gray-600（gray-100 上 6.87:1）。
                    className={`p-1.5 rounded-lg text-sm ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
                {profile.bio ? <p className={`text-sm mt-1 ${muted}`}>{String(profile.bio)}</p> : null}
                <p className={`text-xs mt-1.5 ${faint(dark)}`}>{user.email as React.ReactNode}</p>
              </div>
            </div>

            {/* 統計カード */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              {[
                { label: '投稿', value: profile.post_count, icon: <FileText size={14} /> },
                { label: 'コメント', value: profile.comment_count, icon: <MessageCircle size={14} /> },
                { label: '活動圏', value: `${profile.municipality_count}市町村`, icon: <MapPin size={14} /> },
              ].map(s => (
                <div key={s.label} className={`text-center p-3 rounded-xl ${dark ? 'bg-slate-800/60' : 'bg-gray-50'}`}>
                  <div className={`flex items-center justify-center gap-1 text-xs mb-1 ${faint(dark)}`}>
                    {s.icon} {s.label}
                  </div>
                  <div className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{s.value as React.ReactNode}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 進捗の可視化・調査ミッション・解放演出（REQ-251 フィードバック層／内部は REQ-248 検証済みベース・DB 権威） */}
        <ProgressJourney userId={user.id} dark={dark} />

        {/* 活動の記録（草）：本人だけが見る。進捗の下・バッジの上 */}
        <ActivityGrass userId={user.id} />

        {/* バッジ一覧 */}
        {allBadges.length > 0 && (
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${heading}`}>獲得バッジ</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allBadges.map(badge => {
                const earned = earnedIds.has(badge.id)
                return (
                  <div
                    key={badge.id}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors ${
                      earned
                        ? dark ? 'bg-slate-800/80' : 'bg-gray-50'
                        : dark ? 'bg-slate-800/30 opacity-40' : 'bg-gray-50/50 opacity-40'
                    }`}
                  >
                    <span className="text-2xl shrink-0">{badge.icon as React.ReactNode}</span>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${earned ? (dark ? 'text-slate-200' : 'text-gray-800') : (dark ? 'text-slate-400' : 'text-gray-400')}`}>
                        {badge.name as React.ReactNode}
                      </p>
                      <p className={`text-xs truncate ${faint(dark)}`}>{badge.description as React.ReactNode}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 未送信の下書き（オフライン保存分） */}
        <PendingPostsSection dark={dark} />

        {/* 自分の投稿一覧 */}
        <MyPostsSection dark={dark} />

        {/* 統計（折りたたみ） */}
        <div>
          <button
            onClick={() => setStatsOpen(v => !v)}
            className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl shadow-xs text-sm font-semibold transition-colors ${
              dark ? 'bg-slate-900 border border-slate-800/60 text-slate-200 hover:bg-slate-800/80' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span>📊 全体統計</span>
            {statsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {statsOpen && (
            <div className="mt-3 space-y-4">
              {statsError && !statsLoading && !stats ? (
                // REQ-273: 取得失敗を空表示と区別（ErrorAlert + 再試行）。
                <div className="space-y-3">
                  <ErrorAlert message={t('common.loadError')} />
                  <button
                    type="button"
                    onClick={refetchStats}
                    className={`text-sm px-4 py-2 rounded-xl ${btnRetryCls(dark)}`}
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : (
                stats && <KPISection stats={stats} statsLoading={statsLoading} dark={dark} />
              )}
            </div>
          )}
        </div>

        {/* CSVエクスポート（折りたたみ） */}
        <div>
          <button
            onClick={() => setCsvOpen(v => !v)}
            className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl shadow-xs text-sm font-semibold transition-colors ${
              dark ? 'bg-slate-900 border border-slate-800/60 text-slate-200 hover:bg-slate-800/80' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-2"><Download size={15} /> CSVエクスポート</span>
            {csvOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {csvOpen && (
            <div className="mt-3">
              <CSVExportSection dark={dark} />
            </div>
          )}
        </div>

        {/* コレクション（図鑑・水槽）への導線（REQ-250） */}
        <Link
          href="/collection"
          className={`flex items-center justify-between px-5 py-3.5 rounded-2xl shadow-xs text-sm font-semibold transition-colors ${
            dark ? 'bg-slate-900 border border-slate-800/60 text-slate-200 hover:bg-slate-800/80' : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="flex items-center gap-2">✨ {t('collection.header')}</span>
          <span className={faint(dark)}>→</span>
        </Link>

        {/* ランキングリンク */}
        <div className="text-center pb-4">
          <Link
            href="/ranking"
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors ${
              dark ? 'text-red-400 hover:bg-slate-800' : 'text-red-600 hover:bg-red-50'
            }`}
          >
            🏆 投稿ランキングを見る
          </Link>
        </div>

        {/* アカウント削除 */}
        <div className={`border-t pt-4 ${dark ? 'border-slate-800' : 'border-gray-100'}`}>
          <button
            onClick={() => setShowDeleteModal(true)}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg transition-colors ${
              dark ? 'text-slate-400 hover:text-red-400 hover:bg-slate-800/60' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            }`}
          >
            <Trash2 size={13} />
            {t('account.deleteLink')}
          </button>
        </div>
      </div>

      {editing && profile && (
        <EditProfileModal
          profile={profile}
          onSave={updateProfile}
          onClose={() => setEditing(false)}
          dark={dark}
          userId={user.id}
        />
      )}

      {showDeleteModal && (
        <DeleteAccountModal
          onConfirm={async () => {
            await deleteAccount()
            router.replace('/')
          }}
          onClose={() => setShowDeleteModal(false)}
          dark={dark}
        />
      )}

      {/* REQ-323 FR-323-01: 旧 `pb-20 md:pb-0` は「md 以上でナビが消える」前提の名残で、
          (a) 768〜1023px ではナビが出たまま逃げ幅だけ消えてフッターが潜り、
          (b) 1024px 以上では 80px の空帯だけが残っていた。
          逃げ幅はフッターの**後ろ**に置き、高さと出し分けは BottomNavSpacer（単一の正）に任せる。 */}
      <Footer />
      <BottomNavSpacer />
      <BottomNav
        onPostClick={() => router.push('/map?post=1')}
        onLoginClick={mode => router.push(`/?auth=${mode}`)}
      />
    </div>
  )
}
