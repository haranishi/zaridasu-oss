import assert from 'node:assert/strict'
import { openTurso } from './local-databases.mjs'
import { UID } from './trial-test-helpers.mjs'

export const CLIENT = n => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const submission = (n = 1, owner = UID.a) => ({ queuedOwnerUid: owner, clientId: CLIENT(n),
  name: "合成の池 '); --", note: null, lat: 40.1234567, lng: 140.2345678,
  photoPaths: [`${owner}/50000000-0000-4000-8000-000000000099.jpg`] })

export async function writers(context, t, operation) {
  if (context.fixture.engine === 'd1') return operation([context.api, context.createApi(context.fixture)])
  const peer = await openTurso(context.fixture.stateDirectory)
  try {
    await peer.execute('PRAGMA foreign_keys = ON', [])
    assert.notEqual(peer.database, context.fixture.database)
    t.diagnostic('Two native Turso connections to the same file; no application mutex')
    return await operation([context.api, context.createApi({ engine: 'turso', ...peer })])
  } finally { await peer.close() }
}

// Trusted synthetic setup, through real native transaction/batch, never injected query results.
export async function seedReports(fixture, owner, count, received) {
  const statements = Array.from({ length: count }, (_, index) => [`INSERT INTO water_reports
    (id, owner_uid, client_id, lat, lng, private_name, note, photo_paths_json, status, created_at, version)
    VALUES (?, ?, ?, 40.1234567, 140.2345678, '合成の上限試験', NULL, ?, 'pending', ?, 0)`,
  [`b0000000-0000-4000-8000-${String(index).padStart(12, '0')}`, owner, CLIENT(index + 10000),
    JSON.stringify([`${owner}/50000000-0000-4000-8000-000000000099.jpg`]), received]])
  const { runLocalStatements } = await import('./review-transaction.mjs')
  await runLocalStatements(fixture, statements)
}
