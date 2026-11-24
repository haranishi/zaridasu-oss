import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateFreePreflight } from './free-preflight.mjs'

const now = Date.parse('2026-11-16T06:00:00.000Z')
const accountId = 'a'.repeat(32)
const checkedAt = new Date(now - 1_000).toISOString()
function facts() {
  const plans = {}
  for (const [product, publicName] of [['workers', 'Workers Free'], ['images', 'Images Free']]) {
    plans[product] = { status: 'free', source: 'api-subscriptions', accountId, checkedAt,
      publicName, scope: 'account', state: 'Provisioned', price: 0, evidenceId: `fixture-${product}`,
      periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z' }
  }
  for (const product of ['assets', 'd1', 'durableObjects']) {
    plans[product] = { status: 'free', source: 'inherits-workers', accountId, checkedAt, from: 'workers' }
  }
  const resourceNames = { workerName: 'zaridasu-fixture-preview-20261116', rendererName: 'zaridasu-fixture-preview-renderer-20261116',
    backendName: 'zaridasu-fixture-preview-backend-20261116', databaseName: 'zaridasu-fixture-preview-20261116-cache' }
  return { selection: { ...resourceNames, accountId, expectedAccountId: accountId, mode: 'isolated-preview',
    localDatabaseIdOnly: false, databaseId: '11111111-1111-4111-8111-111111111111' },
  account: { accountId, checkedAt, accountMatch: true, acceptedAdmin: true,
    names: { workersComplete: true, databasesComplete: true, collisions: 0 }, plans },
  candidate: { resourceNames, verified: true, accountId, localOnly: false, quarantined: false,
    products: ['workers', 'assets', 'd1', 'durableObjects', 'images'], unsupportedBindings: [],
    sourceArtifactDigest: 'c'.repeat(64) }, budget: { requests: 250, bytes: 100_000_000 } }
}

test('only complete fresh synthetic Free evidence qualifies a bounded nonproduction preview', () => {
  const result = evaluateFreePreflight(facts(), now)
  assert.equal(result.eligibleForBoundedPreview, true)
  assert.equal(result.remoteMutationAllowed, false, 'this read-only checker never performs or authorizes production writes')
})

test('UNKNOWN or Paid product evidence and caller booleans cannot qualify', () => {
  for (const product of ['workers', 'assets', 'd1', 'durableObjects', 'images']) {
    for (const status of ['unknown', 'paid']) {
      const input = facts(); input.account.plans[product].status = status
      input.selection.freeAccountVerified = true
      assert.equal(evaluateFreePreflight(input, now).eligibleForBoundedPreview, false)
    }
  }
})

test('a local prototype with a dummy database remains ineligible even with synthetic Free evidence', () => {
  const input = facts(); input.selection.mode = 'local-prototype'; input.selection.localDatabaseIdOnly = true
  input.selection.databaseId = '00000000-0000-4000-8000-000000000073'; input.candidate.localOnly = true
  assert.equal(evaluateFreePreflight(input, now).eligibleForBoundedPreview, false)
})

import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, symlink, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { subscriptionEvidence, collectFreeAccount, readWranglerToken } from './free-preflight-account.mjs'
import { inspectFreeCandidate } from './free-preflight-artifacts.mjs'
import { freeConfigs } from './free-profile.mjs'
import { OSS_ASSET_REPLACEMENTS } from '../lib/exportOssSource.mjs'

const sha = value => createHash('sha256').update(value).digest('hex')

test('freshness, source provenance, account, role, names, bindings and experiment bounds fail closed', () => {
  const cases = [
    input => { input.selection.expectedAccountId = 'b'.repeat(32) },
    input => { input.account.accountId = 'b'.repeat(32) },
    input => { input.candidate.accountId = 'b'.repeat(32) },
    input => { input.account.accountMatch = false },
    input => { input.account.checkedAt = new Date(now - 86_400_001).toISOString() },
    input => { input.account.checkedAt = new Date(now + 1).toISOString() },
    input => { input.account.acceptedAdmin = false },
    input => { input.account.names.workersComplete = false },
    input => { input.account.names.databasesComplete = false },
    input => { input.account.names.collisions = 1 },
    input => { input.selection.workerName = 'production' },
    input => { input.candidate.resourceNames.workerName = 'another-worker' },
    input => { input.candidate.products.push('r2') },
    input => { input.candidate.unsupportedBindings.push('queues') },
    input => { input.candidate.verified = false },
    input => { input.candidate.quarantined = true },
    input => { input.candidate.sourceArtifactDigest = '' },
    input => { input.budget.requests = 251 },
    input => { input.budget.bytes = 100_000_001 },
    input => { input.budget.bytes = -1 },
    input => { input.selection.databaseId = 'not-a-database' },
    input => { delete input.account.plans.images },
  ]
  for (const mutate of cases) { const input = facts(); mutate(input); assert.equal(evaluateFreePreflight(input, now).eligibleForBoundedPreview, false) }
  for (const change of [{ source: 'owner-claim' }, { scope: 'zone' }, { publicName: 'Workers Paid' },
    { price: 5 }, { state: 'Trial' }, { evidenceId: '' }, { accountId: 'b'.repeat(32) },
    { checkedAt: new Date(now + 1).toISOString() }, { periodEnd: checkedAt }]) {
    const input = facts(); Object.assign(input.account.plans.workers, change)
    assert.equal(evaluateFreePreflight(input, now).eligibleForBoundedPreview, false)
  }
  const malformed = facts(); malformed.account.plans.workers.status = 'private-marker-not-a-status'
  assert.equal(JSON.stringify(evaluateFreePreflight(malformed, now)).includes('private-marker-not-a-status'), false)
  const inherited = facts(); inherited.account.plans.d1.source = 'empty-entitlements'
  assert.equal(evaluateFreePreflight(inherited, now).eligibleForBoundedPreview, false)
})

test('only explicit account Free subscription records are evidence; empty, credit, zone and contradictory results are unknown', () => {
  const free = { id: 'fixture-record', price: 0, state: 'Provisioned', current_period_start: '2026-11-01T00:00:00Z',
    current_period_end: '2026-12-01T00:00:00Z', rate_plan: { id: 'fixture-rate', public_name: 'Workers Free', scope: 'account',
      externally_managed: false, is_contract: false } }
  const response = records => ({ ok: true, complete: true, records })
  const plans = subscriptionEvidence(response([free]), accountId, checkedAt)
  assert.equal(plans.workers.status, 'free'); assert.equal(plans.d1.status, 'free'); assert.equal(plans.images.status, 'unknown')
  for (const value of [response([]), { ...response([free]), ok: false }, { ...response([free]), complete: false },
    response([{ ...free, rate_plan: { ...free.rate_plan, public_name: 'Workers Paid' } }]),
    response([{ ...free, rate_plan: { ...free.rate_plan, scope: 'zone' } }]), response([free, free])]) {
    assert.equal(subscriptionEvidence(value, accountId, checkedAt).workers.status, 'unknown')
  }
  assert.equal(subscriptionEvidence(response([{ ...free, state: 'Paid' }]), accountId, checkedAt).workers.status, 'paid')
})

test('auth subprocess suppresses disk logging, inherited service credentials and metrics', () => {
  const material = 'synthetic-read-only-auth-material'
  let calls = 0
  const value = readWranglerToken({ run(_bin, args, options) {
    calls++
    assert.deepEqual(args.slice(-3), ['auth', 'token', '--json'])
    assert.equal(options.env.WRANGLER_WRITE_LOGS, 'false')
    assert.equal(options.env.WRANGLER_SEND_METRICS, 'false')
    assert.equal(options.env.CLOUDFLARE_INCLUDE_PROCESS_ENV, 'false')
    assert.equal(options.env.SUPABASE_SERVICE_ROLE_KEY, undefined)
    assert.equal(options.encoding, 'utf8')
    return { status: 0, stdout: JSON.stringify({ token: material }), stderr: 'private diagnostic' }
  } })
  assert.equal(value === material, true); assert.equal(calls, 1)
})

test('account collection performs fixed GETs only and keeps auth, provider messages and PII out of metadata', async () => {
  const input = facts(); const material = 'synthetic-read-only-auth-material'; const hidden = 'private-message-not-for-output'
  const calls = []
  const metadata = await collectFreeAccount(input.selection, { now, tokenReader: () => material, fetcher: async (url, options) => {
    const parsed = new URL(url); calls.push(parsed.pathname)
    assert.equal(parsed.origin, 'https://api.cloudflare.com'); assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.authorization === `Bearer ${material}`, true)
    let result = []; let result_info
    if (parsed.pathname === `/client/v4/accounts/${accountId}`) result = { id: accountId, name: hidden }
    if (parsed.pathname.endsWith('/memberships')) { result = [{ account: { id: accountId }, status: 'accepted',
      roles: ['SuperAdministratorAllPrivileges'], user: { email: hidden } }]; result_info = { total_count: 1 } }
    if (parsed.pathname.endsWith('/workers/scripts')) result = [{ id: 'unrelated-existing-worker' }]
    if (parsed.pathname.endsWith('/d1/database')) result_info = { total_count: 0 }
    if (parsed.pathname.endsWith('/subscriptions')) return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: hidden }] }), { status: 403 })
    return new Response(JSON.stringify({ success: true, result, result_info }))
  } })
  assert.equal(calls.length, 5); assert.equal(metadata.acceptedAdmin, true); assert.equal(metadata.names.collisions, 0)
  assert.equal(metadata.accountMatch, true); assert.equal(metadata.checks.subscriptions.httpStatus, 403)
  assert.deepEqual(metadata.checks.subscriptions.errorCodes, [10000])
  assert.equal(Object.values(metadata.plans).every(item => item.status === 'unknown'), true)
  assert.equal(JSON.stringify(metadata).includes(material), false); assert.equal(JSON.stringify(metadata).includes(hidden), false)
  assert.equal(evaluateFreePreflight({ ...input, account: metadata }, now).eligibleForBoundedPreview, false)
  const denied = await collectFreeAccount(input.selection, { tokenReader: () => { throw new Error(material) }, fetcher: () => { throw new Error('must not call') }, now })
  assert.equal(JSON.stringify(denied).includes(material), false); assert.equal(denied.accountMatch, false)
})

