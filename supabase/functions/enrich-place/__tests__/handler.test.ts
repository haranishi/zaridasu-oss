// REQ-231 (NFR-231-08 / AC-02 / AC-07): enrich-place ハンドラの早期パスの単体テスト。
//   外部 I/O（Supabase / 外部 API）に到達する前の分岐を検証する:
//     - kill switch（GEO_ENRICH_ENABLED=false）で skip
//     - 座標欠落 / 不正で skip（外部 API を叩かない）
//     - OPTIONS プリフライト
//     - webhook secret 不一致で 401
//   ※ キャッシュヒット時の外部非コール・冪等スキップは Supabase クライアントを要するため
//     本ファイルでは扱わず、ロジック単体（geocodeProvider / geocodeThrottle）の網羅で代替する。
//
// 実行: `deno test --allow-env --allow-net --allow-read \
//   --lock=supabase/functions/deno.lock --cached-only --no-check \
//   supabase/functions/enrich-place/__tests__/handler.test.ts`

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { handleRequest } from '../index.ts'

function postReq(body: unknown, secret?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof secret === 'string') headers['x-webhook-secret'] = secret
  return new Request('http://localhost/', { method: 'POST', headers, body: JSON.stringify(body) })
}

Deno.test('handler: OPTIONS は CORS プリフライトに 200 を返す', async () => {
  const res = await handleRequest(new Request('http://localhost/', { method: 'OPTIONS' }))
  assertEquals(res.status, 200)
  await res.body?.cancel()
})

Deno.test('handler: kill switch（GEO_ENRICH_ENABLED=false）で付与を skip する（AC-07）', async () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.set('GEO_ENRICH_ENABLED', 'false')
  try {
    const res = await handleRequest(postReq({ record: { id: 'x', lat: 39.7, lng: 140.1 } }))
    assertEquals(res.status, 200)
    const body = await res.json()
    assertEquals(body.skipped, 'enrich_disabled')
  } finally {
    Deno.env.delete('GEO_ENRICH_ENABLED')
  }
})

Deno.test('handler: 座標欠落は skip（外部 API を叩かない / NFR-231-04）', async () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.delete('GEO_ENRICH_ENABLED')
  const res = await handleRequest(postReq({ record: { id: 'x' } }))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.skipped, 'no_coords')
})

Deno.test('handler: lat/lng が NaN（不正）でも skip', async () => {
  Deno.env.delete('WEBHOOK_SECRET')
  Deno.env.delete('GEO_ENRICH_ENABLED')
  const res = await handleRequest(postReq({ record: { id: 'x', lat: 'abc', lng: 'def' } }))
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.skipped, 'no_coords')
})

Deno.test('handler: WEBHOOK_SECRET 設定済 + ヘッダー不一致 → 401', async () => {
  Deno.env.set('WEBHOOK_SECRET', 's3cr3t-abc')
  try {
    const res = await handleRequest(postReq({ record: { id: 'x', lat: 39.7, lng: 140.1 } }, 'wrong'))
    assertEquals(res.status, 401)
    await res.body?.cancel()
  } finally {
    Deno.env.delete('WEBHOOK_SECRET')
  }
})
