import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previewConfigs, previewBuildEnvironment } from './preview-profile.mjs'

const accountId = 'a'.repeat(32)
const options = { accountId, expectedAccountId: accountId, workerName: 'zaridasu-test-preview-20261115',
  backendName: 'zaridasu-test-preview-backend-20261115', bucketName: 'zaridasu-test-preview-20261115-cache', subdomain: 'example-preview' }

test('explicit selected-account preview config protects all assets and creates only isolated bindings', () => {
  const { app, backend } = previewConfigs(options)
  assert.equal(app.account_id, accountId)
  assert.equal(backend.account_id, accountId)
  assert.equal(app.assets.run_worker_first, true)
  assert.equal(backend.assets.run_worker_first, true)
  assert.equal(app.upload_source_maps, false)
  assert.equal(backend.workers_dev, false)
  assert.equal(backend.preview_urls, false)
  assert.equal(app.services.find(value => value.binding === 'PREVIEW_BACKEND').service, backend.name)
  assert.deepEqual(app.migrations[0].new_sqlite_classes, ['DOQueueHandler'])
  assert.equal(app.r2_buckets[0].bucket_name, options.bucketName)
  assert.equal(app.images.binding, 'IMAGES')
  assert.deepEqual(app.secrets.required, ['PREVIEW_ACCESS_SECRET'])
})

test('profile refuses missing, different or unscoped account/resource selection', () => {
  for (const replacement of [{ accountId: undefined }, { expectedAccountId: 'b'.repeat(32) },
    { bucketName: 'production-cache' }, { workerName: 'production' }, { backendName: options.workerName }, { subdomain: 'invalid.example' }]) {
    assert.throws(() => previewConfigs({ ...options, ...replacement }))
  }
})

test('preview build env keeps only host tooling and fixed synthetic public values', () => {
  const { app } = previewConfigs(options)
  const env = previewBuildEnvironment(app.vars.PREVIEW_APP_ORIGIN, {
    PATH: '/tooling', SENTRY_AUTH_TOKEN: 'inherited-private', SUPABASE_SERVICE_ROLE_KEY: 'inherited-private',
    OPENAI_API_KEY: 'inherited-private', NEXT_PUBLIC_GTM_ID: 'inherited-real-id', VERCEL_ENV: 'production',
  })
  assert.equal(env.PATH, '/tooling')
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, app.vars.PREVIEW_APP_ORIGIN)
  assert.equal(env.SENTRY_AUTH_TOKEN, '')
  assert.equal(env.NEXT_PUBLIC_GTM_ID, '')
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.ZARIDASU_DEPLOYMENT_ENV, 'preview')
})
