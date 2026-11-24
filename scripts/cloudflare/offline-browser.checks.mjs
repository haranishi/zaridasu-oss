import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { chromium } from '@playwright/test'
import { createCloudflareHarness } from './runtime-harness.mjs'
import { SUPABASE_ORIGIN } from './fixtures.mjs'

// Real HTTP bridge also serves as a deny-by-default browser proxy. SW-owned requests
// bypass Playwright routing, so the proxy prevents an external-network fallback there.
async function browserServer(harness) {
  let origin, updated = false
  const blocked = []
  const server = createServer(async (request, outgoing) => {
    try {
      const url = new URL(request.url, origin)
      if (url.origin !== origin) {
        blocked.push(url.hostname)
        outgoing.writeHead(502).end('fixture browser egress denied')
        return
      }
      const response = await harness.fetch(`${url.pathname}${url.search}`, { method: request.method, headers: request.headers })
      let body = Buffer.from(await response.arrayBuffer())
      if (updated && url.pathname === '/sw.js') {
        // Simulate only a new deployment's generated SW bytes. Production source stays unchanged.
        const source = body.toString('utf8')
        assert.match(source, /const PRECACHE_VERSION = '[^']+'/)
        body = Buffer.from(source.replace(/const PRECACHE_VERSION = '[^']+'/, "const PRECACHE_VERSION = 'fixture-task-6.6-update'"))
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.end(body)
    } catch {
      outgoing.writeHead(500).end('fixture browser server failure')
    }
  })
  server.on('connect', (request, socket) => {
    blocked.push(request.url.split(':')[0])
    socket.end('HTTP/1.1 502 Fixture browser egress denied\r\n\r\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
  return { origin, blocked, update: () => { updated = true },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) }
}

// Installed Playwright's waitForFunction treats a returned Promise as truthy; await async checks in Node.
async function waitForBrowser(page, predicate, arg) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, arg)) return
    } catch (error) {
      // The app reloads on true SW updates; resume polling in the new document.
      if (!/Execution context was destroyed|Cannot find context/.test(error.message)) throw error
    }
    await setTimeout(50)
  }
  throw new Error('browser lifecycle condition did not complete within 15 seconds')
}

async function cachedNavigations(page) {
  return page.evaluate(async () => {
    const result = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        if (response.headers.get('content-type')?.includes('text/html')) {
          result.push({ name, path: new URL(request.url).pathname, html: await response.text() })
        }
      }
    }
    return result
  })
}

