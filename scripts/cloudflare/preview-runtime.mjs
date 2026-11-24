import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { createPreviewHarness } from './preview-harness.mjs'

const privateHeaders = response => {
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(response.headers.get('cache-control'), /private.*no-store/)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/)
}

test('upload preview bundle gates assets and preserves actual app Auth/role/cookie privacy', { timeout: 90_000 }, async t => {
  const h = await createPreviewHarness()
  t.after(() => h.close())
  for (const path of ['/', '/sw.js', '/wasm/water_geometry.wasm', '/api/og', '/robots.txt', '/images/american-crayfish.jpg']) {
    const response = await h.fetch(path)
    assert.equal(response.status, 401, path)
    privateHeaders(response)
    await response.body?.cancel()
  }
  const cookie = await h.login()
  const home = await h.fetch('/', { headers: { cookie } })
  assert.equal(home.status, 200)
  privateHeaders(home)
  const html = await home.text()
  const asset = html.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/)[1]
  assert.equal((await h.fetch(asset)).status, 401, 'real emitted JS is access gated')
  assert.equal((await h.fetch(asset, { headers: { cookie } })).status, 200)
  assert.equal((await h.fetch('/dashboard', { headers: { cookie } })).status, 307, 'perimeter cookie does not authenticate app user')
  assert.equal((await h.fetch('/area', { method: 'HEAD', headers: { 'x-isr': '1', 'x-prerender-revalidate': 'forged' } })).status, 401)
  const user = await h.identity(cookie, 'a', { expired: true, forgedAdmin: true })
  const adminDenied = await h.fetch('/admin', { headers: { cookie: user.cookie } })
  assert.equal(adminDenied.status, 307, 'untrusted user_metadata admin cannot confer role')
  assert.equal(new URL(adminDenied.headers.get('location'), h.origin).pathname, '/')
  assert.ok(adminDenied.headers.get('set-cookie'), 'actual Supabase SSR refresh cookie survives redirect')
  privateHeaders(adminDenied)
  const fresh = await h.identity(cookie, 'a')
  const dashboard = await h.fetch('/dashboard', { headers: { cookie: fresh.cookie } })
  assert.equal(dashboard.status, 200)
  privateHeaders(dashboard)
  await dashboard.body?.cancel()
  const profile = await h.fetch(`/profile/${fresh.userId}`, { headers: { cookie: fresh.cookie } })
  assert.equal(profile.status, 200)
  assert.match(await profile.text(), /Fixture A/)
  for (const object of (await (await h.bucket()).list()).objects) {
    const value = await (await (await h.bucket()).get(object.key)).text()
    assert.doesNotMatch(value, /Fixture A|Fixture B|example\.invalid|set-cookie|__Host-zaridasu-preview|sb-zaridasu/i)
  }
  assert.deepEqual(h.networkAttempts, [], 'SDK and app server fetch must terminate at service binding')
})

test('preview uses native R2/DO self ISR and native image/OG processing without network', { timeout: 90_000 }, async t => {
  const h = await createPreviewHarness()
  t.after(() => h.close())
  const cookie = await h.login()
  const first = await h.fetch('/area', { headers: { cookie } })
  assert.equal(first.headers.get('x-nextjs-cache'), 'MISS')
  assert.match(await first.text(), /190001/)
  let cacheKey
  for (const object of (await (await h.bucket()).list()).objects) {
    if ((await (await (await h.bucket()).get(object.key)).text()).includes('190001')) cacheKey = object.key
  }
  assert.ok(cacheKey)
  const hit = await h.fetch('/area', { headers: { cookie } })
  assert.equal(hit.headers.get('x-nextjs-cache'), 'HIT')
  await hit.body?.cancel()
  await h.restart({ ageCache: cacheKey })
  const stale = await h.fetch('/area', { headers: { cookie } })
  assert.equal(stale.headers.get('x-nextjs-cache'), 'STALE')
  await stale.body?.cancel()
  let fresh = false
  for (let attempt = 0; attempt < 40; attempt++) {
    await setTimeout(100)
    const response = await h.fetch('/area', { headers: { cookie } })
    await response.body?.cancel()
    if (response.headers.get('x-nextjs-cache') === 'HIT') { fresh = true; break }
  }
  assert.equal(fresh, true)
  const queueState = await h.queueState()
  assert.ok(queueState.some(row => row.id.endsWith('/area') && row.lastSuccess > 0 && row.buildId),
    'native DO succeeds only when its signed HEAD self-binding request passes preview gate and returns REVALIDATED')
  const image = await h.fetch('/_next/image?url=' + encodeURIComponent(h.origin + '/storage/v1/object/public/runtime-fixture/marker-icon.png') + '&w=32&q=75',
    { headers: { cookie, accept: 'image/webp' } })
  assert.equal(image.status, 200)
  const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata()
  assert.equal(metadata.width, 32)
  const deniedImage = await h.fetch('/_next/image?url=' + encodeURIComponent('https://production.supabase.co/storage/v1/object/public/private.png') + '&w=32&q=75', { headers: { cookie } })
  assert.equal(deniedImage.status, 400)
  const og = await h.fetch('/api/og?title=' + encodeURIComponent('秋田の外来生物調査') + '&description=' + encodeURIComponent('水辺の記録を共有') + '&emoji=' + encodeURIComponent('🦞'), { headers: { cookie } })
  assert.equal(og.status, 200)
  assert.equal(og.headers.get('content-type'), 'image/png')
  assert.equal((await sharp(Buffer.from(await og.arrayBuffer())).metadata()).width, 1200)
  assert.deepEqual(h.networkAttempts, [])
})

