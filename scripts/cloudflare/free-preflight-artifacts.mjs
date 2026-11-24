import { createHash } from 'node:crypto'
import { readFile, lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { freeConfigs } from './free-profile.mjs'
import { OSS_ASSET_REPLACEMENTS } from '../lib/exportOssSource.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const fail = code => { const error = new Error('Candidate verification denied'); error.code = code; throw error }
const OUTPUT_ROOTS = ['.open-next', ...['ingress', 'renderer', 'backend', 'test-renderer'].map(name => `.wrangler/free-profile/${name}-dry-run`)]
const BACKEND_ASSET_DIRECTORY = '.wrangler/free-profile/backend-assets'
const BACKEND_ASSET_SOURCES = [
  ...['noto-jp-detector.css', 'noto-cjk-detector.css', 'noto-jp-subset.css', 'noto-jp-subset.ttf',
    '1f99e.svg', 'NotoSansJP-OFL.txt', 'Twemoji-LICENSE-GRAPHICS.txt', 'Leaflet-LICENSE.txt', 'provenance.json']
    .map(name => [name, `scripts/cloudflare/assets/${name}`]),
  ['marker-icon.png', 'public/images/leaflet/marker-icon-2x.png'],
]


export async function readPrivateJson(file) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077) fail('PRIVATE_EVIDENCE_REQUIRED')
  return JSON.parse(await readFile(file, 'utf8'))
}
async function present(file) { try { await lstat(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
async function bytes(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) fail('UNSAFE_EVIDENCE_PATH')
  const file = path.resolve(root, relative)
  if (!file.startsWith(root + path.sep) || await realpath(file) !== file || !(await lstat(file)).isFile()) fail('UNSAFE_EVIDENCE_PATH')
  return readFile(file)
}
async function tree(root, relative = '') {
  const found = []
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) fail('UNSAFE_EVIDENCE_PATH')
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) found.push(...await tree(root, name))
    else if (entry.isFile()) found.push(name)
    else fail('UNSAFE_EVIDENCE_PATH')
  }
  return found
}
async function verifyRecords(root, records) {
  if (!Array.isArray(records) || !records.length || new Set(records.map(item => item.path)).size !== records.length) fail('PROVENANCE_INVALID')
  for (const item of records) {
    if (!Number.isSafeInteger(item.size) || item.size < 0 || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '')) fail('PROVENANCE_INVALID')
    const actual = await bytes(root, item.path)
    if (actual.length !== item.size || hash(actual) !== item.sha256) fail('SOURCE_OR_ARTIFACT_CHANGED')
  }
}

/** Derive every deployed backend asset from its immutable, baseline-approved source. */
async function verifyBackendAssets(root, originals) {
  const directory = path.join(root, BACKEND_ASSET_DIRECTORY)
  if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) fail('UNSAFE_EVIDENCE_PATH')
  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some(entry => !entry.isFile())) fail('UNSAFE_EVIDENCE_PATH')
  if (!isDeepStrictEqual(entries.map(entry => entry.name).sort(), BACKEND_ASSET_SOURCES.map(([name]) => name).sort())) fail('BACKEND_ASSET_SET_CHANGED')
  const sourceRecords = BACKEND_ASSET_SOURCES.map(([, source]) => {
    const approved = originals.get(source)
    if (!approved) fail('BACKEND_ASSET_PROVENANCE_INVALID')
    return approved
  })
  await verifyRecords(root, sourceRecords)
  const proof = BACKEND_ASSET_SOURCES.map(([name, source], index) => ({ path: `${BACKEND_ASSET_DIRECTORY}/${name}`, source,
    size: sourceRecords[index].size, sha256: sourceRecords[index].sha256 }))
  await verifyRecords(root, proof)
  return proof
}

