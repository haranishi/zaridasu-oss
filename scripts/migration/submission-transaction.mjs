import { createHash, randomUUID } from 'node:crypto'
import { runLocalStatements } from './review-transaction.mjs'
import { failure, fields, invalid, text, uuid } from './trial-validation.mjs'

export function submissionInput(input, ownerUid) {
  fields(input, ['queuedOwnerUid', 'clientId', 'name', 'note', 'lat', 'lng', 'photoPaths'])
  uuid(input.queuedOwnerUid)
  uuid(input.clientId)
  if (input.queuedOwnerUid !== ownerUid) throw failure('FORBIDDEN', 'Queued owner must match verified owner')
  if (typeof input.lat !== 'number' || !Number.isFinite(input.lat) || Math.abs(input.lat) > 90
    || typeof input.lng !== 'number' || !Number.isFinite(input.lng) || Math.abs(input.lng) > 180
    || (input.note != null && (typeof input.note !== 'string' || input.note.length > 2000 || [...input.note].length > 1000))
    || !Array.isArray(input.photoPaths) || input.photoPaths.length < 1 || input.photoPaths.length > 3
    || new Set(input.photoPaths).size !== input.photoPaths.length) invalid()
  for (const value of input.photoPaths) {
    if (typeof value !== 'string' || !value.startsWith(`${ownerUid}/`)
      || !/^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(value)) invalid()
  }
  // Match the source NUMERIC(10,7), optional note, name trimming and ordered photo array.
  const values = [Number(input.lat.toFixed(7)), Number(input.lng.toFixed(7)), text(input.name, 80),
    input.note ?? null, JSON.stringify(input.photoPaths)]
  return { clientId: input.clientId, values,
    hash: createHash('sha256').update(JSON.stringify(values)).digest('hex') }
}

export async function submitTransaction(fixture, ownerUid, input, receivedAt, newOperationId) {
  const id = randomUUID(), operationId = uuid(newOperationId())
  const { clientId, values, hash } = input
  const cutoff = new Date(Date.parse(receivedAt) - 3600000).toISOString()
  const statements = [
    [`INSERT INTO water_reports
      (id, owner_uid, client_id, lat, lng, private_name, note, photo_paths_json, status, created_at, version)
      SELECT ?, a.uid, ?, ?, ?, ?, ?, ?, 'pending', ?, 0 FROM accounts a
      WHERE a.uid = ? AND a.lifecycle = 'active'
        AND NOT EXISTS (SELECT 1 FROM water_reports WHERE owner_uid = a.uid AND client_id = ?)
        AND (SELECT count(*) FROM water_reports WHERE owner_uid = a.uid) < 1000
        AND (SELECT count(*) FROM water_reports WHERE owner_uid = a.uid AND created_at >= ?) < 20
      RETURNING id, status, created_at`, [id, clientId, ...values, receivedAt, ownerUid, clientId, cutoff]],
    // Always attempt this insert. Missing/over-quota/unauthorized/different-payload produces a real NOT NULL
    // error before UPSERT, rolling back all preceding writes; duplicate key is resolved before quota.
    [`INSERT INTO submission_receipts (owner_uid, client_id, report_id, payload_hash, operation_id)
      VALUES (?, ?, (SELECT w.id FROM water_reports w JOIN accounts a ON a.uid = w.owner_uid
        WHERE w.owner_uid = ? AND w.client_id = ? AND a.lifecycle = 'active'
          AND w.lat = ? AND w.lng = ? AND w.private_name = ? AND w.note IS ? AND w.photo_paths_json = ?), ?, ?)
      ON CONFLICT (owner_uid, client_id) DO UPDATE SET report_id = excluded.report_id
        WHERE payload_hash = excluded.payload_hash
      RETURNING report_id`, [ownerUid, clientId, ownerUid, clientId, ...values, hash, operationId]],
    [`INSERT INTO outbox (id, target_id, event_type, payload_json, delivery_state, attempts)
      SELECT operation_id, report_id, 'water.submitted', '{"kind":"water-report-submitted"}', 'pending', 0
      FROM submission_receipts WHERE operation_id = ? AND report_id = ? RETURNING id`, [operationId, id]],
    [`SELECT w.id, w.status, w.created_at FROM water_reports w JOIN accounts a ON a.uid = w.owner_uid
      WHERE w.owner_uid = ? AND w.client_id = ? AND a.lifecycle = 'active'`, [ownerUid, clientId]],
  ]
  try {
    const results = await runLocalStatements(fixture, statements)
    if (results[1].length !== 1 || results[3].length !== 1
      || (results[0].length === 1 && results[2].length !== 1)) throw failure('CONFLICT', 'Submission did not fully persist')
    return results[3][0]
  } catch (error) {
    if (/not.?null|database is locked|SQLITE_BUSY/i.test(error.message)) {
      throw failure('CONFLICT', 'Submission key/content, current account or rolling quota disallows this write', error)
    }
    throw error
  }
}