test('actual preview browser hydrates behind the perimeter while CSP denies external automatic communication', { timeout: 90_000 }, async t => {
  const h = await createPreviewHarness()
  const browser = await chromium.launch({ headless: true })
  t.after(async () => { await browser.close(); await h.close() })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  const external = []
  let scripts = 0
  await page.route('**/*', async route => {
    const request = route.request()
    if (new URL(request.url()).origin !== h.origin) { external.push(new URL(request.url()).origin); return route.abort('blockedbyclient') }
    if (request.url().includes('/_next/static/') && request.url().endsWith('.js')) scripts++
    const response = await h.fetch(request.url(), { method: request.method(), headers: await request.allHeaders(),
      ...(['GET', 'HEAD'].includes(request.method()) ? {} : { body: request.postDataBuffer() }) })
    return route.fulfill({ status: response.status, headers: { ...Object.fromEntries(response.headers), ...(response.headers.getSetCookie().length ? { 'set-cookie': response.headers.getSetCookie().join('\n') } : {}) }, body: Buffer.from(await response.arrayBuffer()) })
  })
  assert.equal((await page.goto(h.origin)).status(), 401)
  assert.match(await page.textContent('body'), /合成データ/)
  const cookie = await h.login()
  const [name, value] = cookie.split('=')
  await context.addCookies([{ name, value, url: h.origin, secure: true, httpOnly: true, sameSite: 'Strict' }])
  const response = await page.goto(h.origin, { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  assert.ok(scripts > 0)
  const menu = page.getByTestId('header-menu')
  await menu.click()
  assert.equal(await menu.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('#gtm-init').count(), 0)

  // The real AuthProvider must read the same app session through createBrowserClient/document.cookie.
  for (const [identity, largeCookie, label] of [['a', false, 'Fixture A'], ['b', true, 'Fixture B'], ['a', false, 'Fixture A']]) {
    const result = await page.evaluate(async ({ identity, largeCookie }) => {
      const response = await fetch('/__preview/identity', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identity, largeCookie }) })
      return { status: response.status, ...(await response.json()) }
    }, { identity, largeCookie })
    assert.equal(result.status, 200)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText(label, { exact: true }).first().waitFor({ state: 'visible' })
    assert.equal(await page.getByText(identity === 'a' ? 'Fixture B' : 'Fixture A', { exact: true }).count(), 0)
    const appCookies = (await context.cookies()).filter(cookie => cookie.name.startsWith('sb-'))
    assert.ok(appCookies.every(cookie => !cookie.httpOnly))
    assert.equal(appCookies.some(cookie => /\.\d+$/.test(cookie.name)), largeCookie)
    assert.ok(appCookies.every(cookie => cookie.value.length > 0))
    const status = await page.evaluate(async () => (await fetch('/dashboard')).status)
    assert.equal(status, 200)
    assert.equal((await h.fetch('/admin', { headers: { cookie: (await context.cookies()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ') } })).status, 307)
  }

  const blocked = await page.evaluate(async () => {
    try { await fetch('https://outside.example.invalid/test'); return false } catch { return true }
  })
  assert.equal(blocked, true)
  assert.deepEqual(external, [], 'browser CSP blocks external requests before network routing')
  assert.deepEqual(h.networkAttempts, [])
})
