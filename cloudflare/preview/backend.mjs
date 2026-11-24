import { createHmac, randomBytes } from 'node:crypto'
import { equalSecret, readBoundedBody } from './security.mjs'
import provenance from '../../scripts/cloudflare/assets/provenance.json' with { type: 'json' }

const identities = Object.freeze({
  a: ['00000000-0000-4000-8000-000000000001', 'Fixture A', 'authenticated'],
  b: ['00000000-0000-4000-8000-000000000002', 'Fixture B', 'authenticated'],
  admin: ['00000000-0000-4000-8000-000000000003', 'Fixture Admin', 'admin'],
})
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const signature = (value, env) => createHmac('sha256', env.PREVIEW_FIXTURE_SECRET).update(value).digest('base64url')
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store', ...headers },
})

function userFor(identity, forgedAdmin = false, largeCookie = false) {
  const [id, display_name, role] = identities[identity]
  return { id, aud: 'authenticated', role: 'authenticated', email: `${identity}@example.invalid`,
    app_metadata: { provider: 'email', providers: ['email'], role },
    user_metadata: { display_name, ...(largeCookie ? { fixture_padding: 'x'.repeat(5000) } : {}), ...(forgedAdmin ? { role: 'admin' } : {}) },
    created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
    email_confirmed_at: new Date(0).toISOString(), identities: [] }
}

