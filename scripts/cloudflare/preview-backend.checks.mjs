import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { syntheticBackend, issueSession } from '../../cloudflare/preview/backend.mjs'
const env = { PREVIEW_APP_ORIGIN: 'https://preview.example.invalid', PREVIEW_FIXTURE_SECRET: randomBytes(32).toString('base64url'),
  FIXTURE_ASSETS: { fetch: async () => new Response('licensed asset') } }
const request = (path, init) => new Request(new URL(path, env.PREVIEW_APP_ORIGIN), init)

test('isolated backend rejects unknown data, mutation, real-provider and forged synthetic sessions', async () => {
  for (const [path, method] of [['/rest/v1/private_spots', 'GET'], ['/rest/v1/posts', 'POST'],
    ['/functions/v1/analyze', 'POST'], ['/auth/v1/signup', 'POST'], ['/storage/v1/object/public/other.jpg', 'GET']]) {
    assert.equal((await syntheticBackend(request(path, { method }), env)).status, 502)
  }
  assert.equal((await syntheticBackend(new Request('https://production.supabase.co/rest/v1/posts'), env)).status, 502)
  assert.equal((await syntheticBackend(request('/auth/v1/user', { headers: { authorization: 'Bearer forged' } }), env)).status, 401)
})

test('synthetic identities and refresh remain valid across calls while user metadata cannot confer admin role', async () => {
  const session = issueSession('a', env, { expired: true, forgedAdmin: true })
  assert.equal((await syntheticBackend(request('/auth/v1/user', { headers: { authorization: `Bearer ${session.access_token}` } }), env)).status, 401)
  const refresh = await syntheticBackend(request('/auth/v1/token?grant_type=refresh_token', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) }), { ...env })
  assert.equal(refresh.status, 200)
  const fresh = await refresh.json()
  const response = await syntheticBackend(request('/auth/v1/user', { headers: { authorization: `Bearer ${fresh.access_token}` } }), { ...env })
  assert.equal(response.status, 200)
  const user = await response.json()
  assert.equal(user.app_metadata.role, 'authenticated')
  assert.equal(user.user_metadata.role, 'admin')
  const admin = issueSession('admin', env)
  assert.equal(admin.user.app_metadata.role, 'admin')
  assert.equal((await syntheticBackend(request('/auth/v1/token?grant_type=refresh_token', { method: 'POST',
    body: JSON.stringify({ refresh_token: session.access_token }) }), env)).status, 400)
})

test('backend serves only synthetic public aggregates and licensed assets; it has no fetch fallback', async () => {
  const counts = await syntheticBackend(request('/rest/v1/rpc/get_municipality_post_counts', { method: 'POST' }), env)
  assert.deepEqual(await counts.json(), [{ municipality: '秋田市', post_count: 190001 }])
  const image = await syntheticBackend(request('/storage/v1/object/public/runtime-fixture/marker-icon.png'), env)
  assert.equal(await image.text(), 'licensed asset')
  assert.equal((await syntheticBackend(request('/storage/v1/object/public/runtime-fixture/redirect.png'), env)).status, 502)
  assert.equal((await syntheticBackend(new Request('https://fonts.googleapis.com/css2?family=Unknown'), env)).status, 502)
})


test('synthetic browser profile RPC verifies the signed actor and refuses cross-actor profile requests', async () => {
  const session = issueSession('a', env)
  const profileRequest = (id, token) => request('/rest/v1/rpc/get_user_profile', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ p_user_id: id }) })
  assert.equal((await syntheticBackend(profileRequest(session.user.id), env)).status, 401)
  assert.equal((await syntheticBackend(profileRequest('00000000-0000-4000-8000-000000000002', session.access_token), env)).status, 403)
  const response = await syntheticBackend(profileRequest(session.user.id, session.access_token), env)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).display_name, 'Fixture A')
})
