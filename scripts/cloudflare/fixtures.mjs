import { readFileSync } from 'node:fs'
import { createHmac, randomBytes } from 'node:crypto'
import { createChunks } from '@supabase/ssr'

export const SUPABASE_ORIGIN = 'https://placeholder.supabase.co'
export const FIXTURE_ENV = Object.freeze({
  NODE_ENV: 'production',
  NEXTJS_ENV: 'production',
  VERCEL_ENV: 'preview',
  CLOUDFLARE_RUNTIME_FIXTURE: '1',
  ZARIDASU_RUNTIME: 'cloudflare',
  ZARIDASU_DEPLOYMENT_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_ORIGIN,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-key-for-ci-build',
  NEXT_PUBLIC_SENTRY_DSN: '',
  NEXT_PUBLIC_GTM_ID: '',
  SENTRY_DSN: '',
  SENTRY_AUTH_TOKEN: '',
  NEXT_TELEMETRY_DISABLED: '1',
  WRANGLER_SEND_METRICS: 'false',
})

// Reserved domain and a deliberately invalid GTM ID: never actual telemetry credentials.
export const MONITORING_PROBE_ENV = Object.freeze({
  NEXT_PUBLIC_SENTRY_DSN: 'https://public@telemetry.example.invalid/1',
  SENTRY_DSN: 'https://public@telemetry.example.invalid/1',
  NEXT_PUBLIC_GTM_ID: 'GTM-FIXTURE-ONLY',
})

const identities = {
  a: ['00000000-0000-4000-8000-000000000001', 'Fixture A', 'authenticated'],
  b: ['00000000-0000-4000-8000-000000000002', 'Fixture B', 'authenticated'],
  admin: ['00000000-0000-4000-8000-000000000003', 'Fixture Admin', 'admin'],
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', ...headers },
})

async function readSmallJson(request) {
  const reader = request.body?.getReader()
  if (!reader) return {}
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16_384) throw new Error('fixture request exceeds 16 KiB')
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    await reader.cancel()
  }
}

