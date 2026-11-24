import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { accessCookie, validateAccessCookie, previewGate, protectResponse, previewFetch, replaceSessionCookies } from '../../cloudflare/preview/security.mjs'

const secret = randomBytes(32).toString('base64url')
const env = { PREVIEW_ACCESS_SECRET: secret, PREVIEW_APP_ORIGIN: 'https://preview.example.invalid' }
const req = (path, init) => new Request(new URL(path, env.PREVIEW_APP_ORIGIN), init)

test('preview gate authorizes a fresh signed cookie and rejects forgery, expiry and duplicate cookies', async () => {
  const cookie = await accessCookie(secret, 1_800_000_000)
  assert.equal(await validateAccessCookie(cookie, secret, 1_800_000_001), true)
  assert.equal(await validateAccessCookie(cookie, secret, 1_800_000_000 + 8 * 3600 + 1), false)
  assert.equal(await validateAccessCookie(cookie + 'forged', secret, 1_800_000_001), false)
  assert.equal(await validateAccessCookie(cookie, secret + 'wrong', 1_800_000_001), false)
  const valid = await accessCookie(secret)
  assert.equal(await previewGate(req('/_next/static/main.js', { headers: { cookie: valid } }), env), null)
  for (const path of ['/', '/api/og', '/_next/static/main.js', '/images/a.jpg', '/wasm/water_geometry.wasm', '/sw.js', '/robots.txt']) {
    const denied = await previewGate(req(path), env)
    assert.equal(denied.status, 401, path)
    assert.match(denied.headers.get('cache-control'), /private.*no-store/)
  }
  assert.equal((await previewGate(req('/', { headers: { cookie: valid + '; ' + valid } }), env)).status, 401)
})

test('preview gate ignores spoofed identity/self headers and requires exact framework token for HEAD ISR only', async () => {
  const selfToken = randomBytes(32).toString('hex')
  for (const headers of [{ 'cf-access-authenticated-user-email': 'owner@example.invalid' },
    { 'cf-connecting-ip': '127.0.0.1', 'x-forwarded-for': '127.0.0.1' },
    { 'x-isr': '1', 'x-prerender-revalidate': 'forged' }]) {
    assert.equal((await previewGate(req('/area', { method: 'HEAD', headers }), env, selfToken)).status, 401)
  }
  const headers = { 'x-isr': '1', 'x-prerender-revalidate': selfToken }
  assert.equal(await previewGate(req('/area', { method: 'HEAD', headers }), env, selfToken), null)
  assert.equal((await previewGate(req('/area', { headers }), env, selfToken)).status, 401)
  assert.equal((await previewGate(req('/area', { method: 'HEAD', headers }), env)).status, 401)
  assert.equal((await previewGate(req('/area', { headers: { cookie: await accessCookie(secret) } }), { ...env, PREVIEW_ACCESS_SECRET: '' })).status, 503)
})

test('preview login is bounded, origin checked and issues a Secure HttpOnly host cookie without reflecting the credential', async () => {
  const login = (body, origin = env.PREVIEW_APP_ORIGIN) => req('/__preview', { method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body })
  assert.equal((await previewGate(login('password=wrong'), env)).status, 401)
  assert.equal((await previewGate(login('password=' + secret, 'https://outside.example.invalid'), env)).status, 403)
  assert.equal((await previewGate(login('x'.repeat(2049)), env)).status, 413)
  const response = await previewGate(login('password=' + secret), env)
  assert.equal(response.status, 303)
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /^__Host-zaridasu-preview=/)
  assert.match(cookie, /Secure; HttpOnly; SameSite=Strict; Path=\//)
  assert.ok(!cookie.includes(secret))
  assert.equal(response.headers.get('location'), '/')
  assert.equal((await previewGate(req('/__preview?password=' + secret), env)).status, 400)
})

test('preview response preserves app cookies and Vary while closing all external browser sources', () => {
  const response = protectResponse(new Response('ok', { headers: { 'set-cookie': 'app=refresh; Secure', vary: 'RSC, Cookie' } }))
  assert.equal(response.headers.get('set-cookie'), 'app=refresh; Secure')
  assert.equal(response.headers.get('vary'), 'RSC, Cookie')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/)
  assert.doesNotMatch(response.headers.get('content-security-policy'), /https:|supabase|google|vercel/)
})

test('server fetch routes only synthetic backend and recorded OG assets without network fallback or redirects', async () => {
  const calls = []
  const bindings = { ...env, PREVIEW_BACKEND: { async fetch(request) { calls.push(new URL(request.url).pathname)
    return new Response(null, { status: new URL(request.url).pathname.endsWith('/redirect.png') ? 302 : 200,
      headers: { location: 'https://outside.example.invalid/secret' } }) } } }
  assert.equal((await previewFetch(req('/rest/v1/posts'), undefined, bindings)).status, 200)
  assert.equal((await previewFetch(req('/storage/v1/object/public/runtime-fixture/redirect.png'), undefined, bindings)).status, 502)
  for (const url of ['https://production.supabase.co/rest/v1/posts', 'http://127.0.0.1/private',
    'https://preview.example.invalid.evil.test/rest/v1/posts', 'https://user:pass@preview.example.invalid/rest/v1/posts',
    env.PREVIEW_APP_ORIGIN + '/unknown', 'https://api.openai.com/v1/responses', 'https://api.resend.com/emails']) {
    assert.equal((await previewFetch(url, undefined, bindings)).status, 502)
  }
  assert.deepEqual(calls, ['/rest/v1/posts', '/storage/v1/object/public/runtime-fixture/redirect.png'])
})


test('synthetic actor switches expire base and all old chunks before setting browser-owned session cookies', () => {
  const headers = new Headers()
  replaceSessionCookies(headers, 'sb-preview-auth-token=old; sb-preview-auth-token.0=oldActor; sb-preview-auth-token.99=stale; unrelated=keep',
    'sb-preview-auth-token', [{ name: 'sb-preview-auth-token.0', value: 'newActor0' }, { name: 'sb-preview-auth-token.1', value: 'newActor1' }])
  const cookies = headers.getSetCookie()
  assert.equal(cookies.filter(value => value.includes('Max-Age=0')).length, 3)
  assert.equal(cookies.filter(value => value.includes('Max-Age=28800')).length, 2)
  assert.ok(cookies.every(value => !value.includes('HttpOnly') && !value.includes('unrelated')))
  assert.match(cookies.at(-1), /^sb-preview-auth-token\.1=newActor1;/)
})
