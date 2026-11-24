'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: フィルタバー/一覧/一括操作/CSV出力をコンポーネント分割する（627行）。

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { SPECIES, INFO_TYPES, MUNICIPALITIES, speciesLabel, infoTypeLabel, getSpecies, ADMIN_PAGE_SIZE } from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
// REQ-247 (M1): 管理投稿のデータアクセスはフックへ集約（inline supabase.* を排し他フックと規約統一）。
import { useAdminPosts } from '@/hooks/admin/useAdminPosts'
import { todayLocalISODate } from '@/lib/localDate'
import ReviewCard from '@/components/features/admin/ReviewCard'
import BulkActionBar from '@/components/features/admin/BulkActionBar'
import { SkeletonCard } from '@/components/ui/Skeleton'
import ErrorAlert from '@/components/ui/ErrorAlert'
import type { MapPost } from '@/components/modals/MapModal'
import type { AdminPost } from '@/types/post'

const PhotoViewer = dynamic(() => import('@/components/ui/PhotoViewer'), { ssr: false })
const MapModal = dynamic(() => import('@/components/modals/MapModal'), { ssr: false })
const DeletePostDialog = dynamic(() => import('@/components/modals/DeletePostDialog'), { ssr: false })
const RejectDialog = dynamic(() => import('@/components/modals/RejectDialog'), { ssr: false })
const AIBadge = dynamic(() => import('@/components/features/admin/AIBadge'), { ssr: false })
const AudioPlayer = dynamic(() => import('@/components/ui/AudioPlayer'), { ssr: false })

// REQ-243 FR-243-01b: 位置の公開レベル（記録単位・種既定で共用）
const DISCLOSURE_LEVELS = ['precise', 'coarsened', 'hidden'] as const

