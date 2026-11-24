import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSyntheticBackend, FIXTURE_ENV, MONITORING_PROBE_ENV } from './fixtures.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const BUILT = path.join(ROOT, '.wrangler/dry-run')
const WORKER_NAME = 'zaridasu-cloudflare-runtime-fixture'
const PROBE_NAME = 'fixture-egress-probe'

/** Real built Worker; only the external Auth/backend service is synthetic. */
export async function createCloudflareHarness({ telemetryProbe = false } = {}) {
  // Set before importing Wrangler: its CLI may otherwise send metrics or read host env files.
  process.env.WRANGLER_SEND_METRICS = 'false'
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false'
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false'
  const [{ Miniflare, convertV4MiniflareOptions }, { unstable_getMiniflareWorkerOptions, unstable_readConfig }] = await Promise.all([
    import('miniflare'), import('wrangler'),
  ])
  const bundle = await readFile(path.join(BUILT, 'worker.js'), 'utf8').catch(() => {
    throw new Error('Missing Worker bundle. Run npm run build:cloudflare:fixture first.')
  })
  assert.ok(bundle.includes(FIXTURE_ENV.NEXT_PUBLIC_SUPABASE_URL)
    && bundle.includes(FIXTURE_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  'Worker must be built with synthetic public env; run npm run build:cloudflare:fixture')
  const modules = [{ type: 'ESModule', path: path.join(BUILT, 'worker.js'), contents: bundle }]
  for (const filename of await readdir(BUILT)) {
    if (/\.(wasm|bin)$/.test(filename)) {
      modules.push({ type: filename.endsWith('.wasm') ? 'CompiledWasm' : 'Data', path: path.join(BUILT, filename) })
    }
  }
  const baseConfig = unstable_readConfig({ config: path.join(ROOT, 'wrangler.jsonc') })
  const fixtureEnv = { ...FIXTURE_ENV, ...(telemetryProbe ? MONITORING_PROBE_ENV : {}) }
  let mf, stateDirectory, backend, closed = false
  async function start() {
    if (!stateDirectory) {
      await mkdir(path.join(ROOT, '.wrangler/runtime-fixtures'), { recursive: true })
      stateDirectory = await mkdtemp(path.join(ROOT, '.wrangler/runtime-fixtures/run-'))
      backend = createSyntheticBackend()
    }
    try {
      // Resolve declared local bindings/assets, but never load .dev.vars or .env from the project.
      const isolatedConfigPath = path.join(stateDirectory, 'wrangler.jsonc')
      const config = { ...baseConfig, name: WORKER_NAME, vars: fixtureEnv,
        configPath: isolatedConfigPath, userConfigPath: isolatedConfigPath,
        assets: { ...baseConfig.assets, directory: path.resolve(ROOT, baseConfig.assets.directory) },
        services: [{ binding: 'WORKER_SELF_REFERENCE', service: WORKER_NAME }],
        observability: { enabled: false }, send_metrics: false }
      const { workerOptions, externalWorkers } = unstable_getMiniflareWorkerOptions(config)
      const { modulesRules: _modulesRules, ...bindings } = workerOptions
      const outboundService = request => backend.handle(request)
      mf = new Miniflare(convertV4MiniflareOptions({
        host: '127.0.0.1', port: 0, cf: false, telemetry: { enabled: false },
        resourcePersistencePath: path.join(stateDirectory, 'storage'),
        isolatedResourcePersistencePath: path.join(stateDirectory, 'isolated-storage'),
        resourceTmpPath: path.join(stateDirectory, 'tmp'),
        workers: [
          { ...bindings, name: WORKER_NAME, bindings: fixtureEnv, modules, modulesRoot: BUILT, outboundService },
          ...externalWorkers.map(worker => ({ ...worker, outboundService })),
          { name: PROBE_NAME, compatibilityDate: baseConfig.compatibility_date,
            modules: true, script: 'export default { fetch(request) { return fetch(request); } }', outboundService },
        ],
      }))
      await mf.ready
    } catch (error) {
      await dispose()
      throw error
    }
  }
  async function dispose(removeState = true) {
    const current = mf
    mf = undefined
    try { await current?.dispose() } finally {
      if (removeState && stateDirectory) {
        await rm(stateDirectory, { recursive: true, force: true })
        stateDirectory = undefined
      }
    }
  }
  const ensureOpen = () => {
    if (closed || !mf) throw new Error('Cloudflare runtime harness is closed')
  }
  const harness = {
    get stateDirectory() { return stateDirectory },
    get backend() { return backend },
    async fetch(input, init) {
      ensureOpen()
      return mf.dispatchFetch(new URL(input, 'https://fixture.example.invalid'), { redirect: 'manual', ...init })
    },
    async probeOutbound(input, init) {
      ensureOpen()
      const probe = await mf.getWorker(PROBE_NAME)
      return probe.fetch(input, init)
    },
    async getBindings() {
      ensureOpen()
      return mf.getBindings(WORKER_NAME)
    },
    async getCacheBucket() {
      ensureOpen()
      return mf.getR2Bucket('NEXT_INC_CACHE_R2_BUCKET', WORKER_NAME)
    },
    async getRevalidationState() {
      ensureOpen()
      await dispose(false)
      const rows = []
      try {
        const { DatabaseSync } = await import('node:sqlite')
        for (const filename of await readdir(stateDirectory, { recursive: true })) {
          if (!filename.endsWith('.sqlite') || !filename.startsWith(`storage${path.sep}do${path.sep}`)) continue
          const db = new DatabaseSync(path.join(stateDirectory, filename), { readOnly: true })
          try {
            if (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync'").get()) {
              rows.push(...db.prepare('SELECT id, lastSuccess, buildId FROM sync').all())
            }
          } finally { db.close() }
        }
      } finally { await start() }
      return rows
    },
    async restart({ ageCache } = {}) {
      ensureOpen()
      await dispose(false)
      if (ageCache) {
        // Test-only storage aging: the real adapter uses R2.uploaded, not a cache JSON field.
        assert.equal(typeof ageCache.key, 'string')
        assert.ok(Number.isSafeInteger(ageCache.milliseconds) && ageCache.milliseconds > 0)
        const { DatabaseSync } = await import('node:sqlite')
        let updated = 0
        for (const filename of await readdir(stateDirectory, { recursive: true })) {
          if (!filename.endsWith('.sqlite')) continue
          const db = new DatabaseSync(path.join(stateDirectory, filename))
          try {
            const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_mf_objects'").get()
            if (table) updated += Number(db.prepare('UPDATE _mf_objects SET uploaded = uploaded - ? WHERE key = ?')
              .run(ageCache.milliseconds, ageCache.key).changes)
          } finally { db.close() }
        }
        assert.equal(updated, 1, 'age exactly one existing fixture R2 object while workerd is stopped')
      }
      await start()
    },
    async reset() {
      ensureOpen()
      await dispose()
      await start()
    },
    async close() {
      if (closed) return
      closed = true
      await dispose()
    },
  }
  await start()
  return harness
}
