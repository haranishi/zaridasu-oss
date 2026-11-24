'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import BottomNav from '@/components/layout/BottomNav'
import { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Header from '@/components/layout/Header'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useRanking, useDiversity, useQuality } from '@/hooks/useProfile'
import { pageBg, cardCls, faint } from '@/lib/themeClasses'
import { btnRetryCls } from '@/lib/formStyles'
import { PAGE_CONTAINER } from '@/lib/layout'
import Footer from '@/components/layout/Footer'
import Breadcrumb from '@/components/ui/Breadcrumb'
import PriorityAreaNudge from '@/components/features/home/PriorityAreaNudge'
import EmptyState from '@/components/ui/EmptyState'
import EarlyStageNote from '@/components/ui/EarlyStageNote'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { LoadingState, SkeletonRows } from '@/components/ui/Skeleton'

const PERIODS = [
  { value: 'all', labelKey: 'ranking.period.all' },
  { value: 'month', labelKey: 'ranking.period.month' },
  { value: 'year', labelKey: 'ranking.period.year' },
]

// REQ-171: info_type は5種（sighting/capture/trace/damage/absence）
const INFO_TYPE_TOTAL = 5

const RANK_STYLE = {
  1: { icon: '🥇', ring: 'ring-amber-400/40 bg-amber-50 dark:bg-amber-900/20' },
  2: { icon: '🥈', ring: 'ring-gray-300/40 bg-gray-50 dark:bg-gray-800/30' },
  3: { icon: '🥉', ring: 'ring-orange-300/40 bg-orange-50 dark:bg-orange-900/20' },
}

/**
 * REQ-320 FR-320-08: 「まだ少ない」注記を出す件数のしきい値。
 * 立ち上がり期（実データ 8 件・登録 9 人）に、1 行だけの一覧が「壊れている」ように
 * 見えるのを防ぐ。ここを超えたら注記は自然に消える（データは一切偽らない）。
 */
const SPARSE_LIST_THRESHOLD = 5

/**
 * REQ-321 FR-321-03: 緑（emerald-500 = #10B981）を廃した後の強調色。
 *
 * ■ なぜ緑を消すのか
 * REQ-224 は「赤×緑は P/D 型色覚で最も識別困難」として主役色を青×オレンジへ移した規約で、
 * 赤いボトムナビが全ページに出るようになった（REQ-320 FR-320-01）今、同一画面の緑は
 * その規約違反そのものになっていた。加えて emerald-500 は白地 2.54:1 で AA の半分ほどしかない。
 *
 * ■ なぜブランド赤なのか
 * REQ-321 の指示は「ブランド赤またはグレースケール」。ここは「強調したい小要素」なので
 * グレーだと強調が消える。ブランド赤 #dc2626 は白面 4.83:1／ダーク面 6.4:1 で、
 * 選択中タブ（bg-brand-600）と同じ 1 系統に収まる。
 * ダークは #dc2626 だと暗いカード面で 2.4:1 まで落ちるので red-400（5.3:1）へ振る。
 */
const ACCENT = 'text-brand-600 dark:text-red-400'

