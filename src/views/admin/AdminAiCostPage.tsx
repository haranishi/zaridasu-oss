'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

// REQ-075 Phase 0: AI 判定 API コスト/呼び出し状況のダッシュボード。
// get_ai_cost_summary RPC (admin-only) から 30/90 日集計を取得する。

// 概算単価（USD / 1K tokens）— Edge Function 側で厳密に保存するわけではないので概算で十分。
const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },
  'gemini-2.5-flash-lite': { input: 0.0375, output: 0.15 },
  'gemini-3.1-flash-lite-preview': { input: 0.0375, output: 0.15 },
}
const DEFAULT_PRICE = { input: 0.05, output: 0.2 }

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_1K[model] ?? DEFAULT_PRICE
  return (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output
}

interface CostSummary {
  period_days: number
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  by_function: Record<string, { calls: number; input_tokens: number; output_tokens: number }> | null
  by_model: Record<string, { calls: number; input_tokens: number; output_tokens: number }> | null
  daily: { date: string; calls: number; input_tokens: number; output_tokens: number }[]
}

export default function AdminAiCostPage() {
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error: err } = await supabase.rpc('get_ai_cost_summary', { p_days: periodDays })
        if (cancelled) return
        if (err) setError(err.message)
        // REQ-246: get_ai_cost_summary は jsonb（Json）を返す。集計形状は CostSummary に固定のため境界で狭める。
        else setSummary(data as unknown as CostSummary)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [periodDays])

  const totalCost = summary
    ? Object.entries(summary.by_model ?? {}).reduce(
        (sum, [model, v]) => sum + estimateCost(model, v.input_tokens, v.output_tokens),
        0,
      )
    : 0
  const maxDaily = summary?.daily.reduce((m, d) => Math.max(m, d.calls), 0) ?? 0

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI 判定コスト</h1>
          <p className="text-sm text-gray-400 mt-0.5">直近 {periodDays} 日間の Gemini API 利用状況</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodDays(d)}
              className={`text-sm px-3 py-1 rounded border ${
                periodDays === d
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              aria-pressed={periodDays === d}
            >
              {d}日
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">エラー: {error}</p>}

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="呼び出し数" value={summary.total_calls.toLocaleString()} />
            <KpiCard label="推定コスト (USD)" value={`$${totalCost.toFixed(4)}`} />
            <KpiCard
              label="入力/出力トークン"
              value={`${summary.total_input_tokens.toLocaleString()} / ${summary.total_output_tokens.toLocaleString()}`}
            />
          </div>

          <section aria-labelledby="daily-heading" className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 id="daily-heading" className="text-base font-semibold text-gray-800 mb-3">
              日次呼び出し回数
            </h2>
            <DailyBars daily={summary.daily} max={maxDaily} />
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BreakdownTable title="Function 別" data={summary.by_function} />
            <BreakdownTable title="Model 別" data={summary.by_model} showCost />
          </section>
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

function DailyBars({
  daily,
  max,
}: {
  daily: CostSummary['daily']
  max: number
}) {
  if (daily.length === 0) return <p className="text-sm text-gray-400">データなし</p>
  return (
    <ul className="flex items-end gap-1 h-32" role="list" aria-label="日次呼び出し回数">
      {daily.map((d) => {
        const h = max === 0 ? 0 : Math.max(2, Math.round((d.calls / max) * 120))
        return (
          <li
            key={d.date}
            className="flex-1 bg-blue-500/70 hover:bg-blue-600 rounded-t"
            style={{ height: `${h}px` }}
            title={`${d.date}: ${d.calls} 件 (in:${d.input_tokens} / out:${d.output_tokens})`}
            aria-label={`${d.date}: ${d.calls} 件`}
          />
        )
      })}
    </ul>
  )
}

function BreakdownTable({
  title,
  data,
  showCost = false,
}: {
  title: string
  data: Record<string, { calls: number; input_tokens: number; output_tokens: number }> | null
  showCost?: boolean
}) {
  const entries = Object.entries(data ?? {})
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-base font-semibold text-gray-800 mb-3">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">データなし</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[24rem]">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1">名称</th>
              <th className="py-1 text-right">呼出</th>
              <th className="py-1 text-right">入力</th>
              <th className="py-1 text-right">出力</th>
              {showCost && <th className="py-1 text-right">推定$</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v]) => (
              <tr key={k} className="border-t border-gray-100">
                <td className="py-1 font-mono text-xs">{k}</td>
                <td className="py-1 text-right tabular-nums">{v.calls.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{v.input_tokens.toLocaleString()}</td>
                <td className="py-1 text-right tabular-nums">{v.output_tokens.toLocaleString()}</td>
                {showCost && (
                  <td className="py-1 text-right tabular-nums">
                    ${estimateCost(k, v.input_tokens, v.output_tokens).toFixed(4)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}