async function fixture(t) {
  const directory = fileURLToPath(new URL('../../.wrangler/task-7.3/', import.meta.url))
  await mkdir(directory, { recursive: true })
  const root = await mkdtemp(path.join(directory, 'checks-')); t.after(() => rm(root, { recursive: true, force: true }))
  const source = path.join(root, 'source'); const build = path.join(root, 'build'); const bad = path.join(root, 'quarantined')
  await Promise.all([mkdir(source), mkdir(build), mkdir(bad)])
  const put = async (base, name, content) => { const file = path.join(base, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); return file }
  const json = async (name, value) => { const file = await put(root, name, JSON.stringify(value)); await chmod(file, 0o600); return file }
  const selected = { ...facts().selection, mode: 'local-prototype', localDatabaseIdOnly: true,
    databaseId: '00000000-0000-4000-8000-000000000073', freeAccountVerified: false, subdomain: 'fixture-preview' }
  const revision = 'd'.repeat(40)
  const files = new Map()
  for (const item of OSS_ASSET_REPLACEMENTS) {
    const content = `fixture-source:${item.source}`; files.set(item.path, content); files.set(item.source, content); files.set(item.notice, 'fixture license notice')
  }
  files.set('public/OSS_ASSET_MANIFEST.json', JSON.stringify({ profile: 'oss-source-with-licensed-placeholders', source_revision: revision, replacements: OSS_ASSET_REPLACEMENTS }))
  files.set('cloudflare/free.renderer.ts', 'fixture original renderer')
  const backendAssets = new Map([
    ...['noto-jp-detector.css', 'noto-cjk-detector.css', 'noto-jp-subset.css', 'noto-jp-subset.ttf',
      '1f99e.svg', 'NotoSansJP-OFL.txt', 'Twemoji-LICENSE-GRAPHICS.txt', 'Leaflet-LICENSE.txt', 'provenance.json']
      .map(name => [name, `scripts/cloudflare/assets/${name}`]),
    ['marker-icon.png', 'public/images/leaflet/marker-icon-2x.png'],
  ])
  for (const name of backendAssets.values()) if (!files.has(name)) files.set(name, `fixture-approved-backend:${name}`)
  for (const [name, content] of files) { await put(source, name, content); await put(build, name, content) }
  const record = (name, content) => ({ path: name, size: Buffer.byteLength(content), sha256: sha(content) })
  const baseline = { source, revision, records: [...files].map(([name, content]) => record(name, content)) }
  const replacement = 'fixture reviewed renderer'
  await put(build, 'cloudflare/free.renderer.ts', replacement)
  const overlays = [record('cloudflare/free.renderer.ts', replacement)]
  const overlay = { source, destination: build, sourceRevision: revision, baselineFiles: baseline.records.length, overlays }
  const preview = { previewModeId: 'p'.repeat(32), previewModeSigningKey: 's'.repeat(64), previewModeEncryptionKey: 'e'.repeat(64) }
  const manifests = { 'prerender-manifest.json': JSON.stringify({ preview }), 'server/server-reference-manifest.json': JSON.stringify({ encryptionKey: 'k'.repeat(44) }) }
  const artifacts = new Map([['.open-next/worker.js', 'fixture compiled output'], ['.open-next/assets/sw.js', 'fixture service worker']])
  for (const [name, content] of Object.entries(manifests)) { await put(build, `.next/${name}`, content); artifacts.set(`.open-next/server-functions/default/.next/${name}`, content) }
  for (const name of ['ingress', 'renderer', 'backend', 'test-renderer']) artifacts.set(`.wrangler/free-profile/${name}-dry-run/worker.js`, 'fixture compiled output')
  for (const [name, content] of artifacts) await put(build, name, content)
  for (const [name, sourcePath] of backendAssets) await put(build, `.wrangler/free-profile/backend-assets/${name}`, files.get(sourcePath))
  await put(build, 'public/sw.js', 'fixture service worker')
  await put(build, '.wrangler/free-profile/revalidation-token.mjs', `export const revalidationToken = ${JSON.stringify(preview.previewModeId)}\n`)
  for (const [name, config] of Object.entries(freeConfigs({ ...selected, root: build }))) {
    const file = await put(build, `.wrangler/free-profile/${name}.json`, JSON.stringify(config)); await chmod(file, 0o600)
  }
  const audit = { immutableFiles: baseline.records.length, overlayFiles: overlays.length, licensedReplacementCount: OSS_ASSET_REPLACEMENTS.length,
    originalWholeBytes: 0, publicMaps: 0, sourceSecretFindings: 0, publicSecretFindings: 0, sourcePublicKeyExactBytes: 0, unclassified: 0,
    classifications: { 'generated-next-key-material': 4, 'compiled-code-expression': 0 }, generatedOrCompiledKeyValuesChecked: 4, rawCompiledFindings: 4, commandExitCode: 0 }
  const summary = { sourceFrozenVerified: true, quarantinedArtifactsUsed: false, remoteMutations: 0, billingChanges: 0, productionChanges: 0, artifactAudit: audit }
  const approval = { task: '7.2', verdict: 'APPROVED', scope: 'LOCAL_PROFILE_ONLY', finalOverlays: overlays.length, immutableFiles: baseline.records.length }
  const quarantine = await json('quarantine.json', { neverDeploy: true, artifactDirectory: bad })
  await put(bad, '.wrangler/NEVER_DEPLOY.json', '{}')
  const settings = { selection: selected, buildRoot: build, baselineFile: await json('baseline.json', baseline), overlayFile: await json('overlay.json', overlay),
    validationFile: await json('validation.json', summary), inventoryFile: await json('inventory.json', { build, records: [...artifacts].map(([name, content]) => record(name, content)) }),
    approvalFile: await json('approval.json', approval), quarantineFiles: [quarantine] }
  return { root, source, build, bad, settings, put, json, summary, backendAssets, artifactCount: artifacts.size }
}

