// REQ-117 / REQ-287 FR-287-01: service-role クライアント生成の source-level テスト
//
// 背景（REQ-287）:
//   以前は各 Edge Function が
//     createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
//   をインライン呼び出ししており、本テストは「全関数が SERVICE_ROLE_KEY を読んでいること」を
//   検査していた。2026-07-29 に生成点を `_shared/supabaseAdmin.ts` へ集約したため、
//   不変条件を「**直接参照していないこと**＋共有ヘルパーを使っていること」へ反転させる。
//
//   旧テストは対象関数を 6 本ハードコードしていた（analyze-image / analyze-audio /
//   notify-comment / notify-post-status / notify-survey-request / notify-gemini-key-failure）。
//   これは check-edge-deploy-lag.sh の DEFAULT_TARGETS と同じ「固定リストが陳腐化する」問題を
//   抱えていた（実際、後から追加された 8 本は検査対象に入っていなかった）ため、本改訂で
//   **supabase/functions/ からの自動導出** に変える。
//
// 実行: `deno test --allow-read supabase/functions/_shared/__tests__/supabaseAdmin.test.ts`

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const FUNCTIONS_DIR = join(dirname(fromFileUrl(import.meta.url)), '..', '..')

/** supabase/functions/ 配下の Edge Function 名を自動導出する（_shared 等は除外）。 */
async function discoverFunctions(): Promise<string[]> {
  const names: string[] = []
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (!entry.isDirectory) continue
    if (entry.name.startsWith('_')) continue
    try {
      const stat = await Deno.stat(join(FUNCTIONS_DIR, entry.name, 'index.ts'))
      if (stat.isFile) names.push(entry.name)
    } catch {
      // index.ts が無いディレクトリは Edge Function ではない
    }
  }
  return names.sort()
}

async function readSource(fn: string): Promise<string> {
  return await Deno.readTextFile(join(FUNCTIONS_DIR, fn, 'index.ts'))
}

/**
 * service-role クライアントを必要としない関数。
 * health-gemini は anon key + JWT 検証のみで DB 書き込みを行わない。
 */
const NO_SERVICE_ROLE = new Set(['health-gemini'])

Deno.test('FR-287-01: どの Edge Function も SERVICE_ROLE / SECRET キーを直接読まない', async () => {
  for (const fn of await discoverFunctions()) {
    const src = await readSource(fn)
    // コメント中の言及は許容し、実際の env 読み出しのみを禁止する。
    const direct = src.match(
      /Deno\.env\.get\(\s*['"](?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)['"]\s*\)/g,
    )
    assertEquals(
      direct,
      null,
      `${fn}/index.ts が service-role キーを直接読み出している。` +
        `_shared/supabaseAdmin.ts の createServiceClient() を使うこと`,
    )
  }
})

Deno.test('FR-287-01: service-role が要る関数は createServiceClient を使う', async () => {
  for (const fn of await discoverFunctions()) {
    if (NO_SERVICE_ROLE.has(fn)) continue
    const src = await readSource(fn)
    assert(
      src.includes('createServiceClient'),
      `${fn}/index.ts が createServiceClient を使っていない`,
    )
    assert(
      /from\s+['"]\.\.\/_shared\/(supabaseAdmin|mailer)\.ts['"]/.test(src),
      `${fn}/index.ts が _shared/supabaseAdmin.ts（もしくは再エクスポート元の mailer.ts）から import していない`,
    )
  }
})

Deno.test('FR-287-01: 共有ヘルパーは新方式キーを優先しレガシーへフォールバックする', async () => {
  const src = await Deno.readTextFile(join(FUNCTIONS_DIR, '_shared', 'supabaseAdmin.ts'))
  assert(
    src.includes("Deno.env.get('SUPABASE_SECRET_KEY')"),
    'supabaseAdmin.ts が新方式 SUPABASE_SECRET_KEY を読んでいない',
  )
  assert(
    src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    'supabaseAdmin.ts がレガシー SUPABASE_SERVICE_ROLE_KEY へフォールバックしていない',
  )
  // 優先順位: SECRET が先に評価されること
  assert(
    src.indexOf("const secret = Deno.env.get('SUPABASE_SECRET_KEY')") <
      src.indexOf("const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    'SUPABASE_SECRET_KEY はレガシーより先に評価されるべき',
  )
})

Deno.test('FR-287-01: mailer.ts は独自実装を持たず supabaseAdmin へ委譲する', async () => {
  const src = await Deno.readTextFile(join(FUNCTIONS_DIR, '_shared', 'mailer.ts'))
  assert(
    /export\s*\{\s*createServiceClient\s*\}\s*from\s*['"]\.\/supabaseAdmin\.ts['"]/.test(src),
    'mailer.ts は supabaseAdmin.ts から createServiceClient を再エクスポートすべき',
  )
  assertEquals(
    src.match(/Deno\.env\.get\(\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\)/g),
    null,
    'mailer.ts に service-role キーの直接参照が残っている',
  )
})

// notify-comment は呼び出し元ユーザーの認証に anon client を使用する仕様（REQ-024 系）
Deno.test('FR-117-02: notify-comment は呼び出し元検証に anon key を併用している', async () => {
  const src = await readSource('notify-comment')
  assert(
    src.includes("Deno.env.get('SUPABASE_ANON_KEY')"),
    'notify-comment は呼び出し元の getUser() 用に anon key を読み込むべき',
  )
})

Deno.test('FR-287-01: 自動導出が機能している（関数を1本以上検出できる）', async () => {
  const fns = await discoverFunctions()
  assert(fns.length >= 10, `検出した Edge Function が少なすぎる: ${fns.length} 本`)
  assert(!fns.includes('_shared'), '_shared を Edge Function として拾っている')
})
