import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createFreeHarness, applyCookieDelta } from './free-harness.mjs'

const privacy = response => {
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/)
}
const consume = async response => { await response.body?.cancel(); return response }
async function until(probe, description) {
  for (let i = 0; i < 60; i++) { if (await probe()) return; await setTimeout(100) }
  assert.fail(description)
}

test('R2-free build gates real assets and retains app Auth, role denial, SSR Cookie deltas and concurrent actor isolation', { timeout: 120_000 }, async t => {
  const h = await createFreeHarness(); t.after(() => h.close())
  for (const path of ['/', '/sw.js', '/wasm/water_geometry.wasm', '/api/og', '/robots.txt', '/images/american.png']) {
    const response = await h.fetch(path)
    assert.equal(response.status, 401, path); privacy(response); await consume(response)
  }
  assert.equal((await h.privateFetch('/')).status, 404, 'private renderer default fetch never reaches app')
  const cookie = await h.login()
  const home = await h.fetch('/', { headers: { cookie } }); assert.equal(home.status, 200); privacy(home)
  const html = await home.text()
  const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/)[1]
  assert.equal((await h.fetch(asset)).status, 401)
  assert.equal((await consume(await h.fetch(asset, { headers: { cookie } }))).status, 200)
  assert.equal((await consume(await h.fetch('/dashboard', { headers: { cookie } }))).status, 307)
  assert.equal((await h.fetch('/area', { method: 'HEAD', headers: { 'x-isr': '1', 'x-prerender-revalidate': 'forged',
    'x-zaridasu-forward': 'admin', 'x-forwarded-for': '1.2.3.4' } })).status, 401)
  const expired = await h.identity(cookie, 'a', { expired: true, forgedAdmin: true, largeCookie: true })
  const denied = await h.fetch('/admin', { headers: { cookie: expired.cookie } })
  assert.equal(denied.status, 307); assert.equal(new URL(denied.headers.get('location'), h.origin).pathname, '/')
  const refreshed = applyCookieDelta(expired.cookie, denied.headers.getSetCookie())
  assert.ok(denied.headers.getSetCookie().length > 0, 'SSR refresh returns its changed/deleted chunks')
  assert.ok(refreshed !== expired.cookie, 'apply the SSR delta to the original chunked jar')
  privacy(denied); await consume(denied)
  const reused = await h.fetch('/dashboard', { headers: { cookie: refreshed } })
  assert.equal(reused.status, 200)
  assert.equal(reused.headers.getSetCookie().length, 0, 'refreshed session is reused without another refresh')
  await consume(reused)
  const refreshedProfile = await h.fetch(`/profile/${expired.userId}`, { headers: { cookie: refreshed } })
  assert.equal(refreshedProfile.status, 200); assert.ok((await refreshedProfile.text()).includes('Fixture A'))
  const a = await h.identity(cookie, 'a'); const b = await h.identity(cookie, 'b', { largeCookie: true })
  await Promise.all(Array.from({ length: 8 }, (_, i) => (async () => {
    const actor = i % 2 ? a : b; const label = i % 2 ? 'Fixture A' : 'Fixture B'
    const response = await h.fetch(`/profile/${actor.userId}`, { headers: { cookie: actor.cookie } })
    assert.equal(response.status, 200); assert.ok((await response.text()).includes(label), 'concurrent actor must retain its own request context')
  })()))
  const dashboard = await h.fetch('/dashboard', { headers: { cookie: a.cookie } })
  assert.equal(dashboard.status, 200); privacy(dashboard); await consume(dashboard)
  for (const row of await h.cacheRows()) assert.doesNotMatch(row.value_json, /Fixture A|Fixture B|example\.invalid|set-cookie|__Host-zaridasu-preview|sb-zaridasu/i)
  assert.deepEqual(h.networkAttempts, [])
})

