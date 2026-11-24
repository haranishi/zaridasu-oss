import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'
import { test } from 'node:test'
import { createCloudflareHarness } from './runtime-harness.mjs'
import { fixtureBuildEnvironment } from './build-fixture.mjs'
import { FIXTURE_ENV } from './fixtures.mjs'

test('fixture build environment drops inherited credentials and disables telemetry', () => {
  const env = fixtureBuildEnvironment({ PATH: '/bin', HOME: '/tmp/fixture-home',
    NEXT_PUBLIC_GTM_ID: 'must-not-pass', NEXT_PUBLIC_SUPABASE_URL: 'https://outside.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'must-not-pass',
    SENTRY_AUTH_TOKEN: 'must-not-pass', RESEND_API_KEY: 'must-not-pass', NEXT_PUBLIC_SENTRY_DSN: 'must-not-pass',
    CLOUDFLARE_API_TOKEN: 'must-not-pass', NEXT_TELEMETRY_DISABLED: '0', WRANGLER_SEND_METRICS: 'true' })
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://placeholder.supabase.co')
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(env.RESEND_API_KEY, undefined)
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined)
  assert.equal(env.NEXT_PUBLIC_GTM_ID, '')
  assert.equal(env.SENTRY_AUTH_TOKEN, '')
  assert.equal(env.NEXT_PUBLIC_SENTRY_DSN, '')
  assert.equal(env.NEXT_TELEMETRY_DISABLED, '1')
  assert.equal(env.WRANGLER_SEND_METRICS, 'false')
  assert.equal(env.VERCEL_ENV, 'preview')
})

test('runtime never reads project credential env files', { timeout: 30_000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const watched = new Set(['.dev.vars', '.env', '.env.local', '.env.production', '.env.production.local']
    .map(name => path.join(root, name)))
  const reads = []
  const originalRead = fs.readFileSync
  // Supply a harmless in-memory decoy if Wrangler attempts a root credential read.
  // No actual env file or secret is created, loaded, or printed.
  fs.readFileSync = function (filename, options) {
    const target = filename instanceof URL ? fileURLToPath(filename)
      : typeof filename === 'string' ? path.resolve(filename) : undefined
    if (watched.has(target)) {
      reads.push(path.basename(target))
      const decoy = 'CLOUDFLARE_FIXTURE_DECOY=synthetic-only\n'
      const encoding = typeof options === 'string' ? options : options?.encoding
      return encoding ? decoy : Buffer.from(decoy)
    }
    return originalRead.apply(this, arguments)
  }
  let harness
  try {
    harness = await createCloudflareHarness()
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await harness.reset()
      const bindings = await harness.getBindings()
      const stringEnv = Object.fromEntries(Object.entries(bindings).filter(([, value]) => typeof value === 'string'))
      assert.deepEqual(stringEnv, FIXTURE_ENV)
    }
    assert.deepEqual(reads, [], 'Wrangler must not attempt to read project credential env files')
  } finally {
    fs.readFileSync = originalRead
    await harness?.close()
  }
})

// Node's test runner is intentional: jsdom/Vitest must not substitute workerd.
test('built OpenNext Worker runs with isolated local bindings and synthetic backend', { timeout: 120_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  const firstState = harness.stateDirectory

  await t.test('boots real root, API and ASSETS routes', async () => {
    const bindings = await harness.getBindings()
    assert.equal(bindings.CLOUDFLARE_RUNTIME_FIXTURE, '1')
    assert.equal(typeof bindings.NEXT_CACHE_DO_QUEUE.idFromName, 'function')
    assert.equal(typeof bindings.IMAGES.input, 'function')
    const root = await harness.fetch('/')
    assert.equal(root.status, 200)
    assert.match(await root.text(), /ザリダス - 秋田県外来生物情報マップ/)
    const api = await harness.fetch('/api/nearby-water?lat=invalid&lng=140')
    assert.equal(api.status, 400)
    assert.ok((await api.json()).error)
    const asset = await harness.fetch('/icon-192.png')
    assert.equal(asset.status, 200)
    assert.ok((await asset.arrayBuffer()).byteLength > 0)
  })

  await t.test('executes Node Proxy and real Supabase SSR authentication', async () => {
    const anonymous = await harness.fetch('/admin?ignored=1')
    assert.equal(anonymous.status, 307)
    assert.equal(new URL(anonymous.headers.get('location'), 'https://fixture.example.invalid').pathname, '/admin/login')
    assert.equal(new URL(anonymous.headers.get('location'), 'https://fixture.example.invalid').search, '')
    const member = harness.backend.session('a')
    const denied = await harness.fetch('/admin', { headers: { cookie: member.cookie } })
    assert.equal(denied.status, 307)
    assert.equal(new URL(denied.headers.get('location'), 'https://fixture.example.invalid').pathname, '/')
    const admin = harness.backend.session('admin')
    const allowed = await harness.fetch('/admin', { headers: { cookie: admin.cookie } })
    assert.equal(allowed.status, 200)
    await allowed.text()
    assert.ok(harness.backend.requests.filter(r => r.kind === 'auth-user').length >= 2)
    const profile = await harness.fetch(`/profile/${member.user.id}`, { headers: { cookie: member.cookie } })
    assert.equal(profile.status, 200)
    assert.match(await profile.text(), /Fixture A/)
    assert.ok(harness.backend.requests.some(r => r.kind === 'profile' && r.authenticated))
    assert.deepEqual(harness.backend.requests.filter(r => r.kind === 'blocked'), [])
  })

  await t.test('workerd egress goes through an allowlist with no network fallback', async () => {
    const user = harness.backend.session('b')
    const valid = await harness.probeOutbound('https://placeholder.supabase.co/auth/v1/user', {
      headers: { authorization: `Bearer ${user.accessToken}` },
    })
    assert.equal(valid.status, 200)
    assert.equal((await valid.json()).id, user.user.id)
    for (const target of ['https://outside.example.invalid/collect', 'https://placeholder.supabase.co/functions/v1/send-email']) {
      const blocked = await harness.probeOutbound(target)
      assert.equal(blocked.status, 502)
      await blocked.text()
    }
    assert.equal(harness.backend.requests.filter(r => r.kind === 'blocked').length, 2)
  })

  await t.test('local R2 and Worker state reset and close without sharing data', async () => {
    const oldSession = harness.backend.session('a')
    const bucket = await harness.getCacheBucket()
    await bucket.put('fixture-isolation', 'only-first-runtime')
    assert.equal(await (await bucket.get('fixture-isolation')).text(), 'only-first-runtime')
    await harness.reset()
    assert.notEqual(harness.stateDirectory, firstState)
    await assert.rejects(access(firstState), { code: 'ENOENT' })
    assert.equal(await (await harness.getCacheBucket()).get('fixture-isolation'), null)
    assert.equal(harness.backend.requests.length, 0)
    const oldAuth = await harness.probeOutbound('https://placeholder.supabase.co/auth/v1/user', {
      headers: { authorization: `Bearer ${oldSession.accessToken}` },
    })
    assert.equal(oldAuth.status, 401)
    await oldAuth.text()
    // Tokens and sessions are scoped to the runtime as well as local storage.
    const restarted = await harness.fetch('/admin')
    assert.equal(restarted.status, 307)
    const lastState = harness.stateDirectory
    await harness.close()
    await harness.close()
    await assert.rejects(access(lastState), { code: 'ENOENT' })
    await assert.rejects(harness.fetch('/'), /closed/)
  })
})