test('approved candidate hashes and exact local configs verify without granting a local dummy remote eligibility', async t => {
  const f = await fixture(t); const candidate = await inspectFreeCandidate(f.settings)
  assert.deepEqual(candidate.reasons, []); assert.equal(candidate.verified, true); assert.equal(candidate.localOnly, true)
  assert.match(candidate.sourceArtifactDigest, /^[a-f0-9]{64}$/)
  const result = evaluateFreePreflight({ ...facts(), selection: f.settings.selection, candidate }, now)
  assert.equal(result.eligibleForBoundedPreview, false); assert.equal(result.reasons.includes('LOCAL_ONLY_PROFILE'), true)
})

test('changed source/output/config, extra output, private material or world-readable evidence deny', async t => {
  const f = await fixture(t)
  const mutate = async (name, change, expected) => {
    const file = path.join(f.build, name); const original = await readFile(file)
    await writeFile(file, change(original)); const result = await inspectFreeCandidate(f.settings)
    assert.equal(result.verified, false); assert.equal(result.reasons.includes(expected), true)
    await writeFile(file, original)
  }
  await mutate('cloudflare/free.renderer.ts', () => 'changed fixture source', 'SOURCE_OR_ARTIFACT_CHANGED')
  await mutate('.open-next/worker.js', () => 'changed fixture artifact', 'SOURCE_OR_ARTIFACT_CHANGED')
  await mutate('.wrangler/free-profile/renderer.json', raw => JSON.stringify({ ...JSON.parse(raw), r2_buckets: [] }), 'UNSUPPORTED_BINDING')
  await mutate('.next/prerender-manifest.json', () => '{}', 'FRAMEWORK_MANIFEST_CHANGED')
  const extra = await f.put(f.build, '.open-next/unlisted.js', 'unlisted fixture output')
  assert.equal((await inspectFreeCandidate(f.settings)).verified, false); await rm(extra)
  f.summary.artifactAudit.classifications['parseable-private-key-material'] = 1
  f.summary.artifactAudit.rawCompiledFindings++
  await writeFile(f.settings.validationFile, JSON.stringify(f.summary))
  assert.deepEqual((await inspectFreeCandidate(f.settings)).reasons, ['ARTIFACT_AUDIT_UNTRUSTED'])
  delete f.summary.artifactAudit.classifications['parseable-private-key-material']; f.summary.artifactAudit.rawCompiledFindings--
  await writeFile(f.settings.validationFile, JSON.stringify(f.summary))
  await chmod(f.settings.baselineFile, 0o644)
  assert.deepEqual((await inspectFreeCandidate(f.settings)).reasons, ['PRIVATE_EVIDENCE_REQUIRED'])
})

