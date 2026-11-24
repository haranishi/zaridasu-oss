'use client'
// REQ-282 D-8（分割候補・実施は個別REQ）: KPIカード群とチャート群をセクション分割する（627行）。

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useAdminKpi } from '@/hooks/admin/useAdminKpi'
import type {
  KpiSummary,
  KpiQualityFunnel,
  RetentionCohorts,
  AiAccuracyStats,
} from '@/hooks/admin/useAdminKpi'

// REQ-233: 卒研 KPI ダッシュボード。
// North Star Metric（1つ）＋ガードレール＋KGI を 1 画面に集約し、
// 獲得月コホート継続率カーブと量×質のカウンター指標（Goodhart 対策）を併置する。
// 既存 admin 画面（AdminExperimentsPage / AdminAiCostPage）に倣い文言は日本語ハードコード。
// KPI 定義・式・閾値・目標バンドは docs/runbooks/kpi-weekly-review.md の KPI Register に準拠。

type Band = 'good' | 'warn' | 'bad' | 'neutral'

const BAND_STYLE: Record<Band, string> = {
  good: 'bg-green-50 border-green-300 text-green-800',
  warn: 'bg-amber-50 border-amber-300 text-amber-800',
  bad: 'bg-red-50 border-red-300 text-red-800',
  neutral: 'bg-white border-gray-200 text-gray-900',
}