test('actual private namespace hop preserves request/stream/redirect/cookies and app rate limits reject forged forwarding IPs', { timeout: 120_000 }, async t => {
  const h = await createFreeHarness(); t.after(() => h.close())
  const cookie = await h.login()
  const response = await h.fetch('/__free_probe/stream?q=%E7%A7%8B', { method: 'POST', headers: { cookie, origin: h.origin,
    'cf-connecting-ip': '198.51.100.72', 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '2.3.4.5',
    'x-zaridasu-forward': 'forged', 'x-zaridasu-actor': 'admin', rsc: '1' }, body: 'native-stream-body' })
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), '/retained')
  assert.equal(response.headers.getSetCookie().length, 2); privacy(response)
  const probe = await response.json()
  assert.equal(probe.url, h.origin + '/__free_probe/stream?q=%E7%A7%8B'); assert.equal(probe.method, 'POST')
  assert.equal(probe.body, 'native-stream-body'); assert.equal(probe.headers.origin, h.origin); assert.equal(probe.headers.rsc, '1')
  assert.ok(probe.headers.cookie === cookie)
  assert.equal(probe.headers['cf-connecting-ip'], '198.51.100.72')
  for (const name of ['x-zaridasu-forward', 'x-zaridasu-actor', 'x-forwarded-for', 'x-vercel-forwarded-for']) assert.equal(probe.headers[name], undefined)
  for (const source of ['198.51.100.73', '']) {
    for (let i = 0; i < 61; i++) {
      const denied = await h.fetch('/dashboard', { headers: { cookie, 'cf-connecting-ip': source,
        'x-forwarded-for': `203.0.113.${i + 1}`, 'x-vercel-forwarded-for': `192.0.2.${i + 1}`,
        'x-zaridasu-trusted-ip': `192.0.2.${i + 1}` } })
      assert.equal(denied.status, i < 60 ? 307 : 429, 'actual proxy counts trusted/unknown source independently of forged headers')
      await consume(denied)
    }
  }
  assert.equal((await consume(await h.fetch('/dashboard', { headers: { cookie, 'cf-connecting-ip': '198.51.100.74' } }))).status, 307)
  assert.deepEqual(h.networkAttempts, [])
})

test('native D1 persistence updates/deletes without seed resurrection, signed SQLite DO ISR succeeds, native Images and Japanese emoji OG run', { timeout: 120_000 }, async t => {
  const h = await createFreeHarness(); t.after(() => h.close()); const cookie = await h.login()
  const first = await h.fetch('/area', { headers: { cookie } })
  assert.equal(first.status, 200); assert.equal(first.headers.get('x-nextjs-cache'), 'MISS'); assert.match(await first.text(), /190001/)
  const area = (await h.cacheRows()).find(row => row.value_json.includes('190001'))
  assert.ok(area); assert.ok(area.cache_key.includes('free-preview-cache/'))
  const hit = await h.fetch('/area', { headers: { cookie } }); assert.equal(hit.headers.get('x-nextjs-cache'), 'HIT'); await consume(hit)
  await h.restart({ publicPostCount: 190002, ageKey: area.cache_key })
  assert.ok((await h.cacheRows()).some(row => row.cache_key === area.cache_key), 'native D1 persists across workerd restart')
  const stale = await h.fetch('/area', { headers: { cookie } }); assert.equal(stale.headers.get('x-nextjs-cache'), 'STALE'); await consume(stale)
  await until(async () => {
    const next = await h.fetch('/area', { headers: { cookie } }); const html = await next.text()
    return next.headers.get('x-nextjs-cache') === 'HIT' && html.includes('190002')
  }, 'native signed HEAD ISR must update actual public aggregate')
  const queue = await h.queueState()
  assert.ok(queue.sync.some(row => row.id.endsWith('/area') && row.lastSuccess > 0 && row.buildId))
  assert.equal(queue.failed.length, 0)
  await (await h.database()).prepare('DELETE FROM opennext_cache WHERE cache_key = ?').bind(area.cache_key).run()
  await h.restart({ publicPostCount: 190003 })
  const regenerated = await h.fetch('/area', { headers: { cookie } }); assert.equal(regenerated.headers.get('x-nextjs-cache'), 'MISS')
  const regeneratedHtml = await regenerated.text(); assert.match(regeneratedHtml, /190003/); assert.doesNotMatch(regeneratedHtml, /190001/)
  const image = await h.fetch('/_next/image?url=' + encodeURIComponent(h.origin + '/storage/v1/object/public/runtime-fixture/marker-icon.png') + '&w=32&q=75',
    { headers: { cookie, accept: 'image/webp' } })
  assert.equal(image.status, 200); assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width, 32)
  const rogue = await h.fetch('/_next/image?url=' + encodeURIComponent('https://production.supabase.co/storage/v1/object/public/private.png') + '&w=32&q=75', { headers: { cookie } })
  assert.equal(rogue.status, 400); await consume(rogue)
  const og = await h.fetch('/api/og?title=' + encodeURIComponent('秋田の外来生物調査') + '&description=' + encodeURIComponent('水辺の記録を共有') + '&emoji=' + encodeURIComponent('🦞'), { headers: { cookie } })
  assert.equal(og.status, 200); assert.equal(og.headers.get('content-type'), 'image/png')
  assert.equal((await sharp(Buffer.from(await og.arrayBuffer())).metadata()).width, 1200)
  assert.deepEqual(h.networkAttempts, [])
})

