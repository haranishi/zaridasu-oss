// REQ-117 / FR-117-03: notify-comment Edge Function の smoke test
//
// handleRequest を直接呼ぶ通知の回帰試験は claims.test.ts に置く。
// 本ファイルは依存・認証・エスケープ等のソース検査を継続する。
//
// 実行: `deno test --allow-read supabase/functions/notify-comment/__tests__/handler.test.ts`

import { assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { dirname, fromFileUrl, join } from 'https://deno.land/std@0.168.0/path/mod.ts'

const SRC_PATH = join(dirname(fromFileUrl(import.meta.url)), '..', 'index.ts')
const src = await Deno.readTextFile(SRC_PATH)

Deno.test('notify-comment: std/http/server を import している', () => {
  assert(
    /from\s+['"]https:\/\/deno\.land\/std@[^'"]+\/http\/server\.ts['"]/.test(src),
    'std/http/server.ts の import が壊れている',
  )
})

// notify-comment は呼び出し元検証用の anon クライアントを自前で作るため supabase-js を
// 直接 import する。service-role 側は _shared/supabaseAdmin.ts へ集約済み（REQ-287 FR-287-01）。
Deno.test('notify-comment: supabase-js を import している（anon クライアント用）', () => {
  assert(
    /from\s+['"]https:\/\/esm\.sh\/@supabase\/supabase-js@2['"]/.test(src),
    'supabase-js v2 の import が壊れている',
  )
})

Deno.test('notify-comment: CORS Allow-Origin / Allow-Headers が定義されている', () => {
  assert(src.includes("'Access-Control-Allow-Origin': '*'"))
  assert(
    src.includes(
      "'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'",
    ),
  )
})

Deno.test('notify-comment: OPTIONS プリフライトを処理している', () => {
  assert(src.includes("req.method === 'OPTIONS'"))
})

Deno.test('notify-comment: Authorization ヘッダー必須チェックが残っている', () => {
  assert(src.includes("req.headers.get('Authorization')"), 'Authorization ヘッダーチェックが消えている')
  assert(src.includes('Unauthorized'), '401 Unauthorized レスポンスが消えている')
})

Deno.test('notify-comment: service-role は共有ヘルパー・anon は直読みで併用している', () => {
  assert(src.includes('createServiceClient()'), 'service-role に createServiceClient() を使っていない')
  assert(
    !src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"),
    'service-role キーの直接参照が残っている（REQ-287 FR-287-01）',
  )
  assert(src.includes("Deno.env.get('SUPABASE_ANON_KEY')"), 'anon key の読み出しが無い')
})

Deno.test('notify-comment: 自分の投稿へのコメントは通知しない (own post スキップ)', () => {
  assert(src.includes("'own post'") || src.includes('own post'))
})

// REQ-132 Phase 1: payload は comment_id のみを信用し、本文は DB から再取得する。
Deno.test('notify-comment: REQ-132 Phase 1: comment_id を必須化し payload を信用しない', () => {
  // comment_id を req.body から読む
  assert(src.includes('comment_id'), 'comment_id の取り出しが消えている')
  // 不正 payload は 400 を返す
  assert(src.includes('invalid_payload'), 'invalid_payload 分岐が消えている')
  // comments テーブルから content を再取得
  assert(/\.from\(['"]comments['"]\)/.test(src), 'comments テーブルの再取得が消えている')
  // callerUser.id と comment.user_id を比較する
  assert(src.includes('comment.user_id !== callerUser.id'), 'caller / owner 一致チェックが消えている')
  // 存在しなければ skip not_found
  assert(src.includes('not_found'), 'not_found skip が消えている')
})

Deno.test('notify-comment: Resend API のエンドポイントが正しい', () => {
  assert(
    src.includes('https://api.resend.com/emails'),
    'Resend のエンドポイントが変わっている可能性',
  )
})

Deno.test('notify-comment: HTML エスケープ関数が定義されている (XSS 対策)', () => {
  assert(/escapeHtml\s*=/.test(src), 'escapeHtml が見つからない')
  assert(src.includes("'&amp;'"), 'HTML エスケープに & 変換が含まれていない')
})
