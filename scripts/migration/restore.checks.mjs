import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { createLocalFixture, snapshotFixture } from './local-fixture.mjs'
import { denied, REPORT, trial, UID } from './trial-test-helpers.mjs'
import { CLIENT, submission } from './recovery-test-helpers.mjs'

// Only synthetic artifacts and freshly generated in-memory keys are used, never existing backups or keys.
function envelopeFor(artifact, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from('zaridasu.synthetic-backup.v1'))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(artifact)), cipher.final()])
  return { format: 'zaridasu.synthetic-backup.v1', iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

for (const engine of ['turso', 'd1']) {
  test(`${engine}: quiesced encrypted logical restore preserves all data/operational state and API allow/deny`, async t => {
    const context = await trial(engine, t, { deletionEffects: {
      async removePrivateMedia() { throw new Error('controlled failure before backup') }, async deleteAuth() {},
    } })
    const { api, fixture, credentials: c, authority } = context
    const { exportSyntheticBackup, restoreSyntheticBackup } = await import('./synthetic-backup.mjs')
    const saved = await api.submitWaterReport(c.b, submission(1, UID.b))
    await api.reviewWaterReport(c.admin, { id: saved.id, expectedVersion: 0, status: 'accepted', publicName: '残る公開水域B' })
    await api.reviewWaterReport(c.admin, { id: REPORT(2), expectedVersion: 0, status: 'accepted', publicName: '合成の復元対象' })
    const deletion = await api.requestDeletion(c.a)
    await assert.rejects(api.runDeletion(authority.issuer.deletion(), deletion.id), error => error.code === 'RETRYABLE_DELETE')
    const original = await snapshotFixture(fixture)
    assert.ok(original.rows.submission_receipts.length)
    assert.ok(original.rows.review_claims.length)
    assert.ok(original.rows.deletion_jobs.some(row => row.state === 'db-cleaned'))
    const key = randomBytes(32)
    await assert.rejects(exportSyntheticBackup(fixture, key), /quiesc/i)
    const encrypted = await exportSyntheticBackup(fixture, key, { quiesced: true })
    assert.equal(JSON.stringify(encrypted).includes(UID.b), false)
    const restored = await restoreSyntheticBackup(engine, encrypted, key)
    t.after(() => restored.destroy())
    assert.notEqual(restored.stateDirectory, fixture.stateDirectory)
    assert.deepEqual(await snapshotFixture(restored), original, 'IDs, UTC, observed date, NULL, JSON, precision, keys, counts, hash and FKs')
    await restored.close()
    await restored.reopen()
    assert.deepEqual(await snapshotFixture(restored), original)
    const restoredApi = context.createApi(restored)
    assert.deepEqual(await restoredApi.publicPosts(), await api.publicPosts())
    assert.deepEqual(await restoredApi.publicWaterBodies(), await api.publicWaterBodies())
    assert.equal((await restoredApi.findSubmission(c.b, CLIENT(1))).id, saved.id)
    assert.equal(await restoredApi.findSubmission(c.admin, CLIENT(1)), null)
    assert.equal((await restoredApi.readWaterReport(c.b, saved.id)).owner_uid, UID.b)
    assert.equal(await restoredApi.readWaterReport(c.admin, REPORT(1)), null)
    await assert.rejects(restoredApi.readWaterReport(c.a, saved.id), denied)
    await assert.rejects(restoredApi.readWaterReport(null, saved.id), denied)
    assert.equal((await restoredApi.readProfile(c.b, UID.b)).uid, UID.b)
    assert.equal(Object.hasOwn(await restoredApi.readProfile(c.b, UID.b), 'unsubscribe_token'), false)
    assert.equal(await restoredApi.readProfile(c.admin, UID.b), null)
    const events = rows => rows.map(row => ({ ...row, payload_json: JSON.parse(row.payload_json) }))
    assert.deepEqual(events(await restoredApi.internalOutbox(c.internal)), events(await api.internalOutbox(c.internal)))
    assert.equal((await restoredApi.submitWaterReport(c.b, submission(1, UID.b))).id, saved.id)
    await assert.rejects(restoredApi.submitWaterReport(c.a, submission()), denied)
    const { createReferenceApi } = await import('./reference-api.mjs')
    const resumed = createReferenceApi(restored, authority.verify, { ...context.options,
      deletionEffects: { async removePrivateMedia() {}, async deleteAuth() {} } })
    assert.equal((await resumed.runDeletion(authority.issuer.deletion(), deletion.id)).state, 'completed')
  })

  test(`${engine}: wrong key, tamper, unknown schema/table/column, excessive values and real FK failure leave no restore target`, async t => {
    const { fixture } = await trial(engine, t)
    const { exportSyntheticBackup, restoreSyntheticBackup, openSyntheticBackup } = await import('./synthetic-backup.mjs')
    const key = randomBytes(32)
    const encrypted = await exportSyntheticBackup(fixture, key, { quiesced: true })
    await assert.rejects(restoreSyntheticBackup(engine, encrypted, randomBytes(32)), /auth|decrypt|backup/i)
    const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.ciphertext.slice(1)}` }
    await assert.rejects(restoreSyntheticBackup(engine, tampered, key), /auth|decrypt|backup/i)
    const artifact = await openSyntheticBackup(encrypted, key)
    const cases = [
      { ...artifact, format: 'unknown' }, { ...artifact, schema: 'unknown' }, { ...artifact, sql: 'DROP TABLE accounts' },
      { ...artifact, tables: { ...artifact.tables, arbitrary: [] } },
      { ...artifact, tables: { ...artifact.tables, accounts: [{ ...artifact.tables.accounts[0], sql: 'DROP TABLE accounts' }] } },
      { ...artifact, tables: { ...artifact.tables, accounts: [{ ...artifact.tables.accounts[0], uid: 'x'.repeat(65537) }] } },
      { ...artifact, tables: { ...artifact.tables, accounts: Array(5001).fill(artifact.tables.accounts[0]) } },
    ]
    const before = (await readdir(new URL('./.runtime/', import.meta.url))).sort()
    for (const candidate of cases) await assert.rejects(restoreSyntheticBackup(engine, envelopeFor(candidate, key), key), /artifact|schema|format|table|column|bound/i)
    const badUid = structuredClone(artifact)
    badUid.tables.accounts[0].uid = "'); DROP TABLE accounts; --"
    await assert.rejects(restoreSyntheticBackup(engine, envelopeFor(badUid, key), key), /artifact/i)
    const orphan = structuredClone(artifact)
    orphan.tables.user_profiles[0].uid = UID.unknown
    await assert.rejects(restoreSyntheticBackup(engine, envelopeFor(orphan, key), key), /foreign|constraint/i,
      'real native FK error after restore starts must roll back/clean the fresh owned target')
    const invalid = structuredClone(artifact)
    invalid.tables.accounts[0].lifecycle = 'forged'
    await assert.rejects(restoreSyntheticBackup(engine, envelopeFor(invalid, key), key), /check|constraint/i)
    assert.deepEqual((await readdir(new URL('./.runtime/', import.meta.url))).sort(), before)
  })
}

test('logical encrypted artifact can cross engines without claiming binary SQLite/Turso compatibility', async t => {
  const fixture = await createLocalFixture('turso')
  t.after(() => fixture.destroy())
  const { exportSyntheticBackup, restoreSyntheticBackup } = await import('./synthetic-backup.mjs')
  const key = randomBytes(32)
  const envelope = await exportSyntheticBackup(fixture, key, { quiesced: true })
  const restored = await restoreSyntheticBackup('d1', envelope, key)
  t.after(() => restored.destroy())
  assert.deepEqual(await snapshotFixture(restored), await snapshotFixture(fixture))
})

test('restore trial made no known credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 0, externalRequests: 0 })
})
