import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { createCloudflareHarness } from './runtime-harness.mjs'

// Data values are public synthetic aggregates. No production route or clock flag is added.
test('actual Next ISR fills R2, hits, revalidates through DO and survives Worker restart', { timeout: 90_000 }, async t => {
  const harness = await createCloudflareHarness()
  t.after(() => harness.close())
  harness.backend.setMunicipalityPostCount(190001)
  const first = await harness.fetch('/area')
  assert.equal(first.headers.get('x-nextjs-cache'), 'MISS')
  assert.match(await first.text(), /190001/)
  assert.equal(harness.backend.requests.filter(r => r.kind === 'municipality-counts').length, 1)
  const bucket = await harness.getCacheBucket()
  let entry
  for (const object of (await bucket.list()).objects) {
    if ((await (await bucket.get(object.key)).text()).includes('190001')) entry = { key: object.key, uploaded: object.uploaded.getTime() }
  }
  assert.ok(entry, 'real ISR output is persisted in the configured R2 bucket')
  const original = await (await bucket.get(entry.key)).text()
  assert.match(original, /190001/)
  const keys = (await bucket.list()).objects.map(o => o.key)
  harness.backend.setMunicipalityPostCount(190002)
  const hit = await harness.fetch('/area')
  assert.equal(hit.headers.get('x-nextjs-cache'), 'HIT')
  assert.match(await hit.text(), /190001/)
  assert.equal(harness.backend.requests.filter(r => r.kind === 'municipality-counts').length, 1)
  const state = harness.stateDirectory
  await harness.restart()
  assert.equal(harness.stateDirectory, state)
  const persisted = await harness.fetch('/area')
  assert.equal(persisted.headers.get('x-nextjs-cache'), 'HIT')
  assert.match(await persisted.text(), /190001/)
  assert.equal(harness.backend.requests.filter(r => r.kind === 'municipality-counts').length, 1)
  // Age only the real local R2 upload metadata while workerd is stopped, not the cache JSON.
  await harness.restart({ ageCache: { key: entry.key, milliseconds: 3_601_000 } })
  assert.ok((await (await harness.getCacheBucket()).head(entry.key)).uploaded < entry.uploaded)
  const stale = await harness.fetch('/area')
  assert.equal(stale.headers.get('x-nextjs-cache'), 'STALE')
  assert.match(await stale.text(), /190001/)
  let fresh
  for (let attempt = 0; attempt < 40; attempt++) {
    await setTimeout(100)
    const response = await harness.fetch('/area')
    const body = await response.text()
    if (body.includes('190002')) { fresh = response; break }
  }
  assert.ok(fresh, 'DO revalidation must publish changed public data')
  assert.equal(fresh.headers.get('x-nextjs-cache'), 'HIT')
  assert.equal(harness.backend.requests.filter(r => r.kind === 'municipality-counts').length, 2)
  const sync = await harness.getRevalidationState()
  assert.ok(sync.some(row => /^127\.0\.0\.1:\d+\/area$/.test(row.id) && row.lastSuccess > 0 && row.buildId),
    'real DO sync rows are written only after native SELF binding HEAD returns REVALIDATED')
  const refreshed = await (await (await harness.getCacheBucket()).get(entry.key)).text()
  assert.match(refreshed, /190002/)
  await harness.restart()
  const restarted = await harness.fetch('/area')
  assert.equal(restarted.headers.get('x-nextjs-cache'), 'HIT')
  assert.match(await restarted.text(), /190002/)
  const user = harness.backend.session('a', { expired: true })
  const privateResponse = await harness.fetch('/admin', { headers: { cookie: user.cookie } })
  assert.equal(privateResponse.status, 307)
  assert.ok(privateResponse.headers.get('set-cookie'))
  assert.match(privateResponse.headers.get('cache-control'), /private.*no-store/)
  assert.doesNotMatch(await privateResponse.text(), /Fixture A/)
  const owner = harness.backend.session('a')
  const profile = await harness.fetch(`/profile/${owner.user.id}`, { headers: { cookie: owner.cookie } })
  assert.equal(profile.status, 200)
  assert.match(await profile.text(), /Fixture A/)
  assert.deepEqual((await (await harness.getCacheBucket()).list()).objects.map(o => o.key), keys,
    'private responses with Set-Cookie must not populate shared R2 cache')
  for (const object of (await (await harness.getCacheBucket()).list()).objects) {
    assert.doesNotMatch(await (await (await harness.getCacheBucket()).get(object.key)).text(), /Fixture A|example\.invalid|sb-placeholder-auth-token/)
  }
  // Next may store the static generic dashboard shell; the final Proxy response stays per-user.
  const refresh = harness.backend.session('b', { expired: true })
  const dashboard = await harness.fetch('/dashboard', { headers: { cookie: refresh.cookie } })
  assert.equal(dashboard.status, 200)
  assert.ok(dashboard.headers.get('set-cookie'))
  assert.match(dashboard.headers.get('cache-control'), /private.*no-store/)
  assert.doesNotMatch(await dashboard.text(), /Fixture A|Fixture B/)
  for (const object of (await (await harness.getCacheBucket()).list()).objects) {
    assert.doesNotMatch(await (await (await harness.getCacheBucket()).get(object.key)).text(),
      /Fixture A|Fixture B|example\.invalid|set-cookie|sb-placeholder-auth-token/i)
  }
  const denied = await harness.fetch('/dashboard')
  assert.equal(denied.status, 307, 'a shared generic shell cannot bypass per-user Proxy authentication')
  await denied.text()
  assert.deepEqual(harness.backend.requests.filter(r => r.kind === 'blocked'), [])
})
