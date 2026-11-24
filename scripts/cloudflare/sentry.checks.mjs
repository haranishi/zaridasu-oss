import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { fixtureBuildEnvironment } from './build-fixture.mjs'
import { MONITORING_PROBE_ENV } from './fixtures.mjs'
import { cloudflareBuildEnvironment } from './build.mjs'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

test('Cloudflare build pins preview despite inherited production labels and configured telemetry IDs', () => {
  const source = { ...fixtureBuildEnvironment(), ...MONITORING_PROBE_ENV,
    VERCEL_ENV: 'production', ZARIDASU_DEPLOYMENT_ENV: 'production', NEXT_PUBLIC_DEPLOYMENT_ENV: 'production',
    SENTRY_AUTH_TOKEN: 'fixture-upload-token' }
  const env = cloudflareBuildEnvironment(source)
  assert.equal(env.ZARIDASU_DEPLOYMENT_ENV, 'preview')
  assert.equal(env.NEXT_PUBLIC_DEPLOYMENT_ENV, 'preview')
  assert.equal(env.NEXT_PUBLIC_SENTRY_DSN, MONITORING_PROBE_ENV.NEXT_PUBLIC_SENTRY_DSN)
  assert.equal(env.NEXT_PUBLIC_GTM_ID, MONITORING_PROBE_ENV.NEXT_PUBLIC_GTM_ID)
  assert.equal(env.SENTRY_AUTH_TOKEN, '')
})

test('actual Next Cloudflare Sentry wrapper disables preview and scrubs production envelopes in workerd', { timeout: 90_000 }, async t => {
  const env = fixtureBuildEnvironment()
  await mkdir(env.TMPDIR, { recursive: true })
  await mkdir(path.join(ROOT, '.wrangler/task-6.5'), { recursive: true })
  const directory = await mkdtemp(path.join(ROOT, '.wrangler/task-6.5/sentry-probe-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const configPath = path.join(directory, 'wrangler.jsonc')
  const output = path.join(directory, 'bundle')
  await writeFile(configPath, JSON.stringify({ name: 'sentry-privacy-probe',
    main: path.join(ROOT, 'cloudflare/fixtures/sentry.worker.ts'), compatibility_date: '2026-11-14',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'] }))
  const buildLog = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy', '--dry-run', '--config', configPath, '--outdir', output], { cwd: ROOT, env })
    let log = ''
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve(log) : reject(new Error(`Sentry probe build failed: ${log}`)))
  })
  await writeFile(path.join(ROOT, '.wrangler/task-6.5/sentry-probe-build.log'), buildLog)
  const filename = (await readdir(output)).find(name => name.endsWith('.js'))
  assert.ok(filename)
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare')
  for (const environment of ['preview', 'production']) {
    const envelopes = []
    const mf = new Miniflare(convertV4MiniflareOptions({ cf: false, telemetry: { enabled: false }, workers: [{
      name: 'sentry-privacy-probe', modules: true, scriptPath: path.join(output, filename),
      compatibilityDate: '2026-11-14', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
      bindings: { ZARIDASU_DEPLOYMENT_ENV: environment, ...MONITORING_PROBE_ENV },
      outboundService: async request => {
        const url = new URL(request.url)
        assert.equal(url.hostname, 'telemetry.example.invalid')
        assert.equal(url.pathname, '/api/1/envelope/')
        const body = await request.text()
        assert.ok(body.length < 64_000)
        envelopes.push(body)
        return Response.json({})
      },
    }] }))
    try {
      const response = await mf.dispatchFetch('https://fixture.example.invalid/private?token=fixture-request-token', {
        headers: { cookie: 'fixture-request-cookie', authorization: 'Bearer fixture-request-token', 'cf-connecting-ip': '203.0.113.55',
          'sentry-trace': '1234567890abcdef1234567890abcdef-abcdef1234567890-1',
          baggage: 'sentry-trace_id=1234567890abcdef1234567890abcdef,sentry-sampled=true,sentry-sample_rate=1' },
      })
      assert.equal(response.status, 200)
      const options = await response.json()
      assert.equal(options.tracesSampleRate, 0.1)
      assert.equal(options.traceLifecycle, 'static')
      assert.equal(options.maxValueLength, 8192)
      assert.deepEqual(options.dataCollection, { userInfo: false, cookies: false, httpHeaders: false,
        httpBodies: [], urlQueryParams: false, graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false }, mcp: { inputs: false, outputs: false },
        databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 5 })
      // The SDK flushes invocation work through waitUntil; one bounded poll covers delivery to the in-memory sink.
      const deadline = Date.now() + 3000
      while (environment === 'production' && (envelopes.length < 2 || !envelopes.join('\n').includes('operation')) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      if (environment === 'preview') assert.equal(envelopes.length, 0)
      else {
        assert.ok(envelopes.length >= 2, 'production must deliver both event and transaction')
        const payload = envelopes.join('\n')
        assert.match(payload, /fixture_failure/)
        assert.match(payload, /"type":"transaction"/)
        assert.match(payload, /operation/)
        for (const sensitive of ['fixture@example.invalid', '203.0.113.55', 'fixture-private-token',
          'fixture-private-cookie', 'fixture-private-body', 'fixture-request-token', 'fixture-request-cookie', 'ValidationError']) {
          assert.ok(!payload.includes(sensitive), `must remove ${sensitive}`)
        }
      }
    } finally { await mf.dispose() }
  }
})
