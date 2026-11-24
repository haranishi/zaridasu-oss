import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCloudflareHarness } from './runtime-harness.mjs'

function assertPrivate(response) {
  assert.match(response.headers.get('cache-control') ?? '', /private/)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  if (response.status === 307 || response.status === 429) {
    assert.ok((response.headers.get('vary') ?? '').toLowerCase().split(/,\s*/).includes('cookie'))
  }
}
function cookieJar(response, previous = '') {
  const jar = new Map(previous.split(';').filter(Boolean).map(value => {
    const separator = value.indexOf('=')
    return [value.slice(0, separator).trim(), value.slice(separator + 1)]
  }))
  const cookies = response.headers.getSetCookie()
  assert.ok(cookies.length > 0, 'refresh/cleanup cookies must survive the final response')
  for (const cookie of cookies) {
    assert.match(cookie, /; Secure/i)
    assert.match(cookie, /; SameSite=Lax/i)
    assert.match(cookie, /; Path=\//i)
    assert.doesNotMatch(cookie, /; HttpOnly/i, 'browser SDK still owns the session')
  }
  for (const cookie of cookies) {
    const pair = cookie.split(';')[0]
    const separator = pair.indexOf('=')
    const name = pair.slice(0, separator)
    if (/; Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(name)
    else jar.set(name, pair.slice(separator + 1))
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

test('task 6.4: real Worker Auth, cookie and trusted IP boundary', { timeout: 180_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  const publicResponse = await harness.fetch('/profile')
  assert.equal(publicResponse.status, 200)
  const frameworkVary = (publicResponse.headers.get('vary') ?? '').toLowerCase().split(/,\s*/).filter(Boolean)
  assert.ok(frameworkVary.length > 0, 'baseline framework response provides its variants')
  await publicResponse.text()

  await t.test('verified member/admin, forged metadata and failed Auth all stay private', async () => {
    for (const [path, identity, expected, location] of [
      ['/dashboard?ignored=1', null, 307, '/'], ['/admin?ignored=1', null, 307, '/admin/login'],
      ['/admin', 'a', 307, '/'], ['/dashboard', 'a', 200, null], ['/admin', 'admin', 200, null],
      ['/admin/login', null, 200, null],
    ]) {
      const session = identity && harness.backend.session(identity)
      const response = await harness.fetch(path, { headers: session ? { cookie: session.cookie } : {} })
      assert.equal(response.status, expected)
      if (location) {
        const target = new URL(response.headers.get('location'), 'https://fixture.example.invalid')
        assert.equal(target.pathname, location)
        assert.equal(target.search, '')
      }
      assertPrivate(response)
      if (expected === 200) {
        const vary = (response.headers.get('vary') ?? '').toLowerCase().split(/,\s*/)
        for (const variant of frameworkVary) assert.ok(vary.includes(variant), `framework variant ${variant} survives`)
      }
      await response.text()
    }
    const forged = harness.backend.session('a', { forgedAdmin: true })
    const denied = await harness.fetch('/admin', { headers: { cookie: forged.cookie } })
    assert.equal(denied.status, 307)
    assert.equal(new URL(denied.headers.get('location'), 'https://fixture.example.invalid').pathname, '/')
    assertPrivate(denied)
    harness.backend.setAuthFault('user', 503)
    try {
      const admin = harness.backend.session('admin')
      const unavailable = await harness.fetch('/admin?ignored=1', { headers: { cookie: admin.cookie } })
      assert.equal(unavailable.status, 307)
      assert.equal(new URL(unavailable.headers.get('location'), 'https://fixture.example.invalid').pathname, '/admin/login')
      assertPrivate(unavailable)
    } finally { harness.backend.setAuthFault('user') }
  })

  await t.test('refresh keeps chunked cookies on success and denial, then reuses the verified session', async () => {
    for (const [identity, path, expected] of [['a', '/dashboard', 200], ['a', '/admin', 307], ['admin', '/admin', 200]]) {
      const old = harness.backend.session(identity, { expired: true, metadataSize: 5000 })
      const response = await harness.fetch(path, { headers: { cookie: old.cookie } })
      assert.equal(response.status, expected)
      assertPrivate(response)
      const cookies = response.headers.getSetCookie()
      assert.ok(cookies.filter(cookie => /sb-placeholder-auth-token\.\d+=/.test(cookie)).length >= 2)
      const jar = cookieJar(response, old.cookie)
      await response.text()
      const count = harness.backend.requests.filter(r => r.kind === 'auth-refresh').length
      const followup = await harness.fetch('/dashboard', { headers: { cookie: jar } })
      assert.equal(followup.status, 200)
      assertPrivate(followup)
      await followup.text()
      assert.equal(harness.backend.requests.filter(r => r.kind === 'auth-refresh').length, count)
    }
  })

  await t.test('refresh removes stale chunks on redirects and invalid refresh clears all session cookies', async () => {
    const shrinking = harness.backend.session('a', { expired: true, metadataSize: 5000, refreshMetadataSize: 0 })
    const response = await harness.fetch('/admin', { headers: { cookie: shrinking.cookie } })
    assert.equal(response.status, 307)
    assertPrivate(response)
    const updated = cookieJar(response, shrinking.cookie)
    const resumed = await harness.fetch('/dashboard', { headers: { cookie: updated } })
    assert.equal(resumed.status, 200)
    assertPrivate(resumed)
    await resumed.text()
    assert.ok(response.headers.getSetCookie().some(cookie => /sb-placeholder-auth-token\.\d+=;/.test(cookie) && /Max-Age=0/i.test(cookie)))
    harness.backend.setAuthFault('refresh', 400)
    try {
      const invalid = harness.backend.session('admin', { expired: true, metadataSize: 5000 })
      const denied = await harness.fetch('/admin', { headers: { cookie: invalid.cookie } })
      assert.equal(denied.status, 307)
      assertPrivate(denied)
      const cleared = denied.headers.getSetCookie()
      assert.equal(cookieJar(denied, invalid.cookie), '')
      assert.ok(cleared.length >= 2)
      assert.ok(cleared.every(cookie => /Max-Age=0/i.test(cookie)))
    } finally { harness.backend.setAuthFault('refresh') }
  })

  await t.test('rotating visitor Vercel/XFF/real-IP headers cannot evade one CF IP bucket', async () => {
    await harness.reset()
    for (let i = 0; i < 61; i++) {
      const response = await harness.fetch('/dashboard', { headers: {
        'cf-connecting-ip': '198.51.100.90', 'x-vercel-forwarded-for': `203.0.113.${i + 1}`,
        'x-forwarded-for': `192.0.2.${i + 1}, 127.0.0.1`, 'x-real-ip': `192.0.2.${i + 1}`,
      } })
      assert.equal(response.status, i < 60 ? 307 : 429, `burst request ${i + 1}`)
      if (i === 60) {
        assertPrivate(response)
        assert.ok(Number(response.headers.get('retry-after')) > 0)
      }
      await response.text()
    }
    const different = await harness.fetch('/dashboard', { headers: { 'cf-connecting-ip': '198.51.100.91' } })
    assert.equal(different.status, 307, 'a separate trusted client has its own bucket')
  })

  await t.test('missing, invalid, private and loopback CF IP cannot skip rate limiting', async () => {
    for (const ip of [null, 'invalid', '10.0.0.1', '127.0.0.1', '::1']) {
      await harness.reset()
      for (let i = 0; i < 61; i++) {
        const headers = { 'x-vercel-forwarded-for': `203.0.113.${i + 1}`,
          'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' }
        if (ip !== null) headers['cf-connecting-ip'] = ip
        // HTTP ingress supplies a loopback CF IP if missing. The real Worker self
        // service binding exercises the literal missing-source case without adding one.
        const response = ip === null
          ? await (await harness.getBindings()).WORKER_SELF_REFERENCE.fetch('https://fixture.example.invalid/dashboard', { headers, redirect: 'manual' })
          : await harness.fetch('/dashboard', { headers })
        assert.equal(response.status, i < 60 ? 307 : 429, `${ip ?? 'missing'} burst ${i + 1}`)
        if (i === 60) assertPrivate(response)
        await response.text()
      }
    }
  })
})
