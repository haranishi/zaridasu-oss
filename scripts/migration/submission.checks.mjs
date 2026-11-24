import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conflict, denied, RECEIVED, trial, UID, unchanged } from './trial-test-helpers.mjs'
import { CLIENT, seedReports, submission, writers } from './recovery-test-helpers.mjs'
import { snapshotFixture } from './local-fixture.mjs'

for (const engine of ['turso', 'd1']) {
  test(`${engine}: timeout after commit is recovered by owner readback and identical retry, without a second event`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    const input = submission()
    let committed
    // The FIRST successful response is lost AFTER the actual commit. No SQL result is mocked.
    const timedOutTransport = async () => {
      committed = await api.submitWaterReport(c.a, input)
      throw new Error('synthetic timeout after committed response')
    }
    await assert.rejects(timedOutTransport(), /timeout after committed/)
    const saved = await api.findSubmission(c.a, input.clientId)
    const beforeRetry = await snapshotFixture(fixture)
    assert.equal(saved.id, committed.id)
    assert.equal(await api.findSubmission(c.b, input.clientId), null)
    const retried = await api.submitWaterReport(c.a, input)
    assert.equal(retried.id, saved.id)
    assert.equal(retried.created_at, RECEIVED)
    assert.equal(retried.status, 'pending')
    assert.deepEqual(await snapshotFixture(fixture), beforeRetry)
    const stored = await api.readWaterReport(c.a, saved.id)
    assert.equal(stored.owner_uid, UID.a)
    assert.equal(stored.private_name, input.name)
    assert.equal(stored.created_at, RECEIVED)
    assert.equal(stored.reviewed_by, null)
    assert.equal(stored.published_water_body_id, null)
    const events = (await snapshotFixture(fixture)).rows.outbox.filter(row => row.target_id === saved.id)
    assert.equal(events.length, 1)
    assert.deepEqual(events[0].payload_json, { kind: 'water-report-submitted' })
    await unchanged(fixture, () => assert.rejects(api.submitWaterReport(c.a,
      { ...input, note: '同じキーで内容が違う' }), conflict))
  })

  test(`${engine}: same-key parallel submissions converge while different owners never share a record`, async t => {
    const context = await trial(engine, t)
    const { fixture, credentials: c, api } = context
    const results = await writers(context, t, apis => Promise.all(Array.from({ length: 32 }, (_, index) =>
      apis[index % 2].submitWaterReport(index < 16 ? c.a : c.b, submission(1, index < 16 ? UID.a : UID.b)))))
    assert.equal(new Set(results.slice(0, 16).map(result => result.id)).size, 1)
    assert.equal(new Set(results.slice(16).map(result => result.id)).size, 1)
    const other = await api.submitWaterReport(c.b, submission(1, UID.b))
    assert.equal(other.id, results[16].id)
    assert.notEqual(other.id, results[0].id)
    const state = await snapshotFixture(fixture)
    assert.equal(state.rows.water_reports.filter(row => row.client_id === CLIENT(1)).length, 2)
    assert.equal(state.rows.outbox.filter(row => [results[0].id, other.id].includes(row.target_id)).length, 2)
    assert.equal(state.rows.submission_receipts.length, 2)
    assert.equal(state.orphanCount, 0)
  })

  test(`${engine}: submission rejects forged identity, owner remapping, protected fields and invalid private photo paths`, async t => {
    const { fixture, api, credentials: c, authority } = await trial(engine, t)
    const revoked = authority.issuer.user(UID.a)
    authority.issuer.revoke(revoked)
    for (const credential of [null, undefined, c.unknown, c.deleting, c.internal, revoked,
      { uid: UID.a, admin: true }, UID.a]) {
      await unchanged(fixture, () => assert.rejects(api.submitWaterReport(credential, submission()), denied))
    }
    await unchanged(fixture, () => assert.rejects(api.submitWaterReport(c.b, submission()), denied))
    const invalid = [null, {}, { ...submission(), clientId: null }, { ...submission(), queuedOwnerUid: null },
      { ...submission(), lat: NaN }, { ...submission(), lng: 181 }, { ...submission(), name: ' ' },
      { ...submission(), note: '字'.repeat(1001) }, { ...submission(), photoPaths: [] },
      { ...submission(), photoPaths: Array(4).fill(submission().photoPaths[0]) },
      { ...submission(), photoPaths: [null] }, { ...submission(), photoPaths: submission(1, UID.b).photoPaths },
      { ...submission(), photoPaths: [`${UID.a}/../private.jpg`] },
      { ...submission(), photoPaths: ['https://example.invalid/a.jpg'] },
      { ...submission(), photoPaths: Array(2).fill(submission().photoPaths[0]) }]
    for (const key of ['owner_uid', 'user_id', 'status', 'source_hash', 'research_status', 'ai_result',
      'created_at', 'received_at', 'reviewed_by', 'public_name', 'window', 'limit', 'now']) {
      invalid.push({ ...submission(), [key]: 'forged' })
    }
    for (const input of invalid) await unchanged(fixture, () =>
      assert.rejects(api.submitWaterReport(c.a, input), error => error.code === 'INVALID_INPUT'))
    await assert.rejects(api.findSubmission(c.a, null), error => error.code === 'INVALID_INPUT')
    await assert.rejects(api.findSubmission(null, CLIENT(1)), denied)
    for (const count of [1, 2, 3]) {
      const input = submission(count)
      input.photoPaths = Array.from({ length: count }, (_, index) =>
        `${UID.a}/50000000-0000-4000-8000-${String(index).padStart(12, '0')}.jpg`)
      await api.submitWaterReport(c.a, input)
    }
  })

  test(`${engine}: rolling sixty minutes crosses the hour boundary and parallel persistence respects the hourly ceiling`, async t => {
    const context = await trial(engine, t, { now: () => Date.parse('2026-11-15T00:01:00.000Z') })
    const { fixture, api, credentials: c } = context
    await seedReports(fixture, UID.a, 18, '2026-11-14T23:50:00.000Z')
    assert.equal((await fixture.query(`SELECT count(*) AS n FROM water_reports WHERE owner_uid = ?
      AND created_at >= ?`, [UID.a, '2026-11-15T00:00:00.000Z']))[0].n, 1,
    'a fixed current-hour bucket would miss nineteen still-recent reports')
    await unchanged(fixture, () => assert.rejects(api.submitWaterReport(c.a, submission()), conflict))
    await fixture.execute('UPDATE water_reports SET created_at = ? WHERE client_id = ?',
      ['2026-11-14T23:01:00.000Z', CLIENT(10000)])
    await unchanged(fixture, () => assert.rejects(api.submitWaterReport(c.a, submission()), conflict))
    await fixture.execute('UPDATE water_reports SET created_at = ? WHERE client_id = ?',
      ['2026-11-14T23:00:59.999Z', CLIENT(10000)])
    const results = await writers(context, t, apis => Promise.allSettled(Array.from({ length: 24 }, (_, index) =>
      apis[index % 2].submitWaterReport(c.a, submission(index + 1)))))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.ok(results.filter(result => result.status === 'rejected').every(result => conflict(result.reason)))
    const winner = results.find(result => result.status === 'fulfilled').value
    const input = submission(Number((await api.readWaterReport(c.a, winner.id)).client_id.slice(-12)))
    await unchanged(fixture, async () => assert.equal((await api.submitWaterReport(c.a, input)).id, winner.id))
    assert.equal((await snapshotFixture(fixture)).counts.water_reports, 22)
    assert.equal((await fixture.query('SELECT count(*) AS n FROM outbox WHERE event_type = ?', ['water.submitted']))[0].n, 1)
  })

  test(`${engine}: an account becoming deleting after preauthorization cannot submit or read back`, async t => {
    const context = await trial(engine, t)
    const { fixture, authority, credentials: c } = context
    const { createReferenceApi } = await import('./reference-api.mjs')
    let once = false
    const raced = { engine, get database() { return fixture.database },
      execute: (...args) => fixture.execute(...args),
      async query(sql, parameters) {
        const rows = await fixture.query(sql, parameters)
        if (!once && sql.includes('SELECT uid, trusted_role FROM accounts')) {
          once = true
          await fixture.execute("UPDATE accounts SET lifecycle = 'deleting' WHERE uid = ?", [UID.a])
        }
        return rows
      } }
    const api = createReferenceApi(raced, authority.verify, context.options)
    await assert.rejects(api.submitWaterReport(c.a, submission()), conflict)
    assert.equal((await snapshotFixture(fixture)).counts.water_reports, 3)
    await assert.rejects(api.findSubmission(c.a, CLIENT(1)), denied)
  })

  test(`${engine}: total ceiling and final native constraint failure cannot consume quota or leave partial persistence`, async t => {
    const context = await trial(engine, t)
    const { fixture, api, credentials: c } = context
    await seedReports(fixture, UID.a, 997, '2020-01-01T00:00:00.000Z')
    const results = await writers(context, t, apis => Promise.allSettled(Array.from({ length: 12 }, (_, index) =>
      apis[index % 2].submitWaterReport(c.a, submission(index + 1)))))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal((await fixture.query('SELECT count(*) AS n FROM water_reports WHERE owner_uid = ?', [UID.a]))[0].n, 1000)
    const winner = results.find(result => result.status === 'fulfilled').value
    const input = submission(Number((await api.readWaterReport(c.a, winner.id)).client_id.slice(-12)))
    await unchanged(fixture, async () => assert.equal((await api.submitWaterReport(c.a, input)).id, winner.id))
    const { createReferenceApi } = await import('./reference-api.mjs')
    const collision = createReferenceApi(fixture, context.authority.verify,
      { ...context.options, newOperationId: () => '70000000-0000-4000-8000-000000000001' })
    await unchanged(fixture, () => assert.rejects(collision.submitWaterReport(c.b, submission(100, UID.b)), /unique|constraint/i))
    await api.submitWaterReport(c.b, submission(100, UID.b))
    assert.equal((await snapshotFixture(fixture)).orphanCount, 0)
  })
}

test('submission trial made no known credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 0, externalRequests: 0 })
})