/** Synthetic Auth/public data and recorded assets. Never delegates to network fetch. */
export function createSyntheticBackend() {
  const asset = name => readFileSync(new URL(`./assets/${name}`, import.meta.url))
  const ogSources = JSON.parse(asset('provenance.json').toString('utf8'))
  let municipalityPostCount = 0
  const marker = readFileSync(new URL('../../node_modules/leaflet/dist/images/marker-icon-2x.png', import.meta.url))
  const key = randomBytes(32)
  const accessTokens = new Map()
  const refreshTokens = new Map()
  const requests = []
  const authFaults = new Map()
  const record = (request, kind, authenticated = false) => {
    // No token, cookie, query, or body is retained in evidence.
    requests.push({ method: request.method, host: new URL(request.url).hostname,
      pathname: new URL(request.url).pathname, kind, authenticated })
  }
  function session(identity, { expired = false, metadataSize = 0, refreshMetadataSize = metadataSize, metadataPadding = 'x', forgedAdmin = false } = {}) {
    const details = identities[identity]
    if (!details) throw new Error('unknown synthetic identity')
    const [id, displayName, role] = details
    const now = Math.floor(Date.now() / 1000)
    const user = {
      id, aud: 'authenticated', role: 'authenticated', email: `${identity}@example.invalid`,
      app_metadata: { provider: 'email', providers: ['email'], role },
      user_metadata: { display_name: displayName, ...(metadataSize ? { fixture_padding: metadataPadding.repeat(metadataSize) } : {}), ...(forgedAdmin ? { role: 'admin' } : {}) },
      created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
      email_confirmed_at: new Date(0).toISOString(), identities: [],
    }
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const expiresAt = now + (expired ? -60 : 3600)
    const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: id, aud: 'authenticated', iss: `${SUPABASE_ORIGIN}/auth/v1`,
      iat: now, exp: expiresAt, role: 'authenticated', jti: randomBytes(12).toString('hex'),
    })}`
    const accessToken = `${unsigned}.${createHmac('sha256', key).update(unsigned).digest('base64url')}`
    const refreshToken = randomBytes(32).toString('base64url')
    const body = { access_token: accessToken, refresh_token: refreshToken,
      token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user }
    accessTokens.set(accessToken, { user, expiresAt })
    refreshTokens.set(refreshToken, { identity, metadataSize: refreshMetadataSize, metadataPadding: 'y', forgedAdmin })
    const cookie = createChunks('sb-placeholder-auth-token', `base64-${Buffer.from(JSON.stringify(body)).toString('base64url')}`)
      .map(({ name, value }) => `${name}=${value}`).join('; ')
    return { cookie, accessToken, refreshToken, user, body }
  }
  async function handle(request) {
    const url = new URL(request.url)
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '')
    const auth = accessTokens.get(token)
    const authenticated = !!auth && auth.expiresAt > Date.now() / 1000
    if (request.method === 'GET' && url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
      && ['Noto Sans JP', 'Noto Sans JP|Noto Sans SC|Noto Sans TC|Noto Sans HK']
        .includes(url.searchParams.getAll('family').join('|'))
      && [...url.searchParams.keys()].every(key => ['family', 'text', 'display'].includes(key))
      && (url.searchParams.get('text')?.length ?? 0) <= 200
      && ((url.searchParams.get('display') === 'swap' && !url.searchParams.has('text'))
        || (url.searchParams.get('text') && [...url.searchParams.get('text')].every(c => ogSources.text.includes(c))))) {
      record(request, 'og-font-css')
      return new Response(asset(url.searchParams.has('text') ? 'noto-jp-subset.css'
        : url.searchParams.getAll('family').length > 1 ? 'noto-cjk-detector.css' : 'noto-jp-detector.css'),
        { headers: { 'content-type': 'text/css' } })
    }
    if (request.method === 'GET' && request.url === ogSources.assets['noto-jp-subset.ttf'].source) {
      record(request, 'og-font')
      return new Response(asset('noto-jp-subset.ttf'), { headers: { 'content-type': 'font/ttf' } })
    }
    if (request.method === 'GET' && request.url === 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f99e.svg') {
      record(request, 'og-emoji')
      return new Response(asset('1f99e.svg'), { headers: { 'content-type': 'image/svg+xml' } })
    }
    if (url.origin !== SUPABASE_ORIGIN) {
      record(request, 'blocked')
      return json({ error: 'fixture_egress_denied' }, 502)
    }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/get_municipality_post_counts') {
      record(request, 'municipality-counts')
      return json([{ municipality: '秋田市', post_count: municipalityPostCount }])
    }
    if (request.method === 'GET' && ['/storage/v1/object/public/runtime-fixture/marker-icon.png',
      '/storage/v1/render/image/public/runtime-fixture/marker-icon.png'].includes(url.pathname)) {
      record(request, 'image')
      return new Response(marker, { headers: { 'content-type': 'image/png' } })
    }
    if (request.method === 'GET' && url.pathname === '/storage/v1/object/public/runtime-fixture/redirect.png') {
      const destinations = {
        outside: 'https://outside.example.invalid/forbidden.png',
        loopback: 'http://127.0.0.1/forbidden.png',
        relative: '/storage/v1/object/public/runtime-fixture/marker-icon.png',
        protocolRelative: '//outside.example.invalid/forbidden.png',
      }
      const location = destinations[url.searchParams.get('destination') ?? 'outside']
      if (typeof location === 'string') {
        record(request, 'image-redirect')
        return new Response(null, { status: 302, headers: { location } })
      }
    }
    if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
      record(request, 'auth-user', authenticated)
      if (authFaults.has('user')) return json({ code: 'unexpected_failure', message: 'synthetic auth failure' }, authFaults.get('user'))
      return authenticated ? json(auth.user) : json({ code: 'bad_jwt', message: 'invalid synthetic token' }, 401)
    }
    if (url.pathname === '/auth/v1/token' && request.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
      record(request, 'auth-refresh')
      if (authFaults.has('refresh')) return json({ code: 'refresh_token_not_found', message: 'synthetic refresh failure' }, authFaults.get('refresh'))
      try {
        const body = await readSmallJson(request)
        const refresh = refreshTokens.get(body.refresh_token)
        return refresh ? json(session(refresh.identity, refresh).body) : json({ code: 'refresh_token_not_found', message: 'invalid synthetic refresh' }, 400)
      } catch {
        return json({ error: 'invalid_fixture_request' }, 400)
      }
    }
    if (url.pathname === '/rest/v1/user_profiles' && request.method === 'GET') {
      record(request, 'profile', authenticated)
      const userId = url.searchParams.get('id')?.replace(/^eq\./, '')
      const details = Object.values(identities).find(([id]) => id === userId)
      if (!details) return json({ code: 'PGRST116' }, 406)
      const profile = { display_name: details[1], avatar_emoji: '🦞' }
      return json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? profile : [profile])
    }
    if (url.pathname === '/rest/v1/posts' && ['GET', 'HEAD'].includes(request.method)) {
      record(request, 'posts', authenticated)
      return request.method === 'HEAD'
        ? new Response(null, { headers: { 'content-range': '*/0' } })
        : json([], 200, { 'content-range': '*/0' })
    }
    record(request, 'blocked', authenticated)
    return json({ error: 'fixture_egress_denied' }, 502)
  }
  return { session, handle, requests,
    setMunicipalityPostCount(count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid synthetic public count')
      municipalityPostCount = count
    },
    setAuthFault(endpoint, status) {
      if (!['user', 'refresh'].includes(endpoint)) throw new Error('unknown auth fixture endpoint')
      if (status === undefined) authFaults.delete(endpoint)
      else authFaults.set(endpoint, status)
    },
  }
}
