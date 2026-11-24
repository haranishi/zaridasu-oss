import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FREE_PRIVATE, freeBuildEnvironment, localCommand } from './free-profile.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
let bundlePreparation
async function prepareTestBundle() {
  const renderer = JSON.parse(await readFile(path.join(FREE_PRIVATE, 'renderer.json'), 'utf8'))
  const config = { ...renderer, main: path.join(ROOT, 'cloudflare/free/test-fixture.ts') }
  const file = path.join(FREE_PRIVATE, 'test-renderer.json')
  await writeFile(file, JSON.stringify(config), { mode: 0o600 })
  await localCommand(path.join(ROOT, 'node_modules/.bin/wrangler'), ['deploy', '--dry-run', '--config', file,
    '--outdir', path.join(FREE_PRIVATE, 'test-renderer-dry-run')], freeBuildEnvironment(renderer.vars.PREVIEW_APP_ORIGIN))
}

/** Apply only changed/deleted Cookie chunks, as a browser does for SSR refresh. */
export function applyCookieDelta(cookie, headers) {
  const jar = new Map(cookie.split(';').map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i).trim(), pair.slice(i + 1)] }))
  for (const header of headers) {
    const pair = header.split(';')[0]; const i = pair.indexOf('=')
    if (/; Max-Age=0(?:;|$)/i.test(header)) jar.delete(pair.slice(0, i))
    else jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
}