test('browser streams actual Wasm and preserves SW scope, update cleanup, offline shells and private exclusion', { timeout: 120_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  const server = await browserServer(harness)
  t.after(() => server.close())
  // Default Playwright headless shell refuses Pointer Lock and never moves the user's cursor.
  const browser = await chromium.launch({ headless: true, proxy: { server: server.origin, bypass: '<-loopback>' } })
  t.after(() => browser.close())
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  await context.routeWebSocket('**/*', socket => socket.close())
  let browserOffline = false
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === server.origin) return route.continue()
    if (url.origin === SUPABASE_ORIGIN) {
      if (browserOffline) return route.abort('internetdisconnected')
      const response = await harness.backend.handle(new Request(request.url(), { method: request.method(), headers: request.headers() }))
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
    }
    return route.abort('blockedbyclient')
  })
  const page = await context.newPage()
  const pageErrors = [], failedPaths = [], scriptResponses = []
  page.on('response', response => {
    const url = new URL(response.url())
    if (url.origin === server.origin && url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js')) {
      scriptResponses.push({ path: url.pathname, status: response.status(), serviceWorker: response.fromServiceWorker() })
    }
  })
  page.on('pageerror', error => { if (pageErrors.length < 20) pageErrors.push(error.message.slice(0, 500)) })
  page.on('requestfailed', request => { if (failedPaths.length < 100) failedPaths.push(new URL(request.url()).pathname) })
  const initial = await page.goto(server.origin, { waitUntil: 'networkidle' })
  assert.equal(initial.status(), 200)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const registration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return { scope: registration.scope, script: registration.active.scriptURL, updateViaCache: registration.updateViaCache }
  })
  assert.deepEqual(registration, { scope: `${server.origin}/`, script: `${server.origin}/sw.js`, updateViaCache: 'none' })
  await waitForBrowser(page, async () => {
    const keys = await caches.keys()
    const name = keys.find(key => key.startsWith('zaridasu-precache-v'))
    return name && !!await (await caches.open(name)).match('/')
  })

  const wasm = JSON.parse(await readFile(new URL('../../rust/water-geometry/artifact.json', import.meta.url), 'utf8'))
  const calculation = await page.evaluate(async url => {
    // MIME and CSP must permit real streaming compilation of the delivered artifact.
    const { instance } = await WebAssembly.instantiateStreaming(fetch(url))
    const api = instance.exports
    const input = new Float64Array([1, 1, 2, 140, 39, 150, 1, 0, 140, 39, 140, 39, 140.1, 39])
    const pointer = api.reserve_input(input.length)
    new Float64Array(api.memory.buffer, pointer, input.length).set(input)
    const ok = api.calculate()
    const output = Array.from(new Float64Array(api.memory.buffer, api.output_ptr(), api.output_len()))
    new Float64Array(api.memory.buffer, pointer, input.length)[0] = 2
    return { abi: api.abi_version(), ok, output, invalid: api.calculate(), invalidLength: api.output_len() }
  }, wasm.url)
  assert.deepEqual(calculation, { abi: 1, ok: 1, output: [39, 39, 140, 140, 39, 140, 0, 1], invalid: 0, invalidLength: 0 })

  // Anonymous dashboard redirects cannot become a cached navigation under /dashboard.
  const anonymousDashboard = await page.goto(`${server.origin}/dashboard`, { waitUntil: 'networkidle' })
  assert.equal(anonymousDashboard.status(), 200)
  assert.equal(new URL(page.url()).pathname, '/')
  assert.ok(!(await cachedNavigations(page)).some(entry => entry.path === '/dashboard'))

  const user = harness.backend.session('a')
  await context.addCookies(user.cookie.split('; ').map(chunk => {
    const split = chunk.indexOf('=')
    return { name: chunk.slice(0, split), value: chunk.slice(split + 1), url: server.origin }
  }))
  const dashboard = await page.goto(`${server.origin}/dashboard`, { waitUntil: 'networkidle' })
  assert.equal(dashboard.status(), 200)
  assert.equal(new URL(page.url()).pathname, '/dashboard')
  assert.match(dashboard.headers()['cache-control'], /private.*no-store/)
  await waitForBrowser(page, async () => {
    const names = await caches.keys()
    const cache = await caches.open(names.find(name => name.startsWith('zaridasu-precache-v')))
    return !!await cache.match('/dashboard')
  })
  const profile = await page.goto(`${server.origin}/profile/${user.user.id}`, { waitUntil: 'networkidle' })
  assert.equal(profile.status(), 200)
  assert.match(await profile.text(), /Fixture A/)
  const shells = await cachedNavigations(page)
  assert.ok(shells.some(entry => entry.path === '/') && shells.some(entry => entry.path === '/dashboard'))
  assert.ok(shells.every(entry => ['/', '/dashboard', '/offline.html'].includes(entry.path)))
  for (const entry of shells) assert.doesNotMatch(entry.html, /Fixture A|a@example\.invalid|00000000-0000-4000-8000-000000000001/)

  await page.evaluate(async () => {
    await (await caches.open('zaridasu-precache-vretired-fixture')).put('/retired-shell', new Response('old shell'))
    await (await caches.open('zaridasu-vdeadbeef')).put('/legacy', new Response('legacy'))
    await (await caches.open('fixture-unrelated')).put('/keep', new Response('keep'))
  })
  const oldAssets = await page.evaluate(async () => (await (await caches.open('zaridasu-assets')).keys()).map(request => request.url))
  assert.ok(oldAssets.some(url => url.includes('/_next/static/')))
  server.update()
  await page.evaluate(() => { navigator.serviceWorker.getRegistration().then(registration => registration.update()) })
  await waitForBrowser(page, async () => (await caches.keys()).includes('zaridasu-precache-vfixture-task-6.6-update'))
  await waitForBrowser(page, async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    const keys = await caches.keys()
    return registration.active.state === 'activated' && !keys.includes('zaridasu-vdeadbeef')
      && keys.every(name => !name.startsWith('zaridasu-precache-v') || name.endsWith('fixture-task-6.6-update'))
  })
  const cachesAfter = await page.evaluate(async () => ({ names: await caches.keys(), assets: (await (await caches.open('zaridasu-assets')).keys()).map(request => request.url) }))
  assert.ok(!cachesAfter.names.includes('zaridasu-vdeadbeef'))
  assert.ok(cachesAfter.names.includes('fixture-unrelated'))
  assert.ok(oldAssets.every(url => cachesAfter.assets.includes(url)), 'immutable assets survive SW update')
  await waitForBrowser(page, async () => {
    const cache = await caches.open('zaridasu-precache-vfixture-task-6.6-update')
    return !!await cache.match('/') && !!await cache.match('/dashboard')
  })

  // Visit both lazy features online before testing their known-warm offline shell.
  // The production SW only warms HTML references; never-visited chunks remain a cutover limitation.
  const loadable = JSON.parse(await readFile(new URL('../../.next/react-loadable-manifest.json', import.meta.url), 'utf8'))
  const homeProfile = Object.entries(loadable).find(([name]) => name.endsWith('HomeHub.tsx -> ./HomeProfile'))?.[1]
  const drawerMenu = Object.entries(loadable).find(([name]) => name.endsWith('Header.tsx -> ./DrawerMenu'))?.[1]
  assert.ok(homeProfile?.files.length)
  assert.ok(drawerMenu?.files.length)
  const lazyDependencies = {
    homeProfile: homeProfile.files.map(file => `/_next/${file}`),
    drawerMenu: drawerMenu.files.map(file => `/_next/${file}`),
  }
  const warmedLazyPaths = [...new Set(Object.values(lazyDependencies).flat())]
  await page.goto(server.origin, { waitUntil: 'networkidle' })
  await page.locator('.loading-screen').waitFor({ state: 'detached' })
  await page.getByTestId('header-menu').click()
  await page.getByRole('dialog').getByTestId('drawer-intro').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await waitForBrowser(page, async expected => {
    const cache = await caches.open('zaridasu-assets')
    for (const pathname of expected) {
      if ((await cache.match(pathname))?.status !== 200) return false
    }
    return true
  }, warmedLazyPaths)
  for (const pathname of warmedLazyPaths) {
    assert.ok(scriptResponses.some(response => response.path === pathname && response.status === 200),
      `actual online component loading must receive HTTP 200 for ${pathname}`)
  }
  const onlineCachedPaths = await page.evaluate(async () => (await (await caches.open('zaridasu-assets')).keys())
    .map(request => new URL(request.url).pathname))
  browserOffline = true
  await context.setOffline(true)
  const offlineRoot = await page.goto(server.origin, { waitUntil: 'domcontentloaded' })
  assert.equal(offlineRoot.status(), 200)
  assert.equal(offlineRoot.fromServiceWorker(), true)
  const menu = page.getByTestId('header-menu')
  try {
    await menu.click({ timeout: 5_000 })
    await page.getByRole('dialog').getByTestId('drawer-intro').waitFor({ state: 'visible', timeout: 5_000 })
  } catch (error) {
    const directory = new URL('../../.wrangler/task-6.6/', import.meta.url)
    await mkdir(directory, { recursive: true })
    await page.screenshot({ path: new URL('offline-failure.png', directory).pathname })
    await writeFile(new URL('offline-failure.json', directory), JSON.stringify({
      pathname: new URL(page.url()).pathname, pageErrors, failedPaths,
      title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 2000),
    }, null, 2))
    throw error
  }
  assert.equal(await menu.getAttribute('aria-expanded'), 'true', 'offline cached shell and chunks hydrate')
  const evidenceDirectory = new URL('../../.wrangler/task-6.6/', import.meta.url)
  await mkdir(evidenceDirectory, { recursive: true })
  await page.locator('.loading-screen').waitFor({ state: 'detached' })
  // Allow delayed dynamic-import recovery to run before calling the UI stable.
  await setTimeout(1_500)
  assert.equal(await page.getByRole('dialog').getByTestId('drawer-intro').isVisible(), true,
    'real offline Drawer content remains visible beyond asynchronous loading')
  const readOfflineState = () => page.evaluate(async () => {
    let cacheNames = []
    try { if ('caches' in window) cacheNames = await caches.keys() } catch { /* Native error pages may deny storage. */ }
    return { title: document.title, pathname: location.pathname,
      hasMenu: !!document.querySelector('[data-testid=header-menu]'),
      hasDrawer: !!document.querySelector('[role=dialog] [data-testid=drawer-intro]'),
      loadingScreen: !!document.querySelector('.loading-screen'),
      controller: !!navigator.serviceWorker?.controller,
      registration: !!await navigator.serviceWorker?.getRegistration(), caches: cacheNames }
  })
  const assertRetainedShell = state => {
    assert.ok(state.hasMenu, 'offline UI remains mounted beyond asynchronous loading')
    assert.equal(state.loadingScreen, false)
    assert.ok(state.controller && state.registration, 'offline shell retains its SW controller and registration')
    assert.ok(cachesAfter.names.every(name => state.caches.includes(name)), 'offline shell retains all post-update caches')
  }
  const offlineState = await readOfflineState()
  assert.equal(offlineState.pathname, '/')
  assert.equal(offlineState.hasDrawer, true)
  assertRetainedShell(offlineState)
  await page.screenshot({ path: new URL('offline-root.png', evidenceDirectory).pathname })
  const diagnostic = { lazyDependencies, onlineCachedPaths, scriptResponses, failedPaths, pageErrors }
  await writeFile(new URL('offline-root-state.json', evidenceDirectory), JSON.stringify({ ...diagnostic, offlineState }, null, 2))
  const offlineDashboard = await page.goto(`${server.origin}/dashboard`, { waitUntil: 'domcontentloaded' })
  assert.equal(offlineDashboard.status(), 200)
  assert.equal(offlineDashboard.fromServiceWorker(), true)
  assert.doesNotMatch(await offlineDashboard.text(), /Fixture A|a@example\.invalid/)
  await page.locator('.loading-screen').waitFor({ state: 'detached' })
  await setTimeout(1_500)
  const offlineDashboardState = await readOfflineState()
  assert.equal(offlineDashboardState.pathname, '/dashboard')
  assertRetainedShell(offlineDashboardState)
  const offlineProfile = await page.goto(`${server.origin}/profile/${user.user.id}`, { waitUntil: 'domcontentloaded' })
  assert.equal(offlineProfile.fromServiceWorker(), true)
  assert.match(await offlineProfile.text(), /オフラインです/)
  assert.doesNotMatch(await offlineProfile.text(), /Fixture A/)
  assert.equal(await page.evaluate(async () => {
    try { await fetch('/api/nearby-water?lat=invalid&lng=140'); return false } catch { return true }
  }), true, 'API responses are never supplied from SW cache')
  assert.ok((await cachedNavigations(page)).every(entry => ['/', '/dashboard', '/offline.html'].includes(entry.path)))
  assert.ok(server.blocked.every(host => host === new URL(SUPABASE_ORIGIN).hostname),
    'proxy denies all external connections; only the synthetic backend may be attempted by SW-owned fetches')
  await writeFile(new URL('browser-result.json', evidenceDirectory), JSON.stringify({ registration, wasm: calculation,
    cachesAfterUpdate: cachesAfter.names, retainedAssetCount: oldAssets.length,
    offlineRootFromSW: offlineRoot.fromServiceWorker(), offlineDashboardFromSW: offlineDashboard.fromServiceWorker(),
    offlineProfileFromSW: offlineProfile.fromServiceWorker(), blockedSyntheticProxyAttempts: server.blocked.length,
    offlinePrecondition: 'authenticated root and actual Drawer visited online; all manifest lazy dependencies received HTTP 200 and entered SW cache',
    lazyDependencies, offlineRootState: offlineState, offlineDashboardState, stabilityDelayMs: 1_500,
    residual: 'never-visited lazy chunks and offline draft submission remain outside this known-warm shell check',
  }, null, 2))
})