const STATUS_TABS = [
  { key: 'pending',  labelKey: 'admin.posts.statusPending', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { key: 'approved', labelKey: 'admin.posts.statusApproved', color: 'text-green-600 bg-green-50 border-green-200' },
  { key: 'rejected', labelKey: 'admin.posts.statusRejected', color: 'text-red-600 bg-red-50 border-red-200' },
  { key: 'all',      labelKey: 'admin.posts.statusAll', color: 'text-gray-600 bg-gray-50 border-gray-200' },
]

export default function AdminPostsPage() {
  const { user } = useAuth()
  const { t } = useTranslation()

  // REQ-247 (M1): 一覧取得・審査待ち件数・承認/却下/一括操作/削除/公開レベル/CSV のデータアクセスと
  // 関連 state（13 useState）は useAdminPosts に集約。JSX が使う名前へエイリアスして委譲する。
  const {
    posts, total, pendingCount, loading, fetchError, retry,
    statusTab, page, setPage, filters,
    changeTab: handleTabChange,
    changeFilter: handleFilterChange,
    selectedIds, toggleSelect, toggleSelectAll,
    opError, clearOpError,
    deleting, bulkProcessing, bulkProgress,
    approve: handleApprove,
    reanalyze: handleReanalyze,
    toggleOfficial: handleToggleOfficial,
    setDisclosure: handleSetDisclosure,
    reject, deletePost, bulkApprove, bulkDelete,
    setSpeciesDefault, fetchPreciseLocation, fetchCsvExport,
  } = useAdminPosts()

  // ── View 固有の UI 状態（モーダル/ダイアログ/写真ビューア/種既定フォーム入力） ──
  const [viewerPhotos, setViewerPhotos] = useState<string[] | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminPost | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminPost | null>(null)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [showBulkApproveConfirm, setShowBulkApproveConfirm] = useState(false)
  const [mapModalPost, setMapModalPost] = useState<MapPost | null>(null)
  // REQ-243 FR-243-01b: 種ごとの既定公開レベル設定フォーム
  const [speciesDefaultSpecies, setSpeciesDefaultSpecies] = useState<string>(SPECIES[0]?.value ?? 'american')
  const [speciesDefaultLevel, setSpeciesDefaultLevel] = useState<string>('coarsened')

  // REQ-156: user が null（未認証 / 初期化途中 / セッション失効）の間は操作 UI を描画しない。
  // 認証済みユーザーの id を要する書き込みは useAdminPosts 側で user ガードしている。
  if (!user) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-gray-400 text-sm">
        {t('admin.posts.loading')}
      </div>
    )
  }
  // ── View 側ラッパー: フックのデータアクセスに UI 状態（モーダル開閉など）を合成する ──
  // 本体のデータアクセス（承認/却下・削除・一括処理・公開レベル・CSV/座標取得）は useAdminPosts が担う。
  async function handleReject(post: AdminPost, data: { reason: string; message: string | null }) {
    setRejectTarget(null)
    await reject(post, data)
  }

  async function handleDelete() {
    // REQ-bug-delete: setDeleteTarget(null) との race を避けるためローカル変数に控える
    const target = deleteTarget
    if (!target) return
    const ok = await deletePost(target)
    if (ok) setDeleteTarget(null)
  }

  async function handleBulkDelete() {
    if (bulkProcessing) return
    setShowBulkConfirm(false)
    await bulkDelete()
  }

  async function handleBulkApprove() {
    if (bulkProcessing) return
    setShowBulkApproveConfirm(false)
    await bulkApprove()
  }

  async function handleExportCSV() {
    // REQ-247 (M1): 取得（列限定 select + 正確座標 RPC マージ）はフックへ委譲。View は CSV 整形と DL のみ。
    const exp = await fetchCsvExport()
    if (!exp) return
    const { data, preciseById } = exp

    const headers = [
      t('admin.posts.csvHeaders.id'),
      t('admin.posts.csvHeaders.date'),
      t('admin.posts.csvHeaders.lat'),
      t('admin.posts.csvHeaders.lng'),
      t('admin.posts.csvHeaders.municipality'),
      t('admin.posts.csvHeaders.species'),
      t('admin.posts.csvHeaders.infoType'),
      t('admin.posts.csvHeaders.comment'),
      t('admin.posts.csvHeaders.photoCount'),
      t('admin.posts.csvHeaders.authType'),
      'ステータス', '却下理由', '天気', '気温(°C)', '湿度(%)',
    ]
    // REQ-103: 列を絞り込んだため AdminPost 全体の型ではなく取得した列のみで型推論する
    const rows = data.map((p) => [
      p.id,
      new Date(p.created_at).toLocaleString('ja-JP'),
      preciseById.get(p.id)?.lat ?? p.lat, preciseById.get(p.id)?.lng ?? p.lng,
      p.municipality ?? '',
      speciesLabel(p.species),
      infoTypeLabel(p.info_type),
      `"${(p.comment ?? '').replace(/"/g, '""')}"`,
      p.photos?.length ?? 0,
      p.is_anonymous ? t('admin.posts.anonymousLabel') : t('admin.posts.verifiedLabel'),
      p.status ?? '',
      p.rejection_reason ?? '',
      p.weather ?? '',
      p.temperature ?? '',
      p.humidity ?? '',
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zarigani_posts_${todayLocalISODate()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // REQ-243: 審査地図は正確座標で開く（RPC 失敗時は粗化 display 座標へフォールバック）。
  async function handleMapClick(p: AdminPost) {
    const loc = await fetchPreciseLocation(p.id)
    const lat = loc?.lat ?? (p.lat as number | null)
    const lng = loc?.lng ?? (p.lng as number | null)
    if (lat != null && lng != null) {
      setMapModalPost({ lat, lng, species: p.species, municipality: p.municipality })
    }
  }

  // REQ-243 FR-243-01b: 種既定公開レベルはフォーム入力値をフックへ渡す。
  async function handleSetSpeciesDefault() {
    await setSpeciesDefault(speciesDefaultSpecies, speciesDefaultLevel)
  }

  const totalPages = Math.ceil(total / ADMIN_PAGE_SIZE)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {fetchError && (
        <div className="space-y-3">
          <ErrorAlert message={t('common.loadError')} />
          <button
            type="button"
            onClick={retry}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      {opError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{opError}</span>
          <button onClick={clearOpError} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold text-gray-800">{t('admin.posts.title')}</h1>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {t('admin.posts.exportCsv')}
        </button>
      </div>

      {/* REQ-243 FR-243-01b: 種ごとの既定公開レベル設定（新規投稿の location_disclosure 初期値に反映） */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-700 mb-1">{t('admin.posts.disclosure.speciesTitle')}</h2>
        <p className="text-xs text-gray-500 mb-3">{t('admin.posts.disclosure.speciesDesc')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={speciesDefaultSpecies}
            onChange={e => setSpeciesDefaultSpecies(e.target.value)}
            aria-label={t('admin.posts.disclosure.speciesTitle')}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          >
            {SPECIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={speciesDefaultLevel}
            onChange={e => setSpeciesDefaultLevel(e.target.value)}
            aria-label={t('admin.posts.disclosure.label')}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          >
            {DISCLOSURE_LEVELS.map(lv => <option key={lv} value={lv}>{t(`admin.posts.disclosure.level.${lv}`)}</option>)}
          </select>
          <button
            onClick={handleSetSpeciesDefault}
            className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            {t('admin.posts.disclosure.apply')}
          </button>
        </div>
      </div>

      {/* ステータスタブ */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              statusTab === tab.key
                ? tab.color
                : 'text-gray-500 bg-white border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(tab.labelKey)}
            {tab.key === 'pending' && (fetchError || pendingCount === null) ? (
              <span
                className="bg-gray-400 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center"
                title={t('admin.posts.pendingCountUnavailable')}
                aria-label={t('admin.posts.pendingCountUnavailable')}
              >
                —
              </span>
            ) : tab.key === 'pending' && pendingCount !== null && pendingCount > 0 ? (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center">
                {pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 審査待ちの案内 */}
      {!fetchError && statusTab === 'pending' && !loading && posts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          <strong>{posts.length}件</strong>の投稿が審査待ちです。内容を確認して承認または却下してください。
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
          <select value={filters.species} onChange={e => handleFilterChange('species', e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400">
            <option value="">{t('admin.posts.filter.allSpecies')}</option>
            {SPECIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filters.info_type} onChange={e => handleFilterChange('info_type', e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400">
            <option value="">{t('admin.posts.filter.allInfoTypes')}</option>
            {INFO_TYPES.map(tp => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
          </select>
          <select value={filters.municipality} onChange={e => handleFilterChange('municipality', e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400">
            <option value="">{t('admin.posts.filter.allMunicipalities')}</option>
            {MUNICIPALITIES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            type="text"
            placeholder={t('admin.posts.filter.keyword')}
            value={filters.keyword}
            onChange={e => handleFilterChange('keyword', e.target.value)}
            className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400"
          />
          <select value={filters.auth} onChange={e => handleFilterChange('auth', e.target.value)} className="border border-gray-300 rounded-lg px-2.5 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400">
            <option value="">{t('admin.posts.filter.allPosts')}</option>
            <option value="verified">{t('admin.posts.filter.verifiedOnly')}</option>
            <option value="anonymous">{t('admin.posts.filter.anonymousOnly')}</option>
          </select>
        </div>
      </div>

      {/* ── 審査待ち: カード型レイアウト ── */}
      {!fetchError && (statusTab === 'pending' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading ? t('admin.posts.loading') : t('admin.posts.table.range', { total, from: page * ADMIN_PAGE_SIZE + 1, to: Math.min((page + 1) * ADMIN_PAGE_SIZE, total) })}
            </p>
            {posts.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={posts.length > 0 && selectedIds.length === posts.length}
                  onChange={toggleSelectAll}
                  className="rounded-sm"
                />
                すべて選択
              </label>
            )}
          </div>

          {posts.map(post => (
            <ReviewCard
              key={post.id}
              post={post}
              selected={selectedIds.includes(post.id)}
              onToggleSelect={() => toggleSelect(post.id)}
              onApprove={() => handleApprove(post)}
              onReject={() => setRejectTarget(post)}
              onDelete={() => setDeleteTarget(post)}
              onReanalyze={() => handleReanalyze(post)}
              onPhotoClick={(photos, idx) => { setViewerPhotos(photos); setViewerIndex(idx) }}
              onMapClick={(p) => { void handleMapClick(p as AdminPost) }}
            />
          ))}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {!loading && posts.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-gray-400">
              {t('admin.posts.pendingEmpty')}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800">
                {t('admin.posts.prev')}
              </button>
              <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800">
                {t('admin.posts.next')}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── 公開中/却下済み/全件: テーブル（フォント拡大版） ── */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
            {loading ? t('admin.posts.loading') : t('admin.posts.table.range', { total, from: page * ADMIN_PAGE_SIZE + 1, to: Math.min((page + 1) * ADMIN_PAGE_SIZE, total) })}
          </div>
          {/* モバイル: カード表示 */}
          <div className="md:hidden divide-y divide-gray-100">
            {posts.map(post => (
              <div key={post.id} className={`px-4 py-3 space-y-2 ${selectedIds.includes(post.id) ? 'bg-red-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedIds.includes(post.id)} onChange={() => toggleSelect(post.id)} className="rounded-sm mt-1 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-sm font-medium">
                        <Image src={getSpecies(post.species)?.image || '/images/unknown.png'} alt={speciesLabel(post.species)} width={20} height={20} className="w-5 h-5 object-contain" />
                        {speciesLabel(post.species)}
                      </span>
                      <span className="text-xs text-gray-500">{infoTypeLabel(post.info_type)}</span>
                      <span className="text-xs text-gray-400">{post.municipality || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{new Date(post.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      <AIBadge post={post} />
                      {post.auto_approved && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">🤖</span>
                      )}
                    </div>
                    {post.comment && <p className="text-xs text-gray-600 line-clamp-2">{post.comment}</p>}
                    {statusTab === 'rejected' && post.rejection_reason && (
                      <p className="text-xs text-red-600">却下: {post.rejection_reason}</p>
                    )}
                    {(post.photos?.length ?? 0) > 0 && (
                      <div className="flex gap-1.5">
                        {post.photos!.slice(0, 3).map((url: string, i: number) => (
                          <button key={i} onClick={() => { setViewerPhotos(post.photos!); setViewerIndex(i) }} className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200">
                            <Image src={url} alt={`写真 ${i + 1}`} fill sizes="40px" className="object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {(statusTab === 'approved' || statusTab === 'all') && post.auto_approved && (
                        <button onClick={() => setRejectTarget(post)} className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-red-100 text-red-600 min-h-[44px] flex items-center">却下</button>
                      )}
                      {(statusTab === 'approved' || statusTab === 'all') && (
                        <button
                          onClick={() => handleToggleOfficial(post)}
                          className={`text-xs font-medium px-2 py-1 rounded-full ${post.is_official ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}
                        >
                          {post.is_official ? t('admin.posts.action.official') : t('admin.posts.action.makeOfficial')}
                        </button>
                      )}
                      {/* REQ-243 FR-243-01b: 記録単位の公開レベル */}
                      <select
                        value={post.location_disclosure ?? 'coarsened'}
                        onChange={(e) => handleSetDisclosure(post, e.target.value)}
                        aria-label={t('admin.posts.disclosure.label')}
                        className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-gray-600 focus:outline-hidden focus:ring-2 focus:ring-gray-400"
                      >
                        {DISCLOSURE_LEVELS.map(lv => <option key={lv} value={lv}>{t(`admin.posts.disclosure.level.${lv}`)}</option>)}
                      </select>
                      <button onClick={() => setDeleteTarget(post)} className="text-red-600 text-xs font-medium min-h-[44px] flex items-center">{t('admin.posts.action.delete')}</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!loading && posts.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400">{t('admin.posts.empty')}</div>
            )}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 w-8">
                    <input type="checkbox" checked={posts.length > 0 && selectedIds.length === posts.length} onChange={toggleSelectAll} className="rounded-sm" aria-label="select all" />
                  </th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.date')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.municipality')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.species')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.infoType')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.comment')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">{t('admin.posts.table.photo')}</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">音声</th>
                  <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">AI判定</th>
                  {statusTab === 'rejected' && (
                    <th className="text-left px-4 py-2.5 text-sm text-gray-500 font-medium">却下理由</th>
                  )}
                  <th className="px-4 py-2.5 text-sm text-gray-500 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map(post => (
                  <tr key={post.id} className={`hover:bg-gray-50 ${selectedIds.includes(post.id) ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 w-8">
                      <input type="checkbox" checked={selectedIds.includes(post.id)} onChange={() => toggleSelect(post.id)} className="rounded-sm" />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                      {new Date(post.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{post.municipality || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <Image src={getSpecies(post.species)?.image || '/images/unknown.png'} alt={speciesLabel(post.species)} width={24} height={24} className="w-6 h-6 object-contain" />
                        {speciesLabel(post.species)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{infoTypeLabel(post.info_type)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 max-w-sm">{post.comment || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {post.photos?.slice(0, 3).map((url: string, i: number) => (
                          <button key={i} onClick={() => { setViewerPhotos(post.photos); setViewerIndex(i) }} className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80 transition-opacity">
                            <Image src={url} alt={`投稿写真 ${i + 1}`} fill sizes="48px" className="object-cover" />
                          </button>
                        ))}
                        {!post.photos?.length && <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {post.audio_url ? (
                        <AudioPlayer src={post.audio_url} className="w-48" />
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AIBadge post={post} />
                    </td>
                    {statusTab === 'rejected' && (
                      <td className="px-4 py-3 text-sm text-red-600 max-w-[160px]">
                        {post.rejection_reason || '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {(statusTab === 'approved' || statusTab === 'all') && post.auto_approved && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium whitespace-nowrap">
                            🤖 AI自動
                          </span>
                        )}
                        {(statusTab === 'approved' || statusTab === 'all') && post.auto_approved && (
                          <button
                            onClick={() => setRejectTarget(post)}
                            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                          >
                            却下する
                          </button>
                        )}
                        {(statusTab === 'approved' || statusTab === 'all') && (
                          <button
                            onClick={() => handleToggleOfficial(post)}
                            className={`text-sm font-medium px-2.5 py-1 rounded-full transition-colors ${
                              post.is_official
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {post.is_official ? t('admin.posts.action.official') : t('admin.posts.action.makeOfficial')}
                          </button>
                        )}
                        {/* REQ-243 FR-243-01b: 記録単位の公開レベル */}
                        <select
                          value={post.location_disclosure ?? 'coarsened'}
                          onChange={(e) => handleSetDisclosure(post, e.target.value)}
                          aria-label={t('admin.posts.disclosure.label')}
                          title={t('admin.posts.disclosure.label')}
                          className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-gray-600 focus:outline-hidden focus:ring-2 focus:ring-gray-400"
                        >
                          {DISCLOSURE_LEVELS.map(lv => <option key={lv} value={lv}>{t(`admin.posts.disclosure.level.${lv}`)}</option>)}
                        </select>
                        <button
                          onClick={() => setDeleteTarget(post)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          {t('admin.posts.action.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && posts.length === 0 && (
                  <tr>
                    <td colSpan={statusTab === 'rejected' ? 11 : 10} className="px-4 py-8 text-center text-gray-400">
                      {t('admin.posts.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800">
                {t('admin.posts.prev')}
              </button>
              <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800">
                {t('admin.posts.next')}
              </button>
            </div>
          )}
        </div>
      ))}

      {/* ── 一括操作バー ── */}
      {!fetchError && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          onBulkApprove={() => setShowBulkApproveConfirm(true)}
          onBulkDelete={() => setShowBulkConfirm(true)}
          bulkProcessing={bulkProcessing}
          bulkProgress={bulkProgress}
        />
      )}

      {/* ── モーダル群 ── */}
      {viewerPhotos && viewerIndex != null && (
        <PhotoViewer
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => { setViewerPhotos(null); setViewerIndex(null) }}
        />
      )}

      {mapModalPost && (
        <MapModal post={mapModalPost} onClose={() => setMapModalPost(null)} />
      )}

      {deleteTarget && (
        <DeletePostDialog
          post={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
          t={t}
        />
      )}
      {rejectTarget && (
        <RejectDialog
          post={rejectTarget}
          onConfirm={(data) => handleReject(rejectTarget, data)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 mb-2">
              {t('admin.posts.bulkDialog.title', { count: selectedIds.length })}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('admin.posts.bulkDialog.desc')}<br />
              <strong className="text-red-600">{t('admin.posts.bulkDialog.warning')}</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkConfirm(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                {t('admin.posts.bulkDialog.cancel')}
              </button>
              <button onClick={handleBulkDelete} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700">
                {t('admin.posts.bulkDialog.confirm', { count: selectedIds.length })}
              </button>
            </div>
          </div>
        </div>
      )}
      {showBulkApproveConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-800 mb-2">
              {selectedIds.length}件を一括承認しますか？
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              選択した{selectedIds.length}件の投稿をすべて承認します。
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkApproveConfirm(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
                キャンセル
              </button>
              <button onClick={handleBulkApprove} className="flex-1 bg-green-500 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-600">
                承認する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
