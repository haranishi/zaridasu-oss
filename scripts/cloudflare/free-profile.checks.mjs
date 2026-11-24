import assert from 'node:assert/strict'
import { test } from 'node:test'
import { freeConfigs, freeBuildEnvironment } from './free-profile.mjs'

const accountId = 'a'.repeat(32)
const options = { accountId, expectedAccountId: accountId,
  workerName: 'zaridasu-free-preview-20261116', rendererName: 'zaridasu-free-preview-renderer-20261116',
  backendName: 'zaridasu-free-preview-backend-20261116', databaseName: 'zaridasu-free-preview-20261116-cache',
  databaseId: '00000000-0000-4000-8000-000000000072', localDatabaseIdOnly: true,
  subdomain: 'example-preview', mode: 'local-prototype', freeAccountVerified: false }

test('local Free profile isolates ingress, private SQLite renderer/queue and synthetic backend without R2', () => {
  const { ingress, renderer, backend } = freeConfigs(options)
  for (const config of [ingress, renderer, backend]) {
    assert.equal(config.account_id, accountId)
    assert.equal(config.upload_source_maps, false)
    assert.equal(config.preview_urls, false)
    assert.equal(config.r2_buckets, undefined)
    assert.equal(config.routes, undefined)
  }
  assert.equal(ingress.assets.run_worker_first, true)
  assert.equal(ingress.main.endsWith('/cloudflare/free.ingress.ts'), true)
  assert.equal(ingress.durable_objects.bindings[0].script_name, renderer.name)
  assert.equal(ingress.services.find(v => v.binding === 'PREVIEW_BACKEND').service, backend.name)
  assert.equal(renderer.workers_dev, false)
  assert.equal(backend.workers_dev, false)
  assert.equal(backend.assets.run_worker_first, true)
  assert.deepEqual(renderer.migrations[0].new_sqlite_classes, ['RenderHandler', 'DOQueueHandler'])
  assert.equal(renderer.services.find(v => v.binding === 'WORKER_SELF_REFERENCE').service, ingress.name)
  assert.equal(renderer.d1_databases[0].database_id, options.databaseId)
  assert.equal(renderer.images.binding, 'IMAGES')
  assert.equal(renderer.vars.NEXT_INC_CACHE_D1_PREFIX, 'free-preview-cache')
})

test('Free prototype refuses ambiguous account, resources, local IDs and unsupported remote evidence', () => {
  for (const replacement of [{ accountId: undefined }, { expectedAccountId: 'b'.repeat(32) },
    { rendererName: options.workerName }, { backendName: options.rendererName }, { workerName: 'production' },
    { databaseName: 'production-cache' }, { databaseId: 'actual-resource' }, { subdomain: 'invalid.example' },
    { mode: 'remote' }, { localDatabaseIdOnly: false }, { freeAccountVerified: true }]) {
    assert.throws(() => freeConfigs({ ...options, ...replacement }))
  }
})

test('Free build env retains tooling, uses private HOME/TMP and suppresses configured synthetic monitoring', () => {
  const env = freeBuildEnvironment('https://free-preview.example.invalid', { PATH: '/tools',
    HOME: '/real-home', PRIVATE_TOKEN: 'must-not-copy', SUPABASE_SERVICE_ROLE_KEY: 'must-not-copy',
    NEXT_PUBLIC_GTM_ID: 'real', NEXT_PUBLIC_SENTRY_DSN: 'real' })
  assert.equal(env.PATH, '/tools')
  assert.equal(env.PRIVATE_TOKEN, undefined)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://free-preview.example.invalid')
  assert.match(env.HOME, /\.wrangler\/free-profile\/home$/)
  assert.match(env.TMPDIR, /\.wrangler\/free-profile\/tmp$/)
  assert.equal(env.ZARIDASU_DEPLOYMENT_ENV, 'preview')
  assert.equal(env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV, 'false')
  assert.equal(env.CLOUDFLARE_INCLUDE_PROCESS_ENV, 'false')
  assert.match(env.NEXT_PUBLIC_SENTRY_DSN, /example\.invalid/)
  assert.equal(env.NEXT_PUBLIC_GTM_ID, 'GTM-FIXTURE-ONLY')
})