function pct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(1)}%`
}
function num(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString()
}

/** WoW（前週比）を符号付きで表示。null=前週が 0 で比率不能。 */
function wowText(wow: number | null, delta: number): string {
  if (wow == null) return delta === 0 ? '前週比 —' : `前週比 +${delta}（前週 0）`
  const sign = wow >= 0 ? '+' : ''
  return `前週比 ${sign}${(wow * 100).toFixed(1)}%`
}

/** 「大きいほど良い」指標を緑黄赤バンドに落とす（目標は仮置き・3ヶ月運用後に見直し）。 */
function bandHigher(v: number | null | undefined, good: number, warn: number): Band {
  if (v == null) return 'neutral'
  if (v >= good) return 'good'
  if (v >= warn) return 'warn'
  return 'bad'
}
/** 「小さいほど良い」指標（却下率など）を緑黄赤バンドに落とす。 */
function bandLower(v: number | null | undefined, good: number, warn: number): Band {
  if (v == null) return 'neutral'
  if (v <= good) return 'good'
  if (v <= warn) return 'warn'
  return 'bad'
}

export default function AdminKpiPage() {
  const {
    data,
    loading,
    error,
    funnelDays,
    setFunnelDays,
    cohortMonths,
    setCohortMonths,
    reload,
  } = useAdminKpi()

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl font-bold text-gray-800 mb-1">📈 研究 KPI ダッシュボード</h1>
        <p className="text-sm text-gray-500">
          卒論の主張（<strong>継続率・参加率・データ品質</strong>）を、North Star Metric（1つ）＋
          ガードレール＋KGI、獲得月コホート別の継続カーブ、量×質のカウンター指標で 1 画面に集約します。
          全体平均は生存者バイアスで嘘になるため継続はコホートで、量だけ追って品質が落ちる
          Goodhart を防ぐため量と質を必ずペアで見ます。
        </p>
        <p className="text-xs text-gray-400 mt-1">
          指標の定義・式・目標バンド・週次レビュー手順は{' '}
          <code className="rounded-sm bg-gray-100 px-1 py-0.5 font-mono">
            docs/runbooks/kpi-weekly-review.md
          </code>{' '}
          の KPI Register を参照。関連:{' '}
          <Link href="/admin/experiments" className="text-blue-600 underline">
            実験計測（DID・REQ-175）
          </Link>{' '}
          /{' '}
          <Link href="/admin/ai-cost" className="text-blue-600 underline">
            AI コスト（USD 換算）
          </Link>
        </p>
      </header>

      {/* コントロール */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="funnel-days" className="text-sm font-medium text-gray-700">
            ファネル/品質の期間
          </label>
          <select
            id="funnel-days"
            value={funnelDays}
            onChange={(e) => setFunnelDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value={30}>直近 30 日</option>
            <option value={90}>直近 90 日</option>
            <option value={180}>直近 180 日</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="cohort-months" className="text-sm font-medium text-gray-700">
            コホート遡及
          </label>
          <select
            id="cohort-months"
            value={cohortMonths}
            onChange={(e) => setCohortMonths(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value={6}>6 ヶ月</option>
            <option value={12}>12 ヶ月</option>
            <option value={18}>18 ヶ月</option>
          </select>
        </div>
        <button
          type="button"
          onClick={reload}
          className="text-sm rounded-lg bg-gray-800 text-white px-3 py-1.5 hover:bg-gray-700"
        >
          再集計
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">集計中…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && (
        <>
          <SummarySection summary={data.summary} />
          <CounterMetricsSection funnel={data.funnel} />
          <AiAccuracySection accuracy={data.accuracy} />
          <FunnelSection funnel={data.funnel} />
          <CohortSection cohorts={data.cohorts} />
        </>
      )}
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// NSM + ガードレール + KGI サマリー
// ───────────────────────────────────────────────────────────────────────────
function SummarySection({ summary }: { summary: KpiSummary | null }) {
  if (!summary) {
    return (
      <SectionShell title="① North Star + ガードレール + KGI" note="（取得できませんでした）">
        <p className="text-sm text-gray-400">データなし</p>
      </SectionShell>
    )
  }
  const { nsm, guardrails, kgi } = summary
  return (
    <SectionShell
      title="① North Star + ガードレール + KGI"
      note="先行（行動・予兆）＝NSM とガードレール、遅行（結果）＝KGI。NSM は 1 つだけ。"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* NSM */}
        <KpiCard
          band={bandHigher(nsm.wow ?? 0, 0, -0.0001)}
          tag="North Star（先行・価値）"
          label="週次アクティブ投稿者数（週内2回以上・承認）"
          value={num(nsm.value)}
          sub={wowText(nsm.wow, nsm.delta)}
          def="価値を受け取った参加の量。直近7日に approved 投稿を2回以上したユニークユーザー数。データ源: posts(status, user_id, created_at)。"
        />
        {/* ガードレール */}
        <KpiCard
          band={bandLower(guardrails.rejection_rate, 0.1, 0.25)}
          tag="ガードレール（counter-metric）"
          label="モデレーション却下率（直近7日）"
          value={pct(guardrails.rejection_rate)}
          sub={`今週の投稿 ${num(guardrails.posts_this_week)} 件`}
          def="NSM を追って品質が落ちていないかの歯止め。rejected ÷ 全status。データ源: posts.status。目標: ≤10%緑 / ≤25%黄。"
        />
        <KpiCard
          band={bandHigher(guardrails.completeness_rate, 0.6, 0.4)}
          tag="ガードレール（counter-metric）"
          label="完全率（直近7日）"
          value={pct(guardrails.completeness_rate)}
          sub={`正確率（≤${summary.accuracy_threshold_m}m）: ${pct(guardrails.accuracy_rate)}`}
          def="写真添付 AND GPS精度ありの割合。量（投稿数）と必ずペアで監視。データ源: posts.photos / accuracy。"
        />
        {/* KGI */}
        <KpiCard
          band="neutral"
          tag="KGI（遅行・成果）"
          label="累積有効観測レコード数"
          value={num(kgi.cumulative_approved)}
          sub="status='approved' の累計"
          def="卒研の最終成果（遅行指標）。データ源: posts(status='approved')。"
        />
        <KpiCard
          band="neutral"
          tag="KGI（遅行・成果）"
          label="継続投稿者総数"
          value={num(kgi.repeat_contributors)}
          sub="approved 投稿を2回以上したユニークユーザー"
          def="参加の継続を表す累積成果。データ源: posts(status='approved', user_id)。"
        />
      </div>
    </SectionShell>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 量×質のカウンター指標（必ず横並び）
// ───────────────────────────────────────────────────────────────────────────
function CounterMetricsSection({ funnel }: { funnel: KpiQualityFunnel | null }) {
  if (!funnel) {
    return (
      <SectionShell title="② 量×質カウンター指標" note="（取得できませんでした）">
        <p className="text-sm text-gray-400">データなし</p>
      </SectionShell>
    )
  }
  const { completeness, accuracy, cost_per_submission: cost } = funnel
  return (
    <SectionShell
      title="② 量×質カウンター指標（Goodhart 対策）"
      note={`量（左）と質（右）を必ずペアで。期間内の集計。GPS 閾値=${funnel.accuracy_threshold_m}m（REQ-172）。`}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <PairCard
          title="完全率"
          quantityLabel="投稿数（量）"
          quantityValue={num(completeness.count)}
          qualityLabel="完全な投稿の割合（質）"
          qualityValue={pct(completeness.rate)}
          band={bandHigher(completeness.rate, 0.6, 0.4)}
          extra={`写真添付率 ${pct(completeness.photo_rate)} / GPS精度あり率 ${pct(completeness.accuracy_present_rate)}`}
          def="完全 = 写真添付 AND accuracy 非NULL。種別/情報種別は NOT NULL 制約で常に充足。"
        />
        <PairCard
          title="正確率（精度内率）"
          quantityLabel="投稿数（量）"
          quantityValue={num(accuracy.count)}
          qualityLabel={`≤${funnel.accuracy_threshold_m}m の割合（質・全投稿分母）`}
          qualityValue={pct(accuracy.rate_of_all)}
          band={bandHigher(accuracy.rate_of_all, 0.5, 0.3)}
          extra={`測位ありを分母にすると ${pct(accuracy.rate_of_measured)}（測位 ${num(accuracy.measured)} 件）`}
          def="正確 = accuracy が閾値以内。全投稿分母と測位あり分母の両方を明示（手動地図選択は accuracy=NULL）。"
        />
        <PairCard
          title="1 提出あたり AI コスト"
          quantityLabel="承認投稿数（量・分母）"
          quantityValue={num(cost.approved)}
          qualityLabel="承認1件あたりトークン（質）"
          qualityValue={
            cost.tokens_per_approved == null ? '—' : cost.tokens_per_approved.toLocaleString()
          }
          band="neutral"
          extra={`AI 呼出 ${num(cost.ai_calls)} 件 / in ${num(cost.input_tokens)} + out ${num(cost.output_tokens)} tok`}
          def="AI 判定コスト（ai_call_logs のトークン）÷ 承認投稿数。USD 概算は AI コスト画面（モデル別単価）で確認。"
        />
      </div>
    </SectionShell>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// REQ-253: AI 信頼度 → 的中率エビデンス（信頼度ビン別の承認率・的中率）
// 「信頼度が高いほど人手承認され、AI 検出種が確定種と一致する」を運用データで裏付ける。
// truth は承認済み投稿の確定 species を真値とみなす運用プロキシ（真の適合率/再現率ではない）。
// ───────────────────────────────────────────────────────────────────────────
function AiAccuracySection({ accuracy }: { accuracy: AiAccuracyStats | null }) {
  const { t } = useTranslation()
  const binLabel = (key: AiAccuracyStats['bins'][number]['key']): string => {
    switch (key) {
      case 'lt50':
        return t('admin.aiAccuracy.binLt50')
      case 'c50_70':
        return t('admin.aiAccuracy.bin50_70')
      case 'c70_90':
        return t('admin.aiAccuracy.bin70_90')
      case 'c90_100':
        return t('admin.aiAccuracy.bin90_100')
    }
  }

  if (!accuracy || accuracy.summary.total === 0) {
    return (
      <SectionShell title={t('admin.aiAccuracy.title')} note={t('admin.aiAccuracy.note')}>
        <p className="text-sm text-gray-400">{t('admin.aiAccuracy.empty')}</p>
      </SectionShell>
    )
  }

  const { bins, summary } = accuracy
  const hr = summary.human_reviewed
  const thClass = 'text-right font-medium px-2 py-1.5'

  return (
    <SectionShell title={t('admin.aiAccuracy.title')} note={t('admin.aiAccuracy.note')}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-gray-500 border-b border-gray-200">
              <th scope="col" className="text-left font-medium px-2 py-1.5">
                {t('admin.aiAccuracy.colBin')}
              </th>
              <th scope="col" className={thClass}>{t('admin.aiAccuracy.colTotal')}</th>
              <th scope="col" className={thClass}>{t('admin.aiAccuracy.colApproved')}</th>
              <th scope="col" className={thClass}>{t('admin.aiAccuracy.colRejected')}</th>
              <th scope="col" className={thClass}>{t('admin.aiAccuracy.colPending')}</th>
              <th scope="col" className={thClass}>{t('admin.aiAccuracy.colAutoApproved')}</th>
              <th scope="col" className="text-left font-medium px-2 py-1.5 min-w-28">
                {t('admin.aiAccuracy.colApprovalRate')}
              </th>
              <th scope="col" className="text-left font-medium px-2 py-1.5 min-w-28">
                {t('admin.aiAccuracy.colMatchRate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {bins.map((b) => (
              <tr key={b.key} className="border-b border-gray-100">
                <th scope="row" className="text-left font-medium px-2 py-1.5 text-gray-700 whitespace-nowrap">
                  {binLabel(b.key)}
                </th>
                <td className="text-right tabular-nums px-2 py-1.5 text-gray-700">{num(b.total)}</td>
                <td className="text-right tabular-nums px-2 py-1.5 text-emerald-700">{num(b.approved)}</td>
                <td className="text-right tabular-nums px-2 py-1.5 text-red-700">{num(b.rejected)}</td>
                <td className="text-right tabular-nums px-2 py-1.5 text-gray-500">{num(b.pending)}</td>
                <td className="text-right tabular-nums px-2 py-1.5 text-gray-500">{num(b.auto_approved)}</td>
                <td className="px-2 py-1.5">
                  <RateBar rate={b.approval_rate} color="bg-sky-500/70" />
                </td>
                <td className="px-2 py-1.5">
                  <RateBar rate={b.match_rate} color="bg-emerald-500/70" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200">
              <th scope="row" className="text-left font-semibold px-2 py-1.5 text-gray-800">
                {t('admin.aiAccuracy.summary')}
              </th>
              <td className="text-right tabular-nums px-2 py-1.5 font-medium text-gray-800">{num(summary.total)}</td>
              <td className="text-right tabular-nums px-2 py-1.5 font-medium text-emerald-700">{num(summary.approved)}</td>
              <td className="text-right tabular-nums px-2 py-1.5 font-medium text-red-700">{num(summary.rejected)}</td>
              <td className="text-right tabular-nums px-2 py-1.5 font-medium text-gray-500">{num(summary.pending)}</td>
              <td className="text-right tabular-nums px-2 py-1.5 font-medium text-gray-500">{num(summary.auto_approved)}</td>
              <td className="px-2 py-1.5">
                <RateBar rate={summary.approval_rate} color="bg-sky-500/70" />
              </td>
              <td className="px-2 py-1.5">
                <RateBar rate={summary.match_rate} color="bg-emerald-500/70" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 人手レビュー分（自動承認を除いた独立検証）＋注意書き */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-xs font-medium text-gray-700">{t('admin.aiAccuracy.humanReviewed')}</p>
          <p className="text-sm text-gray-800 mt-0.5">
            {t('admin.aiAccuracy.humanMatchRate')}:{' '}
            <strong className="tabular-nums">{pct(hr.match_rate)}</strong>
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
            n={num(hr.count)}（{t('admin.aiAccuracy.colApproved')} {num(hr.approved)} /{' '}
            {t('admin.aiAccuracy.colRejected')} {num(hr.rejected)}）
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-[11px] text-amber-800 leading-snug">{t('admin.aiAccuracy.caveat')}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-gray-400 leading-snug">
        {t('admin.aiAccuracy.approvalRateDef')} {t('admin.aiAccuracy.matchRateDef')} ·{' '}
        {t('admin.aiAccuracy.avgConfidence')}: {pct(summary.avg_confidence)}
      </p>
    </SectionShell>
  )
}

/** 0..1 の率を横棒＋パーセントで表示。null は「—」。 */
function RateBar({ rate, color }: { rate: number | null; color: string }) {
  if (rate == null) return <span className="text-gray-300">—</span>
  const w = Math.round(rate * 100)
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 flex-1 min-w-10 bg-gray-100 rounded-sm">
        <div className={`h-2 rounded-sm ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="tabular-nums text-gray-600 w-11 text-right">{pct(rate)}</span>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 承認ファネル（Supabase 側の段）
