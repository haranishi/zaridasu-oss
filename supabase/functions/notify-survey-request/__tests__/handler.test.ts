// REQ-117 / FR-117-03: notify-survey-request Edge Function の smoke test
//
// notify-survey-request は `serve(async (req) => …)` を直接呼び出して
// ハンドラを export していないため、本テストでは source-level smoke check を行う:
//   - 4 種の event_type 分岐 (request_created / request_responded /
//     request_closed / comment_created) を処理する
//   - opt-out (notify_survey_request=false) を尊重する
//   - 起点ユーザーは自己通知から除外する
//   - 不正ペイロード / 未知 event_type を 400 で拒否する
//   - RESEND_API_KEY 未設定時は fail-soft
//   - escapeHtml で XSS 対策
//
// 実行: `deno test --allow-read supabase/functions/notify-survey-request/__tests__/handler.test.ts`

import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const SRC_PATH = join(dirname(fromFileUrl(import.meta.url)), '..', 'index.ts')
const src = await Deno.readTextFile(SRC_PATH)

Deno.test('notify-survey-request: std/http/server を import している', () => {
  assert(
    /from\s+['"]https:\/\/deno\.land\/std@[^'"]+\/http\/server\.ts['"]/.test(src),
  )
})

// REQ-287 FR-287-01: service-role クライアントの生成は _shared/supabaseAdmin.ts へ集約した。
// 各関数は supabase-js を直接 import せず、共有ヘルパーを経由する。
Deno.test('notify-survey-request: 共有の service-role ヘルパーを import している', () => {
  assert(
    /from\s+['"]\.\.\/_shared\/supabaseAdmin\.ts['"]/.test(src),
    '_shared/supabaseAdmin.ts の import が壊れている',
  )
})

Deno.test('notify-survey-request: CORS / OPTIONS プリフライト分岐が残っている', () => {
  assert(src.includes("'Access-Control-Allow-Origin': '*'"))
  assert(src.includes("req.method === 'OPTIONS'"))
})

Deno.test('notify-survey-request: service-role キーを直接読まず createServiceClient を使う', () => {
  assert(src.includes('createServiceClient()'), 'createServiceClient() を使っていない')
  assert(
    !src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    'service-role キーの直接参照が残っている（REQ-287 FR-287-01）',
  )
})

Deno.test('notify-survey-request: 4 種の event_type を全て処理する', () => {
  for (const ev of ['request_created', 'request_responded', 'request_closed', 'comment_created']) {
    assert(src.includes(`'${ev}'`), `event_type "${ev}" の分岐が見当たらない`)
  }
})

Deno.test('notify-survey-request: 不正ペイロードは 400 invalid_payload', () => {
  assert(src.includes('invalid_payload'))
  assert(src.includes(', 400)'))
})

Deno.test('notify-survey-request: 未知 event_type を 400 unknown_event_type で拒否', () => {
  assert(src.includes('unknown_event_type'))
})

Deno.test('notify-survey-request: opt-out (notify_survey_request=false) を尊重する', () => {
  assert(src.includes('notify_survey_request'))
  assert(src.includes('opt_out') || src.includes('=== false'))
})

Deno.test('notify-survey-request: 起点ユーザーは自己通知から除外される', () => {
  // request_created: starting user の除外 .neq('id', request.user_id)
  // comment_created: initiatorId の delete()
  assert(src.includes("userIds.delete(initiatorId)") || src.includes('initiatorId'))
})

Deno.test('notify-survey-request: RESEND_API_KEY 未設定時は fail-soft でスキップ', () => {
  assert(src.includes("Deno.env.get('RESEND_API_KEY')"))
  assert(src.includes('no_resend_key'))
})

Deno.test('notify-survey-request: 送信先は Resend API', () => {
  assert(src.includes('https://api.resend.com/emails'))
})

Deno.test('notify-survey-request: escapeHtml による XSS 対策がある', () => {
  assert(/escapeHtml\s*=/.test(src))
  assert(src.includes("'&amp;'"))
})

Deno.test('notify-survey-request: 個別送信失敗は continue (fail-soft)', () => {
  // try/catch 内で個別 send を回しているか確認
  assert(src.includes('send failed') || src.includes('catch (e)'))
})
