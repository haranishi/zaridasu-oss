import { runLocalStatements } from './review-transaction.mjs'
import { failure, uuid } from './trial-validation.mjs'

export async function requestDeletion(fixture, ownerUid, newOperationId) {
  const id = uuid(newOperationId())
  const result = await runLocalStatements(fixture, [
    [`INSERT INTO deletion_jobs (id, owner_uid, state, media_refs_json, attempts, last_error)
      SELECT ?, a.uid, 'requested',
        (SELECT json_group_array(json_object('bucket', 'water-report-photos', 'key', p.value, 'visibility', 'private'))
         FROM water_reports w, json_each(w.photo_paths_json) p WHERE w.owner_uid = a.uid), 0, NULL
      FROM accounts a WHERE a.uid = ? AND a.lifecycle IN ('active', 'deleting')
      ON CONFLICT (owner_uid) DO NOTHING`, [id, ownerUid]],
    [`UPDATE accounts SET lifecycle = 'deleting' WHERE uid = ? AND lifecycle IN ('active', 'deleting')
      AND EXISTS (SELECT 1 FROM deletion_jobs WHERE owner_uid = ?) RETURNING uid`, [ownerUid, ownerUid]],
    [`SELECT j.id, j.state FROM deletion_jobs j JOIN accounts a ON a.uid = j.owner_uid
      WHERE j.owner_uid = ? AND a.lifecycle = 'deleting'`, [ownerUid]],
  ])
  if (result[1].length !== 1 || result[2].length !== 1) throw failure('FORBIDDEN', 'Current deletion target required')
  return result[2][0]
}

async function cleanDatabase(fixture, job, createdAt) {
  const owner = job.owner_uid
  await runLocalStatements(fixture, [
    // Cancel private payloads and operational claims BEFORE removing the referenced report. The reviewed
    // outbox.target_id NOT NULL fail-closed invariant remains unchanged; no dangling FK or later resend.
    ['DELETE FROM outbox WHERE target_id IN (SELECT id FROM water_reports WHERE owner_uid = ?)', [owner]],
    ['DELETE FROM submission_receipts WHERE owner_uid = ?', [owner]],
    ['DELETE FROM review_claims WHERE actor_uid = ? OR report_id IN (SELECT id FROM water_reports WHERE owner_uid = ?)', [owner, owner]],
    ['UPDATE water_reports SET reviewed_by = NULL WHERE reviewed_by = ?', [owner]],
    ['DELETE FROM water_reports WHERE owner_uid = ?', [owner]],
    ['UPDATE posts_raw SET owner_uid = NULL WHERE owner_uid = ?', [owner]],
    ['UPDATE audit_logs SET actor_uid = NULL WHERE actor_uid = ?', [owner]],
    ['DELETE FROM user_profiles WHERE uid = ?', [owner]],
    ['DELETE FROM quota_state WHERE owner_uid = ?', [owner]],
    [`INSERT INTO audit_logs (id, actor_uid, action, target_id, details_json, created_at)
      SELECT id, NULL, 'delete_account', owner_uid, '{"private_cleanup":true}', ? FROM deletion_jobs
      WHERE id = ? AND state IN ('requested', 'blocked') ON CONFLICT (id) DO NOTHING`, [createdAt, job.id]],
    [`UPDATE deletion_jobs SET state = 'db-cleaned', last_error = NULL
      WHERE id = ? AND state IN ('requested', 'blocked') RETURNING id`, [job.id]],
  ])
}

function privateMedia(serialized, owner) {
  const media = JSON.parse(serialized)
  if (!Array.isArray(media) || media.length > 3000) throw new Error('Bounded synthetic private media required')
  for (const item of media) {
    if (!item || Object.keys(item).sort().join(',') !== 'bucket,key,visibility' || item.visibility !== 'private'
      || !['rare-photos', 'water-report-photos'].includes(item.bucket) || typeof item.key !== 'string'
      || !item.key.startsWith(`${owner}/`) || !/^[a-f0-9-]{36}\/[A-Za-z0-9._-]{1,120}$/.test(item.key)
      || item.key.includes('..')) throw new Error('Synthetic private owner path required')
  }
  return media
}

export async function runDeletion(fixture, id, effects, createdAt) {
  const read = async () => (await fixture.query(`SELECT j.id, j.owner_uid, j.state, j.media_refs_json, j.attempts, j.last_error
    FROM deletion_jobs j JOIN accounts a ON a.uid = j.owner_uid
    WHERE j.id = ? AND a.lifecycle IN ('deleting', 'deleted')`, [id]))[0]
  let job = await read()
  if (!job) throw failure('NOT_FOUND', 'Recorded deletion target required')
  if (job.state === 'completed') return { id, state: 'completed' }
  const [attempt] = await fixture.query(`UPDATE deletion_jobs SET attempts = attempts + 1
    WHERE id = ? AND state <> 'completed' RETURNING id`, [id])
  if (!attempt) return { id, state: (await read()).state }
  if (['requested', 'blocked'].includes(job.state)) {
    await cleanDatabase(fixture, job, createdAt)
    job = await read()
  }
  // External operations deliberately happen AFTER the DB transaction. Their idempotent contract tolerates
  // timeout-after-side-effect and repeated calls; strict external exactly-once is not promised.
  for (const [phase, next, effect, errorCode] of [
    ['db-cleaned', 'media-cleaned', 'removePrivateMedia', 'MEDIA_FAILED'],
    ['media-cleaned', 'completed', 'deleteAuth', 'AUTH_FAILED'],
  ]) {
    if (job.state !== phase) continue
    try {
      if (typeof effects?.[effect] !== 'function') throw new Error('Synthetic external deletion operation required')
      const media = effect === 'removePrivateMedia' ? privateMedia(job.media_refs_json, job.owner_uid) : []
      await effects[effect]({ ownerUid: job.owner_uid, jobId: id, media })
    } catch {
      await fixture.execute('UPDATE deletion_jobs SET last_error = ? WHERE id = ? AND state = ?', [errorCode, id, phase])
      throw failure('RETRYABLE_DELETE', 'Recorded external deletion phase requires retry')
    }
    if (next === 'completed') {
      await runLocalStatements(fixture, [
        [`UPDATE accounts SET lifecycle = 'deleted', trusted_role = 'user' WHERE uid = ? AND lifecycle = 'deleting'
          AND EXISTS (SELECT 1 FROM deletion_jobs WHERE id = ? AND state = 'media-cleaned')`, [job.owner_uid, id]],
        [`UPDATE deletion_jobs SET state = 'completed', last_error = NULL WHERE id = ? AND state = 'media-cleaned'
          AND EXISTS (SELECT 1 FROM accounts WHERE uid = ? AND lifecycle = 'deleted') RETURNING id`, [id, job.owner_uid]],
      ])
    } else {
      await fixture.execute(`UPDATE deletion_jobs SET state = 'media-cleaned', media_refs_json = '[]', last_error = NULL
        WHERE id = ? AND state = 'db-cleaned'`, [id])
    }
    job = await read()
  }
  if (job.state !== 'completed') throw failure('RETRYABLE_DELETE', 'Deletion has not reached completion')
  return { id, state: job.state }
}
