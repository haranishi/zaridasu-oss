import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const A = '10000000-0000-4000-8000-000000000001'
const B = '10000000-0000-4000-8000-000000000002'
const ADMIN = '10000000-0000-4000-8000-000000000003'
const DELETING = '10000000-0000-4000-8000-000000000004'
const POST = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const REPORT = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const WATER = '40000000-0000-4000-8000-000000000001'
const RECEIVED = '2026-11-14T23:59:58.123Z'
const REVIEWED = '2026-11-15T00:00:00.456Z'

// Literal synthetic rows only. No app imports, environment variables or data exports.
const tables = [
  { name: 'accounts', keys: ['uid'], rows: [
    { uid: A, trusted_role: 'user', lifecycle: 'active' },
    { uid: B, trusted_role: 'user', lifecycle: 'active' },
    { uid: ADMIN, trusted_role: 'admin', lifecycle: 'active' },
    { uid: DELETING, trusted_role: 'user', lifecycle: 'deleting' },
  ] },
  { name: 'user_profiles', keys: ['uid'], rows: [
    { uid: A, display_name: '合成人物A', is_public: 1, unsubscribe_token: 'fixture-only-unsubscribe-a' },
    { uid: B, display_name: "合成人物B's", is_public: 0, unsubscribe_token: 'fixture-only-unsubscribe-b' },
    { uid: ADMIN, display_name: '合成管理者', is_public: 0, unsubscribe_token: 'fixture-only-unsubscribe-admin' },
  ] },
  { name: 'posts_raw', keys: ['id'], rows: [
    { id: POST(1), owner_uid: A, observed_at: '2026-01-02', created_at: RECEIVED,
      species: 'crayfish', count: null, lat: 40.1234567, lng: 140.2345678,
      location_disclosure: 'precise', private_locality: '合成原票だけの地名A', private_water_body: null,
      metadata_json: { labels: ['合成', '水辺'], attributes: { note: null, confirmed: false } },
      source_hash: null, research_status: 'unreviewed' },
    { id: POST(2), owner_uid: B, observed_at: '2026-01-03', created_at: '2026-11-15T00:00:01.000Z',
      species: 'bullfrog', count: 0, lat: 40.3456789, lng: 140.4567891,
      location_disclosure: 'coarsened', private_locality: '合成原票だけの地名B', private_water_body: '合成の池B',
      metadata_json: { labels: [], attributes: { confirmed: true, note: '未確認と0件を分ける' } },
      source_hash: 'fixture-only-content-hash-b', research_status: 'adopted' },
    { id: POST(3), owner_uid: A, observed_at: '2026-01-04', created_at: '2026-11-15T00:00:02.000Z',
      species: 'crayfish', count: 2, lat: 40.5678912, lng: 140.6789123,
      location_disclosure: 'hidden', private_locality: '合成非公開の地名', private_water_body: '合成非公開の池',
      metadata_json: { labels: ['private'], attributes: { note: null, confirmed: false } },
      source_hash: null, research_status: 'excluded' },
  ] },
  // Public values are explicit, separate fixtures. Setup does not implement a review API.
  { name: 'posts_public', keys: ['id'], rows: [
    { id: POST(1), observed_at: '2026-01-02', created_at: RECEIVED, species: 'crayfish', count: null,
      location_disclosure: 'precise', display_lat: 40.1234567, display_lng: 140.2345678,
      locality: '合成公開の地域A', water_body: null },
    { id: POST(2), observed_at: '2026-01-03', created_at: '2026-11-15T00:00:01.000Z', species: 'bullfrog', count: 0,
      location_disclosure: 'coarsened', display_lat: 40.346, display_lng: 140.457,
      locality: '合成公開の地域B', water_body: '合成公開の水域B' },
    { id: POST(3), observed_at: '2026-01-04', created_at: '2026-11-15T00:00:02.000Z', species: 'crayfish', count: 2,
      location_disclosure: 'hidden', display_lat: null, display_lng: null, locality: null, water_body: null },
  ] },
  { name: 'community_water_bodies', keys: ['id'], rows: [
    { id: WATER, name: '合成の審査済み水域', lat: 40.988, lng: 140.457, created_at: REVIEWED },
  ] },
  { name: 'water_reports', keys: ['id'], rows: [
    { id: REPORT(1), owner_uid: A, client_id: 'fixture-client-a-accepted',
      lat: 40.9876543, lng: 140.4567891, private_name: '合成水域原票A', note: '合成の非公開メモA',
      photo_paths_json: [`${A}/50000000-0000-4000-8000-000000000001.jpg`],
      status: 'accepted', public_name: '合成の審査済み水域', published_water_body_id: WATER, reviewed_at: REVIEWED, reviewed_by: ADMIN,
      created_at: RECEIVED, version: 1 },
    { id: REPORT(2), owner_uid: A, client_id: 'fixture-client-a-pending',
      lat: 40.1112223, lng: 140.3334445, private_name: '合成の未審査水域A', note: '合成の非公開メモ未審査A',
      photo_paths_json: [`${A}/50000000-0000-4000-8000-000000000002.jpg`],
      status: 'pending', public_name: null, published_water_body_id: null, reviewed_at: null, reviewed_by: null,
      created_at: '2026-11-15T00:00:03.000Z', version: 0 },
    { id: REPORT(3), owner_uid: B, client_id: 'fixture-client-b-pending',
      lat: 40.5556667, lng: 140.7778889, private_name: '合成の未審査水域B', note: null,
      photo_paths_json: [`${B}/50000000-0000-4000-8000-000000000003.jpg`],
      status: 'pending', public_name: null, published_water_body_id: null, reviewed_at: null, reviewed_by: null,
      created_at: '2026-11-15T00:00:04.000Z', version: 0 },
  ] },
  { name: 'audit_logs', keys: ['id'], rows: [
    { id: '60000000-0000-4000-8000-000000000001', actor_uid: ADMIN, action: 'review_water_report',
      target_id: REPORT(1), details_json: { previous_status: 'pending', status: 'accepted' }, created_at: REVIEWED },
  ] },
  { name: 'outbox', keys: ['id'], rows: [
    { id: '70000000-0000-4000-8000-000000000001', target_id: REPORT(1), event_type: 'fixture.water-reviewed',
      payload_json: { report_id: REPORT(1), status: 'accepted' }, delivery_state: 'pending', attempts: 0 },
  ] },
  { name: 'quota_state', keys: ['owner_uid', 'window_start'], rows: [
    { owner_uid: A, window_start: '2026-11-14T23:00:00.000Z', used: 2, version: 0 },
  ] },
  { name: 'review_claims', keys: ['operation_id'], columns: ['operation_id', 'report_id', 'expected_version',
    'previous_status', 'previous_public_id', 'public_id', 'actor_uid', 'reviewed_at'], rows: [] },
  { name: 'submission_receipts', keys: ['owner_uid', 'client_id'], columns: ['owner_uid', 'client_id',
    'report_id', 'payload_hash', 'operation_id'], rows: [] },
  { name: 'deletion_jobs', keys: ['id'], rows: [
    { id: '80000000-0000-4000-8000-000000000001', owner_uid: DELETING, state: 'requested',
      media_refs_json: [{ bucket: 'water-report-photos', key: `${DELETING}/fixture-only.jpg`, visibility: 'private' }],
      attempts: 0, last_error: null },
  ] },
]

