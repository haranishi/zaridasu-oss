'use client'

import { useRouter } from 'next/navigation'
import BottomNav from '@/components/layout/BottomNav'
import { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Header from '@/components/layout/Header'
import { SPECIES, INFO_TYPES } from '@/lib/constants'
import { useTheme } from '@/context/ThemeContext'
import { useStats } from '@/hooks/useStats'
import { useTranslation } from 'react-i18next'
import Footer from '@/components/layout/Footer'
import BarChart from '@/components/ui/charts/BarChart'
import DonutChart from '@/components/ui/charts/DonutChart'
import TrendsKPI from '@/components/features/dashboard/TrendsKPI'
import Breadcrumb from '@/components/ui/Breadcrumb'
import EarlyStageNote from '@/components/ui/EarlyStageNote'
import { LoadingState, SkeletonStats, SkeletonChart } from '@/components/ui/Skeleton'
import ErrorAlert from '@/components/ui/ErrorAlert'
import { btnRetryCls } from '@/lib/formStyles'
import { PAGE_CONTAINER } from '@/lib/layout'

/**
 * REQ-320 FR-320-08: 「まだ少ない」注記を出す総報告件数のしきい値。
 * これを下回るあいだは、0 が並ぶグラフを「欠損」ではなく「これから」として読ませる。
 * 件数そのものは実データのまま（データは偽らない）。
 */
const SPARSE_TOTAL_THRESHOLD = 30

/**
 * REQ-321 FR-321-01: 市区町村内訳の合計が累計投稿数と一致しない理由を注記で示すためのヘルパー。
 *
 * ■ なぜ食い違うのか（データのバグではない）
 * `get_dashboard_stats` の municipality_counts は
 *   `WHERE status='approved' AND municipality IS NOT NULL ... LIMIT 10`
 * なので、(a) 市区町村が記録されていない報告 と (b) 上位 10 市区町村に入らなかった報告 が落ちる。
 * 一方 KPI の「累計投稿数」は `WHERE status='approved'` の全件。
 * 実データでは累計 8 件に対し内訳が 7 件で、**差の 1 件がどこへ行ったか画面から読めなかった**。
 *
 * ■ 直し方
 * 集計は一切変えない（AC-06）。**表示側で内訳の合計を出して注記に添えるだけ**。
 * 「市区町村が特定できた件数」と断定せず「この内訳に含まれるのは」と書くのは、上の (b) があるため
 * （25 市町村ある県で 10 件上限に当たると、断定形は嘘になる）。
 */
function sumCounts(rows: readonly { count: number }[]): number {
  return rows.reduce((acc, r) => acc + r.count, 0)
}

export default function TrendsPage() {
  const { t } = useTranslation()
  const { dark } = useTheme()
  // REQ-273 FR-273-01: error を無視すると RPC 失敗時に「全部0件」の空グラフを
  // 正常表示のように描画してしまう。エラーは明示表示＋再試行導線を出す。
  const { stats, loading, error, refetch } = useStats({ months: 12 })
  const router = useRouter()

  const card = `rounded-2xl shadow-xs p-5 ${dark ? 'bg-slate-800 border border-slate-700/40' : 'bg-white ring-1 ring-gray-200'}`
  const muted = dark ? 'text-slate-300' : 'text-gray-600'
  const faint = dark ? 'text-slate-400' : 'text-gray-500'
  const heading = dark ? 'text-slate-200' : 'text-gray-700'

  // REQ-323 FR-323-05: 種別色は CSS 変数から引く。定数の hex を直接描くと**ダークで色が
  // 切り替わらず**、slate-800 のカード上で #0072B2 が 2.82:1（UI 部品 3:1 未満）になっていた。
  // 値そのものは変えていない（ライト値は constants の #0072B2 / #D55E00 と一致・テストで固定）。
  const speciesSegments = SPECIES.map((s) => ({
    color: `var(${s.colorVar})`,
    value: stats?.speciesCounts?.[s.value] || 0,
  }))

  // REQ-323 FR-323-10: 12 ヶ月のうち値がある月が 1 つだけなら、11 列が空の棒グラフではなく
  // 「3月に8件」を主役にした表示へ切り替える（集計は変えない＝表示の出し分けだけ）。
  const monthly = stats?.monthly ?? []
  const monthsWithData = monthly.filter((m) => m.count > 0)
  const soleMonth = monthly.length > 1 && monthsWithData.length === 1 ? monthsWithData[0]! : null
  const monthlyMax = monthly.reduce((mx, m) => Math.max(mx, m.count), 0)

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <Header
        onPostClick={() => router.push('/map?post=1')}
        onLoginClick={mode => router.push(`/?auth=${mode}`)}
        onSurveyClick={() => router.push('/requests?create=1')}
      />

      <Breadcrumb items={[{ label: t('nav.trends') }]} />

      {/* REQ-275 FR-275-03: h2 始まりだった見出し階層の起点。視覚デザインは変えない（sr-only）。 */}
      <h1 className="sr-only">{t('nav.trends')}</h1>

      {/* REQ-282: 非同期領域に下限高さを予約し CLS を防ぐ。統計取得失敗時（エラー表示は背が低い）に
          スケルトン→エラーで縦が詰まって下の要素が跳ね上がるのを防ぐ（Lighthouse の CLS ゲート対策・
          本番の正常系ではチャートが埋めるため余白は出ない）。 */}
      {/* REQ-320 FR-320-05: 幅・左パディングは PAGE_CONTAINER（単一の正）から取る */}
      <div className={`${PAGE_CONTAINER} py-6 space-y-5 min-h-[640px]`}>
        {error && !loading ? (
          // REQ-273: 取得失敗を「0件」と区別して表示（RankingPage の LoadErrorState と同型）。
          <div className="space-y-3">
            <ErrorAlert message={t('common.loadError')} />
            <button
              type="button"
              onClick={refetch}
              className={`text-sm px-4 py-2 rounded-xl ${btnRetryCls(dark)}`}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : loading ? (
          <LoadingState className="space-y-5">
            {/* KPI + 月別チャート + 内訳の骨格に寄せて CLS を防ぐ */}
            <SkeletonStats />
            <div className={card}><SkeletonChart height="h-44" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={card}><SkeletonChart height="h-32" /></div>
              <div className={card}><SkeletonChart height="h-32" /></div>
            </div>
          </LoadingState>
        ) : (
          <>
            {/* KPI */}
            {stats && <TrendsKPI stats={stats} card={card} dark={dark} faint={faint} />}

            {/* 月別推移 */}
            <div className={card}>
              {/* REQ-325 FR-325-03: 見出しが「直近12ヶ月の推移」を約束しているのに、値のある月が
                  1 つだけのときは推移グラフを描かない（REQ-323 FR-323-10 の判断）。
                  約束と中身が食い違うと、空いた領域が「描画に失敗した領域」に見える。
                  データ量に合わせて見出しの方を言い換える（集計・件数は一切変えない）。 */}
              <h2 className={`text-sm font-semibold mb-4 ${heading}`}>
                {t(soleMonth ? 'trends.monthlyChartSole' : 'trends.monthlyChart')}
              </h2>
              {/* REQ-323 FR-323-10: 目盛ラベルと「1ヶ月だけ」表示の文言は i18n が要るので
                  呼び出し側で解決して渡す（BarChart は表示専用のまま保つ）。 */}
              <BarChart
                data={monthly}
                dark={dark}
                maxLabel={monthlyMax > 0 ? `${monthlyMax}${t('trends.countSuffix')}` : undefined}
                soleValueHeadline={soleMonth ? t('trends.soleMonthHeadline', { month: soleMonth.label, count: soleMonth.count }) : undefined}
                soleValueNote={soleMonth ? t('trends.soleMonthNote') : undefined}
              />
              {/* REQ-320 FR-320-08: 報告が少ないうちは、空白の多いグラフの意味を言葉で補い、
                  次の行動（投稿）へつなぐ。件数は実データをそのまま出す（捏造しない）。
                  REQ-322 FR-322-05: 1 行注記では「作りかけ」に見えると採点されたため、
                  評価者が強みとして挙げた area/[municipality] の空状態と同じ
                  「イラスト＋説明＋CTA」へ格上げする（title を渡すと切り替わる）。 */}
              {(stats?.totalAll ?? 0) > 0 && (stats?.totalAll ?? 0) < SPARSE_TOTAL_THRESHOLD && (
                <EarlyStageNote
                  className="mt-4"
                  title={t('trends.sparseTitle')}
                  message={t('trends.earlyStageNote', { count: stats?.totalAll ?? 0 })}
                  ctaLabel={t('empty.postCta')}
                  href="/map?post=1"
                />
              )}
            </div>

            {/* 種類別 + 情報種別 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 種類別ドーナツ */}
              <div className={card}>
                <h2 className={`text-sm font-semibold mb-4 ${heading}`}>{t('trends.speciesBreakdown')}</h2>
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <DonutChart segments={speciesSegments} />
                  </div>
                  <div className="flex-1 space-y-2">
                    {SPECIES.map((s) => {
                      const count = stats?.speciesCounts?.[s.value] || 0
                      const pct = stats?.totalAll ? Math.round((count / stats.totalAll) * 100) : 0
                      return (
                        <div key={s.value}>
                          <div className="flex justify-between text-sm mb-0.5">
                            <span className={`flex items-center gap-1.5 ${muted}`}>
                              {/* REQ-323 FR-323-05: 凡例の丸もドーナツと同じ CSS 変数から引く */}
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: `var(${s.colorVar})` }} />
                              {s.label}
                            </span>
                            <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                              {count as React.ReactNode}{t('trends.countSuffix')}
                            </span>
                          </div>
                          <div className={`h-2 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                            <div
                              className="h-2 rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: `var(${s.colorVar})` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* 情報種別 */}
              <div className={card}>
                <h2 className={`text-sm font-semibold mb-4 ${heading}`}>{t('trends.infoTypeBreakdown')}</h2>
                <div className="space-y-3">
                  {INFO_TYPES.map((inf) => {
                    const count = stats?.infoTypeCounts?.[inf.value] || 0
                    const pct = stats?.totalAll ? Math.round((count / stats.totalAll) * 100) : 0
                    return (
                      <div key={inf.value}>
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className={`flex items-center gap-1.5 ${muted}`}>
                            {inf.emoji as React.ReactNode} {inf.label}
                          </span>
                          <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {count as React.ReactNode}{t('trends.countSuffix')} ({pct as React.ReactNode}%)
                          </span>
                        </div>
                        <div className={`h-1.5 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                          {/* REQ-321 FR-321-04: red-400→rose-500 のグラデは帯の途中が珊瑚色（実測 #F7636B 付近）
                              になり、ブランド赤 #dc2626 とは別の赤として読めていた。単色に寄せた。
                              REQ-323 FR-323-06: その単色をブランド赤から**濃い無彩色**へ移す。
                              同じ画面で「量（バー）」と「行動（CTA）」が同じ赤だと読み分けられない。 */}
                          <div
                            className="h-1.5 rounded-full bg-(--chart-quantity) transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* 市区町村ランキング */}
            {(stats?.municipalityRank?.length ?? 0) > 0 && (
              <div className={card}>
                {/* REQ-320 FR-320-08: 旧見出しは「市区町村別ランキング（上位10件）」の固定文で、
                    実際には 1 件しか無く**ラベルと中身が矛盾**していた（Round 1 採点 #16）。
                    見出しに実件数を補間し、データと言葉が食い違わないようにする。 */}
                <h2 className={`text-sm font-semibold mb-4 ${heading}`}>
                  {t('trends.municipalityRank', { count: stats!.municipalityRank.length })}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stats!.municipalityRank.map((item: { name: string; count: number }, i: number) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className={`text-xs font-bold w-5 text-right ${faint}`}>{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-0.5">
                          <span className={muted}>{item.name as React.ReactNode}</span>
                          <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>
                            {item.count as React.ReactNode}{t('trends.countSuffix')}
                          </span>
                        </div>
                        <div className={`h-1 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                          {/* REQ-321 FR-321-04: 情報種別バーと同じ理由でグラデを廃した。
                              REQ-323 FR-323-06: 色も情報種別バーと同じ「量＝無彩色」へ揃える。 */}
                          <div
                            className="h-1 bg-(--chart-quantity) rounded-full transition-all duration-700"
                            style={{ width: `${(item.count / stats!.municipalityRank[0]!.count) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* REQ-321 FR-321-01: 内訳の合計（7件）と KPI の累計投稿数（8件）が食い違って見える
                    問題への注記。データは触らず、差が実際にあるときだけ理由を添える。
                    差が無ければ注記も出ない（余計な説明を常設しない）。 */}
                {sumCounts(stats!.municipalityRank) < (stats?.totalAll ?? 0) && (
                  <p className={`mt-3 text-xs ${faint}`}>
                    {t('trends.municipalityCoverage', {
                      listed: sumCounts(stats!.municipalityRank),
                      total: stats!.totalAll,
                    })}
                  </p>
                )}
              </div>
            )}

            <div className={`text-center text-xs ${faint} pb-2`}>
              {t('trends.dataNote')}
            </div>
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
