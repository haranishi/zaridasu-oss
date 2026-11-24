#!/usr/bin/env -S npx tsx
/**
 * REQ-075 FR-075-03: AI 判定評価スクリプト
 *
 * 使い方:
 *   npx tsx scripts/eval-ai-analysis.ts --target=audio --model=gemini-2.5-flash-lite [--limit=10] [--temperature=0]
 *   npx tsx scripts/eval-ai-analysis.ts --target=image --model=gemini-2.5-flash-lite
 *
 * 必須環境変数: GEMINI_API_KEY
 * 出力:
 *   - 標準出力: precision / recall / F1 / confusion matrix サマリー
 *   - reports/eval/eval-<timestamp>-<target>-<model>.json
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type Target = 'audio' | 'image'

interface Args {
  target: Target
  model: string
  limit?: number
  temperature: number
}

interface LabeledSample {
  file: string
  expectedClass: string
}

interface SampleResult {
  file: string
  expected: string
  predicted: string | null
  confidence: number | null
  error?: string
  latencyMs: number
  inputTokens?: number
  outputTokens?: number
}

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (k: string) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  const target = (get('target') ?? 'audio') as Target
  if (target !== 'audio' && target !== 'image') {
    throw new Error('--target は audio | image のいずれか')
  }
  return {
    target,
    model: get('model') ?? (target === 'audio' ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash-lite'),
    limit: get('limit') ? Number(get('limit')) : undefined,
    temperature: Number(get('temperature') ?? '0'),
  }
}

async function loadSamples(target: Target): Promise<LabeledSample[]> {
  const root = join(PROJECT_ROOT, 'tests', 'fixtures', target === 'audio' ? 'audio' : 'images')
  if (!existsSync(root)) return []
  const classes = await readdir(root, { withFileTypes: true })
  const samples: LabeledSample[] = []
  for (const cls of classes) {
    if (!cls.isDirectory()) continue
    const dir = join(root, cls.name)
    const files = await readdir(dir)
    for (const f of files) {
      if (f.startsWith('.')) continue
      samples.push({ file: join(dir, f), expectedClass: cls.name })
    }
  }
  return samples
}

async function geminiAnalyze(
  apiKey: string,
  model: string,
  target: Target,
  filePath: string,
  temperature: number,
): Promise<{ detected: string | null; confidence: number | null; inputTokens?: number; outputTokens?: number }> {
  const bytes = await readFile(filePath)
  const base64 = bytes.toString('base64')
  const mime =
    target === 'audio'
      ? filePath.endsWith('.mp3')
        ? 'audio/mpeg'
        : filePath.endsWith('.ogg')
          ? 'audio/ogg'
          : 'audio/webm'
      : filePath.endsWith('.png')
        ? 'image/png'
        : filePath.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg'

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const prompt =
    target === 'audio'
      ? 'この音声を bullfrog | native_frog | noise | unclear のいずれかで分類してください。以下の JSON のみ返答: {"detected_species":"...","confidence":0.0-1.0}'
      : 'この画像を bullfrog | american | native_frog | other のいずれかで分類してください。以下の JSON のみ返答: {"detected_species":"...","confidence":0.0-1.0}'

  const body = {
    contents: [
      { parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] },
    ],
    generationConfig: { responseMimeType: 'application/json', temperature },
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  const parsed = JSON.parse(cleaned) as { detected_species?: string; confidence?: number }
  return {
    detected: parsed.detected_species ?? null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
  }
}

function computeMetrics(results: SampleResult[]): {
  overall: { accuracy: number; macro_f1: number }
  perClass: Record<string, { precision: number; recall: number; f1: number; support: number }>
  confusion: Record<string, Record<string, number>>
} {
  const valid = results.filter((r) => !r.error && r.predicted)
  const classes = Array.from(new Set(valid.flatMap((r) => [r.expected, r.predicted!])))
  const confusion: Record<string, Record<string, number>> = {}
  for (const c of classes) {
    confusion[c] = {}
    for (const c2 of classes) confusion[c][c2] = 0
  }
  for (const r of valid) {
    const predicted = r.predicted
    if (!predicted) continue
    const row = confusion[r.expected] ?? (confusion[r.expected] = {})
    row[predicted] = (row[predicted] ?? 0) + 1
  }

  const perClass: Record<string, { precision: number; recall: number; f1: number; support: number }> = {}
  for (const c of classes) {
    const tp = confusion[c]?.[c] ?? 0
    const fp = classes.reduce((s, c2) => (c2 === c ? s : s + (confusion[c2]?.[c] ?? 0)), 0)
    const fn = classes.reduce((s, c2) => (c2 === c ? s : s + (confusion[c]?.[c2] ?? 0)), 0)
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn)
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
    perClass[c] = { precision, recall, f1, support: tp + fn }
  }
  const correct = valid.filter((r) => r.predicted === r.expected).length
  const accuracy = valid.length === 0 ? 0 : correct / valid.length
  const macro_f1 = classes.length === 0
    ? 0
    : classes.reduce((s, c) => s + (perClass[c]?.f1 ?? 0), 0) / classes.length
  return { overall: { accuracy, macro_f1 }, perClass, confusion }
}

async function main() {
  const args = parseArgs()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('環境変数 GEMINI_API_KEY が未設定です')
    process.exit(1)
  }

  const samples = (await loadSamples(args.target)).slice(0, args.limit)
  if (samples.length === 0) {
    console.error(`フィクスチャが見つかりません: tests/fixtures/${args.target === 'audio' ? 'audio' : 'images'}/`)
    process.exit(1)
  }

  console.log(`[eval] target=${args.target} model=${args.model} samples=${samples.length}`)
  const results: SampleResult[] = []
  for (const s of samples) {
    const start = Date.now()
    try {
      const out = await geminiAnalyze(apiKey, args.model, args.target, s.file, args.temperature)
      results.push({
        file: s.file,
        expected: s.expectedClass,
        predicted: out.detected,
        confidence: out.confidence,
        latencyMs: Date.now() - start,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
      })
    } catch (e) {
      results.push({
        file: s.file,
        expected: s.expectedClass,
        predicted: null,
        confidence: null,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - start,
      })
    }
  }

  const metrics = computeMetrics(results)
  const errorsCount = results.filter((r) => r.error).length
  const totalInput = results.reduce((s, r) => s + (r.inputTokens ?? 0), 0)
  const totalOutput = results.reduce((s, r) => s + (r.outputTokens ?? 0), 0)

  console.log('\n=== summary ===')
  console.log(`accuracy: ${metrics.overall.accuracy.toFixed(3)}`)
  console.log(`macro F1: ${metrics.overall.macro_f1.toFixed(3)}`)
  console.log(`errors: ${errorsCount}/${results.length}`)
  console.log(`tokens: input=${totalInput} output=${totalOutput}`)
  console.log('per-class:')
  for (const [cls, m] of Object.entries(metrics.perClass)) {
    console.log(`  ${cls}: precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} f1=${m.f1.toFixed(3)} support=${m.support}`)
  }
  console.log('confusion:', metrics.confusion)

  const reportsDir = join(PROJECT_ROOT, 'reports', 'eval')
  await mkdir(reportsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outfile = join(reportsDir, `eval-${ts}-${args.target}-${args.model}.json`)
  await writeFile(
    outfile,
    JSON.stringify(
      {
        target: args.target,
        model: args.model,
        timestamp: new Date().toISOString(),
        sample_count: samples.length,
        errors_count: errorsCount,
        metrics,
        results,
        token_totals: { input: totalInput, output: totalOutput },
      },
      null,
      2,
    ),
  )
  console.log(`\nwritten: ${outfile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
