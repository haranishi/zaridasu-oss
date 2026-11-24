// REQ-117: Edge Function 全体の CORS ヘッダー smoke test
//
// 背景:
//   `_shared/cors.ts` は本リポジトリには存在せず、CORS ヘッダー定義は
//   各 Edge Function の index.ts にインライン展開されている (notify-comment /
//   notify-post-status / notify-survey-request / analyze-image / analyze-audio)。
//   将来的に共通化された場合の差分検出と、現状の整合性 (Allow-Origin /
//   Allow-Headers が同一文字列) の自動チェックを行う source-level smoke test。
//
// 実行: `deno test --allow-read --allow-env --allow-net supabase/functions/_shared/__tests__/cors.test.ts`

import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const FUNCTIONS_DIR = join(dirname(fromFileUrl(import.meta.url)), '..', '..')

const TARGETS = [
  'analyze-image',
  'analyze-audio',
  'notify-comment',
  'notify-post-status',
  'notify-survey-request',
] as const

const EXPECTED_ALLOW_ORIGIN = "'Access-Control-Allow-Origin': '*'"
const EXPECTED_ALLOW_HEADERS =
  "'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'"

async function readSource(fn: string): Promise<string> {
  return await Deno.readTextFile(join(FUNCTIONS_DIR, fn, 'index.ts'))
}

Deno.test('FR-117-01: 全 Edge Function に CORS Allow-Origin: * が定義されている', async () => {
  for (const fn of TARGETS) {
    const src = await readSource(fn)
    assert(
      src.includes(EXPECTED_ALLOW_ORIGIN),
      `${fn}/index.ts に "${EXPECTED_ALLOW_ORIGIN}" が含まれていない`,
    )
  }
})

Deno.test('FR-117-01: 全 Edge Function に CORS Allow-Headers が同一定義されている', async () => {
  for (const fn of TARGETS) {
    const src = await readSource(fn)
    assert(
      src.includes(EXPECTED_ALLOW_HEADERS),
      `${fn}/index.ts に "${EXPECTED_ALLOW_HEADERS}" が含まれていない`,
    )
  }
})

Deno.test('FR-117-01: 全 Edge Function が OPTIONS プリフライトを処理している', async () => {
  for (const fn of TARGETS) {
    const src = await readSource(fn)
    assert(
      src.includes("req.method === 'OPTIONS'"),
      `${fn}/index.ts に OPTIONS 分岐が含まれていない`,
    )
  }
})

// FR-117-04 (analyze-image / analyze-audio の OPTIONS handler smoke) は
// それぞれ ../../analyze-image/index.test.ts (INV-02) と
// ../../analyze-audio/index.test.ts (INV-03) で既にカバー済。
// ここで index.ts を直接 import すると serve(handleRequest) の TCP listener
// (port 8000) が起動して leak / AddrInUse になるため、二重定義を避ける。
