'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { logError } from '@/lib/errorHandler'

// REQ-175: 介入評価ダッシュボード。get_experiment_metrics(admin-only) から
// 群（control/treatment）× 期間（pre/post）の4指標を取得し、群間比較・DID を表示する。

interface MetricCell {
  variant: string
  period: 'pre' | 'post'
  post_count: number
  n_users: number
  photo_rate: number
  gps_rate: number
  accuracy_median: number | null
  repeat_rate: number
}

// 4指標の定義（独立追跡。トレードオフ検出のため個別カードで表示）
const METRICS: { key: keyof MetricCell; label: string; pct?: boolean }[] = [
  { key: 'post_count', label: '投稿数' },
  { key: 'gps_rate', label: '位置精度（GPS率）', pct: true },
  { key: 'photo_rate', label: '写真添付率', pct: true },
  { key: 'repeat_rate', label: 'リピート投稿率', pct: true },
]

function fmt(v: number | null | undefined, pct?: boolean): string {
  if (v == null) return '—'
  return pct ? `${(v * 100).toFixed(1)}%` : String(v)
}

function cell(cells: MetricCell[], variant: string, period: 'pre' | 'post'): MetricCell | undefined {
  return cells.find((c) => c.variant === variant && c.period === period)
}

export default function AdminExperimentsPage() {
  const [experimentKey, setExperimentKey] = useState('ai_feedback')
  const [cells, setCells] = useState<MetricCell[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_experiment_metrics', {
        p_experiment_key: experimentKey,
      })
      if (rpcError) throw rpcError
      // REQ-246: get_experiment_metrics は jsonb（Json）を返す。行形状は MetricCell[] に固定のため境界で狭める。
      setCells((data as unknown as MetricCell[]) ?? [])
    } catch (e) {
      logError(e instanceof Error ? e : new Error(String(e)), 'AdminExperimentsPage:load')
      setError('集計の取得に失敗しました。管理者権限を確認してください。')
      setCells(null)
    } finally {
      setLoading(false)
    }
  }, [experimentKey])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-gray-800 mb-1">🧪 実験計測（介入評価）</h1>
      <p className="text-sm text-gray-500 mb-4">
        群（control / treatment）× 期間（pre / post）で4指標を独立に比較します。pre/post は実験の開始日（started_at）を境に分割。
        効果は単純前後比較ではなく <strong>DID（差分の差分）</strong> で読み、サンプルが小さい場合は値の幅に留意してください。
      </p>

      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="exp-key" className="text-sm font-medium text-gray-700">実験キー</label>
        <select
          id="exp-key"
          value={experimentKey}
          onChange={(e) => setExperimentKey(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="ai_feedback">ai_feedback（REQ-170 AIフィードバック）</option>
          <option value="new_ranking">new_ranking（REQ-171 新ランキング）</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm rounded-lg bg-gray-800 text-white px-3 py-1.5 hover:bg-gray-700"
        >
          再集計
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">集計中…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {!loading && !error && cells && (
        cells.length === 0 ? (
          <p className="text-sm text-gray-500">この実験の割付付き投稿データがまだありません。</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {METRICS.map((m) => {
              const cTreatPost = cell(cells, 'treatment', 'post')?.[m.key] as number | null | undefined
              const cCtrlPost = cell(cells, 'control', 'post')?.[m.key] as number | null | undefined
              const cTreatPre = cell(cells, 'treatment', 'pre')?.[m.key] as number | null | undefined
              const cCtrlPre = cell(cells, 'control', 'pre')?.[m.key] as number | null | undefined
              // DID = (treatment_post - treatment_pre) - (control_post - control_pre)
              const did =
                cTreatPost != null && cTreatPre != null && cCtrlPost != null && cCtrlPre != null
                  ? cTreatPost - cTreatPre - (cCtrlPost - cCtrlPre)
                  : null
              return (
                <div key={String(m.key)} className="rounded-xl border border-gray-200 bg-white p-4">
                  <h2 className="font-semibold text-gray-800 text-sm mb-2">{m.label}</h2>
                  <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[20rem]">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left font-medium"></th>
                        <th className="text-right font-medium">pre</th>
                        <th className="text-right font-medium">post</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="text-gray-600 py-0.5">control</td>
                        <td className="text-right">{fmt(cCtrlPre, m.pct)}</td>
                        <td className="text-right">{fmt(cCtrlPost, m.pct)}</td>
                      </tr>
                      <tr>
                        <td className="text-gray-600 py-0.5">treatment</td>
                        <td className="text-right">{fmt(cTreatPre, m.pct)}</td>
                        <td className="text-right">{fmt(cTreatPost, m.pct)}</td>
                      </tr>
                    </tbody>
                  </table>
                  </div>
                  <p className="mt-2 text-xs text-gray-700">
                    DID: <strong>{did == null ? '—（pre/post 両群のデータ不足）' : fmt(did, m.pct)}</strong>
                  </p>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
