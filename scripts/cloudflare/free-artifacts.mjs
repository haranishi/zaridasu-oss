import assert from 'node:assert/strict'
import { createHash, createPrivateKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OSS_ASSET_REPLACEMENTS } from '../lib/exportOssSource.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function files(root) {
  const found = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Audit refuses symbolic links')
    const name = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...await files(name))
    else if (entry.isFile()) found.push(name)
  }
  return found
}
function scan(directory, config) {
  // Raw reports and key values stay only in process memory. They are never written or printed.
  const result = spawnSync('gitleaks', ['dir', '--config', config, '--gitleaks-ignore-path', '/dev/null',
    '--ignore-gitleaks-allow', '--no-banner', '--no-color', '--report-format=json', '--report-path=-', directory],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.ok(!result.error && [0, 1].includes(result.status), 'Secret audit did not execute successfully')
  let findings
  try { findings = JSON.parse(result.stdout) } catch { throw new Error('Secret audit returned no parseable RAM-only report') }
  assert.ok(Array.isArray(findings))
  return findings
}

// Use the parser shipped by the pinned direct Next dependency; no new dependency or code execution.
const { tokenizer } = createRequire(import.meta.url)('next/dist/compiled/acorn')

/** Classify exact current matches. Ambiguous positions and every literal/comment remain denied. */
export function classifyCompiledSource(source, findings, generatedKeys = new Set()) {
  const generated = [...generatedKeys]
  const spans = []
  const perFinding = findings.map((finding, index) => {
    const value = finding.Secret
    if (typeof value !== 'string' || value.length === 0) return { kind: 'unclassified' }
    if (generated.some(key => key === value || (value.length >= 32 && key.includes(value)))) return { kind: 'generated-next-key-material' }
    if (finding.RuleID === 'private-key') {
      try { createPrivateKey(value.replaceAll('\\n', '\n').replaceAll('\\r', '\r')); return { kind: 'parseable-private-key-material' } } catch { /* Unknown key-looking material remains denied. */ }
    }
    if (!['generic-api-key', 'cloudflare-api-key'].includes(finding.RuleID) || typeof finding.Match !== 'string' || !finding.Match.includes(value)) return { kind: 'unclassified' }
    const ownSpans = []
    // Check ALL exact full-match occurrences and ALL captured-value occurrences
    // within each match. A same-value expression elsewhere cannot mask a literal.
    for (let at = source.indexOf(finding.Match); at !== -1; at = source.indexOf(finding.Match, at + 1)) {
      for (let offset = finding.Match.indexOf(value); offset !== -1; offset = finding.Match.indexOf(value, offset + 1)) {
        const span = { index, start: at + offset, end: at + offset + value.length, covered: 0, code: true, wholeName: true }
        spans.push(span); ownSpans.push(span)
      }
    }
    return { kind: 'unclassified', spans: ownSpans, requireWholeName: finding.RuleID === 'cloudflare-api-key' }
  })
  spans.sort((a, b) => a.start - b.start)
  const literals = new Set(['string', 'regexp', 'template', 'invalidTemplate', 'num'])
  try {
    let first = 0
    for (const token of tokenizer(source, { ecmaVersion: 'latest', sourceType: 'module' })) {
      while (first < spans.length && spans[first].end <= token.start) first++
      if (first === spans.length) break
      for (let i = first; i < spans.length && spans[i].start < token.end; i++) {
        const span = spans[i]
        const overlap = Math.max(0, Math.min(span.end, token.end) - Math.max(span.start, token.start))
        span.covered += overlap
        if (overlap && literals.has(token.type.label)) span.code = false
        if (overlap && (token.type.label !== 'name' || token.start !== span.start || token.end !== span.end)) span.wholeName = false
      }
    }
  } catch { return perFinding.map(item => item.kind) }
  return perFinding.map(item => item.spans?.length && item.spans.every(span => span.code && span.covered === span.end - span.start && (!item.requireWholeName || span.wholeName))
    ? 'compiled-code-expression' : item.kind)
}

/** Preserve exact match accounting when Wrangler packages JS and binary MIME parts. */
export async function classifyCompiledContainer(bytes, findings, generatedKeys = new Set()) {
  const source = bytes.toString('utf8')
  const kinds = classifyCompiledSource(source, findings, generatedKeys)
  const boundary = /^--([-A-Za-z0-9_]{1,200})\r?\n/.exec(source)?.[1]
  if (!boundary || !kinds.includes('unclassified')) return kinds
  const javascript = new Set(['application/javascript+module', 'application/javascript', 'text/javascript',
    'application/ecmascript', 'text/ecmascript'])
  let modules
  try {
    const form = await new Response(bytes, { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }).formData()
    modules = await Promise.all([...form.values()].filter(value => typeof value !== 'string' && javascript.has(value.type)).map(value => value.text()))
  } catch { return kinds }
  const count = (text, value) => {
    let found = 0
    for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + 1)) found++
    return found
  }
  const moduleKinds = modules.map(text => classifyCompiledSource(text, findings, generatedKeys))
  return kinds.map((kind, index) => {
    const finding = findings[index]
    if (kind !== 'unclassified' || typeof finding.Match !== 'string' || !finding.Match.length) return kind
    const matched = modules.map((text, moduleIndex) => ({ text, moduleIndex })).filter(item => item.text.includes(finding.Match))
    const inModules = matched.reduce((sum, item) => sum + count(item.text, finding.Match), 0)
    // A full match in metadata, binary, non-JS, or any ambiguous position is denied.
    if (!inModules || inModules !== count(source, finding.Match)) return kind
    return matched.every(item => moduleKinds[item.moduleIndex][index] === 'compiled-code-expression')
      ? 'compiled-code-expression' : kind
  })
}