export function issueSession(identity, env, { expired = false, forgedAdmin = false, largeCookie = false } = {}) {
  if (!Object.hasOwn(identities, identity) || env.PREVIEW_FIXTURE_SECRET?.length < 32) throw new Error('Invalid synthetic session configuration')
  const seconds = Math.floor(Date.now() / 1000)
  const token = (purpose, expiresAt) => {
    const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: identities[identity][0], identity, purpose, forgedAdmin, largeCookie,
      aud: 'authenticated', iss: `${env.PREVIEW_APP_ORIGIN}/auth/v1`,
      iat: seconds, exp: expiresAt, role: 'authenticated', jti: randomBytes(12).toString('hex'),
    })}`
    return `${payload}.${signature(payload, env)}`
  }
  const expiresAt = seconds + (expired ? -60 : 3600)
  return { access_token: token('access', expiresAt), refresh_token: token('refresh', seconds + 8 * 3600),
    token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user: userFor(identity, forgedAdmin, largeCookie) }
}

function verifyToken(value, purpose, env) {
  if (typeof value !== 'string' || value.length > 4096) return undefined
  const parts = value.split('.')
  if (parts.length !== 3 || !equalSecret(parts[2], signature(`${parts[0]}.${parts[1]}`, env))) return undefined
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return claims.purpose === purpose && Object.hasOwn(identities, claims.identity)
      && claims.sub === identities[claims.identity][0] && claims.iss === `${env.PREVIEW_APP_ORIGIN}/auth/v1`
      && claims.aud === 'authenticated' && claims.exp > Date.now() / 1000 ? claims : undefined
  } catch { return undefined }
}

/** Recorded licensed font/emoji endpoints, without any remote fallback. */
function recordedAsset(request) {
  const url = new URL(request.url)
  if (request.method !== 'GET') return undefined
  if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
    && ['Noto Sans JP', 'Noto Sans JP|Noto Sans SC|Noto Sans TC|Noto Sans HK'].includes(url.searchParams.getAll('family').join('|'))
    && [...url.searchParams.keys()].every(key => ['family', 'text', 'display'].includes(key))
    && (url.searchParams.get('text')?.length ?? 0) <= 200
    && ((url.searchParams.get('display') === 'swap' && !url.searchParams.has('text'))
      || (url.searchParams.get('text') && [...url.searchParams.get('text')].every(char => provenance.text.includes(char))))) {
    return url.searchParams.has('text') ? 'noto-jp-subset.css'
      : url.searchParams.getAll('family').length > 1 ? 'noto-cjk-detector.css' : 'noto-jp-detector.css'
  }
  if (request.url === provenance.assets['noto-jp-subset.ttf'].source) return 'noto-jp-subset.ttf'
  if (request.url === 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f99e.svg') return '1f99e.svg'
  return undefined
}

/** This Worker has no public route and no outbound fetch call. Only synthetic fixtures are reachable. */
export async function syntheticBackend(request, env) {
  if (typeof env.PREVIEW_FIXTURE_SECRET !== 'string' || env.PREVIEW_FIXTURE_SECRET.length < 32) return json({ error: 'fixture_unavailable' }, 503)
  const asset = recordedAsset(request)
  if (asset) return env.FIXTURE_ASSETS.fetch(new Request(`https://fixture-assets.invalid/${asset}`))
  const url = new URL(request.url)
  if (url.origin !== env.PREVIEW_APP_ORIGIN || url.username || url.password || url.hash) return json({ error: 'fixture_egress_denied' }, 502)
  if (request.method === 'POST' && url.pathname === '/__fixture/session') {
    try {
      const body = JSON.parse(await readBoundedBody(request))
      return json(issueSession(body.identity, env, { expired: body.expired === true, forgedAdmin: body.forgedAdmin === true, largeCookie: body.largeCookie === true }))
    } catch { return json({ error: 'invalid_fixture_identity' }, 400) }
  }
  if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/get_user_profile') {
    const auth = verifyToken(request.headers.get('authorization')?.replace(/^Bearer /, ''), 'access', env)
    if (!auth) return json({ error: 'invalid_synthetic_actor' }, 401)
    try {
      const body = JSON.parse(await readBoundedBody(request))
      if (body.p_user_id !== auth.sub) return json({ error: 'synthetic_owner_required' }, 403)
      const user = userFor(auth.identity)
      return json({ id: user.id, display_name: user.user_metadata.display_name, avatar_emoji: '🦞' })
    } catch { return json({ error: 'invalid_fixture_request' }, 400) }
  }
  if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/get_municipality_post_counts') {
    const count = env.PREVIEW_PUBLIC_POST_COUNT === undefined ? 190001 : Number(env.PREVIEW_PUBLIC_POST_COUNT)
    if (!Number.isSafeInteger(count) || count < 0) return json({ error: 'invalid_public_fixture' }, 503)
    return json([{ municipality: '秋田市', post_count: count }])
  }
  if (request.method === 'GET' && ['/storage/v1/object/public/runtime-fixture/marker-icon.png',
    '/storage/v1/render/image/public/runtime-fixture/marker-icon.png'].includes(url.pathname)) {
    return env.FIXTURE_ASSETS.fetch(new Request('https://fixture-assets.invalid/marker-icon.png'))
  }
  if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
    const auth = verifyToken(request.headers.get('authorization')?.replace(/^Bearer /, ''), 'access', env)
    return auth ? json(userFor(auth.identity, auth.forgedAdmin, auth.largeCookie)) : json({ code: 'bad_jwt', message: 'invalid synthetic token' }, 401)
  }
  if (url.pathname === '/auth/v1/token' && request.method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
    try {
      const body = JSON.parse(await readBoundedBody(request, 8192))
      const refresh = verifyToken(body.refresh_token, 'refresh', env)
      return refresh ? json(issueSession(refresh.identity, env, { forgedAdmin: refresh.forgedAdmin, largeCookie: refresh.largeCookie }))
        : json({ code: 'refresh_token_not_found', message: 'invalid synthetic refresh' }, 400)
    } catch { return json({ error: 'invalid_fixture_request' }, 400) }
  }
  if (url.pathname === '/auth/v1/logout' && request.method === 'POST') return new Response(null, { status: 204 })
  if (url.pathname === '/rest/v1/user_profiles' && request.method === 'GET') {
    const userId = url.searchParams.get('id')?.replace(/^eq\./, '')
    const identity = Object.keys(identities).find(name => identities[name][0] === userId)
    if (!identity) return json({ code: 'PGRST116' }, 406)
    const user = userFor(identity)
    const profile = { display_name: user.user_metadata.display_name, avatar_emoji: '🦞' }
    return json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? profile : [profile])
  }
  if (url.pathname === '/rest/v1/posts' && ['GET', 'HEAD'].includes(request.method)) {
    return request.method === 'HEAD' ? new Response(null, { headers: { 'content-range': '*/0' } }) : json([], 200, { 'content-range': '*/0' })
  }
  return json({ error: 'fixture_egress_denied' }, 502)
}
