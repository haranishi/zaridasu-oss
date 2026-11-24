import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { assertTrustedMediaUrl, fetchTrustedMedia, readBodyWithLimit, UntrustedMediaUrlError } from '../mediaFetch.ts'
import { MediaTooLargeError } from '../aiSchema.ts'

const base = 'https://project.supabase.co'
const path = '/storage/v1/object/public/posts/a.jpg'
Deno.test('media URL: 許可ホスト・Storageパス・ローカル開発のみ許可', () => {
  for (const url of [base + path, base + '/storage/v1/render/image/public/posts/a.jpg', 'https://cdn.example.com' + path]) {
    assertEquals(assertTrustedMediaUrl(url, { supabaseUrl: base, allowedHosts: 'CDN.EXAMPLE.COM' }).href, url)
  }
  assertEquals(assertTrustedMediaUrl('http://localhost:54321' + path, { supabaseUrl: 'http://localhost:54321' }).protocol, 'http:')
  for (const url of [
    'http://project.supabase.co' + path, 'https://evil.example' + path,
    'https://user:pass@project.supabase.co' + path, base + '/rest/v1/posts',
    base + '/storage/v1/object/public/../public/a.jpg',
    base + '/storage/v1/object/public/%2e%2e/public/a.jpg',
    base + '/storage/v1/object/public/%252e%252e/a.jpg',
    'https://project.supabase.co:444' + path,
  ]) assertThrows(() => assertTrustedMediaUrl(url, { supabaseUrl: base }), UntrustedMediaUrlError)
})
Deno.test('media fetch: redirect:error を指定しリダイレクト応答も拒否', async () => {
  const before = Deno.env.get('SUPABASE_URL')
  Deno.env.set('SUPABASE_URL', base)
  try {
    let called = 0
    let seen: RequestInit | undefined
    const fetchImpl: typeof fetch = async (_url, init) => {
      called++
      // 模擬の中で assert すると、assertRejects が「何かが投げられた」だけで合格にして、失敗を吸収する。
      // 受け取った引数は外に取り出して、拒否の確認とは別に検査する。
      seen = init
      return new Response(null, { status: 302, headers: { location: base + path } })
    }
    await assertRejects(() => fetchTrustedMedia(base + path, { kind: 'image', maxBytes: 10, timeoutMs: 100, fetchImpl }))
    assertEquals(seen?.redirect, 'error')
    assertEquals(seen?.signal instanceof AbortSignal, true)
    await assertRejects(() => fetchTrustedMedia('https://evil.example' + path, { kind: 'image', maxBytes: 10, timeoutMs: 100, fetchImpl }), UntrustedMediaUrlError)
    assertEquals(called, 1)
  } finally {
    if (before === undefined) Deno.env.delete('SUPABASE_URL'); else Deno.env.set('SUPABASE_URL', before)
  }
})
Deno.test('media body: Content-Length 超過では本文を読まずキャンセル', async () => {
  let reads = 0; let canceled = false
  const body = new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(new Uint8Array(8)) }, cancel() { canceled = true } }, { highWaterMark: 0 })
  await assertRejects(() => readBodyWithLimit(new Response(body, { headers: { 'Content-Length': '20' } }), 10, 'image'), MediaTooLargeError)
  assertEquals(reads, 0); assertEquals(canceled, true)
})
Deno.test('media body: 長さ不明でも超過チャンクで即中止', async () => {
  let reads = 0; let canceled = false
  const body = new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(new Uint8Array(8)) }, cancel() { canceled = true } }, { highWaterMark: 0 })
  await assertRejects(() => readBodyWithLimit(new Response(body), 10, 'audio'), MediaTooLargeError)
  assertEquals(reads, 2); assertEquals(canceled, true)
  assertEquals(await readBodyWithLimit(new Response(new Uint8Array([1, 2])), 2, 'image'), new Uint8Array([1, 2]))
})
