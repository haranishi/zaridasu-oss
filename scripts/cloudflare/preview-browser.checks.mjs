import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import { createCloudflareHarness } from './runtime-harness.mjs'
import { SUPABASE_ORIGIN } from './fixtures.mjs'

test('preview browser runs compiled application without Sentry or GTM requests despite configured IDs', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness({ telemetryProbe: true })
  t.after(() => harness.close())
  const server = createServer(async (request, outgoing) => {
    try {
      const response = await harness.fetch(request.url, { method: request.method, headers: request.headers })
      outgoing.writeHead(response.status, Object.fromEntries(response.headers))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.writeHead(500)
      outgoing.end('fixture server failure')
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ serviceWorkers: 'block' })
  await page.routeWebSocket('**/*', socket => socket.close())
  // Observe attempted sends before CSP can block them, not just successful network requests.
  await page.addInitScript(() => {
    window.__fixtureTelemetryRequests = []
    const record = input => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input, location.href)
      if (/telemetry\.example\.invalid|sentry|googletagmanager|google-analytics/.test(url.hostname)) {
        window.__fixtureTelemetryRequests.push(url.hostname)
      }
    }
    const fetch = window.fetch
    window.fetch = function (input, ...args) { record(input); return fetch.call(this, input, ...args) }
    const open = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method, url, ...args) { record(url); return open.call(this, method, url, ...args) }
    const sendBeacon = navigator.sendBeacon
    navigator.sendBeacon = function (url, data) { record(url); return sendBeacon.call(this, url, data) }
  })
  const telemetry = []
  let ownScripts = 0
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (/telemetry\.example\.invalid|sentry|googletagmanager|google-analytics/.test(url.hostname)) telemetry.push(url.hostname)
    if (url.origin === origin) {
      if (url.pathname.startsWith('/_next/static/') && url.pathname.endsWith('.js')) ownScripts++
      return route.continue()
    }
    if (url.origin === SUPABASE_ORIGIN) {
      const response = await harness.backend.handle(new Request(request.url(), { method: request.method(), headers: request.headers() }))
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
    }
    return route.abort('blockedbyclient')
  })
  const response = await page.goto(origin, { waitUntil: 'networkidle' })
  assert.equal(response.status(), 200)
  assert.equal(response.headers()['x-robots-tag'], 'noindex, nofollow')
  assert.ok(ownScripts > 0, 'real compiled browser scripts must run')
  const menu = page.getByTestId('header-menu')
  await menu.click()
  assert.equal(await menu.getAttribute('aria-expanded'), 'true', 'the application must hydrate and handle input')
  assert.equal(await page.locator('#gtm-init').count(), 0)
  assert.equal(await page.locator('noscript iframe[src*="googletagmanager"]').count(), 0)
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('synthetic preview failure'), message: 'synthetic preview failure' }))
  })
  await page.waitForTimeout(300)
  // Existing local analytics can create dataLayer; the GTM loader and its sends must stay absent.
  assert.equal(await page.evaluate(() => Array.isArray(window.dataLayer)
    && window.dataLayer.some(item => item.event === 'gtm.js' || Object.hasOwn(item, 'gtm.start'))), false)
  assert.deepEqual(await page.evaluate(() => window.__fixtureTelemetryRequests), [])
  assert.deepEqual(telemetry, [])
  assert.deepEqual(harness.backend.requests.filter(request => request.host === 'telemetry.example.invalid'), [])
})