test('quarantine markers and canonical symlink aliases deny before any generated content is read', async t => {
  const f = await fixture(t)
  const alias = path.join(f.root, 'quarantine-alias'); await symlink(f.bad, alias)
  for (const buildRoot of [f.bad, alias]) {
    const result = await inspectFreeCandidate({ ...f.settings, buildRoot, inventoryFile: path.join(f.root, 'does-not-exist') })
    assert.equal(result.quarantined, true); assert.deepEqual(result.reasons, ['ARTIFACT_QUARANTINED'])
  }
})


test('backend assets have complete baseline-derived proof and honest total coverage', async t => {
  const f = await fixture(t); const candidate = await inspectFreeCandidate(f.settings)
  assert.equal(candidate.verified, true)
  assert.equal(candidate.artifactFiles, f.artifactCount)
  assert.equal(candidate.backendAssetFiles, 10)
  assert.equal(candidate.totalArtifactFiles, f.artifactCount + 10)
  assert.deepEqual(candidate.backendAssetProof.map(item => [path.basename(item.path), item.source]).sort(), [...f.backendAssets].sort())
  for (const item of candidate.backendAssetProof) {
    const approved = await readFile(path.join(f.source, item.source))
    assert.equal(item.size, approved.length); assert.equal(item.sha256, sha(approved))
  }
})

