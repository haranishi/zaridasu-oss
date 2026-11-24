#!/usr/bin/env -S npx tsx
/**
 * REQ-075 FR-075-04: Gemini API コスト集計スクリプト
 *
 * 使い方:
 *   npx tsx scripts/calc-ai-cost.ts --period=30d [--group-by=day|function|model]
 *
 * 必須環境変数:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

interface Args {
  periodDays: number
  groupBy: 'day' | 'function' | 'model'
}

// 概算単価（USD / 1K tokens）。REQ-074 の目標比較のための概算で十分。
// REQ-282 D-6: 出典: https://ai.google.dev/gemini-api/docs/pricing（単価表更新日: 2026-07-18）。
// 料金改定時はこの表と更新日を同時に直すこと。未知モデルは下の estimateCost の
// フォールバック単価になり警告が出る（概算が黙って誤らないように）。
const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-flash-lite': { input: 0.0375, output: 0.15 },
  'gemini-3.1-flash-lite-preview': { input: 0.0375, output: 0.15 },
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
  const period = get('period') ?? '30d'
  const days = period.endsWith('d') ? Number(period.slice(0, -1)) : Number(period)
  const gb = (get('group-by') ?? 'day') as Args['groupBy']
  return { periodDays: days, groupBy: gb }
}

const warnedUnknownModels = new Set<string>()

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PER_1K[model]
  if (!p && !warnedUnknownModels.has(model)) {
    // REQ-282 D-6: 単価表に無いモデルはフォールバック単価での概算になる。集計が黙って
    // 誤らないよう1モデルにつき1回警告する（PRICE_PER_1K への追記を促す）。
    warnedUnknownModels.add(model)
    console.warn(`[calc-ai-cost] 単価表に無いモデル "${model}" — フォールバック単価(in $0.05 / out $0.20 per 1K)で概算します。PRICE_PER_1K に追記してください。`)
  }
  const price = p ?? { input: 0.05, output: 0.2 }
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output
}

async function main() {
  const args = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  const since = new Date(Date.now() - args.periodDays * 86400_000).toISOString()
  const { data, error } = await supabase
    .from('ai_call_logs')
    .select('created_at, function_name, model, input_tokens, output_tokens, status')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rows = data ?? []
  const totals = { calls: rows.length, inputTokens: 0, outputTokens: 0, cost: 0 }
  const grouped: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }> = {}

  for (const r of rows) {
    totals.inputTokens += r.input_tokens ?? 0
    totals.outputTokens += r.output_tokens ?? 0
    const cost = estimateCost(r.model, r.input_tokens ?? 0, r.output_tokens ?? 0)
    totals.cost += cost
    const key =
      args.groupBy === 'day'
        ? new Date(r.created_at).toISOString().slice(0, 10)
        : args.groupBy === 'function'
          ? r.function_name
          : r.model
    grouped[key] = grouped[key] ?? { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 }
    grouped[key].calls++
    grouped[key].inputTokens += r.input_tokens ?? 0
    grouped[key].outputTokens += r.output_tokens ?? 0
    grouped[key].cost += cost
  }

  console.log(`period: last ${args.periodDays} days`)
  console.log(`total calls: ${totals.calls}`)
  console.log(`total tokens: input=${totals.inputTokens} output=${totals.outputTokens}`)
  console.log(`estimated cost: $${totals.cost.toFixed(4)}`)
  console.log(`\nby ${args.groupBy}:`)
  for (const [k, v] of Object.entries(grouped).sort()) {
    console.log(`  ${k}: calls=${v.calls} cost=$${v.cost.toFixed(4)} tokens=${v.inputTokens}/${v.outputTokens}`)
  }

  console.log('\n--- JSON ---')
  console.log(JSON.stringify({ totals, grouped }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