/** No runtime execution: compare approved input/config/output identities and quarantine first. */
export async function inspectFreeCandidate(settings) {
  const denied = { verified: false, quarantined: false, localOnly: true, accountId: settings.selection?.accountId,
    products: [], unsupportedBindings: [], reasons: [] }
  try {
    const root = await realpath(settings.buildRoot)
    if (await present(path.join(root, '.wrangler/NEVER_DEPLOY.json'))) fail('ARTIFACT_QUARANTINED')
    if (!Array.isArray(settings.quarantineFiles) || !settings.quarantineFiles.length) fail('QUARANTINE_EVIDENCE_REQUIRED')
    for (const file of settings.quarantineFiles) {
      const item = await readPrivateJson(file)
      if (item.neverDeploy !== true || typeof item.artifactDirectory !== 'string') fail('QUARANTINE_EVIDENCE_REQUIRED')
      if (await realpath(item.artifactDirectory) === root) fail('ARTIFACT_QUARANTINED')
    }
    const [baseline, overlay, summary, inventory, approval] = await Promise.all([
      readPrivateJson(settings.baselineFile), readPrivateJson(settings.overlayFile), readPrivateJson(settings.validationFile),
      readPrivateJson(settings.inventoryFile), readPrivateJson(settings.approvalFile),
    ])
    if (await realpath(overlay.destination) !== root || await realpath(inventory.build) !== root
      || baseline.revision !== overlay.sourceRevision || overlay.baselineFiles !== baseline.records.length
      || baseline.records.length !== summary.artifactAudit?.immutableFiles || overlay.overlays.length !== summary.artifactAudit?.overlayFiles
      || summary.sourceFrozenVerified !== true || summary.quarantinedArtifactsUsed !== false
      || summary.remoteMutations !== 0 || summary.billingChanges !== 0 || summary.productionChanges !== 0
      || approval.task !== '7.2' || approval.verdict !== 'APPROVED' || approval.scope !== 'LOCAL_PROFILE_ONLY'
      || approval.finalOverlays !== overlay.overlays.length || approval.immutableFiles !== baseline.records.length) fail('PROVENANCE_INVALID')
    const source = await realpath(baseline.source)
    if (await realpath(overlay.source) !== source) fail('PROVENANCE_INVALID')
    const originals = new Map(baseline.records.map(item => [item.path, item]))
    await verifyRecords(source, baseline.records)
    const combined = new Map(originals)
    for (const item of overlay.overlays) combined.set(item.path, item)
    await verifyRecords(root, [...combined.values()])
    await verifyRecords(root, inventory.records)
    if (inventory.records.some(item => !OUTPUT_ROOTS.some(prefix => item.path.startsWith(prefix + '/')))) fail('PROVENANCE_INVALID')
    const actualOutput = (await Promise.all(OUTPUT_ROOTS.map(prefix => tree(root, prefix)))).flat().sort()
    if (!isDeepStrictEqual(actualOutput, inventory.records.map(item => item.path).sort())) fail('SOURCE_OR_ARTIFACT_CHANGED')
    const backendAssetProof = await verifyBackendAssets(root, originals)
    const manifest = JSON.parse(await bytes(root, 'public/OSS_ASSET_MANIFEST.json'))
    if (manifest.profile !== 'oss-source-with-licensed-placeholders' || manifest.source_revision !== baseline.revision
      || !isDeepStrictEqual(manifest.replacements, OSS_ASSET_REPLACEMENTS)) fail('LICENSE_PROVENANCE_INVALID')
    for (const item of OSS_ASSET_REPLACEMENTS) {
      if (!(await bytes(root, item.path)).equals(await bytes(root, item.source)) || !(await bytes(root, item.notice)).length) fail('LICENSE_PROVENANCE_INVALID')
    }
    for (const name of await tree(root, 'public')) {
      if (!combined.has(name) && (name !== 'public/sw.js' || !(await bytes(root, name)).equals(await bytes(root, '.open-next/assets/sw.js')))) fail('SOURCE_OR_ARTIFACT_CHANGED')
    }
    const audit = summary.artifactAudit
    if (['originalWholeBytes', 'publicMaps', 'sourceSecretFindings', 'publicSecretFindings', 'sourcePublicKeyExactBytes', 'unclassified']
      .some(key => audit[key] !== 0) || audit.licensedReplacementCount !== OSS_ASSET_REPLACEMENTS.length
      || audit.commandExitCode !== 0 || Object.keys(audit.classifications ?? {}).some(key => !['generated-next-key-material', 'compiled-code-expression'].includes(key))
      || !Object.values(audit.classifications ?? {}).every(value => Number.isSafeInteger(value) && value >= 0)
      || Object.values(audit.classifications ?? {}).reduce((sum, value) => sum + value, 0) !== audit.rawCompiledFindings
      || !(audit.classifications?.['generated-next-key-material'] > 0) || !(audit.generatedOrCompiledKeyValuesChecked > 0)) fail('ARTIFACT_AUDIT_UNTRUSTED')
    const configs = freeConfigs({ ...settings.selection, root })
    const forbidden = ['r2_buckets', 'kv_namespaces', 'ai', 'vectorize', 'hyperdrive', 'queues', 'workflows', 'pipelines', 'unsafe', 'env', 'browser', 'send_email']
    for (const [name, expected] of Object.entries(configs)) {
      const actual = await readPrivateJson(path.join(root, `.wrangler/free-profile/${name}.json`))
      if (forbidden.some(key => Object.hasOwn(actual, key))) fail('UNSUPPORTED_BINDING')
      if (!isDeepStrictEqual(actual, expected)) fail('PROFILE_CONFIG_CHANGED')
    }
    for (const name of ['prerender-manifest.json', 'server/server-reference-manifest.json']) {
      if (!(await bytes(root, `.next/${name}`)).equals(await bytes(root, `.open-next/server-functions/default/.next/${name}`))) fail('FRAMEWORK_MANIFEST_CHANGED')
    }
    const prerender = JSON.parse(await bytes(root, '.next/prerender-manifest.json'))
    const references = JSON.parse(await bytes(root, '.next/server/server-reference-manifest.json'))
    if (Object.values(prerender.preview ?? {}).filter(value => typeof value === 'string' && value.length >= 32).length !== 3
      || typeof references.encryptionKey !== 'string' || references.encryptionKey.length < 32) fail('FRAMEWORK_MANIFEST_CHANGED')
    const expectedTokenModule = `export const revalidationToken = ${JSON.stringify(prerender.preview?.previewModeId)}\n`
    if (!(await bytes(root, '.wrangler/free-profile/revalidation-token.mjs')).equals(Buffer.from(expectedTokenModule))) fail('FRAMEWORK_MANIFEST_CHANGED')
    if ((await readdir(root)).some(name => (/^\.env(?:\.|$)/.test(name) && name !== '.env.example') || /^\.dev\.vars(?:\.|$)/.test(name))) fail('ENV_INPUT_PRESENT')
    return { verified: true, quarantined: false, accountId: settings.selection.accountId, localOnly: true,
      products: ['workers', 'assets', 'd1', 'durableObjects', 'images'], unsupportedBindings: [], reasons: [],
      resourceNames: Object.fromEntries(['workerName', 'rendererName', 'backendName', 'databaseName'].map(key => [key, settings.selection[key]])),
      immutableFiles: baseline.records.length, overlays: overlay.overlays.length, artifactFiles: inventory.records.length,
      backendAssetFiles: backendAssetProof.length, totalArtifactFiles: inventory.records.length + backendAssetProof.length, backendAssetProof,
      sourceArtifactDigest: hash(JSON.stringify({ baseline, overlay, inventory, backendAssetProof, configs })) }
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z_]+$/.test(error.code) && !['ENOENT', 'EACCES'].includes(error.code)
      ? error.code : 'CANDIDATE_VERIFICATION_FAILED'
    return { ...denied, quarantined: code === 'ARTIFACT_QUARANTINED', reasons: [code] }
  }
}
