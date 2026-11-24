// REQ-117 / FR-117-03: analyze-audio Edge Function の補足 smoke test
//
// メインの handler 単体テストは `analyze-audio/index.test.ts` (REQ-072/073) にあり、
// CORS / no_audio / no_api_key / combineDecision の 8 パターンを既にカバーしている。
//
// 本ファイルは `_shared/` の import path 整合性を CI で素早く検出するための
// 静的 smoke test。`../_shared/aiCache.ts` などのパスが壊れた場合に CI が落ちる。
//
// 実行: `deno test --allow-read --allow-env --allow-net supabase/functions/analyze-audio/__tests__/handler.test.ts`

import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const SRC_PATH = join(dirname(fromFileUrl(import.meta.url)), '..', 'index.ts')
const src = await Deno.readTextFile(SRC_PATH)

Deno.test('analyze-audio: _shared モジュールへの相対 import が壊れていない', () => {
  for (const m of ['aiLogging', 'aiDedup', 'aiRateLimit', 'aiCache']) {
    const re = new RegExp(`from\\s+['"]\\.\\./_shared/${m}\\.ts['"]`)
    assert(re.test(src), `../_shared/${m}.ts への import が壊れている`)
  }
})

Deno.test('analyze-audio: handleRequest と combineDecision を export している', () => {
  assert(/export\s+async\s+function\s+handleRequest/.test(src))
  assert(/export\s+function\s+combineDecision/.test(src))
})

Deno.test('analyze-audio: serve(handleRequest) で handler を登録している', () => {
  assert(src.includes('serve(handleRequest)'))
})

// no_audio スキップの実 handler smoke は ../index.test.ts (INV-01) でカバー済。
// ここで index.ts を import すると serve(handleRequest) の TCP listener
// (port 8000) が起動して leak / AddrInUse になるため重複定義しない。
