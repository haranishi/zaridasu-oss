// REQ-117 / FR-117-03: notify-post-status Edge Function の smoke test
//
// notify-post-status は `serve(async (req) => …)` を直接呼び出してハンドラを
// export していない。本テストでは source-level smoke check として以下を確認する:
//   - DB Webhook ペイロード (record / old_record) を扱う
//   - approved / rejected 以外はスキップする
//   - 匿名投稿 (user_id 無し) はスキップする
//   - RESEND_API_KEY 未設定時は fail-soft でスキップ
//   - escapeHtml で XSS 対策
//   - 承認方法 (auto/管理者) を表示
//
// 実行: `deno test --allow-read supabase/functions/notify-post-status/__tests__/handler.test.ts`

import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const SRC_PATH = join(dirname(fromFileUrl(import.meta.url)), '..', 'index.ts')
const src = await Deno.readTextFile(SRC_PATH)

Deno.test('notify-post-status: std/http/server を import している', () => {
  assert(
    /from\s+['"]https:\/\/deno\.land\/std@[^'"]+\/http\/server\.ts['"]/.test(src),
  )
})

// REQ-287 FR-287-01: service-role クライアントの生成は _shared/supabaseAdmin.ts へ集約した。
// 各関数は supabase-js を直接 import せず、共有ヘルパーを経由する。
Deno.test('notify-post-status: 共有の service-role ヘルパーを import している', () => {
  assert(
    /from\s+['"]\.\.\/_shared\/supabaseAdmin\.ts['"]/.test(src),
    '_shared/supabaseAdmin.ts の import が壊れている',
  )
})

Deno.test('notify-post-status: CORS / OPTIONS プリフライト分岐が残っている', () => {
  assert(src.includes("'Access-Control-Allow-Origin': '*'"))
  assert(src.includes("req.method === 'OPTIONS'"))
})

Deno.test('notify-post-status: service-role キーを直接読まず createServiceClient を使う', () => {
  assert(src.includes('createServiceClient()'), 'createServiceClient() を使っていない')
  assert(
    !src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    'service-role キーの直接参照が残っている（REQ-287 FR-287-01）',
  )
})

Deno.test('notify-post-status: status 変化なしのスキップ分岐がある', () => {
  assert(src.includes("'no_status_change'") || src.includes('no_status_change'))
  // REQ-131 Phase 1: payload.record は信用しないため payloadRecord 変数名に rename したが
  // status 変化判定自体は残っている。
  assert(/\.status\s*===\s*old_record\.status/.test(src))
})

// REQ-131 Phase 1: webhook secret 検証と payload.record 非信用化が入っていることを確認
Deno.test('notify-post-status: REQ-131 webhook secret 検証が handler 冒頭にある', () => {
  assert(src.includes('requireWebhookSecret'), 'requireWebhookSecret を呼んでいない')
  assert(src.includes("'unauthorized'") || src.includes('unauthorized'), '401 unauthorized レスポンスが消えている')
})

Deno.test('notify-post-status: REQ-131 payload.record を信用せず posts から再 fetch する', () => {
  // payload からは id のみ受領、posts テーブルを SELECT し直す
  assert(/\.from\(['"]posts['"]\)/.test(src), 'posts テーブルの再 fetch が消えている')
  assert(src.includes("'not_found'") || src.includes('not_found'), 'not_found skip が無い')
})

Deno.test('notify-post-status: approved / rejected 以外はスキップ', () => {
  assert(src.includes("'approved'"))
  assert(src.includes("'rejected'"))
  assert(src.includes('irrelevant_status'))
})

Deno.test('notify-post-status: 匿名投稿 (user_id 無し) スキップ分岐がある', () => {
  assert(src.includes('anonymous_post'))
})

Deno.test('notify-post-status: RESEND_API_KEY 未設定時は fail-soft', () => {
  assert(src.includes("Deno.env.get('RESEND_API_KEY')"))
  assert(src.includes('no_resend_key'))
})

Deno.test('notify-post-status: メール送信先は Resend API', () => {
  assert(src.includes('https://api.resend.com/emails'))
})

Deno.test('notify-post-status: escapeHtml による XSS 対策がある', () => {
  assert(/escapeHtml\s*=/.test(src))
  assert(src.includes("'&amp;'"))
})

Deno.test('notify-post-status: 承認方法 (auto/管理者) を切り替えるロジックがある', () => {
  assert(src.includes('auto_approved'))
})
