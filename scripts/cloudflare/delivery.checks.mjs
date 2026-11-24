import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { createCloudflareHarness } from './runtime-harness.mjs'
import { SUPABASE_ORIGIN } from './fixtures.mjs'

const marker = `${SUPABASE_ORIGIN}/storage/v1/object/public/runtime-fixture/marker-icon.png`
const optimized = source => `/_next/image?${new URLSearchParams({ url: source, w: '32', q: '75' })}`

test('real image optimizer resizes allowed images and never fetches forbidden origins', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  await t.test('IMAGES binding downsizes licensed Leaflet marker from 50x82 to 32x52', async () => {
    for (const source of [marker, marker.replace('/object/', '/render/image/')]) {
      const response = await harness.fetch(optimized(source))
      assert.equal(response.status, 200)
      assert.equal(response.headers.get('content-type'), 'image/png')
      const image = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
      assert.deepEqual([image.width, image.height], [32, 52], 'must transform, not return the original image')
    }
    assert.equal(harness.backend.requests.filter(r => r.kind === 'image').length, 2)
  })
  await t.test('disallowed URLs fail before attempting outbound fetch', async () => {
    for (const source of [
      'https://outside.example.invalid/forbidden.png',
      'https://other.supabase.co/storage/v1/object/public/forbidden.png',
      `${SUPABASE_ORIGIN}/auth/v1/user`,
      marker.replace('https:', 'http:'), marker.replace('.co/', '.co:8443/'),
      marker.replace('/public/', '/private/'),
      'http://127.0.0.1/forbidden.png', 'http://[::1]/forbidden.png',
      '//outside.example.invalid/forbidden.png',
      marker.replace('https://', 'https://fixture:synthetic@'),
    ]) {
      const before = harness.backend.requests.length
      const response = await harness.fetch(optimized(source))
      await response.text()
      assert.equal(response.status, 400, source)
      assert.equal(harness.backend.requests.length, before, `must reject before fetching ${source}`)
    }
  })
  await t.test('allowed upstream redirect is stopped before fetching Location', async () => {
    for (const destination of ['outside', 'loopback', 'relative', 'protocolRelative']) {
      const before = harness.backend.requests.length
      const response = await harness.fetch(optimized(`${SUPABASE_ORIGIN}/storage/v1/object/public/runtime-fixture/redirect.png?destination=${destination}`))
      await response.text()
      assert.equal(response.status, 508)
      assert.deepEqual(harness.backend.requests.slice(before).map(r => r.kind), ['image-redirect'])
    }
  })
  await t.test('unused CDN image proxy is rejected even for normalized paths and self-binding requests', async () => {
    const self = (await harness.getBindings()).WORKER_SELF_REFERENCE
    for (const pathname of [
      '/cdn-cgi/image/width=16/https://outside.example.invalid/forbidden.png',
      '/cdn-cgi/image/width=16/http://127.0.0.1/forbidden.png',
      '/a/../cdn-cgi/image/width=16/https://outside.example.invalid/forbidden.png',
      '/cdn-cgi\\image/width=16/https://outside.example.invalid/forbidden.png',
    ]) {
      for (const headers of [{}, { 'x-prerender-revalidate': 'synthetic-only' }]) {
        for (const throughSelf of [false, true]) {
          const before = harness.backend.requests.length
          const response = throughSelf
            ? await self.fetch(new URL(pathname, 'https://fixture.example.invalid').href, { headers })
            : await harness.fetch(pathname, { headers })
          await response.text()
          assert.equal(response.status, 404)
          assert.equal(harness.backend.requests.length, before, 'no request to the arbitrary upstream')
        }
      }
    }
  })
})

test('real Next ImageResponse renders Japanese and emoji PNG in workerd', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  const buffers = []
  for (const title of ['秋田の外来生物調査', '水辺の記録を共有']) {
    const response = await harness.fetch(`/api/og?${new URLSearchParams({ title, area: '秋田県', species: 'american' })}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    const buffer = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(buffer).metadata()
    assert.deepEqual([metadata.width, metadata.height], [1200, 630])
    buffers.push(buffer)
  }
  assert.notDeepEqual(buffers[0], buffers[1], 'dynamic Japanese title must affect rendered PNG')
  for (const kind of ['og-font-css', 'og-font', 'og-emoji']) {
    assert.ok(harness.backend.requests.some(r => r.kind === kind), kind)
  }
  assert.deepEqual(harness.backend.requests.filter(r => r.kind === 'blocked'), [])
  const directory = new URL('../../.wrangler/task-6.6/', import.meta.url)
  await mkdir(directory, { recursive: true })
  await writeFile(new URL('og-japanese.png', directory), buffers[0])
})