// Fixed allowlist for snapshot/restore. Artifact values can never supply SQL identifiers or statements.
export const fixtureRegistry = Object.freeze(tables.map(table => Object.freeze({ name: table.name,
  keys: Object.freeze(table.keys), columns: Object.freeze(table.columns ?? Object.keys(table.rows[0])) })))

export async function seedFixture(fixture, { seed = true } = {}) {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  for (const sql of schema.split(';').map(sql => sql.trim()).filter(Boolean)) await fixture.execute(sql)
  for (const table of seed ? tables : []) {
    if (!table.rows.length) continue
    const columns = Object.keys(table.rows[0])
    const sql = `INSERT INTO ${table.name} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    for (const row of table.rows) {
      await fixture.execute(sql, columns.map(column => column.endsWith('_json') ? JSON.stringify(row[column]) : row[column]))
    }
  }
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key =>
      [key, normalize(key.endsWith('_json') && typeof value[key] === 'string' ? JSON.parse(value[key]) : value[key])]))
  }
  return value
}

export function snapshotFromRows(tableRows, foreignKeyErrors) {
  const rows = {}, counts = {}, primaryKeys = {}
  for (const table of fixtureRegistry) {
    rows[table.name] = normalize(tableRows[table.name])
    counts[table.name] = rows[table.name].length
    primaryKeys[table.name] = rows[table.name].map(row => table.keys.map(key => row[key]))
  }
  return { rows, counts, primaryKeys, orphanCount: foreignKeyErrors.length,
    hash: createHash('sha256').update(JSON.stringify(normalize(rows))).digest('hex') }
}

export async function snapshotFixture(fixture) {
  const rows = {}
  for (const table of fixtureRegistry) {
    rows[table.name] = await fixture.query(`SELECT * FROM ${table.name} ORDER BY ${table.keys.join(', ')}`)
  }
  return snapshotFromRows(rows, await fixture.query('PRAGMA foreign_key_check'))
}