// REQ-171: 多様性カバレッジの進捗バー（色のみに依存せず数値併記）
function CoverageBar({ value, total, label, dark }: { value: number; total: number; label: string; dark: boolean }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className={dark ? 'text-slate-300' : 'text-gray-600'}>{label}</span>
        <span className={`font-semibold tabular-nums ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
          {value}{total ? `/${total}` : ''}
        </span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
        {/* REQ-321 FR-321-03: 旧 bg-emerald-500 は gray-200 のトラック上で 1.87:1 と
            UI 部品基準 3:1 を大きく割っていた（バーの伸びが見えない）。そこで赤へ移した。
            REQ-323 FR-323-06: **赤は CTA とリンク専用**にする方針になったので、trends の
            データバーと同じ `--chart-quantity`（量＝濃い無彩色）へ揃える。
            トラック上 6.10:1（ライト）／4.04:1（ダーク）で、赤のとき（3.85/3.79）より余裕がある。 */}
        <div
          className="h-full rounded-full bg-(--chart-quantity)"
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

// REQ-192 (FR-192-03/04/07): 取得失敗を空状態と分離するエラー UI（再試行ボタン付き）。
// ErrorAlert は role="alert" を内蔵（REQ-195）。空状態文言は流用せず common.loadError を使う。
function LoadErrorState({ onRetry, dark }: { onRetry: () => void; dark: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <ErrorAlert message={t('common.loadError')} />
      <button
        type="button"
        onClick={onRetry}
        className={`text-sm px-4 py-2 rounded-xl ${btnRetryCls(dark)}`}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}

export default function RankingPage() {
  const { user } = useAuth()
  const { dark } = useTheme()
  const router = useRouter()
  const { t } = useTranslation()
  // REQ-171: 既定は「発見の多様性」。REQ-235: 「品質（検証済み）」を質の主軸として並置し、
  // 投稿数順リーダーボードはオプトインのタブに後退（量・いいね偏重の是正・Goodhart 対策）。
  const [view, setView] = useState<'diversity' | 'quality' | 'leaderboard'>('diversity')
  const [period, setPeriod] = useState('all')
  // REQ-192 (FR-192-01/04): error / refetch を受け取り、取得失敗を「まだ記録がありません」（空状態）と分離する。
  // REQ-278 FR-278-03: 表示中のタブぶんだけフェッチする（従来は3系統のRPCを初期表示で一斉発火していた）。
  const { ranking, loading: rankingLoading, error: rankingError, refetch: refetchRanking } = useRanking({ period, limit: 50, enabled: view === 'leaderboard' })
  const { diversity, loading: diversityLoading, error: diversityError, refetch: refetchDiversity } = useDiversity({ limit: 50, enabled: view === 'diversity' })
  const { quality, loading: qualityLoading } = useQuality({ limit: 50, enabled: view === 'quality' })

  const card = cardCls(dark)
  const bg = pageBg(dark)
  const muted = dark ? 'text-slate-400' : 'text-gray-600'

  const myDiversity = user ? diversity.find((d) => d.user_id === user.id) : null
  const myQuality = user ? quality.find((q) => q.user_id === user.id) : null
  const myRank = user ? ranking.find((r) => r.user_id === user.id) : null

  // REQ-235: 0..1 の比率を百分率表示（質指標は必ず量指標に併記する）。
  const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

  return (
    <div className={`min-h-screen ${bg}`}>
      <Header
        onPostClick={() => router.push('/map?post=1')}
        onLoginClick={mode => router.push(`/?auth=${mode}`)}
        onSurveyClick={() => router.push('/requests?create=1')}
      />

      <Breadcrumb items={[{ label: t('ranking.breadcrumb') }]} />

      {/* REQ-275 FR-275-03: 見出し要素が皆無だったページの h1 起点。視覚デザインは変えない（sr-only）。 */}
      <h1 className="sr-only">{t('ranking.breadcrumb')}</h1>

      {/* REQ-320 FR-320-05: 幅・左パディングは PAGE_CONTAINER（単一の正）から取る */}
      <div className={`${PAGE_CONTAINER} py-6 space-y-5`}>
        {/* REQ-171: 貢献フレーミング（順位・他者比較を含めない内発的動機の意味づけ） */}
        <div className={`${card} p-4! flex items-start gap-3`}>
          {/* REQ-321 FR-321-03: 旧 text-emerald-500 */}
          <Sparkles className={`${ACCENT} shrink-0 mt-0.5`} size={20} />
          <p className={`text-sm leading-relaxed ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
            {t('ranking.framing.main')}
            <span className={muted}> {t('ranking.framing.sub')}</span>
          </p>
        </div>

        {/* ビュー切替（多様性 / 投稿数ランキング=オプトイン）
            REQ-318 FR-318-03/04: 選択中タブの背景を 3 タブとも `bg-brand-600` に統一した。
             - 旧 emerald-500(#10B981) は白文字で 2.54:1、sky-500 で 2.77:1、red-500 で 3.76:1 と
               全て AA(4.5:1) 未満。ブランド赤 #dc2626 は白文字 4.83:1 で唯一基準を満たす。
             - 加えて emerald は「赤いボトムナビと同一画面に緑」＝ REQ-224 で禁じた赤×緑の再発だった。
             - 同時に 1 つしか選ばれないので、選択色を種類ごとに変える必要はない（選択＝ブランド色）。
            REQ-318 FR-318-07: 390px でトラックからはみ出していた対策。
             - `min-w-0` で flex アイテムが min-content 未満に縮めるようにし、横あふれを構造的に断つ。
             - ラベルは 390px で text-xs（折り返しても 2 行までに収まる）、sm 以上で従来の text-sm。
             - 高さは REQ-268 のタップ基準に合わせて min-h-11(44px) を明示（text-xs 化で縮まないように）。
            REQ-325 FR-325-01: 非選択タブのラベルが gray-500(#6b7280) だった。白地なら 4.83:1 で通るが、
             このトラックは gray-100(#f3f4f6) なので **4.39:1** で AA を割る（Round 5c 採点 TOP5-3）。
             色付き面に載せる二次テキストは muted 以上＝ここでは gray-600(#4b5563) の 6.87:1 にする。 */}
        <div className={`flex gap-1 p-1 rounded-xl ${dark ? 'bg-slate-800' : 'bg-gray-100'}`} role="tablist" aria-label={t('ranking.viewSwitch')}>
          <button
            role="tab"
            aria-selected={view === 'diversity'}
            onClick={() => setView('diversity')}
            className={`flex-1 min-w-0 min-h-11 px-1 py-2 text-xs sm:text-sm leading-tight font-medium rounded-lg transition-all ${
              view === 'diversity' ? 'bg-brand-600 text-white shadow-xs'
                : dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🌱 {t('ranking.tabDiversity')}
          </button>
          {/* REQ-235: 「品質（検証済み）」軸。多様性と並ぶ“質”の見せ方。 */}
          <button
            role="tab"
            aria-selected={view === 'quality'}
            onClick={() => setView('quality')}
            className={`flex-1 min-w-0 min-h-11 px-1 py-2 text-xs sm:text-sm leading-tight font-medium rounded-lg transition-all ${
              view === 'quality' ? 'bg-brand-600 text-white shadow-xs'
                : dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🔬 {t('ranking.tabQuality')}
          </button>
          <button
            role="tab"
            aria-selected={view === 'leaderboard'}
            onClick={() => setView('leaderboard')}
            className={`flex-1 min-w-0 min-h-11 px-1 py-2 text-xs sm:text-sm leading-tight font-medium rounded-lg transition-all ${
              view === 'leaderboard' ? 'bg-brand-600 text-white shadow-xs'
                : dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🏆 {t('ranking.tabLeaderboard')}
          </button>
        </div>

        {view === 'diversity' ? (
          <>
            {/* REQ-173: 優先調査エリアのナッジ（空間バイアス補正） */}
            <PriorityAreaNudge />

            {/* あなたのコレクション */}
            {myDiversity && (
              <div className={`${card} p-4!`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-2xl">{myDiversity.avatar_emoji}</span>
                  <p className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{t('ranking.yourCollection')}</p>
                </div>
                <div className="space-y-2.5">
                  <CoverageBar value={myDiversity.info_type_coverage} total={INFO_TYPE_TOTAL} label={t('ranking.coverage.infoType')} dark={dark} />
                  <CoverageBar value={myDiversity.municipality_count} total={0} label={t('ranking.coverage.municipality')} dark={dark} />
                  <CoverageBar value={myDiversity.species_count} total={2} label={t('ranking.coverage.species')} dark={dark} />
                </div>
                {/* REQ-321 FR-321-03: 旧 text-emerald-500（白地 2.54:1）→ ブランド赤（4.83:1） */}
                {myDiversity.info_type_coverage >= INFO_TYPE_TOTAL && (
                  <p className={`mt-3 text-xs font-medium ${ACCENT}`}>🏅 {t('ranking.infoTypeComplete')}</p>
                )}
              </div>
            )}

            {/* 多様性ビュー（順位数値・件数を主役にしない） */}
            {diversityLoading ? (
              <LoadingState className={card}>
                <SkeletonRows rows={5} />
              </LoadingState>
            ) : diversityError ? (
              // REQ-192: 取得失敗（エラー）→ 空状態と分離して再試行を提示。
              <div className={card}>
                <LoadErrorState onRetry={refetchDiversity} dark={dark} />
              </div>
            ) : diversity.length === 0 ? (
              <div className={card}>
                <EmptyState
                  title={t('ranking.diversityEmptyTitle')}
                  description={t('ranking.diversityEmpty.desc')}
                  action={{ label: t('empty.postCta'), onClick: () => router.push('/map?post=1') }}
                />
              </div>
            ) : (
              <>
              <div className={card}>
                <div className="space-y-1">
                  {diversity.map((entry) => {
                    const isMe = user && entry.user_id === user.id
                    return (
                      <Link
                        key={entry.user_id}
                        href={`/profile/${entry.user_id}`}
                        // REQ-321 FR-321-03: 「あなた」の行ハイライトも emerald → ブランド赤系へ。
                        // 投稿数タブ（下の ranking.map）が既に red-50/red-200 を使っており、
                        // 同じ「自分の行」がタブごとに違う色になっていたのも一貫性の欠落だった。
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isMe
                            ? dark ? 'bg-red-900/20 ring-1 ring-red-500/30' : 'bg-red-50 ring-1 ring-red-200'
                            : dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center">{entry.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {entry.display_name}
                            {/* REQ-321 FR-321-03: 旧 text-emerald-500 */}
                            {isMe && <span className={`ml-1.5 text-xs font-normal ${ACCENT}`}>{t('ranking.you')}</span>}
                          </p>
                          {/* REQ-325 FR-325-01: 「あなた」の行だけ下地が red-50(#fef2f2) になるため、
                              faint(#6b7280) だと 4.42:1 で AA を割る（白カード上なら 4.83:1 で通る）。
                              色付き面に載る可能性がある行の副文は muted 以上にする（red-50 上 6.91:1）。 */}
                          <p className={`text-xs ${muted}`}>
                            {t('ranking.diversitySummary', { coverage: entry.info_type_coverage, total: INFO_TYPE_TOTAL, municipalities: entry.municipality_count, species: entry.species_count })}
                          </p>
                        </div>
                        {/* REQ-321 FR-321-03: 旧 text-emerald-500 */}
                        {entry.info_type_coverage >= INFO_TYPE_TOTAL && (
                          <span className={`shrink-0 text-xs ${ACCENT}`} title={t('ranking.infoTypeCompleteShort')}>🏅</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
              {/* REQ-320 FR-320-08: 1 行だけの一覧は「壊れている」ように見える。件数は偽らず、
                  「まだ始まったばかり」であることと次の行動を添える。
                  REQ-322 FR-322-05: 注記が**個人カードの内側**にあったため「そのユーザーの説明文」に
                  読めていた（Round 3 採点 #21）。カードの外＝ページレベルへ出し、
                  area/[municipality] と同じイラスト付きの見せ方に格上げする。 */}
              {diversity.length < SPARSE_LIST_THRESHOLD && (
                <EarlyStageNote
                  title={t('ranking.sparseTitle')}
                  message={t('ranking.earlyStageNote', { count: diversity.length })}
                  ctaLabel={t('empty.postCta')}
                  onClick={() => router.push('/map?post=1')}
                />
              )}
              </>
            )}
          </>
        ) : view === 'quality' ? (
          <>
            {/* REQ-235: 品質連動ランキング（検証済み投稿数＝量に、承認率/定点率/GPS良好率＝質を必ず併記） */}
            <p className={`text-xs ${muted}`}>{t('ranking.qualityNote')}</p>

            {/* あなたの品質サマリー（量×質ペア表示） */}
            {myQuality && (
              <div className={`${card} p-4!`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{myQuality.avatar_emoji}</span>
                  <div>
                    <p className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{t('ranking.yourQuality')}</p>
                    <p className={`text-xs ${muted}`}>{t('ranking.verifiedCount', { count: myQuality.verified_count })}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className={`rounded-lg py-2 ${dark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                    <p className="text-base font-bold tabular-nums text-sky-500">{pct(myQuality.approval_rate)}</p>
                    <p className={`text-[11px] ${faint(dark)}`}>{t('ranking.quality.approvalRate')}</p>
                  </div>
                  <div className={`rounded-lg py-2 ${dark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                    <p className="text-base font-bold tabular-nums text-sky-500">{pct(myQuality.structured_rate)}</p>
                    <p className={`text-[11px] ${faint(dark)}`}>{t('ranking.quality.structuredRate')}</p>
                  </div>
                  <div className={`rounded-lg py-2 ${dark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                    <p className="text-base font-bold tabular-nums text-sky-500">{pct(myQuality.gps_good_rate)}</p>
                    <p className={`text-[11px] ${faint(dark)}`}>{t('ranking.quality.gpsGoodRate')}</p>
                  </div>
                </div>
              </div>
            )}

            {qualityLoading ? (
              <LoadingState className={card}>
                <SkeletonRows rows={5} />
              </LoadingState>
            ) : quality.length === 0 ? (
              <div className={card}>
                <EmptyState
                  title={t('ranking.qualityEmptyTitle')}
                  description={t('ranking.qualityEmpty.desc')}
                  action={{ label: t('empty.postCta'), onClick: () => router.push('/map?post=1') }}
                />
              </div>
            ) : (
              <>
              <div className={card}>
                <div className="space-y-1">
                  {quality.map((entry) => {
                    const isMe = user && entry.user_id === user.id
                    return (
                      <Link
                        key={entry.user_id}
                        href={`/profile/${entry.user_id}`}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isMe
                            ? dark ? 'bg-sky-900/20 ring-1 ring-sky-500/30' : 'bg-sky-50 ring-1 ring-sky-200'
                            : dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center">{entry.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {entry.display_name}
                            {isMe && <span className="ml-1.5 text-xs text-sky-500 font-normal">{t('ranking.you')}</span>}
                          </p>
                          {/* 量（検証済み件数）に質（承認率・定点率）を必ず併記 */}
                          <p className={`text-xs ${faint(dark)}`}>
                            {t('ranking.qualitySummary', {
                              verified: entry.verified_count,
                              approval: pct(entry.approval_rate),
                              structured: pct(entry.structured_rate),
                            })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold tabular-nums ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{entry.verified_count}</p>
                          <p className={`text-xs ${faint(dark)}`}>{t('ranking.verifiedUnit')}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
              {/* REQ-322 FR-322-05: 多様性タブと同じくカードの外へ（採点 #21） */}
              {quality.length < SPARSE_LIST_THRESHOLD && (
                <EarlyStageNote
                  title={t('ranking.sparseTitle')}
                  message={t('ranking.earlyStageNote', { count: quality.length })}
                  ctaLabel={t('empty.postCta')}
                  onClick={() => router.push('/map?post=1')}
                />
              )}
              </>
            )}
          </>
        ) : (
          <>
            {/* 投稿数ランキング（オプトイン・参考） */}
            <p className={`text-xs ${muted}`}>{t('ranking.leaderboardNote')}</p>
            <div className={`flex gap-1 p-1 rounded-xl ${dark ? 'bg-slate-800' : 'bg-gray-100'}`}>
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                    period === p.value ? 'bg-brand-600 text-white shadow-xs'
                      : dark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>

            {myRank && (
              <div className={`${card} p-4! flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{myRank.avatar_emoji}</span>
                  <div>
                    <p className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{t('ranking.yourActivity')}</p>
                    <p className={`text-xs ${muted}`}>{t('ranking.reportCount', { count: myRank.post_count })}</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-red-500">{t('ranking.rankPosition', { rank: myRank.rank })}</p>
              </div>
            )}

            {rankingLoading ? (
              <LoadingState className={card}>
                <SkeletonRows rows={5} />
              </LoadingState>
            ) : rankingError ? (
              // REQ-192: 取得失敗（エラー）→ 空状態と分離して再試行を提示。
              <div className={card}>
                <LoadErrorState onRetry={refetchRanking} dark={dark} />
              </div>
            ) : ranking.length === 0 ? (
              <div className={card}>
                <EmptyState
                  title={t('ranking.leaderboardEmptyTitle')}
                  description={t('empty.contributionDesc')}
                  action={{ label: t('empty.postCta'), onClick: () => router.push('/map?post=1') }}
                />
              </div>
            ) : (
              <>
              <div className={card}>
                <div className="space-y-1">
                  {ranking.map((entry) => {
                    const rs = RANK_STYLE[entry.rank as keyof typeof RANK_STYLE]
                    const isMe = user && entry.user_id === user.id
                    return (
                      <Link
                        key={entry.user_id}
                        href={`/profile/${entry.user_id}`}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isMe
                            ? dark ? 'bg-red-900/20 ring-1 ring-red-500/30' : 'bg-red-50 ring-1 ring-red-200'
                            : dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                        }`}
                      >
                        {/* REQ-320 FR-320-08: 旧実装は 1〜3 位でメダル絵文字が順位番号を**置き換えて**
                            いたため、エントリが 1 件しか無い立ち上がり期の画面には数字が 1 つも出ず、
                            「ランキング」と名乗りながら順位が読めなかった（Round 1 採点 #14）。
                            メダルは装飾として残し、順位番号は常に出す。 */}
                        <div className="w-8 shrink-0 flex flex-col items-center leading-none">
                          {rs && <span className="text-lg" aria-hidden="true">{rs.icon}</span>}
                          {/* 数字は言語非依存なので素の数値を出し、読み上げ用の語（「1位」/「#1」）は
                              sr-only で添える（w-8 の列に各言語の語を入れると溢れるため）。 */}
                          {/* REQ-325 FR-325-01: この行も isMe で red-50 になる（上の多様性タブと同じ理由）。 */}
                          <span className={`text-sm font-bold tabular-nums ${rs ? 'mt-0.5' : ''} ${muted}`} aria-hidden="true">
                            {entry.rank}
                          </span>
                          <span className="sr-only">{t('ranking.rankPosition', { rank: entry.rank })}</span>
                        </div>
                        <span className="text-2xl shrink-0 w-10 h-10 flex items-center justify-center">{entry.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {entry.display_name}
                            {/* REQ-321 FR-321-03: 多様性タブの「あなた」を ACCENT に寄せた以上、
                                同じ語がタブごとに違う赤（red-500 = 白地 3.76:1・AA 未満）になるのは
                                一貫性の欠落なので同じ色に揃える。 */}
                            {isMe && <span className={`ml-1.5 text-xs font-normal ${ACCENT}`}>{t('ranking.you')}</span>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-base font-bold tabular-nums ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{entry.post_count}</p>
                          <p className={`text-xs ${muted}`}>{t('ranking.countUnit')}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
              {/* REQ-322 FR-322-05: 多様性タブと同じくカードの外へ（採点 #21） */}
              {ranking.length < SPARSE_LIST_THRESHOLD && (
                <EarlyStageNote
                  title={t('ranking.sparseTitle')}
                  message={t('ranking.earlyStageNote', { count: ranking.length })}
                  ctaLabel={t('empty.postCta')}
                  onClick={() => router.push('/map?post=1')}
                />
              )}
              </>
            )}
          </>
        )}
      </div>

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