/** Actual built app, native D1/SQLite DO/Images, private namespace hop and denied external network. */
export async function createFreeHarness() {
  await readFile(path.join(FREE_PRIVATE, 'finalized.json')) // A missing profile is a hard failure, never a skip.
  await (bundlePreparation ??= prepareTestBundle())
  process.env.WRANGLER_SEND_METRICS = 'false'
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
  const [{ Miniflare, convertV4MiniflareOptions }, { unstable_readConfig, unstable_getMiniflareWorkerOptions }] = await Promise.all([
    import('miniflare'), import('wrangler'),
  ])
  const configs = Object.fromEntries(await Promise.all(['ingress', 'renderer', 'backend'].map(async name =>
    [name, unstable_readConfig({ config: path.join(FREE_PRIVATE, `${name}.json`) })])))
  const origin = configs.ingress.vars.PREVIEW_APP_ORIGIN
  const secrets = Object.fromEntries(['PREVIEW_ACCESS_SECRET', 'PREVIEW_FORWARD_SECRET', 'PREVIEW_FIXTURE_SECRET']
    .map(name => [name, randomBytes(32).toString('base64url')]))
  const networkAttempts = []
  const faultCalls = { read: 0, write: 0 }
  const bindingIntegrity = { checks: 0, failures: 0 }
  let fault = null
  let publicCount = '190001'
  await mkdir(path.join(FREE_PRIVATE, 'runtime'), { recursive: true, mode: 0o700 })
  const state = await mkdtemp(path.join(FREE_PRIVATE, 'runtime/run-'))
  let mf
  async function start() {
    const workers = []
    for (const name of ['ingress', 'renderer', 'backend']) {
      const config = { ...configs[name], secrets: { required: [] } }
      const directory = path.join(FREE_PRIVATE, name === 'renderer' ? 'test-renderer-dry-run' : `${name}-dry-run`)
      const main = name === 'renderer' ? 'test-fixture.js' : name === 'ingress' ? 'free.ingress.js' : 'preview.backend.js'
      const modules = [{ type: 'ESModule', path: path.join(directory, main), contents: await readFile(path.join(directory, main), 'utf8') }]
      for (const filename of await readdir(directory)) {
        if (/\.(wasm|bin)$/.test(filename)) modules.push({ type: filename.endsWith('.wasm') ? 'CompiledWasm' : 'Data', path: path.join(directory, filename) })
      }
      const { workerOptions, externalWorkers } = unstable_getMiniflareWorkerOptions(config)
      const { modulesRules: _modulesRules, ...bindings } = workerOptions
      const outboundService = request => {
        networkAttempts.push({ origin: new URL(request.url).origin, pathname: new URL(request.url).pathname })
        return new Response('Free preview network denied', { status: 502 })
      }
      workers.push({ ...bindings, name: config.name, bindings: { ...config.vars,
        ...(name === 'ingress' ? { PREVIEW_ACCESS_SECRET: secrets.PREVIEW_ACCESS_SECRET, PREVIEW_FORWARD_SECRET: secrets.PREVIEW_FORWARD_SECRET }
          : name === 'renderer' ? { PREVIEW_FORWARD_SECRET: secrets.PREVIEW_FORWARD_SECRET }
            : { PREVIEW_FIXTURE_SECRET: secrets.PREVIEW_FIXTURE_SECRET, PREVIEW_PUBLIC_POST_COUNT: publicCount }) },
      ...(name === 'renderer' ? { serviceBindings: { ...bindings.serviceBindings, FREE_TEST_CONTROL: async request => {
        const operation = new URL(request.url).pathname.slice(1)
        if (operation === 'integrity') {
          bindingIntegrity.checks++
          if ((await request.json()).unchanged !== true) bindingIntegrity.failures++
          return new Response(null, { status: 204 })
        }
        assert.ok(['read', 'write'].includes(operation))
        faultCalls[operation]++
        return new Response(null, { status: fault === operation ? 429 : 204 })
      } } } : {}), modules, modulesRoot: directory, outboundService })
      workers.push(...externalWorkers.map(worker => ({ ...worker, outboundService })))
    }
    mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, cf: false, telemetry: { enabled: false },
      resourcePersistencePath: path.join(state, 'storage'), isolatedResourcePersistencePath: path.join(state, 'isolated'),
      resourceTmpPath: path.join(state, 'tmp'), workers }))
    await mf.ready
    const db = await mf.getD1Database('NEXT_INC_CACHE_D1', configs.renderer.name)
    await db.exec((await readFile(path.join(ROOT, 'cloudflare/free/cache-schema.sql'), 'utf8')).replace(/^--.*$/gm, '').replaceAll('\n', ' '))
  }
  async function stop() { const current = mf; mf = undefined; await current?.dispose() }
  const harness = {
    origin, networkAttempts, faultCalls, bindingIntegrity,
    setFault(operation) { assert.ok([null, 'read', 'write'].includes(operation)); fault = operation },
    async fetch(input, init) { return mf.dispatchFetch(new URL(input, origin), { redirect: 'manual', ...init }) },
    async privateFetch(input, init) {
      return (await mf.getWorker(configs.renderer.name)).fetch(new URL(input, origin), { redirect: 'manual', ...init })
    },
    async login() {
      const response = await this.fetch('/__preview', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password: secrets.PREVIEW_ACCESS_SECRET }).toString() })
      assert.equal(response.status, 303)
      return response.headers.get('set-cookie').split(';')[0]
    },
    async identity(cookie, identity, options = {}) {
      const response = await this.fetch('/__preview/identity', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
        body: JSON.stringify({ identity, ...options }) })
      assert.equal(response.status, 200)
      assert.ok(response.headers.getSetCookie().every(value => !/; HttpOnly/i.test(value)))
      return { cookie: applyCookieDelta(cookie, response.headers.getSetCookie()), ...(await response.json()) }
    },
    async database() { return mf.getD1Database('NEXT_INC_CACHE_D1', configs.renderer.name) },
    async cacheRows() { return (await (await this.database()).prepare('SELECT cache_key,value_json,last_modified FROM opennext_cache').all()).results },
    async restart({ publicPostCount, ageKey } = {}) {
      if (ageKey) await (await this.database()).prepare('UPDATE opennext_cache SET last_modified = last_modified - ? WHERE cache_key = ?').bind(3_601_000, ageKey).run()
      await stop()
      if (publicPostCount !== undefined) { assert.ok(Number.isSafeInteger(publicPostCount) && publicPostCount >= 0); publicCount = String(publicPostCount) }
      await start()
    },
    async queueState() {
      await stop()
      const result = { sync: [], failed: [] }
      const { DatabaseSync } = await import('node:sqlite')
      try {
        for (const filename of await readdir(state, { recursive: true })) {
          if (!filename.endsWith('.sqlite')) continue
          const db = new DatabaseSync(path.join(state, filename), { readOnly: true })
          try {
            for (const [table, key] of [['sync', 'sync'], ['failed_state', 'failed']]) {
              if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
                result[key].push(...db.prepare(table === 'sync' ? 'SELECT id,lastSuccess,buildId FROM sync' : 'SELECT id,buildId FROM failed_state').all())
              }
            }
          } finally { db.close() }
        }
      } finally { await start() }
      return result
    },
    async close() { await stop(); await rm(state, { recursive: true, force: true }) },
  }
  try { await start() } catch (error) { await harness.close(); throw error }
  return harness
}