test('injected quota around actual native D1 cannot become cache miss, successful save, stale seed or successful ISR', { timeout: 120_000 }, async t => {
  const h = await createFreeHarness(); t.after(() => h.close()); const cookie = await h.login()
  for (const operation of ['read', 'write']) {
    h.setFault(operation)
    const response = await h.fetch('/area', { headers: { cookie } })
    assert.equal(response.status, 503, `${operation} failure must remain visible outside OpenNext`); privacy(response)
    const text = await response.text(); assert.equal(text, 'Free preview storage unavailable')
    assert.doesNotMatch(text, /private-marker|SQL|190001/)
    assert.equal((await h.cacheRows()).length, 0, 'failed save never claims persistent success')
  }
  const callsBeforeRecovery = { ...h.faultCalls }
  h.setFault(null)
  const normal = await h.fetch('/area', { headers: { cookie } }); assert.equal(normal.status, 200); await normal.text()
  assert.ok(h.faultCalls.read > callsBeforeRecovery.read && h.faultCalls.write > callsBeforeRecovery.write, 'same workerd resumes native reads and writes after fault removal')
  const area = (await h.cacheRows()).find(row => row.value_json.includes('190001')); assert.ok(area)
  h.setFault('write'); await h.restart({ ageKey: area.cache_key, publicPostCount: 190002 })
  const stale = await h.fetch('/area', { headers: { cookie } }); assert.equal(stale.headers.get('x-nextjs-cache'), 'STALE'); await consume(stale)
  await until(() => h.faultCalls.write >= 3, 'native ISR write must reach injected quota failure')
  await setTimeout(200)
  const queue = await h.queueState()
  assert.ok(queue.failed.some(row => row.id && row.buildId), 'native SQLite queue records failed ISR rather than REVALIDATED success')
  assert.equal(queue.sync.length, 0)
  const retained = (await h.cacheRows()).find(row => row.cache_key === area.cache_key)
  assert.ok(retained.value_json.includes('190001')); assert.ok(!retained.value_json.includes('190002'))
  assert.ok(h.faultCalls.read > 0 && h.faultCalls.write > 0)
  assert.ok(h.bindingIntegrity.checks > 0); assert.equal(h.bindingIntegrity.failures, 0, 'actual Sentry path never overwrites native binding methods')
  assert.deepEqual(h.networkAttempts, [])
})

test('parallel body cache readers all retain native D1 failure and recover in the same workerd', { timeout: 120_000 }, async () => {
  for (const operation of ['read', 'write']) {
    const h = await createFreeHarness()
    try {
      const cookie = await h.login(); h.setFault(operation)
      const responses = await Promise.all(Array.from({ length: 8 }, () => h.fetch('/area', { headers: { cookie } })))
      const statuses = responses.map(response => response.status)
      for (const response of responses) { privacy(response); await response.arrayBuffer() }
      assert.ok(statuses.every(status => status === 503), `${operation} parallel native failure statuses: ${statuses.join(',')}`)
      assert.ok(h.faultCalls[operation] > 0, 'each fault must reach the actual cold native cache operation')
      assert.equal((await h.cacheRows()).length, 0, 'parallel failed work never reports successful persistent cache storage')
      const later = await h.fetch('/area', { headers: { cookie } })
      assert.equal(later.status, 503, 'a later request still fails after original bodies finish while the native fault remains active')
      privacy(later); await consume(later)
      const before = { ...h.faultCalls }; h.setFault(null)
      const recovered = await h.fetch('/area', { headers: { cookie } })
      assert.equal(recovered.status, 200); assert.match(await recovered.text(), /190001/)
      assert.ok(h.faultCalls.read > before.read && h.faultCalls.write > before.write)
      assert.equal(h.bindingIntegrity.failures, 0)
      assert.deepEqual(h.networkAttempts, [])
      console.log('PARALLEL_CACHE_METADATA:' + JSON.stringify({ operation, statuses, laterStatus: later.status, recoveryStatus: recovered.status,
        nativeReadResumed: h.faultCalls.read > before.read, nativeWriteResumed: h.faultCalls.write > before.write, nativeIntegrityFailures: h.bindingIntegrity.failures }))
    } finally { await h.close() }
  }
})

