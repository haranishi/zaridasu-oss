import { randomUUID } from 'node:crypto'
import { failure } from './trial-validation.mjs'

// Fixed SQL and server-created operation IDs. No caller SQL, provider framework, or shared app mutex.
export async function reviewTransaction(fixture, actorUid, input, reviewedAt, newOperationId = randomUUID) {
  const { id, expectedVersion, status, publicName } = input
  const operationId = newOperationId()
  const publicId = randomUUID()
  const statements = [
    [`INSERT INTO review_claims
      (operation_id, report_id, expected_version, previous_status, previous_public_id, public_id, actor_uid, reviewed_at)
      SELECT ?, w.id, w.version, w.status, w.published_water_body_id,
        coalesce(w.published_water_body_id, ?), a.uid, ?
      FROM water_reports w JOIN accounts a ON a.uid = ?
      WHERE w.id = ? AND w.version = ? AND a.lifecycle = 'active' AND a.trusted_role = 'admin'
      RETURNING operation_id`, [operationId, publicId, reviewedAt, actorUid, id, expectedVersion]],
    [`INSERT INTO community_water_bodies (id, name, lat, lng, created_at)
      SELECT c.public_id, ?, round(w.lat, 3), round(w.lng, 3), c.reviewed_at
      FROM review_claims c JOIN water_reports w ON w.id = c.report_id
      WHERE c.operation_id = ? AND w.version = c.expected_version AND ? = 'accepted'
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, lat = excluded.lat, lng = excluded.lng`,
    [publicName, operationId, status]],
    [`UPDATE water_reports SET status = ?, public_name = CASE WHEN ? = 'accepted' THEN ? ELSE public_name END,
      published_water_body_id = CASE WHEN ? = 'accepted'
        THEN (SELECT public_id FROM review_claims WHERE operation_id = ?) ELSE NULL END,
      reviewed_at = (SELECT reviewed_at FROM review_claims WHERE operation_id = ?),
      reviewed_by = (SELECT actor_uid FROM review_claims WHERE operation_id = ?), version = version + 1
      WHERE id = (SELECT report_id FROM review_claims WHERE operation_id = ?)
        AND version = (SELECT expected_version FROM review_claims WHERE operation_id = ?)
      RETURNING id, status, public_name, version, reviewed_at, reviewed_by`,
    [status, status, publicName, status, operationId, operationId, operationId, operationId, operationId]],
    [`DELETE FROM community_water_bodies
      WHERE id = (SELECT previous_public_id FROM review_claims WHERE operation_id = ?) AND ? = 'rejected'`,
    [operationId, status]],
    [`INSERT INTO audit_logs (id, actor_uid, action, target_id, details_json, created_at)
      SELECT c.operation_id, c.actor_uid, 'review_water_report', c.report_id,
        json_object('previous_status', c.previous_status, 'status', ?), c.reviewed_at
      FROM review_claims c JOIN water_reports w ON w.id = c.report_id
      WHERE c.operation_id = ? AND w.version = c.expected_version + 1`, [status, operationId]],
    // VALUES always attempts the final insert. Missing claim / zero-row raw update produces a REAL NOT NULL
    // violation and rolls back the whole native batch/transaction. A stale operation cannot borrow a winner's claim.
    [`INSERT INTO outbox (id, target_id, event_type, payload_json, delivery_state, attempts)
      VALUES (?, (SELECT w.id FROM review_claims c JOIN water_reports w ON w.id = c.report_id
        WHERE c.operation_id = ? AND w.version = c.expected_version + 1), 'water.reviewed',
        json_object('status', ?, 'public_water_body_id',
          (SELECT CASE WHEN ? = 'accepted' THEN public_id ELSE previous_public_id END
           FROM review_claims WHERE operation_id = ?)), 'pending', 0)`,
    [operationId, operationId, status, status, operationId]],
  ]
  try {
    const results = await runLocalStatements(fixture, statements)
    if (results[0].length !== 1 || results[2].length !== 1) {
      throw failure('CONFLICT', 'Review target is missing, stale, or no longer authorized')
    }
    return results[2][0]
  } catch (error) {
    if (/not.?null|database is locked|SQLITE_BUSY/i.test(error.message)) {
      throw failure('CONFLICT', 'Review target is missing, stale, or no longer authorized', error)
    }
    throw error
  }
}

// Shared only by these local trials: the reviewed native batch/IMMEDIATE transaction, no app mutex.
export async function runLocalStatements(fixture, statements) {
  if (fixture.engine === 'd1') {
    const batch = await fixture.database.batch(statements.map(([sql, parameters]) =>
      fixture.database.prepare(sql).bind(...parameters)))
    return batch.map(result => result.results)
  }
  return fixture.database.transactionAsync(async txn => {
    const rows = []
    for (const [sql, parameters] of statements) {
      const prepared = txn.prepare(sql)
      try { rows.push(await prepared.all(...parameters)) } finally { prepared.close() }
    }
    return rows
  }).immediate()
}