// ───────────────────────────────────────────────────────────────────────────
function FunnelSection({ funnel }: { funnel: KpiQualityFunnel | null }) {
  if (!funnel) {
    return (
      <SectionShell title="③ 承認ファネル" note="（取得できませんでした）">
        <p className="text-sm text-gray-400">データなし</p>
      </SectionShell>
    )
  }
  const f = funnel.funnel
  const steps: { label: string; value: number; rate?: number | null }[] = [
    { label: '投稿完了（posts 行）', value: f.completed },
    { label: '承認（status=approved）', value: f.approved, rate: f.approval_rate },
  ]
  const maxV = Math.max(1, f.completed)
  return (
    <SectionShell
      title="③ 承認ファネル（Supabase 側の段）"
      note="閲覧→投稿開始→投稿完了の上流は GA4 ファネル探索で見る（REQ-232 のイベント定義に依存）。本表は「完了→承認」の歩留まりに特化し、漏れの段を1つ特定できる粒度。"
    >
      <div className="space-y-2 max-w-xl">
        {steps.map((s) => (
          <div key={s.label}>
            <div className="flex justify-between text-sm text-gray-700">
              <span>{s.label}</span>
              <span className="tabular-nums">
                {num(s.value)}
                {s.rate != null && (
                  <span className="text-gray-400">（承認率 {pct(s.rate)}）</span>
                )}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-sm">
              <div
                className="h-3 bg-emerald-500/70 rounded-sm"
                style={{ width: `${Math.round((s.value / maxV) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        内訳: 承認 {num(f.approved)} / 保留 {num(f.pending)} / 却下 {num(f.rejected)}（却下率{' '}
        {pct(f.rejection_rate)}）。データ源: posts.status。
      </p>
    </SectionShell>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 獲得月コホート継続率（三角マトリクス）
// ───────────────────────────────────────────────────────────────────────────
function CohortSection({ cohorts }: { cohorts: RetentionCohorts | null }) {
  if (!cohorts || cohorts.cohorts.length === 0) {
    return (
      <SectionShell title="④ 獲得月コホート継続率" note="（データなし、または取得できませんでした）">
        <p className="text-sm text-gray-400">
          コホート別の継続率を算出できる投稿データがまだありません。
        </p>
      </SectionShell>
    )
  }
  const months = cohorts.max_months
  const cols = Array.from({ length: months }, (_, i) => i) // M0..M(n-1)

  function cellBand(rate: number | null): Band {
    if (rate == null) return 'neutral'
    if (rate >= 0.4) return 'good'
    if (rate >= 0.2) return 'warn'
    return 'bad'
  }
  const cellBg: Record<Band, string> = {
    good: 'bg-green-100 text-green-800',
    warn: 'bg-amber-100 text-amber-800',
    bad: 'bg-red-50 text-red-700',
    neutral: 'text-gray-300',
  }

  return (
    <SectionShell
      title="④ 獲得月コホート継続率"
      note="行=初投稿月（獲得コホート）、列=経過月。各セル=その経過月に再投稿したユーザー比。全体平均ではなくコホート別カーブで生存者バイアスを排する。M0 は定義上 100%。"
    >
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-medium px-2 py-1 sticky left-0 bg-white">コホート</th>
              <th className="text-right font-medium px-2 py-1">人数</th>
              {cols.map((m) => (
                <th key={m} className="text-right font-medium px-2 py-1">
                  M{m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.cohorts.map((c) => {
              const byM = new Map<number, number | null>()
              c.retention.forEach((p) => byM.set(p.m, p.rate))
              return (
                <tr key={c.cohort} className="border-t border-gray-100">
                  <td className="px-2 py-1 font-mono sticky left-0 bg-white">{c.cohort}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-gray-600">{c.size}</td>
                  {cols.map((m) => {
                    const rate = byM.has(m) ? byM.get(m)! : null
                    return (
                      <td
                        key={m}
                        className={`px-2 py-1 text-right tabular-nums ${cellBg[cellBand(rate)]}`}
                        title={rate == null ? '—' : pct(rate)}
                      >
                        {rate == null ? '·' : `${Math.round(rate * 100)}`}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        値は %（小数切り捨て）。空セル（·）は経過月が未到来。データ源: posts(user_id, created_at)。
      </p>
    </SectionShell>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 共通 UI
// ───────────────────────────────────────────────────────────────────────────
function SectionShell({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-800 text-base mb-0.5">{title}</h2>
      {note && <p className="text-xs text-gray-500 mb-3">{note}</p>}
      {children}
    </section>
  )
}

function KpiCard({
  band,
  tag,
  label,
  value,
  sub,
  def,
}: {
  band: Band
  tag: string
  label: string
  value: string
  sub?: string
  def: string
}) {
  return (
    <div className={`rounded-xl border p-4 ${BAND_STYLE[band]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{tag}</p>
      <p className="text-sm font-medium mt-0.5">{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs mt-0.5 opacity-80">{sub}</p>}
      <p className="text-[11px] mt-2 opacity-60 leading-snug">{def}</p>
    </div>
  )
}

function PairCard({
  title,
  quantityLabel,
  quantityValue,
  qualityLabel,
  qualityValue,
  band,
  extra,
  def,
}: {
  title: string
  quantityLabel: string
  quantityValue: string
  qualityLabel: string
  qualityValue: string
  band: Band
  extra?: string
  def: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="font-semibold text-gray-800 text-sm mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 p-2">
          <p className="text-[11px] text-gray-500">{quantityLabel}</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{quantityValue}</p>
        </div>
        <div className={`rounded-lg border p-2 ${BAND_STYLE[band]}`}>
          <p className="text-[11px] opacity-70">{qualityLabel}</p>
          <p className="text-lg font-bold tabular-nums">{qualityValue}</p>
        </div>
      </div>
      {extra && <p className="text-xs text-gray-500 mt-2">{extra}</p>}
      <p className="text-[11px] text-gray-400 mt-1 leading-snug">{def}</p>
    </div>
  )
}