test('backend assets reject tampering, extra/missing entries, links and unapproved paired copies', async t => {
  const f = await fixture(t)
  const directory = path.join(f.build, '.wrangler/free-profile/backend-assets')
  for (const name of f.backendAssets.keys()) {
    await t.test(`reject changed ${name}`, async () => {
      const file = path.join(directory, name); const original = await readFile(file); const changed = Buffer.from(original)
      changed[0] ^= 1
      try {
        await writeFile(file, changed)
        assert.equal((await inspectFreeCandidate(f.settings)).verified, false)
      } finally { await writeFile(file, original) }
    })
  }
  await t.test('reject added file', async () => {
    const file = await f.put(f.build, '.wrangler/free-profile/backend-assets/unapproved.svg', 'unapproved fixture')
    try { assert.equal((await inspectFreeCandidate(f.settings)).verified, false) } finally { await rm(file) }
  })
  await t.test('reject missing file', async () => {
    const file = path.join(directory, 'noto-jp-subset.ttf'); const original = await readFile(file)
    try { await rm(file); assert.equal((await inspectFreeCandidate(f.settings)).verified, false) } finally { await writeFile(file, original) }
  })
  await t.test('reject file symlink even with approved identical bytes', async () => {
    const file = path.join(directory, 'noto-jp-subset.ttf'); const original = await readFile(file)
    try {
      await rm(file); await symlink(path.join(f.source, 'scripts/cloudflare/assets/noto-jp-subset.ttf'), file)
      assert.equal((await inspectFreeCandidate(f.settings)).verified, false)
    } finally { await rm(file); await writeFile(file, original) }
  })
  await t.test('reject a symlinked asset directory', async () => {
    const saved = path.join(f.root, 'identical-backend-assets')
    try {
      await rename(directory, saved); await symlink(saved, directory)
      assert.equal((await inspectFreeCandidate(f.settings)).verified, false)
    } finally { await rm(directory); await rename(saved, directory) }
  })
  await t.test('reject a directory entry or directory symlink', async () => {
    const extra = path.join(directory, 'extra-directory')
    try { await mkdir(extra); assert.equal((await inspectFreeCandidate(f.settings)).verified, false) } finally { await rm(extra, { recursive: true }) }
    try { await symlink(f.source, extra); assert.equal((await inspectFreeCandidate(f.settings)).verified, false) } finally { await rm(extra) }
  })
  await t.test('reject marker copied from an unapproved mutable dependency', async () => {
    const file = path.join(directory, 'marker-icon.png'); const original = await readFile(file)
    await f.put(f.build, 'node_modules/leaflet/dist/images/marker-icon-2x.png', 'unapproved dependency marker')
    try {
      await writeFile(file, 'unapproved dependency marker')
      assert.equal((await inspectFreeCandidate(f.settings)).verified, false)
    } finally { await writeFile(file, original) }
  })
  await t.test('reject matching mutated immutable source and deployed copy against the approved baseline', async () => {
    const file = path.join(directory, 'noto-jp-subset.ttf')
    const source = path.join(f.source, 'scripts/cloudflare/assets/noto-jp-subset.ttf'); const original = await readFile(source)
    try {
      await writeFile(source, 'paired unapproved fixture'); await writeFile(file, 'paired unapproved fixture')
      assert.equal((await inspectFreeCandidate(f.settings)).verified, false)
    } finally { await writeFile(source, original); await writeFile(file, original) }
  })
  assert.equal((await inspectFreeCandidate(f.settings)).verified, true, 'all temporary mutations were restored')
})
