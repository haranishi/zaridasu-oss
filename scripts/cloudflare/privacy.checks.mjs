import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { createCloudflareHarness } from './runtime-harness.mjs'

test('preview SSR/API/redirect responses forbid indexing', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness({ telemetryProbe: true })
  t.after(() => harness.close())
  for (const pathname of ['/', '/api/nearby-water?lat=invalid&lng=140', '/admin']) {
    const response = await harness.fetch(pathname)
    const body = await response.text()
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', pathname)
    assert.ok(!body.includes('GTM-FIXTURE-ONLY') && !body.includes('gtm-init'), pathname)
  }
  assert.deepEqual(harness.backend.requests.filter(request => request.host === 'telemetry.example.invalid'), [])
})

test('real ASSETS responses preserve Next security and cache headers', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  const manifest = JSON.parse(await readFile(new URL('../../.next/routes-manifest.json', import.meta.url), 'utf8'))
  const securityHeaders = manifest.headers.find(rule => rule.source === '/(.*)').headers
  const appManifest = JSON.parse(await readFile(new URL('../../.next/app-build-manifest.json', import.meta.url), 'utf8'))
  const staticChunk = Object.values(appManifest.pages).flat().find(filename => filename.endsWith('.js'))
  assert.ok(staticChunk)
  const wasm = (await readdir(new URL('../../public/wasm/', import.meta.url))).find(filename => filename.endsWith('.wasm'))
  assert.ok(wasm)
  for (const [pathname, cache, contentType] of [
    ['/icon-192.png'],
    ['/images/leaflet/marker-icon.png', 'public, max-age=31536000, immutable'],
    [`/wasm/${wasm}`, 'public, max-age=31536000, immutable', 'application/wasm'],
    [`/_next/${staticChunk}`, 'public, max-age=31536000, immutable'],
    ['/sw.js', 'no-cache, no-store, must-revalidate'],
  ]) {
    const response = await harness.fetch(pathname)
    assert.equal(response.status, 200, pathname)
    await response.arrayBuffer()
    for (const { key, value } of securityHeaders) assert.equal(response.headers.get(key), value, `${pathname}: ${key}`)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', pathname)
    if (cache) assert.equal(response.headers.get('cache-control'), cache, pathname)
    if (contentType) assert.equal(response.headers.get('content-type'), contentType, pathname)
  }
})