/** Audit immutable input, exact overlays, licenses and public/private output boundaries. */
export async function auditFreeArtifacts({ baselineFile, overlayFile, sourceRoot, buildRoot }) {
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'))
  const overlay = JSON.parse(await readFile(overlayFile, 'utf8'))
  const overlays = new Map(overlay.overlays.map(item => [item.path, item]))
  const inputFiles = await files(baseline.source)
  assert.equal(inputFiles.length, baseline.records.length)
  const expectedSource = new Set([...baseline.records.map(item => item.path), ...overlays.keys()])
  const auditSource = path.join(buildRoot, '.wrangler/free-profile/source-audit')
  await mkdir(auditSource, { recursive: true, mode: 0o700 })
  for (const original of baseline.records) {
    const bytes = await readFile(path.join(baseline.source, original.path))
    assert.equal(bytes.length, original.size); assert.equal(hash(bytes), original.sha256, 'Immutable input hash changed')
    const expected = overlays.get(original.path) ?? original
    const built = await readFile(path.join(buildRoot, original.path))
    assert.equal(built.length, expected.size); assert.equal(hash(built), expected.sha256, 'Unlisted source mutation in private build')
  }
  for (const [name, item] of overlays) {
    const [source, built] = await Promise.all([readFile(path.join(sourceRoot, name)), readFile(path.join(buildRoot, name))])
    assert.ok(source.equals(built), 'Working source and built overlay differ')
    assert.equal(hash(built), item.sha256); assert.equal(built.length, item.size)
  }
  for (const name of expectedSource) {
    const target = path.join(auditSource, name)
    await mkdir(path.dirname(target), { recursive: true }); await copyFile(path.join(buildRoot, name), target)
  }
  for (const item of OSS_ASSET_REPLACEMENTS) {
    const [replacement, licensed, notice] = await Promise.all([readFile(path.join(buildRoot, item.path)),
      readFile(path.join(buildRoot, item.source)), readFile(path.join(buildRoot, item.notice))])
    assert.ok(replacement.equals(licensed)); assert.ok(notice.length > 0)
  }
  const originals = []
  for (const item of baseline.originals) {
    const bytes = await readFile(path.join(sourceRoot, item.path))
    assert.equal(bytes.length, item.size); assert.equal(hash(bytes), item.sha256)
    originals.push(bytes)
  }
  const publicFiles = [...await files(path.join(buildRoot, 'public')), ...await files(path.join(buildRoot, '.open-next/assets'))]
  const privateRoots = ['.open-next', '.wrangler/free-profile/renderer-dry-run', '.wrangler/free-profile/ingress-dry-run',
    '.wrangler/free-profile/backend-dry-run', '.wrangler/free-profile/test-renderer-dry-run']
  const outputFiles = [...new Set([...publicFiles, ...await Promise.all(privateRoots.map(name => files(path.join(buildRoot, name)))).then(groups => groups.flat())])]
  let originalWholeBytes = 0
  for (const name of outputFiles) {
    const bytes = await readFile(name)
    for (const original of originals) if (bytes.includes(original)) originalWholeBytes++
  }
  assert.equal(originalWholeBytes, 0, 'Original unverified image bytes appeared in output')
  const publicMaps = publicFiles.filter(name => name.endsWith('.map')).length
  assert.equal(publicMaps, 0)
  const config = path.join(buildRoot, '.gitleaks-oss.toml')
  const sourceFindings = scan(auditSource, config)
  const publicFindings = scan(path.join(buildRoot, '.open-next/assets'), config)
  assert.equal(sourceFindings.length, 0, 'Publishable source secret findings require review')
  assert.equal(publicFindings.length, 0, 'Public asset secret findings require review')
  const generatedKeys = new Set()
  const prerender = JSON.parse(await readFile(path.join(buildRoot, '.next/prerender-manifest.json'), 'utf8'))
  for (const value of Object.values(prerender.preview ?? {})) if (typeof value === 'string' && value.length >= 32) generatedKeys.add(value)
  const references = JSON.parse(await readFile(path.join(buildRoot, '.next/server/server-reference-manifest.json'), 'utf8'))
  if (typeof references.encryptionKey === 'string' && references.encryptionKey.length >= 32) generatedKeys.add(references.encryptionKey)
  const classifications = {}; let rawCompiledFindings = 0; let unclassified = 0
  const sensitiveValues = new Set(generatedKeys)
  for (const directory of privateRoots) {
    const byFile = new Map()
    for (const finding of scan(path.join(buildRoot, directory), config)) {
      const file = path.isAbsolute(finding.File) ? finding.File : path.resolve(buildRoot, finding.File)
      assert.ok(file.startsWith(path.resolve(buildRoot) + path.sep), 'Scanner returned a file outside the build')
      const group = byFile.get(file) ?? []
      group.push(finding); byFile.set(file, group)
    }
    for (const [file, findings] of byFile) {
      const kinds = await classifyCompiledContainer(await readFile(file), findings, generatedKeys)
      for (const [index, kind] of kinds.entries()) {
        rawCompiledFindings++
        if (kind === 'unclassified') unclassified++
        classifications[kind] = (classifications[kind] ?? 0) + 1
        // Code expressions are not secret values. All actual or unknown material
        // must stay absent from source/public bytes. The known-key set is immutable.
        if (kind !== 'compiled-code-expression' && typeof findings[index].Secret === 'string' && findings[index].Secret.length >= 16) {
          sensitiveValues.add(findings[index].Secret)
        }
      }
    }
  }
  let sourcePublicKeyExactBytes = 0
  for (const name of [...await files(auditSource), ...publicFiles]) {
    const bytes = await readFile(name)
    for (const key of sensitiveValues) if (bytes.includes(Buffer.from(key))) sourcePublicKeyExactBytes++
  }
  assert.equal(sourcePublicKeyExactBytes, 0, 'Private compiled key material appeared in source or public bytes')
  const result = { immutableFiles: baseline.records.length, immutableBytes: baseline.records.reduce((n, item) => n + item.size, 0),
    overlayFiles: overlays.size, licensedReplacementCount: OSS_ASSET_REPLACEMENTS.length, originalWholeBytes, publicMaps,
    sourceSecretFindings: sourceFindings.length, publicSecretFindings: publicFindings.length,
    rawCompiledFindings, classifications, generatedOrCompiledKeyValuesChecked: sensitiveValues.size, sourcePublicKeyExactBytes,
    unclassified, accountFreeVerified: false, remoteCpuVerified: false }
  return result
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [baselineFile, overlayFile, sourceRoot, buildRoot] = process.argv.slice(2)
  assert.ok([baselineFile, overlayFile, sourceRoot, buildRoot].every(Boolean), 'Expected baseline, overlay, source root and build root')
  await stat(buildRoot)
  const result = await auditFreeArtifacts({ baselineFile, overlayFile, sourceRoot, buildRoot })
  console.log(JSON.stringify(result, null, 2))
  assert.equal(result.unclassified, 0, 'Compiled findings require current-build classification; no old exemption is reused')
}