test('actual browser hydrates and changes A→B chunked→A→anonymous without automatic external communication', { timeout: 120_000 }, async t => {
  const h = await createFreeHarness(); const browser = await chromium.launch({ headless: true })
  t.after(async () => { await browser.close(); await h.close() })
  const context = await browser.newContext({ serviceWorkers: 'block' }); const page = await context.newPage()
  const external = []; let scripts = 0
  await page.routeWebSocket('**/*', socket => socket.close())
  await page.addInitScript(() => {
    window.__freeTelemetryAttempts = []
    const record = input => { const url = new URL(typeof input === 'string' ? input : input.url ?? input, location.href)
      if (/telemetry\.example\.invalid|sentry|googletagmanager|google-analytics/.test(url.hostname)) window.__freeTelemetryAttempts.push(url.hostname) }
    const originalFetch = window.fetch; window.fetch = function (input, ...args) { record(input); return originalFetch.call(this, input, ...args) }
    const open = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (method, url, ...args) { record(url); return open.call(this, method, url, ...args) }
    const beacon = navigator.sendBeacon; navigator.sendBeacon = function (url, data) { record(url); return beacon.call(this, url, data) }
  })
  await page.route('**/*', async route => {
    const request = route.request()
    if (new URL(request.url()).origin !== h.origin) { external.push(new URL(request.url()).origin); return route.abort('blockedbyclient') }
    if (request.url().includes('/_next/static/') && request.url().endsWith('.js')) scripts++
    const response = await h.fetch(request.url(), { method: request.method(), headers: await request.allHeaders(),
      ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postDataBuffer() }) })
    return route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers),
      ...(response.headers.getSetCookie().length ? { 'set-cookie': response.headers.getSetCookie().join('\n') } : {}) }, body: Buffer.from(await response.arrayBuffer()) })
  })
  assert.equal((await page.goto(h.origin)).status(), 401)
  const cookie = await h.login(); const [name, value] = cookie.split('=')
  await context.addCookies([{ name, value, url: h.origin, secure: true, httpOnly: true, sameSite: 'Strict' }])
  assert.equal((await page.goto(h.origin, { waitUntil: 'networkidle' })).status(), 200); assert.ok(scripts > 0)
  const menu = page.getByTestId('header-menu').filter({ visible: true }); await menu.click(); assert.equal(await menu.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('#gtm-init').count(), 0)
  for (const [identity, largeCookie, label] of [['a', false, 'Fixture A'], ['b', true, 'Fixture B'], ['a', false, 'Fixture A']]) {
    const status = await page.evaluate(async ({ identity, largeCookie }) => (await fetch('/__preview/identity', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity, largeCookie }) })).status, { identity, largeCookie })
    assert.equal(status, 200); await page.reload({ waitUntil: 'networkidle' })
    await page.getByText(label, { exact: true }).first().waitFor({ state: 'visible' })
    assert.equal(await page.getByText(identity === 'a' ? 'Fixture B' : 'Fixture A', { exact: true }).count(), 0)
    const cookies = (await context.cookies()).filter(item => item.name.startsWith('sb-'))
    assert.ok(cookies.every(item => !item.httpOnly)); assert.equal(cookies.some(item => /\.\d+$/.test(item.name)), largeCookie)
    assert.equal(await page.evaluate(async () => (await fetch('/dashboard')).status), 200)
  }
  await context.clearCookies({ name: /^sb-/ }); await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.getByText('Fixture A', { exact: true }).count(), 0); assert.equal(await page.getByText('Fixture B', { exact: true }).count(), 0)
  assert.equal((await consume(await h.fetch('/dashboard', { headers: { cookie } }))).status, 307)
  assert.deepEqual(await page.evaluate(() => window.__freeTelemetryAttempts), [])
  assert.deepEqual(external, []); assert.deepEqual(h.networkAttempts, [])
})
