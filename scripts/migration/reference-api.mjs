import { randomUUID } from 'node:crypto'
import { reviewTransaction } from './review-transaction.mjs'
import { submissionInput, submitTransaction } from './submission-transaction.mjs'
import { requestDeletion, runDeletion } from './deletion-transaction.mjs'
import { failure, fields, invalid, text, uuid } from './trial-validation.mjs'

/** Local reference API only. Its verifier, clock and operation-ID source are TRUSTED fixture controls. */
export function createReferenceApi(fixture, verify, { now = Date.now, newOperationId = randomUUID, deletionEffects } = {}) {
  if (!['turso', 'd1'].includes(fixture.engine) || typeof verify !== 'function') throw new TypeError('Local fixture/verifier required')
  function identity(credential, kind) {
    const principal = verify(credential)
    if (!principal) throw failure('UNAUTHENTICATED', 'Verified fixture identity required')
    if (principal.kind !== kind) throw failure('FORBIDDEN', 'Operation is not permitted for this identity')
    return principal
  }
  async function account(credential, requireAdmin = false) {
    const principal = identity(credential, 'user')
    const [current] = await fixture.query(`SELECT uid, trusted_role FROM accounts
      WHERE uid = ? AND lifecycle = 'active'`, [principal.uid])
    if (!current || (requireAdmin && current.trusted_role !== 'admin')) throw failure('FORBIDDEN', 'Current account permission required')
    return current
  }
  function timestamp() {
    const instant = now()
    if (!Number.isFinite(instant)) throw new TypeError('Valid trusted fixture clock required')
    return new Date(instant).toISOString()
  }
  return Object.freeze({
    async publicPosts() {
      return fixture.query(`SELECT id, observed_at, created_at, species, count, location_disclosure,
        display_lat, display_lng, locality, water_body FROM posts_public ORDER BY id`)
    },
    async publicWaterBodies() {
      return fixture.query('SELECT id, name, lat, lng, created_at FROM community_water_bodies ORDER BY id')
    },
    async publicProfile(uid) {
      uuid(uid)
      const [profile] = await fixture.query(`SELECT p.uid, p.display_name FROM user_profiles p
        JOIN accounts a ON a.uid = p.uid WHERE p.uid = ? AND p.is_public = 1 AND a.lifecycle = 'active'`, [uid])
      return profile ?? null
    },
    async readProfile(credential, uid) {
      const actor = await account(credential)
      uuid(uid)
      // unsubscribe_token is not selectable even by its owner in the current source contract.
      const [profile] = await fixture.query(`SELECT p.uid, p.display_name, p.is_public FROM user_profiles p
        JOIN accounts a ON a.uid = p.uid
        WHERE p.uid = ? AND p.uid = ? AND a.lifecycle = 'active'`, [uid, actor.uid])
      return profile ?? null
    },
    async readWaterReport(credential, id) {
      const actor = await account(credential)
      uuid(id)
      const [report] = await fixture.query(`SELECT w.id, w.owner_uid, w.client_id, w.lat, w.lng,
        w.private_name, w.note, w.photo_paths_json, w.status, w.public_name, w.published_water_body_id,
        w.reviewed_at, w.reviewed_by, w.created_at, w.version
        FROM water_reports w JOIN accounts a ON a.uid = ?
        WHERE w.id = ? AND a.lifecycle = 'active' AND (w.owner_uid = a.uid OR a.trusted_role = 'admin')`, [actor.uid, id])
      return report ?? null
    },
    async changeProfile(credential, patch) {
      const actor = await account(credential)
      fields(patch, ['display_name', 'is_public'])
      const name = Object.hasOwn(patch, 'display_name') ? text(patch.display_name, 80) : null
      const visibility = Object.hasOwn(patch, 'is_public') ? patch.is_public : null
      if (Object.hasOwn(patch, 'is_public') && ![0, 1].includes(visibility)) invalid()
      const [changed] = await fixture.query(`UPDATE user_profiles
        SET display_name = coalesce(?, display_name), is_public = coalesce(?, is_public)
        WHERE uid = ? AND EXISTS (SELECT 1 FROM accounts WHERE uid = ? AND lifecycle = 'active')
        RETURNING uid, display_name, is_public`, [name, visibility, actor.uid, actor.uid])
      if (!changed) throw failure('FORBIDDEN', 'Profile update affected zero authorized rows')
      return changed
    },
    async reviewWaterReport(credential, input) {
      const actor = await account(credential, true)
      fields(input, ['id', 'expectedVersion', 'status', 'publicName'])
      uuid(input.id)
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0
        || !['accepted', 'rejected'].includes(input.status)) invalid()
      const publicName = input.status === 'accepted' ? text(input.publicName, 80) : null
      return reviewTransaction(fixture, actor.uid, { ...input, publicName }, timestamp(), newOperationId)
    },
    async submitWaterReport(credential, input) {
      const actor = await account(credential)
      return submitTransaction(fixture, actor.uid, submissionInput(input, actor.uid), timestamp(), newOperationId)
    },
    async findSubmission(credential, clientId) {
      const actor = await account(credential)
      uuid(clientId)
      const [report] = await fixture.query(`SELECT w.id, w.status, w.created_at FROM water_reports w
        JOIN accounts a ON a.uid = w.owner_uid WHERE w.owner_uid = ? AND w.client_id = ? AND a.lifecycle = 'active'`,
      [actor.uid, clientId])
      return report ?? null
    },
    async requestDeletion(credential) {
      const principal = identity(credential, 'user')
      return requestDeletion(fixture, principal.uid, newOperationId)
    },
    async runDeletion(credential, id) {
      const principal = identity(credential, 'internal')
      if (principal.purpose !== 'deletion') throw failure('FORBIDDEN', 'Dedicated deletion purpose required')
      uuid(id)
      return runDeletion(fixture, id, deletionEffects, timestamp())
    },
    async reserveQuota(credential, scope) {
      const actor = await account(credential)
      if (!['hourly', 'total'].includes(scope)) invalid('Choose a fixed quota scope')
      const window = scope === 'total' ? 'total' : `${timestamp().slice(0, 13)}:00:00.000Z`
      const bound = scope === 'total' ? 1000 : 20
      const [reservation] = await fixture.query(`INSERT INTO quota_state (owner_uid, window_start, used, version)
        SELECT uid, ?, 1, 1 FROM accounts WHERE uid = ? AND lifecycle = 'active'
        ON CONFLICT (owner_uid, window_start) DO UPDATE SET used = used + 1, version = version + 1
          WHERE used < ?
        RETURNING used`, [window, actor.uid, bound])
      return reservation ? { accepted: true, used: reservation.used } : { accepted: false }
    },
    async internalOutbox(credential) {
      const principal = identity(credential, 'internal')
      if (principal.purpose !== 'outbox') throw failure('FORBIDDEN', 'Dedicated internal purpose required')
      return fixture.query(`SELECT o.id, o.target_id, o.event_type, o.payload_json, o.delivery_state, o.attempts
        FROM outbox o JOIN water_reports w ON w.id = o.target_id JOIN accounts a ON a.uid = w.owner_uid
        WHERE o.delivery_state = 'pending' AND a.lifecycle = 'active' ORDER BY o.id LIMIT 100`)
    },
  })
}
