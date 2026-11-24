'use client'

// REQ-085 Phase 1: 調査依頼一覧ページ。/requests ルートからアクセス。
// フィルタ / ソート / owner=me を URL クエリと state で双方向同期する。

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocales'
import { ArrowLeft, Search, MapPin, Clock, Users, Plus } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useSurveyRequests } from '@/hooks/survey/useSurveyRequests'
import { SURVEY_SPECIES, SURVEY_STATUS, MUNICIPALITIES } from '@/lib/constants'
import EmptyState from '@/components/ui/EmptyState'

// REQ-090: 一覧ページから直接「依頼を立てる」フォームを開けるようにする
const SurveyRequestForm = dynamic(() => import('@/components/modals/SurveyRequestForm'), { ssr: false })
const AuthModal = dynamic(() => import('@/components/modals/AuthModal'), { ssr: false })

type StatusFilter = 'all' | 'open' | 'responded' | 'closed' | undefined
type SortKey = 'newest' | 'urgentFirst'

export default function SurveyRequestsListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { dark } = useTheme()
  const { t, i18n } = useTranslation()
  const { user, loading: authLoading } = useAuth()
  // REQ-090: ページ内モーダルとして SurveyRequestForm を開閉する
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const statusParam = searchParams.get('status') as StatusFilter
  const speciesParam = searchParams.get('species') ?? undefined
  const municipalityParam = searchParams.get('municipality') ?? undefined
  const sortParam = (searchParams.get('sort') as SortKey) ?? 'newest'
  const ownerParam = searchParams.get('owner') === 'me' ? 'me' : undefined

  const filters = useMemo(
    () => ({
      status: statusParam,
      species: speciesParam,
      municipality: municipalityParam,
      sort: sortParam,
      owner: ownerParam as 'me' | undefined,
    }),
    [statusParam, speciesParam, municipalityParam, sortParam, ownerParam],
  )

  const { requests, loading, error, fetchRequests } = useSurveyRequests(filters)

  useEffect(() => {
    void fetchRequests()
  }, [fetchRequests])

  // REQ-271: ドロワー「調査を依頼する」(モーダルを持たない画面) からは /requests?create=1 で遷移し、
  // ここでフォームを自動オープンする。FAB と同じ認証ゲート（未ログインは AuthModal）。
  // 認証状態の復元中 (authLoading) はログイン済みユーザーに誤って AuthModal を出さないよう待つ。
  // パラメータは一度消費したら URL から除去し、リロード/戻るでの再オープンを防ぐ。
  const createParam = searchParams.get('create')
  useEffect(() => {
    if (createParam !== '1' || authLoading) return
    if (user) setShowCreateForm(true)
    else setShowAuthModal(true)
    const params = new URLSearchParams(searchParams.toString())
    params.delete('create')
    router.replace(`/requests${params.toString() ? `?${params.toString()}` : ''}`)
  }, [createParam, authLoading, user, router, searchParams])

  const updateParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value) params.delete(key)
    else params.set(key, value)
    router.replace(`/requests${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const resetFilters = () => router.replace('/requests')

  const hasFilters = !!(statusParam || speciesParam || municipalityParam || ownerParam) || sortParam !== 'newest'

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-gray-800'}`}>
      <header
        className={`sticky top-0 z-40 border-b px-4 py-3 flex items-center gap-3 ${
          dark ? 'bg-slate-900/95 border-slate-800 backdrop-blur-md' : 'bg-white/95 border-gray-200 backdrop-blur-md'
        }`}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className={`p-1 rounded-lg transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}
          aria-label={t('common.back', { defaultValue: '戻る' })}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-bold flex items-center gap-2">
          <Search size={18} className="text-amber-500" />
          {t('survey.listTitle', { defaultValue: '調査依頼一覧' })}
        </h1>
        <span className={`ml-auto text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`} aria-live="polite">
          {loading ? '…' : `${requests.length}件`}
        </span>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-4 pb-24 space-y-4">
        {/* フィルタ */}
        <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl ${dark ? 'bg-slate-900 border border-slate-800' : 'bg-white border border-gray-100 shadow-xs'}`}>
          <FilterSelect
            label="ステータス"
            value={statusParam ?? ''}
            onChange={(v) => updateParam('status', v || undefined)}
            options={[
              { value: '', label: '進行中' },
              { value: 'all', label: '全て' },
              { value: 'open', label: '募集中' },
              { value: 'responded', label: '結果あり' },
              { value: 'closed', label: 'クローズ済' },
            ]}
          />
          <FilterSelect
            label="種別"
            value={speciesParam ?? ''}
            onChange={(v) => updateParam('species', v || undefined)}
            options={[{ value: '', label: '全種' }, ...SURVEY_SPECIES.map((s) => ({ value: s.value, label: s.label ?? s.value }))]}
          />
          <FilterSelect
            label="市区町村"
            value={municipalityParam ?? ''}
            onChange={(v) => updateParam('municipality', v || undefined)}
            options={[{ value: '', label: '全地域' }, ...MUNICIPALITIES.map((m) => ({ value: m, label: m }))]}
          />
          <FilterSelect
            label="ソート"
            value={sortParam}
            onChange={(v) => updateParam('sort', v === 'newest' ? undefined : v)}
            options={[
              { value: 'newest', label: '新しい順' },
              { value: 'urgentFirst', label: '緊急優先' },
            ]}
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-red-500 underline"
          >
            フィルタをリセット
          </button>
        )}

        {/* コンテンツ */}
        {error ? (
          // REQ-273 FR-273-03: 生の技術メッセージ（PostgREST英語文言等）を露出せず、
          // 詳細ページ（SurveyRequestPage）と同じ common.loadError ＋ 再試行に統一する。
          <div className="space-y-3">
            <div className="text-sm text-red-500" role="alert">{t('common.loadError')}</div>
            <button
              type="button"
              onClick={() => { void fetchRequests() }}
              className={`text-sm px-4 py-2 rounded-xl font-semibold ${
                dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
              }`}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-sm opacity-60" role="status" aria-busy="true">{t('common.loading')}</div>
        ) : requests.length === 0 ? (
          // REQ-222 (FR-222-03 / AC-07): フィルタ有無で文言と単一 CTA を切替（リセット or 依頼を立てる）。
          hasFilters ? (
            <EmptyState
              icon="🔍"
              title={t('survey.listEmptyFiltered')}
              action={{ label: t('survey.resetFilters'), onClick: resetFilters }}
            />
          ) : (
            <EmptyState
              icon="🔍"
              title={t('survey.listEmptyTitle')}
              description={t('survey.listEmptyDesc')}
              action={{ label: t('survey.createRequestCta'), href: '/' }}
            />
          )
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {requests.map((req) => {
              const sp = SURVEY_SPECIES.find((s) => s.value === req.species)
              const stt = SURVEY_STATUS.find((s) => s.value === req.status)
              return (
                <li key={req.id}>
                  <Link
                    href={`/request/${req.id}`}
                    className={`block rounded-xl p-3 transition-colors ${
                      dark ? 'bg-slate-900 border border-slate-800 hover:bg-slate-800' : 'bg-white border border-gray-100 shadow-xs hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        req.status === 'open' ? 'bg-amber-100 text-amber-700' :
                        req.status === 'responded' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {stt?.emoji} {t(`survey.status.${req.status}`, { defaultValue: req.status })}
                      </span>
                      {req.urgency === 'urgent' && (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded-full">
                          🔴 緊急
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-bold mb-1">
                      <span>{sp?.emoji ?? '🔍'}</span>
                      <span>{sp?.label ?? req.species}</span>
                    </div>
                    {typeof req.reason === 'string' && req.reason && (
                      <p className="text-xs opacity-70 line-clamp-2 mb-2">{req.reason}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] opacity-60">
                      {req.municipality && (
                        <span className="flex items-center gap-1"><MapPin size={11} />{req.municipality}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatDistanceToNowStrict(new Date(req.created_at), { locale: getDateLocale(i18n.language), addSuffix: true })}
                      </span>
                      {typeof req.response_count === 'number' && req.response_count > 0 && (
                        <span className="flex items-center gap-1"><Users size={11} />{req.response_count}</span>
                      )}
                      <span title={format(new Date(req.created_at), 'yyyy/M/d HH:mm', { locale: getDateLocale(i18n.language) })} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* REQ-090: 新規依頼 FAB。BottomNav (h-14) + safe-area-inset-bottom + 余白を考慮 */}
      <button
        type="button"
        onClick={() => {
          if (user) setShowCreateForm(true)
          else setShowAuthModal(true)
        }}
        aria-label="調査依頼を立てる"
        className="fixed right-4 z-30 w-14 h-14 rounded-full bg-linear-to-br from-amber-500 to-orange-600 text-white shadow-xl shadow-amber-500/40 ring-4 ring-white dark:ring-slate-950 active:scale-95 transition-transform flex items-center justify-center"
        // REQ-268 FR-268-09: /requests は BottomNav 非表示のため 5rem→1.5rem の標準 FAB 位置に是正
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {showCreateForm && (
        <SurveyRequestForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => { void fetchRequests() }}
        />
      )}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} defaultTab="signup" />
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="text-xs flex flex-col gap-1">
      <span className="opacity-70">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-transparent px-2.5 py-2 text-base md:text-sm dark:border-slate-700"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
