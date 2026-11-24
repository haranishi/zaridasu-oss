import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openTurso } from './local-databases.mjs'
import { conflict, RECEIVED, REPORT, reviewState, trial, UID, unchanged } from './trial-test-helpers.mjs'

const checkedName = '確認済みの合成池'
const input = (id = REPORT(2), expectedVersion = 0, status = 'accepted', publicName = checkedName) =>
  ({ id, expectedVersion, status, publicName })

// A second Turso SDK connection to the SAME owned file; D1 serializes native batches on its one binding.
async function writers(context, t, operation) {
  const { fixture, api, createApi } = context
  if (fixture.engine === 'd1') {
    t.diagnostic('D1: simultaneous native batch requests on one local binding; workerd serializes DB transactions')
    return operation([api, createApi(fixture)])
  }
  const peer = await openTurso(fixture.stateDirectory)
  try {
    await peer.execute('PRAGMA foreign_keys = ON', [])
    assert.notEqual(peer.database, fixture.database, 'real independent native connections, no shared application mutex')
    t.diagnostic('Turso: two distinct native connections to one file; transactionAsync.immediate uses the DB writer lock')
    return await operation([api, createApi({ engine: 'turso', ...peer })])
  } finally { await peer.close() }
}

for (const engine of ['turso', 'd1']) {
  test(`${engine}: admin review commits raw state, checked projection, audit and public-only outbox together`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    const rawBefore = await api.readWaterReport(c.admin, REPORT(2))
    const accepted = await api.reviewWaterReport(c.admin, input(REPORT(2), 0, 'accepted', `  ${checkedName}  `))
    assert.equal(accepted.status, 'accepted')
    assert.equal(accepted.version, 1)
    assert.equal(accepted.public_name, checkedName)
    assert.equal(accepted.reviewed_at, RECEIVED)
    assert.equal(accepted.reviewed_by, UID.admin)
    let state = await reviewState(fixture)
    const raw = state.rows.water_reports.find(row => row.id === REPORT(2))
    assert.equal(raw.private_name, rawBefore.private_name)
    assert.equal(raw.created_at, rawBefore.created_at, 'server review time does not replace original receipt time')
    assert.deepEqual(raw.photo_paths_json, JSON.parse(rawBefore.photo_paths_json), 'review does not publish or rewrite photos')
    const water = state.rows.community_water_bodies.find(row => row.id === raw.published_water_body_id)
    assert.deepEqual(water, { id: raw.published_water_body_id, name: checkedName,
      lat: 40.111, lng: 140.333, created_at: RECEIVED })
    const audit = state.rows.audit_logs.find(row => row.target_id === REPORT(2))
    assert.equal(audit.actor_uid, UID.admin)
    assert.deepEqual(audit.details_json, { previous_status: 'pending', status: 'accepted' })
    const event = state.rows.outbox.find(row => row.target_id === REPORT(2))
    assert.deepEqual(event.payload_json, { status: 'accepted', public_water_body_id: water.id })
    assert.deepEqual(Object.keys(event.payload_json).sort(), ['public_water_body_id', 'status'])
    assert.equal(event.delivery_state, 'pending')
    assert.equal(state.rows.review_claims.length, 1)
    const publicId = water.id
    await api.reviewWaterReport(c.admin, input(REPORT(2), 1, 'accepted', '修正した公開名'))
    state = await reviewState(fixture)
    assert.equal(state.rows.community_water_bodies.length, 2, 'repeated accept keeps one row per report')
    assert.equal(state.rows.water_reports.find(row => row.id === REPORT(2)).published_water_body_id, publicId)
    assert.equal(state.rows.community_water_bodies.find(row => row.id === publicId).created_at, RECEIVED)
    await api.reviewWaterReport(c.admin, input(REPORT(2), 2, 'rejected', null))
    state = await reviewState(fixture)
    const rejected = state.rows.water_reports.find(row => row.id === REPORT(2))
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.version, 3)
    assert.equal(rejected.published_water_body_id, null)
    assert.equal(rejected.public_name, '修正した公開名', 'source retains the last checked name after rejection')
    assert.equal(state.rows.community_water_bodies.some(row => row.id === publicId), false)
    assert.equal(state.rows.audit_logs.filter(row => row.target_id === REPORT(2)).length, 3)
    assert.equal(state.rows.outbox.filter(row => row.target_id === REPORT(2)).length, 3)
    assert.deepEqual(state.rows.audit_logs.find(row => row.target_id === REPORT(2)
      && row.details_json.status === 'rejected').details_json, { previous_status: 'accepted', status: 'rejected' })
    assert.equal(state.orphanCount, 0)
  })

  test(`${engine}: real last-statement UNIQUE failure rolls back every earlier review change and claim`, async t => {
    const operationId = '90000000-0000-4000-8000-000000000068'
    const { api, fixture, credentials: c } = await trial(engine, t, { newOperationId: () => operationId })
    // Trusted fixture setup collides only with the final outbox INSERT. This is a real DB constraint, no SQL mock.
    await fixture.execute(`INSERT INTO outbox
      (id, target_id, event_type, payload_json, delivery_state, attempts) VALUES (?, ?, ?, ?, ?, ?)`,
    [operationId, REPORT(1), 'fixture.force-last-statement-constraint', '{}', 'pending', 0])
    const before = await reviewState(fixture)
    for (const attempt of [input(), input(REPORT(1), 1, 'accepted', '失敗する公開名'), input(REPORT(1), 1, 'rejected', null)]) {
      await assert.rejects(api.reviewWaterReport(c.admin, attempt), /unique|primary|constraint/i)
      assert.deepEqual(await reviewState(fixture), before,
        'raw/public/audit/outbox/claim, including retracted or renamed projection, all roll back')
    }
  })

  test(`${engine}: review validates bounded source status/name inputs and caller cannot supply server fields`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    for (const attempt of [input(REPORT(2), 0, 'pending'), input(REPORT(2), 0, null),
      input(REPORT(2), 0, 'accepted', null), input(REPORT(2), 0, 'accepted', '  '),
      input(REPORT(2), 0, 'accepted', '池'.repeat(81)), input(REPORT(2), -1), input(REPORT(2), 0.5),
      input("' OR 1=1 --"), { ...input(), actor_uid: UID.a }, { ...input(), role: 'admin' },
      { ...input(), reviewed_at: '2000-01-01T00:00:00.000Z' }, { ...input(), published_water_body_id: REPORT(99) }]) {
      await unchanged(fixture, async () => {
        await assert.rejects(api.reviewWaterReport(c.admin, attempt), error => error.code === 'INVALID_INPUT')
      })
    }
  })

  test(`${engine}: missing and stale zero-row reviews fail without borrowing another operation's claim`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    await unchanged(fixture, () => assert.rejects(api.reviewWaterReport(c.admin, input(REPORT(99))), conflict))
    await api.reviewWaterReport(c.admin, input())
    await unchanged(fixture, () => assert.rejects(api.reviewWaterReport(c.admin,
      input(REPORT(2), 0, 'accepted', '古い版が上書きしてはいけない')), conflict))
    await unchanged(fixture, () => assert.rejects(api.reviewWaterReport(c.admin,
      input(REPORT(2), 0, 'rejected', null)), conflict))
    const state = await reviewState(fixture)
    assert.equal(state.rows.water_reports.find(row => row.id === REPORT(2)).version, 1)
    assert.equal(state.rows.community_water_bodies.filter(row => row.name === checkedName).length, 1)
    assert.equal(state.rows.audit_logs.filter(row => row.target_id === REPORT(2)).length, 1)
    assert.equal(state.rows.outbox.filter(row => row.target_id === REPORT(2)).length, 1)
    assert.equal(state.rows.review_claims.filter(row => row.report_id === REPORT(2)).length, 1)
  })

  test(`${engine}: simultaneous different reviews have exactly one committed version and coherent projection/event`, async t => {
    const context = await trial(engine, t)
    const { api, fixture, credentials: c } = context
    const attempts = [input(REPORT(2), 0, 'accepted', '並行審査で確認した池'), input(REPORT(2), 0, 'rejected', null)]
    const results = await writers(context, t, apis => Promise.allSettled(apis.map((writer, index) =>
      writer.reviewWaterReport(c.admin, attempts[index]))))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    const loser = results.find(result => result.status === 'rejected')
    assert.ok(conflict(loser.reason), `loser must be an explicit conflict: ${loser.reason.message}`)
    const state = await reviewState(fixture)
    const raw = state.rows.water_reports.find(row => row.id === REPORT(2))
    assert.equal(raw.version, 1)
    const accepted = raw.status === 'accepted'
    assert.equal(state.rows.community_water_bodies.length, accepted ? 2 : 1)
    assert.equal(state.rows.audit_logs.filter(row => row.target_id === REPORT(2)).length, 1)
    assert.equal(state.rows.outbox.filter(row => row.target_id === REPORT(2)).length, 1)
    assert.equal(state.rows.review_claims.filter(row => row.report_id === REPORT(2)).length, 1)
    assert.equal(state.rows.outbox.find(row => row.target_id === REPORT(2)).payload_json.status, raw.status)
    if (accepted) assert.equal((await api.publicWaterBodies()).find(row => row.id === raw.published_water_body_id).name,
      '並行審査で確認した池')
    else assert.equal(raw.published_water_body_id, null)
    assert.equal(state.orphanCount, 0)
  })

  test(`${engine}: conditional hourly and total quota reservations never exceed source bounds under simultaneous requests`, async t => {
    const context = await trial(engine, t)
    const { fixture, credentials: c } = context
    await fixture.execute('INSERT INTO quota_state (owner_uid, window_start, used, version) VALUES (?, ?, ?, ?)',
      [UID.a, 'total', 997, 0])
    await writers(context, t, async apis => {
      for (const [scope, accepted, bound, window] of [
        ['hourly', 18, 20, '2026-11-14T23:00:00.000Z'], ['total', 3, 1000, 'total'],
      ]) {
        const results = await Promise.all(Array.from({ length: 40 }, (_, index) => apis[index % apis.length].reserveQuota(c.a, scope)))
        assert.equal(results.filter(result => result.accepted).length, accepted)
        assert.equal(results.filter(result => !result.accepted).length, 40 - accepted)
        const [counter] = await fixture.query('SELECT used, version FROM quota_state WHERE owner_uid = ? AND window_start = ?', [UID.a, window])
        assert.equal(counter.used, bound)
        assert.equal(counter.version, accepted)
      }
    })
    assert.equal((await fixture.query('SELECT count(*) AS n FROM water_reports'))[0].n, 3,
      'counter-only proof: submission/retry/quota coupling is deliberately reserved for 6.9')
  })
}

test('atomicity trial made no known credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 0, externalRequests: 0 })
})
