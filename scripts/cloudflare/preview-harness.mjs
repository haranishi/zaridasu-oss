import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const PROFILE = path.join(ROOT, '.wrangler/preview-profile')

/** Actual upload bundles, service-bound synthetic Worker, native R2/DO/IMAGES and default-denied network. */
export async function createPreviewHarness() {
  process.env.WRANGLER_SEND_METRICS = 'false'
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
  const [{ Miniflare, convertV4MiniflareOptions }, { unstable_readConfig, unstable_getMiniflareWorkerOptions }] = await Promise.all([
    import('miniflare'), import('wrangler'),
  ])
  const configs = Object.fromEntries(await Promise.all(['app', 'backend'].map(async name =>
    [name, unstable_readConfig({ config: path.join(PROFILE, `${name}.json`) })])))
  const origin = configs.app.vars.PREVIEW_APP_ORIGIN
  const secrets = { PREVIEW_ACCESS_SECRET: randomBytes(32).toString('base64url'), PREVIEW_FIXTURE_SECRET: randomBytes(32).toString('base64url') }
  const networkAttempts = []
  await mkdir(path.join(PROFILE, 'runtime'), { recursive: true })
  const state = await mkdtemp(path.join(PROFILE, 'runtime/run-'))
  let mf
  async function start() {
    const workers = []
    for (const name of ['app', 'backend']) {
      const config = { ...configs[name], secrets: { required: [] } }
      const directory = path.join(PROFILE, `${name}-dry-run`)
      const main = name === 'app' ? 'preview.worker.js' : 'preview.backend.js'
      const modules = [{ type: 'ESModule', path: path.join(directory, main), contents: await readFile(path.join(directory, main), 'utf8') }]
      for (const filename of await readdir(directory)) {
        if (/\.(wasm|bin)$/.test(filename)) modules.push({ type: filename.endsWith('.wasm') ? 'CompiledWasm' : 'Data', path: path.join(directory, filename) })
      }
      const { workerOptions, externalWorkers } = unstable_getMiniflareWorkerOptions(config)
      const { modulesRules: _modulesRules, ...bindings } = workerOptions
      const outboundService = request => {
        // Metadata only. No query, credential, cookie, token or response body is logged.
        networkAttempts.push({ origin: new URL(request.url).origin, pathname: new URL(request.url).pathname })
        return new Response('Preview network denied', { status: 502 })
      }
      workers.push({ ...bindings, name: config.name, bindings: { ...config.vars,
        ...(name === 'app' ? { PREVIEW_ACCESS_SECRET: secrets.PREVIEW_ACCESS_SECRET } : { PREVIEW_FIXTURE_SECRET: secrets.PREVIEW_FIXTURE_SECRET }) },
      modules, modulesRoot: directory, outboundService })
      workers.push(...externalWorkers.map(worker => ({ ...worker, outboundService })))
    }
    mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, cf: false, telemetry: { enabled: false },
      resourcePersistencePath: path.join(state, 'storage'), isolatedResourcePersistencePath: path.join(state, 'isolated'),
      resourceTmpPath: path.join(state, 'tmp'), workers }))
    await mf.ready
  }
  async function stop() { const current = mf; mf = undefined; await current?.dispose() }
  const harness = {
    origin, networkAttempts,
    async fetch(input, init) { return mf.dispatchFetch(new URL(input, origin), { redirect: 'manual', ...init }) },
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
      assert.ok(response.headers.getSetCookie().every(value => !/; HttpOnly/i.test(value)), 'synthetic app cookies retain browser SDK ownership')
      const jar = new Map(cookie.split(';').map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i).trim(), pair.slice(i + 1)] }))
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0]
        const i = pair.indexOf('=')
        if (/; Max-Age=0(?:;|$)/i.test(header)) jar.delete(pair.slice(0, i))
        else jar.set(pair.slice(0, i), pair.slice(i + 1))
      }
      return { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...(await response.json()) }
    },
    async bucket() { return mf.getR2Bucket('NEXT_INC_CACHE_R2_BUCKET', configs.app.name) },
    async restart({ ageCache } = {}) {
      await stop()
      if (ageCache) {
        const { DatabaseSync } = await import('node:sqlite')
        let changed = 0
        for (const filename of await readdir(state, { recursive: true })) {
          if (!filename.endsWith('.sqlite')) continue
          const db = new DatabaseSync(path.join(state, filename))
          try {
            if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_mf_objects'").get()) {
              changed += Number(db.prepare('UPDATE _mf_objects SET uploaded = uploaded - ? WHERE key = ?').run(3_601_000, ageCache).changes)
            }
          } finally { db.close() }
        }
        assert.equal(changed, 1)
      }
      await start()
    },
    async queueState() {
      await stop()
      const rows = []
      const { DatabaseSync } = await import('node:sqlite')
      try {
        for (const filename of await readdir(state, { recursive: true })) {
          if (!filename.endsWith('.sqlite') || !filename.startsWith(`storage${path.sep}do${path.sep}`)) continue
          const db = new DatabaseSync(path.join(state, filename), { readOnly: true })
          try {
            if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync'").get()) rows.push(...db.prepare('SELECT id,lastSuccess,buildId FROM sync').all())
          } finally { db.close() }
        }
      } finally { await start() }
      return rows
    },
    async close() { await stop(); await rm(state, { recursive: true, force: true }) },
  }
  try { await start() } catch (error) { await harness.close(); throw error }
  return harness
}
