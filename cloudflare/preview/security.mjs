import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const COOKIE = '__Host-zaridasu-preview'
const TTL = 8 * 3600
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'", "connect-src 'self'", "img-src 'self' data: blob:",
  "media-src 'self' data: blob:", "font-src 'self'", "worker-src 'self' blob:",
  "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ')

export const equalSecret = (a, b) => typeof a === 'string' && typeof b === 'string'
  && timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
const mac = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url')
const now = () => Math.floor(Date.now() / 1000)

export function accessCookie(secret, seconds = now()) {
  const payload = `${seconds + TTL}.${randomBytes(16).toString('base64url')}`
  return `${COOKIE}=${payload}.${mac(payload, secret)}`
}

export function validateAccessCookie(header, secret, seconds = now()) {
  if (typeof header !== 'string' || header.length > 32_768 || typeof secret !== 'string' || secret.length < 32) return false
  const matches = header.split(';').map(value => value.trim()).filter(value => value.startsWith(`${COOKIE}=`))
  if (matches.length !== 1) return false
  const value = matches[0].slice(COOKIE.length + 1)
  const match = /^(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match || Number(match[1]) <= seconds || Number(match[1]) > seconds + TTL) return false
  return equalSecret(match[3], mac(`${match[1]}.${match[2]}`, secret))
}

export function protectResponse(response) {
  const protectedResponse = new Response(response.body, response)
  protectedResponse.headers.set('Cache-Control', 'private, no-store, max-age=0')
  protectedResponse.headers.set('CDN-Cache-Control', 'no-store')
  protectedResponse.headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  protectedResponse.headers.set('X-Robots-Tag', 'noindex, nofollow')
  protectedResponse.headers.set('Content-Security-Policy', CSP)
  protectedResponse.headers.set('X-Content-Type-Options', 'nosniff')
  protectedResponse.headers.set('Referrer-Policy', 'no-referrer')
  protectedResponse.headers.set('X-Frame-Options', 'DENY')
  return protectedResponse
}

export async function readBoundedBody(request, limit = 2048) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new RangeError('Preview request too large')
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { await reader.cancel() }
}

const loginPage = status => protectResponse(new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width"><title>隔離プレビュー</title><body><main><h1>ザリダス 隔離プレビュー</h1><p>合成データによる移行検証環境です。実際の記録・アカウントは利用できません。</p><form method="post" action="/__preview"><label>プレビュー用パスワード <input type="password" name="password" autocomplete="current-password" required maxlength="256"></label><button>開く</button></form></main></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))

/** Preview-only perimeter. Application Auth and trusted-role checks execute after this gate. */
export async function previewGate(request, env, selfToken) {
  if (typeof env.PREVIEW_ACCESS_SECRET !== 'string' || env.PREVIEW_ACCESS_SECRET.length < 32
    || !env.PREVIEW_APP_ORIGIN) return protectResponse(new Response('Preview unavailable', { status: 503 }))
  // The actual adapter signs HEAD revalidations with its build-specific Next secret. No public identity header is trusted.
  if (request.method === 'HEAD' && request.headers.get('x-isr') === '1'
    && typeof selfToken === 'string' && selfToken.length >= 32
    && equalSecret(request.headers.get('x-prerender-revalidate'), selfToken)) return null
  const url = new URL(request.url)
  if (url.origin !== env.PREVIEW_APP_ORIGIN) return protectResponse(new Response('Invalid preview origin', { status: 403 }))
  if (url.pathname === '/__preview') {
    if (url.search) return protectResponse(new Response('Use the password form', { status: 400 }))
    if (request.method === 'GET') return loginPage(200)
    if (request.method !== 'POST') return protectResponse(new Response('Method not allowed', { status: 405 }))
    if (request.headers.get('origin') !== env.PREVIEW_APP_ORIGIN) return protectResponse(new Response('Origin denied', { status: 403 }))
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return protectResponse(new Response('Unsupported form', { status: 415 }))
    let body
    try { body = await readBoundedBody(request) } catch { return protectResponse(new Response('Request too large', { status: 413 })) }
    const form = new URLSearchParams(body)
    if (form.getAll('password').length !== 1 || !equalSecret(form.get('password'), env.PREVIEW_ACCESS_SECRET)) return loginPage(401)
    return protectResponse(new Response(null, { status: 303, headers: { location: '/',
      'set-cookie': `${accessCookie(env.PREVIEW_ACCESS_SECRET)}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL}` } }))
  }
  return validateAccessCookie(request.headers.get('cookie'), env.PREVIEW_ACCESS_SECRET) ? null : loginPage(401)
}

export function isBackendPath(pathname) {
  return /^\/(?:auth|rest|storage)\/v1(?:\/|$)/.test(pathname)
}

/** All global server fetches terminate at the isolated synthetic service; there is no network fallback. */
export async function previewFetch(input, init, env) {
  let request
  try { request = new Request(input, { ...init, redirect: 'manual' }) } catch { return new Response('Preview egress denied', { status: 502 }) }
  const url = new URL(request.url)
  if (url.username || url.password || url.hash || url.protocol !== 'https:') return new Response('Preview egress denied', { status: 502 })
  const ownBackend = url.origin === env.PREVIEW_APP_ORIGIN && isBackendPath(url.pathname)
  const recordedOgAsset = request.method === 'GET' && (
    (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2')
    || (url.origin === 'https://fonts.gstatic.com' && url.pathname === '/l/font')
    || request.url === 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f99e.svg')
  if (!ownBackend && !recordedOgAsset) return new Response('Preview egress denied', { status: 502 })
  if (!env.PREVIEW_BACKEND) return new Response('Preview backend unavailable', { status: 503 })
  const response = await env.PREVIEW_BACKEND.fetch(request)
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel()
    return new Response('Preview redirect denied', { status: 502 })
  }
  return response
}

/** Expire stale base/chunk cookies before writing a new synthetic actor, retaining browser SDK ownership. */
export function replaceSessionCookies(headers, previous, cookieName, chunks) {
  const names = new Set([cookieName])
  for (const pair of (previous ?? '').split(';')) {
    const name = pair.slice(0, pair.indexOf('=')).trim()
    if (name.startsWith(`${cookieName}.`) && /^\d+$/.test(name.slice(cookieName.length + 1))) names.add(name)
  }
  for (const name of names) headers.append('set-cookie', `${name}=; Secure; SameSite=Lax; Path=/; Max-Age=0`)
  for (const { name, value } of chunks) headers.append('set-cookie', `${name}=${value}; Secure; SameSite=Lax; Path=/; Max-Age=28800`)
}