test('compiled audit proves expressions are code and never relabels repeated unknown literals as generated keys', async () => {
  const { classifyCompiledSource } = await import('./free-artifacts.mjs')
  const source = "const config = { apiKey: provider.apiKey, secret: 'literal-value' }; // provider.apiKey"
  const code = { RuleID: 'generic-api-key', Match: 'apiKey: provider.apiKey', Secret: 'provider.apiKey' }
  const unknown = { RuleID: 'generic-api-key', Match: "secret: 'literal-value'", Secret: 'literal-value' }
  const known = new Set(['g'.repeat(64)])
  assert.deepEqual(classifyCompiledSource(source, [code, unknown, unknown], known),
    ['compiled-code-expression', 'unclassified', 'unclassified'])
  assert.equal(known.size, 1, 'finding values never mutate the generated-key allowlist')
  assert.deepEqual(classifyCompiledSource("const s = 'provider.apiKey'", [{ ...code, Match: "'provider.apiKey'" }], known), ['unclassified'])
  assert.deepEqual(classifyCompiledSource('// apiKey: provider.apiKey', [code], known), ['unclassified'])
  const ambiguous = "const a = { apiKey: provider.apiKey }; const text = 'apiKey: provider.apiKey'"
  assert.deepEqual(classifyCompiledSource(ambiguous, [code], known), ['unclassified'])
  const identifier = { RuleID: 'generic-api-key', Match: 'providerApiKey', Secret: 'providerApiKey' }
  for (const literal of ["const s = 'providerApiKey'", 'const s = `providerApiKey`', 'const s = /providerApiKey/']) {
    assert.deepEqual(classifyCompiledSource(literal, [identifier], known), ['unclassified'])
  }
})

test('compiled audit recognizes only current generated material or its exact detected fragment', async () => {
  const { classifyCompiledSource } = await import('./free-artifacts.mjs')
  const material = 'g'.repeat(64)
  assert.deepEqual(classifyCompiledSource(`const value = "${material}"`, [
    { RuleID: 'cloudflare-api-key', Match: material, Secret: material.slice(0, 40) },
    { RuleID: 'generic-api-key', Match: material, Secret: material },
  ], new Set([material])), ['generated-next-key-material', 'generated-next-key-material'])
})


test('compiled multipart audit lexes only JavaScript MIME parts and denies matches outside those parts', async () => {
  const { classifyCompiledContainer } = await import('./free-artifacts.mjs')
  const finding = { RuleID: 'generic-api-key', Match: 'apiKey: provider.apiKey', Secret: 'provider.apiKey' }
  const form = new FormData()
  form.append('main', new File(['export const config = { apiKey: provider.apiKey };'], 'worker.js', { type: 'application/javascript+module' }))
  assert.deepEqual(await classifyCompiledContainer(Buffer.from(await new Response(form).arrayBuffer()), [finding]), ['compiled-code-expression'])
  form.append('metadata', 'apiKey: provider.apiKey')
  assert.deepEqual(await classifyCompiledContainer(Buffer.from(await new Response(form).arrayBuffer()), [finding]), ['unclassified'])
})


test('compiled key-looking identifiers require an exact whole JavaScript name token and literals remain denied', async () => {
  const { classifyCompiledSource } = await import('./free-artifacts.mjs')
  const identifier = 'compiler'.repeat(5)
  const finding = { RuleID: 'cloudflare-api-key', Match: identifier, Secret: identifier }
  assert.deepEqual(classifyCompiledSource(`const ${identifier} = () => 1`, [finding]), ['compiled-code-expression'])
  assert.deepEqual(classifyCompiledSource(`const value = "${identifier}"`, [finding]), ['unclassified'])
  assert.deepEqual(classifyCompiledSource(`const prefix${identifier} = () => 1`, [finding]), ['unclassified'])
})
