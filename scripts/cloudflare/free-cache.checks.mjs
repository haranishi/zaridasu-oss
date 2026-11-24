import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { computeCacheKey } from '@opennextjs/cloudflare/overrides/internal'
import { createD1Cache, D1CacheError, MAX_VALUE_BYTES } from '../../cloudflare/free/d1-cache.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const KEY_OPTIONS = { prefix: 'incremental-cache', buildId: 'synthetic-build-a' }
const app = html => ({ type: 'app', html, rsc: '', meta: { status: 200 }, revalidate: 3600 })
const fetchValue = { kind: 'FETCH', data: { headers: {}, body: 'public-fetch', url: 'https://fixture.example.invalid' } }
const composableValue = { value: 'cHVibGlj', tags: [], stale: 60, timestamp: 123, expire: 3600, revalidate: 60 }

function rejectsSafely(operation, code) {
  return assert.rejects(operation, error => {
    assert.ok(error instanceof D1CacheError)
    assert.equal(error.code, code)
    assert.equal(error.name, 'D1CacheError')
    assert.equal(Object.hasOwn(error, 'cause'), false)
    assert.doesNotMatch(`${inspect(error)} ${JSON.stringify(error)}`, /synthetic-private-marker|SELECT |INSERT |DELETE |Your account has exceeded/)
    return true
  })
}

// Delegates preparation and binding to a real D1 binding. Only execution fails.
// This is fault injection, not a measurement of account-level Free quota enforcement.
function faultDatabase(database, failure) {
  const counts = { read: 0, write: 0 }
  const statement = native => ({
    bind: (...values) => statement(native.bind(...values)),
    async first() {
      counts.read++
      if (failure.read) throw new Error(failure.read)
      return native.first()
    },
    async run() {
      counts.write++
      if (failure.write) throw new Error(failure.write)
      if (failure.unsuccessful) return { success: false, error: 'synthetic-private-marker' }
      return native.run()
    },
  })
  return { counts, binding: {
    prepare: sql => statement(database.prepare(sql)),
    withSession: constraint => {
      const session = database.withSession(constraint)
      return { prepare: sql => statement(session.prepare(sql)) }
    },
  } }
}

function guardCredentialReads() {
  const reads = []
  const originalSync = fs.readFileSync
  const originalAsync = fs.promises.readFile
  function guard(filename) {
    if (typeof filename !== 'string' && !(filename instanceof URL)) return
    const name = filename instanceof URL ? fileURLToPath(filename) : path.resolve(filename)
    if (/\/(?:\.env(?:\.[^/]*)?|\.dev\.vars(?:\.[^/]*)?)$/.test(name)
      || /\/(?:\.wrangler\/config|\.config\/(?:\.wrangler|wrangler|cloudflare))\//.test(name)) {
      reads.push(path.basename(name))
      throw new Error('Credential configuration reads are forbidden in native D1 checks')
    }
  }
  fs.readFileSync = function (filename, ...args) { guard(filename); return originalSync.call(this, filename, ...args) }
  fs.promises.readFile = function (filename, ...args) { guard(filename); return originalAsync.call(this, filename, ...args) }
  syncBuiltinESMExports()
  return { reads, restore() {
    fs.readFileSync = originalSync
    fs.promises.readFile = originalAsync
    syncBuiltinESMExports()
  } }
}

async function nativeHarness() {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  const parent = path.join(ROOT, '.wrangler/task-7.1/native-runs')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  const state = await mkdtemp(path.join(parent, 'run-'))
  let runtime, database
  const outbound = []
  async function start() {
    runtime = new Miniflare(convertV4MiniflareOptions({
      host: '127.0.0.1', port: 0, cf: false, telemetry: { enabled: false },
      resourcePersistencePath: path.join(state, 'storage'),
      isolatedResourcePersistencePath: path.join(state, 'isolated'), resourceTmpPath: path.join(state, 'tmp'),
      workers: [{ name: 'd1-cache-native-check', compatibilityDate: '2026-11-14', modules: true,
        script: 'export default { fetch(request) { return fetch(request); } }',
        d1Databases: { NEXT_INC_CACHE_D1: 'synthetic-task-7-1' },
        outboundService: request => { outbound.push(new URL(request.url).hostname); return new Response('denied', { status: 502 }) },
      }],
    }))
    await runtime.ready
    database = await runtime.getD1Database('NEXT_INC_CACHE_D1')
  }
  try { await start() } catch (error) { await runtime?.dispose(); await rm(state, { recursive: true, force: true }); throw error }
  return { get database() { return database }, getDatabase: () => database, outbound,
    probe: () => runtime.dispatchFetch('https://outside.example.invalid/blocked'),
    async restart() { await runtime.dispose(); await start() },
    async close() { try { await runtime.dispose() } finally { await rm(state, { recursive: true, force: true }) } },
  }
}

