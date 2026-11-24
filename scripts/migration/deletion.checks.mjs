import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { denied, POST, REPORT, trial, UID, unchanged } from './trial-test-helpers.mjs'
import { submission } from './recovery-test-helpers.mjs'
import { snapshotFixture } from './local-fixture.mjs'

for (const engine of ['turso', 'd1']) {
  test(`${engine}: deletion records progress across media/Auth failures and retry; public/audit anonymity stays stable`, async t => {
    const calls = { media: 0, auth: 0 }
    let failMedia = true, failAuth = true
    const removed = new Set()
    const context = await trial(engine, t, { deletionEffects: {
      async removePrivateMedia({ media, ownerUid, jobId }) {
        calls.media++
        assert.equal(ownerUid, UID.a)
        assert.match(jobId, /^[a-f0-9-]{36}$/)
        assert.equal(media.length, 2)
        for (const item of media) {
          assert.equal(item.visibility, 'private')
          assert.equal(item.bucket, 'water-report-photos')
          assert.ok(item.key.startsWith(`${UID.a}/`))
          removed.add(item.key)
        }
        if (failMedia) throw new Error('synthetic media timeout after side effect')
      },
      async deleteAuth({ ownerUid }) {
        calls.auth++
        assert.equal(ownerUid, UID.a)
        if (failAuth) throw new Error('synthetic Auth failure')
      },
    } })
    const { fixture, api, credentials: c, authority } = context
    const internal = authority.issuer.deletion()
    await api.reviewWaterReport(c.admin, { id: REPORT(2), expectedVersion: 0, status: 'accepted', publicName: '審査済みの池' })
    await fixture.execute(`INSERT INTO audit_logs (id, actor_uid, action, target_id, details_json, created_at)
      VALUES (?, ?, 'fixture-history', ?, '{}', ?)`, [REPORT(98), UID.a, POST(1), '2026-11-15T00:00:00.000Z'])
    const before = await snapshotFixture(fixture)
    const bReports = before.rows.water_reports.filter(row => row.owner_uid === UID.b)
    const publicBefore = await api.publicPosts()
    const waterBefore = await api.publicWaterBodies()
    const requested = await api.requestDeletion(c.a)
    assert.equal((await api.requestDeletion(c.a)).id, requested.id)
    assert.equal((await fixture.query('SELECT lifecycle FROM accounts WHERE uid = ?', [UID.a]))[0].lifecycle, 'deleting')
    assert.equal((await api.internalOutbox(c.internal)).some(row => [REPORT(1), REPORT(2)].includes(row.target_id)), false,
      'deleting immediately suppresses pending events, including before cleanup or after cleanup failure')
    await unchanged(fixture, async () => {
      await assert.rejects(api.submitWaterReport(c.a, submission()), denied)
      await assert.rejects(api.changeProfile(c.a, { display_name: '古い認証' }), denied)
      await assert.rejects(api.readWaterReport(c.a, REPORT(1)), denied)
    })
    for (const credential of [null, c.a, c.admin, c.internal]) await assert.rejects(api.runDeletion(credential, requested.id), denied)
    await assert.rejects(api.runDeletion(internal, requested.id), error => error.code === 'RETRYABLE_DELETE')
    let state = await snapshotFixture(fixture)
    let job = state.rows.deletion_jobs.find(row => row.id === requested.id)
    assert.equal(job.state, 'db-cleaned')
    assert.equal(job.last_error, 'MEDIA_FAILED', 'external exception text is not persisted')
    assert.equal(job.attempts, 1)
    assert.equal(calls.auth, 0)
    assert.equal(state.rows.water_reports.some(row => row.owner_uid === UID.a), false)
    assert.deepEqual(state.rows.water_reports.filter(row => row.owner_uid === UID.b), bReports)
    assert.equal(state.rows.posts_raw.find(row => row.id === POST(1)).owner_uid, null)
    assert.equal(state.rows.posts_raw.find(row => row.id === POST(3)).owner_uid, null)
    assert.equal(state.rows.posts_raw.find(row => row.id === POST(2)).owner_uid, UID.b)
    assert.equal(state.rows.audit_logs.find(row => row.id === REPORT(98)).actor_uid, null)
    assert.equal(state.rows.audit_logs.length, before.rows.audit_logs.length + 1)
    assert.equal(state.rows.review_claims.some(row => [REPORT(1), REPORT(2)].includes(row.report_id)), false)
    assert.equal((await api.internalOutbox(c.internal)).some(row => [REPORT(1), REPORT(2)].includes(row.target_id)), false)
    assert.deepEqual(await api.publicPosts(), publicBefore)
    assert.deepEqual(await api.publicWaterBodies(), waterBefore, 'independent vetted public water has no owner')
    assert.equal(state.orphanCount, 0)
    const stableAnonymized = state.rows.posts_raw
    const stableAudit = state.rows.audit_logs
    failMedia = false
    await assert.rejects(api.runDeletion(internal, requested.id), error => error.code === 'RETRYABLE_DELETE')
    state = await snapshotFixture(fixture)
    job = state.rows.deletion_jobs.find(row => row.id === requested.id)
    assert.equal(job.state, 'media-cleaned')
    assert.deepEqual(job.media_refs_json, [])
    assert.equal(job.last_error, 'AUTH_FAILED')
    assert.equal(job.attempts, 2)
    assert.equal(removed.size, 2, 'idempotent synthetic remove tolerates a repeated call after timeout')
    failAuth = false
    assert.equal((await api.runDeletion(internal, requested.id)).state, 'completed')
    assert.equal((await fixture.query('SELECT lifecycle FROM accounts WHERE uid = ?', [UID.a]))[0].lifecycle, 'deleted')
    state = await snapshotFixture(fixture)
    assert.deepEqual(state.rows.posts_raw, stableAnonymized)
    assert.deepEqual(state.rows.audit_logs, stableAudit)
    assert.equal(state.rows.deletion_jobs.find(row => row.id === requested.id).attempts, 3)
    assert.deepEqual(calls, { media: 2, auth: 2 })
    await unchanged(fixture, async () => assert.equal((await api.runDeletion(internal, requested.id)).state, 'completed'))
    assert.deepEqual(calls, { media: 2, auth: 2 })
    await assert.rejects(api.submitWaterReport(c.a, submission()), denied)
    assert.equal(await api.publicProfile(UID.a), null)
    await api.submitWaterReport(c.b, submission(1, UID.b))
  })

  test(`${engine}: a real cleanup FK failure rolls back report/outbox/profile/audit changes and can retry`, async t => {
    const { fixture, api, credentials: c, authority } = await trial(engine, t, { deletionEffects: {
      async removePrivateMedia() {}, async deleteAuth() {},
    } })
    await api.submitWaterReport(c.a, submission())
    await fixture.execute('CREATE TABLE synthetic_cleanup_blocker (report_id TEXT NOT NULL REFERENCES water_reports(id))')
    await fixture.execute('INSERT INTO synthetic_cleanup_blocker (report_id) VALUES (?)', [REPORT(2)])
    const job = await api.requestDeletion(c.a)
    const before = await snapshotFixture(fixture)
    await assert.rejects(api.runDeletion(authority.issuer.deletion(), job.id), /foreign|constraint/i)
    const after = await snapshotFixture(fixture)
    assert.equal(after.rows.deletion_jobs.find(row => row.id === job.id).attempts, 1)
    after.rows.deletion_jobs.find(row => row.id === job.id).attempts = 0
    assert.deepEqual(after.rows, before.rows, 'only the recorded attempt persists, every native cleanup write rolls back')
    assert.equal(after.orphanCount, 0)
    await fixture.execute('DELETE FROM synthetic_cleanup_blocker')
    assert.equal((await api.runDeletion(authority.issuer.deletion(), job.id)).state, 'completed')
    assert.equal((await snapshotFixture(fixture)).rows.submission_receipts.length, 0)
    await api.submitWaterReport(c.b, submission(1, UID.b))
  })

  test(`${engine}: deletion checks input/purpose, missing state and required external operations fail closed`, async t => {
    const { api, fixture, credentials: c, authority } = await trial(engine, t)
    const internal = authority.issuer.deletion()
    for (const credential of [null, c.unknown, c.internal, { uid: UID.a }]) {
      await unchanged(fixture, () => assert.rejects(api.requestDeletion(credential), denied))
    }
    await assert.rejects(api.runDeletion(internal, null), error => error.code === 'INVALID_INPUT')
    await unchanged(fixture, () => assert.rejects(api.runDeletion(internal, REPORT(99)), error => error.code === 'NOT_FOUND'))
    const requested = await api.requestDeletion(c.b)
    await assert.rejects(api.runDeletion(internal, requested.id), error => error.code === 'RETRYABLE_DELETE')
    assert.equal((await fixture.query('SELECT lifecycle FROM accounts WHERE uid = ?', [UID.b]))[0].lifecycle, 'deleting')
    assert.equal((await snapshotFixture(fixture)).rows.deletion_jobs.find(row => row.id === requested.id).state, 'db-cleaned')
  })
}

test('deletion trial made no known credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 0, externalRequests: 0 })
})
