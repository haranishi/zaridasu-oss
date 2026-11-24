import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createLocalFixture } from './local-fixture.mjs'
import { fixtureRegistry, snapshotFromRows } from './fixtures.mjs'
import { runLocalStatements } from './review-transaction.mjs'

const ENVELOPE = 'zaridasu.synthetic-backup.v1'
const LOGICAL = 'zaridasu.synthetic-logical.v1'
const MAX_BYTES = 2 * 1024 * 1024
const bad = () => { throw new TypeError('Invalid or unbounded synthetic backup artifact') }
const schemaHash = async () => createHash('sha256')
  .update(await readFile(new URL('./schema.sql', import.meta.url))).digest('hex')
function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) bad()
  const actual = Reflect.ownKeys(value)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) bad()
}
function checkKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) bad()
}
function base64(value, maximum, exact) {
  if (typeof value !== 'string' || value.length > maximum * 2
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) bad()
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length > maximum || bytes.toString('base64') !== value || (exact && bytes.length !== exact)) bad()
  return bytes
}
function jsonValue(value, depth = 0) {
  if (depth > 10) bad()
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'string') { if (value.length > 65536) bad(); return }
  if (typeof value === 'number') { if (!Number.isFinite(value)) bad(); return }
  if (!value || typeof value !== 'object') bad()
  if (Array.isArray(value)) {
    if (value.length > 3000) bad()
    value.forEach(item => jsonValue(item, depth + 1))
  } else {
    if (Object.keys(value).length > 100) bad()
    for (const [key, item] of Object.entries(value)) {
      if (key.length > 100) bad()
      jsonValue(item, depth + 1)
    }
  }
}
const numericColumns = new Set(['lat', 'lng', 'display_lat', 'display_lng', 'count', 'is_public',
  'attempts', 'used', 'version', 'expected_version'])
const uuidColumns = new Set(['uid', 'id', 'owner_uid', 'actor_uid', 'reviewed_by', 'target_id', 'report_id',
  'published_water_body_id', 'previous_public_id', 'public_id', 'operation_id'])
function scalarValue(column, value) {
  if (value === null) return // the actual NOT NULL/FK/CHECK constraints remain authoritative
  if (numericColumns.has(column)) {
    if (typeof value !== 'number' || !Number.isFinite(value)
      || (!column.includes('lat') && !column.includes('lng') && !Number.isSafeInteger(value))) bad()
  } else {
    if (typeof value !== 'string' || value.length > 4096) bad()
    if (uuidColumns.has(column) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) bad()
    if (['created_at', 'reviewed_at'].includes(column)
      && (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)) bad()
    if (column === 'observed_at' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) bad()
  }
}
async function validateArtifact(artifact) {
  exactKeys(artifact, ['format', 'schema', 'tables'])
  if (artifact.format !== LOGICAL || artifact.schema !== await schemaHash()) bad()
  exactKeys(artifact.tables, fixtureRegistry.map(table => table.name))
  let count = 0
  for (const table of fixtureRegistry) {
    const rows = artifact.tables[table.name]
    if (!Array.isArray(rows) || rows.length > 5000 || (count += rows.length) > 10000) bad()
    for (const row of rows) {
      exactKeys(row, table.columns)
      for (const column of table.columns) {
        const value = row[column]
        if (column.endsWith('_json')) {
          jsonValue(value)
          if (typeof value !== 'object' || value === null) bad()
        } else scalarValue(column, value)
      }
    }
  }
  return artifact
}

// Caller MUST quiesce every writer for this fixture, including peer connections and deletion workers.
// The native read transaction gives one consistent logical view; no active DB/WAL file is copied.
export async function exportSyntheticBackup(fixture, key, { quiesced = false } = {}) {
  if (quiesced !== true) throw new TypeError('Quiesced synthetic fixture required')
  checkKey(key)
  const result = await runLocalStatements(fixture, [
    ...fixtureRegistry.map(table => [`SELECT ${table.columns.join(', ')} FROM ${table.name} ORDER BY ${table.keys.join(', ')}`, []]),
    ['PRAGMA foreign_key_check', []],
  ])
  const rows = Object.fromEntries(fixtureRegistry.map((table, index) => [table.name, result[index]]))
  const snapshot = snapshotFromRows(rows, result.at(-1))
  if (snapshot.orphanCount !== 0) bad()
  const artifact = await validateArtifact({ format: LOGICAL, schema: await schemaHash(), tables: snapshot.rows })
  const plaintext = Buffer.from(JSON.stringify(artifact))
  if (plaintext.length > MAX_BYTES) bad()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(ENVELOPE))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return { format: ENVELOPE, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64') }
}

// Synthetic-only inspection used by the restore validator/test, never a real Auth/media export tool.
export async function openSyntheticBackup(envelope, key) {
  checkKey(key)
  exactKeys(envelope, ['format', 'iv', 'ciphertext', 'tag'])
  if (envelope.format !== ENVELOPE) bad()
  const decipher = createDecipheriv('aes-256-gcm', key, base64(envelope.iv, 12, 12))
  decipher.setAAD(Buffer.from(ENVELOPE))
  decipher.setAuthTag(base64(envelope.tag, 16, 16))
  const plaintext = Buffer.concat([decipher.update(base64(envelope.ciphertext, MAX_BYTES)), decipher.final()])
  if (plaintext.length > MAX_BYTES) bad()
  return validateArtifact(JSON.parse(plaintext.toString('utf8')))
}

export async function restoreSyntheticBackup(engine, envelope, key) {
  const artifact = await openSyntheticBackup(envelope, key)
  const target = await createLocalFixture(engine, { seed: false })
  try {
    const statements = []
    for (const table of fixtureRegistry) {
      const sql = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${table.columns.map(() => '?').join(', ')})`
      for (const row of artifact.tables[table.name]) {
        statements.push([sql, table.columns.map(column => column.endsWith('_json') ? JSON.stringify(row[column]) : row[column])])
      }
    }
    statements.push(['PRAGMA foreign_key_check', []])
    const result = await runLocalStatements(target, statements)
    if (result.at(-1).length !== 0) bad()
    return target
  } catch (error) {
    await target.destroy()
    throw error
  }
}