test('D1 incremental cache uses isolated native storage and fails closed', { timeout: 90_000 }, async t => {
  const credentials = guardCredentialReads()
  t.after(() => credentials.restore())
  const harness = await nativeHarness()
  t.after(() => harness.close())
  const schema = await readFile(path.join(ROOT, 'cloudflare/free/cache-schema.sql'), 'utf8')
  const cache = createD1Cache(harness.getDatabase, { getKeyOptions: () => KEY_OPTIONS })

  await t.test('binding resolution is lazy and missing/context failures are typed', async () => {
    let calls = 0
    const absent = createD1Cache(() => { calls++; return undefined })
    assert.equal(calls, 0)
    for (const operation of [() => absent.get('missing'), () => absent.set('missing', app('public')), () => absent.delete('missing')]) {
      await rejectsSafely(operation, 'MISSING_BINDING')
    }
    assert.equal(calls, 3)
    await rejectsSafely(() => createD1Cache(() => { throw new Error('synthetic-private-marker') }).get('missing'), 'MISSING_BINDING')
  })

  await t.test('schema is explicit, native and indexed; operations never auto-create it', async () => {
    for (const operation of [() => cache.get('missing'), () => cache.set('missing', app('public')), () => cache.delete('missing')]) {
      await rejectsSafely(operation, 'STORAGE_FAILURE')
    }
    assert.equal(await harness.database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'opennext_cache'").first('count'), 0)
    await harness.database.prepare(schema).run()
    await harness.database.prepare(schema).run()
    const info = await harness.database.prepare('PRAGMA table_info(opennext_cache)').all()
    assert.equal(info.results.find(column => column.name === 'cache_key').pk, 1)
    const plan = await harness.database.prepare('EXPLAIN QUERY PLAN SELECT value_json, last_modified FROM opennext_cache WHERE cache_key = ?').bind('synthetic').all()
    assert.match(plan.results.map(row => row.detail).join(' '), /PRIMARY KEY|INDEX/)
    assert.equal(await cache.get('true-miss'), null)
  })

  await t.test('JSON and timestamp persist through upsert and primary-session reads', async () => {
    const constraints = []
    const primary = createD1Cache(() => ({
      prepare: sql => harness.database.prepare(sql),
      withSession: constraint => { constraints.push(constraint); return harness.database.withSession(constraint) },
    }), { getKeyOptions: () => KEY_OPTIONS, now: () => 1_700_000_000_123 })
    await primary.set('/area', app('public-日本語'))
    assert.deepEqual(await primary.get('/area'), { value: app('public-日本語'), lastModified: 1_700_000_000_123 })
    await primary.set('/area', app('public-updated'))
    assert.equal((await primary.get('/area')).value.html, 'public-updated')
    assert.deepEqual(constraints, ['first-primary', 'first-primary'])
    const stored = await harness.database.prepare('SELECT cache_key, value_json, last_modified FROM opennext_cache WHERE cache_key = ?')
      .bind(computeCacheKey('/area', { ...KEY_OPTIONS, cacheType: 'cache' })).first()
    assert.deepEqual(JSON.parse(stored.value_json), app('public-updated'))
    assert.equal(stored.last_modified, 1_700_000_000_123)
  })

  await t.test('keys/builds/prefixes/types stay isolated and untrusted keys are bound', async () => {
    const otherBuild = createD1Cache(harness.getDatabase, { getKeyOptions: () => ({ ...KEY_OPTIONS, buildId: 'synthetic-build-b' }) })
    const otherPrefix = createD1Cache(harness.getDatabase, { getKeyOptions: () => ({ ...KEY_OPTIONS, prefix: 'other-cache' }) })
    await otherBuild.set('/area', app('other-build'))
    await otherPrefix.set('/area', app('other-prefix'))
    await cache.set('/area', fetchValue, 'fetch')
    await cache.set('/area', composableValue, 'composable')
    const untrusted = "'; DROP TABLE opennext_cache; --\u0000/秘密"
    await cache.set(untrusted, app('bound-public'))
    assert.equal((await cache.get(untrusted)).value.html, 'bound-public')
    assert.equal((await cache.get('/area')).value.html, 'public-updated')
    assert.deepEqual((await cache.get('/area', 'fetch')).value, fetchValue)
    assert.deepEqual((await cache.get('/area', 'composable')).value, composableValue)
    assert.equal((await otherBuild.get('/area')).value.html, 'other-build')
    assert.equal((await otherPrefix.get('/area')).value.html, 'other-prefix')
    assert.equal(await otherBuild.get('only-in-other-build'), null)
    const keys = (await harness.database.prepare('SELECT cache_key FROM opennext_cache').all()).results.map(row => row.cache_key)
    assert.ok(keys.includes(computeCacheKey(untrusted, { ...KEY_OPTIONS, cacheType: 'cache' })))
    assert.ok(keys.every(key => !key.includes('DROP TABLE')))
  })

  await t.test('concurrent native writes keep value and timestamp atomic', async () => {
    let sequence = 0
    const concurrent = createD1Cache(harness.getDatabase, { getKeyOptions: () => KEY_OPTIONS, now: () => 1_700_000_100_000 + sequence++ })
    await Promise.all(Array.from({ length: 24 }, (_, id) => concurrent.set('concurrent', { ...app('atomic-public'), id })))
    const entry = await concurrent.get('concurrent')
    assert.equal(entry.lastModified, 1_700_000_100_000 + entry.value.id)
    assert.equal(await harness.database.prepare('SELECT count(*) AS count FROM opennext_cache WHERE cache_key = ?')
      .bind(computeCacheKey('concurrent', KEY_OPTIONS)).first('count'), 1)
  })

  await t.test('1 MiB is a UTF-8 JSON byte boundary and overflow preserves previous data', async () => {
    assert.equal(MAX_VALUE_BYTES, 1_048_576)
    const available = MAX_VALUE_BYTES - Buffer.byteLength(JSON.stringify(app('')))
    const value = app('あ'.repeat(Math.floor(available / 3)) + 'a'.repeat(available % 3))
    assert.equal(Buffer.byteLength(JSON.stringify(value)), MAX_VALUE_BYTES)
    await cache.set('size-boundary', value)
    assert.deepEqual((await cache.get('size-boundary')).value, value)
    await rejectsSafely(() => cache.set('size-boundary', { ...value, html: value.html + 'a' }), 'VALUE_TOO_LARGE')
    assert.deepEqual((await cache.get('size-boundary')).value, value)
  })

  await t.test('invalid input and malformed stored JSON are rejected without deleting data', async () => {
    const cyclic = {}; cyclic.self = cyclic
    for (const value of [undefined, null, 'synthetic-private-marker', [], 12n, cyclic]) {
      await rejectsSafely(() => cache.set('invalid', value), 'INVALID_INPUT')
    }
    for (const key of [null, 4, '', 'a'.repeat(8193)]) await rejectsSafely(() => cache.get(key), 'INVALID_INPUT')
    await rejectsSafely(() => cache.get('invalid-type', 'unknown'), 'INVALID_INPUT')
    await rejectsSafely(() => createD1Cache(harness.getDatabase, { now: () => NaN }).set('time', app('public')), 'INVALID_INPUT')
    await rejectsSafely(() => createD1Cache(harness.getDatabase, { getKeyOptions: () => ({ buildId: '../unsafe' }) }).get('key'), 'INVALID_INPUT')
    for (const serialized of ['{synthetic-private-marker', 'null', '[]', '"synthetic-private-marker"']) {
      await cache.set('corrupt', app('public'))
      await harness.database.prepare('UPDATE opennext_cache SET value_json = ? WHERE cache_key = ?')
        .bind(serialized, computeCacheKey('corrupt', KEY_OPTIONS)).run()
      await rejectsSafely(() => cache.get('corrupt'), 'INVALID_ENTRY')
      assert.equal(await harness.database.prepare('SELECT value_json FROM opennext_cache WHERE cache_key = ?')
        .bind(computeCacheKey('corrupt', KEY_OPTIONS)).first('value_json'), serialized)
    }
  })

  await t.test('injected daily read/write quota and storage failures reject with no fallback or raw logs', async () => {
    await cache.set('quota', app('unchanged-public'))
    const logged = [], originalLog = console.log, originalWarn = console.warn, originalError = console.error
    const originalFetch = globalThis.fetch
    let fallbackCalls = 0
    console.log = console.warn = console.error = (...args) => logged.push(args)
    globalThis.fetch = () => { fallbackCalls++; throw new Error('synthetic-private-marker unexpected fallback') }
    try {
      for (const quota of ['read', 'write']) {
        const message = `Your account has exceeded D1's free tier daily row ${quota} limit. synthetic-private-marker`
        const injected = faultDatabase(harness.database, { [quota]: message })
        const failing = createD1Cache(() => injected.binding, { getKeyOptions: () => KEY_OPTIONS })
        if (quota === 'read') await rejectsSafely(() => failing.get('quota'), 'STORAGE_FAILURE')
        else {
          await rejectsSafely(() => failing.set('quota', app('synthetic-private-marker')), 'STORAGE_FAILURE')
          await rejectsSafely(() => failing.delete('quota'), 'STORAGE_FAILURE')
        }
        assert.equal(injected.counts[quota], quota === 'read' ? 1 : 2)
      }
      for (const failure of [{ write: 'SQLITE_FULL synthetic-private-marker' }, { unsuccessful: true }]) {
        const injected = faultDatabase(harness.database, failure)
        const failing = createD1Cache(() => injected.binding, { getKeyOptions: () => KEY_OPTIONS })
        await rejectsSafely(() => failing.set('quota', app('synthetic-private-marker')), 'STORAGE_FAILURE')
        await rejectsSafely(() => failing.delete('quota'), 'STORAGE_FAILURE')
      }
      assert.equal((await cache.get('quota')).value.html, 'unchanged-public')
      assert.equal(fallbackCalls, 0)
      assert.deepEqual(logged, [])
    } finally { console.log = originalLog; console.warn = originalWarn; console.error = originalError; globalThis.fetch = originalFetch }
  })

  await t.test('native restart persists values; delete cannot revive old entries or cross types/builds', async () => {
    const before = await cache.get('concurrent')
    await harness.restart()
    assert.deepEqual(await cache.get('concurrent'), before)
    await cache.delete('/area')
    await cache.delete('concurrent')
    await cache.delete('never-present')
    assert.equal(await cache.get('/area'), null)
    assert.equal(await cache.get('concurrent'), null)
    assert.deepEqual((await cache.get('/area', 'fetch')).value, fetchValue)
    await harness.restart()
    assert.equal(await cache.get('/area'), null)
    assert.equal(await cache.get('concurrent'), null)
    const otherBuild = createD1Cache(harness.getDatabase, { getKeyOptions: () => ({ ...KEY_OPTIONS, buildId: 'synthetic-build-b' }) })
    assert.equal((await otherBuild.get('/area')).value.html, 'other-build')
  })

  await t.test('OpenNext wrapper imports without context and resolves each request binding lazily', async () => {
    const symbol = Symbol.for('__cloudflare-context__')
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, symbol)
    const previousBuild = process.env.OPEN_NEXT_BUILD_ID
    let calls = 0
    Object.defineProperty(globalThis, symbol, { configurable: true, get() { calls++; throw new Error('synthetic-private-marker') } })
    try {
      const { tsImport } = await import('tsx/esm/api')
      const { default: adapter } = await tsImport('../../cloudflare/free/d1-incremental-cache.ts', import.meta.url)
      assert.equal(calls, 0)
      await assert.rejects(() => adapter.get('context-missing'), error => error.name === 'D1CacheError' && error.code === 'MISSING_BINDING'
        && !inspect(error).includes('synthetic-private-marker'))
      Object.defineProperty(globalThis, symbol, { configurable: true, value: { env: { NEXT_INC_CACHE_D1: harness.database, NEXT_INC_CACHE_D1_PREFIX: 'wrapper-cache' } } })
      process.env.OPEN_NEXT_BUILD_ID = 'wrapper-build-a'
      await adapter.set('wrapper-key', app('first-public'))
      const saved = await adapter.get('wrapper-key')
      assert.deepEqual(saved.value, app('first-public'))
      assert.ok(Number.isSafeInteger(saved.lastModified))
      process.env.OPEN_NEXT_BUILD_ID = 'wrapper-build-b'
      assert.equal(await adapter.get('wrapper-key'), null)
      await adapter.set('wrapper-key', app('second-public'))
      await adapter.delete('wrapper-key')
      assert.equal(await adapter.get('wrapper-key'), null)
      process.env.OPEN_NEXT_BUILD_ID = 'wrapper-build-a'
      assert.equal((await adapter.get('wrapper-key')).value.html, 'first-public')
      Object.defineProperty(globalThis, symbol, { configurable: true, value: { env: {} } })
      await assert.rejects(() => adapter.get('wrapper-key'), error => error.name === 'D1CacheError' && error.code === 'MISSING_BINDING')
    } finally {
      if (originalDescriptor) Object.defineProperty(globalThis, symbol, originalDescriptor)
      else delete globalThis[symbol]
      if (previousBuild === undefined) delete process.env.OPEN_NEXT_BUILD_ID
      else process.env.OPEN_NEXT_BUILD_ID = previousBuild
    }
  })

  await t.test('native outbound is denied and no credential configuration was read', async () => {
    assert.deepEqual(harness.outbound, [])
    const denied = await harness.probe()
    assert.equal(denied.status, 502)
    assert.equal(await denied.text(), 'denied')
    assert.deepEqual(harness.outbound, ['outside.example.invalid'])
    assert.deepEqual(credentials.reads, [])
  })
})
