import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { access, lstat, readFile, rename, symlink, unlink } from 'node:fs/promises'
import { test } from 'node:test'
import { createLocalFixture, snapshotFixture } from './local-fixture.mjs'

// Verify the guards themselves without reading a file or making a network request.
assert.throws(() => fs.readFileSync(new URL('./.env.guard-sentinel', import.meta.url)), /Credential-file/)
await assert.rejects(fetch('https://fixture-network-denied.example.invalid'), /External Node/)

const A = '10000000-0000-4000-8000-000000000001'
const ADMIN = '10000000-0000-4000-8000-000000000003'
const COUNTS = { accounts: 4, user_profiles: 3, posts_raw: 3, posts_public: 3,
  water_reports: 3, community_water_bodies: 1, audit_logs: 1, outbox: 1,
  quota_state: 1, review_claims: 0, submission_receipts: 0, deletion_jobs: 1 }
const expectedPublic = [
  { location_disclosure: 'precise', display_lat: 40.1234567, display_lng: 140.2345678 },
  { location_disclosure: 'coarsened', display_lat: 40.346, display_lng: 140.457 },
  { location_disclosure: 'hidden', display_lat: null, display_lng: null },
]

for (const engine of ['turso', 'd1']) {
  test(`${engine}: real local engine seeds bounded synthetic contracts`, async t => {
    const fixture = await createLocalFixture(engine)
    t.after(() => fixture.destroy())
    assert.equal(fixture.engine, engine)
    assert.equal((await lstat(fixture.stateDirectory)).isDirectory(), true)
    const snapshot = await snapshotFixture(fixture)
    assert.deepEqual(snapshot.counts, COUNTS)
    assert.equal(snapshot.orphanCount, 0)
    assert.match(snapshot.hash, /^[a-f0-9]{64}$/)
    assert.equal(snapshot.primaryKeys.posts_raw.length, 3)
    assert.deepEqual(await fixture.query(`SELECT location_disclosure, display_lat, display_lng
      FROM posts_public ORDER BY id`), expectedPublic)
    const [raw] = await fixture.query('SELECT * FROM posts_raw WHERE owner_uid = ? ORDER BY id', [A])
    assert.equal(raw.owner_uid, A)
    assert.match(raw.id, /^[a-f0-9-]{36}$/)
    assert.equal(raw.observed_at, '2026-01-02')
    assert.equal(raw.created_at, '2026-11-14T23:59:58.123Z')
    assert.notEqual(raw.observed_at, raw.created_at.slice(0, 10))
    assert.equal(raw.count, null)
    assert.equal(snapshot.rows.posts_raw[1].count, 0)
    assert.deepEqual(snapshot.rows.posts_raw[0].metadata_json,
      { attributes: { confirmed: false, note: null }, labels: ['合成', '水辺'] })
    assert.equal(raw.private_locality, '合成原票だけの地名A')
    const [hidden] = await fixture.query("SELECT * FROM posts_public WHERE location_disclosure = 'hidden'")
    assert.equal(hidden.locality, null)
    assert.equal(hidden.water_body, null)
    for (const row of snapshot.rows.posts_public) {
      for (const key of ['lat', 'lng', 'private_locality', 'unsubscribe_token', 'reporter_ip']) {
        assert.equal(Object.hasOwn(row, key), false, `public projection excludes ${key}`)
      }
    }
    const [profile] = await fixture.query('SELECT * FROM user_profiles WHERE uid = ?', [A])
    assert.equal(profile.unsubscribe_token, 'fixture-only-unsubscribe-a')
    assert.equal(snapshot.rows.water_reports[0].status, 'accepted')
    assert.equal(snapshot.rows.water_reports[1].status, 'pending')
    assert.equal(snapshot.rows.water_reports[1].reviewed_by, null)
    assert.equal(snapshot.rows.audit_logs[0].actor_uid, ADMIN)
    assert.deepEqual(snapshot.rows.community_water_bodies.map(row => [row.lat, row.lng]), [[40.988, 140.457]])
  })

  test(`${engine}: bound values and actual constraint errors survive the adapter`, async t => {
    const fixture = await createLocalFixture(engine)
    t.after(() => fixture.destroy())
    const attack = "fixture '); DROP TABLE accounts; --"
    assert.deepEqual(await fixture.query('SELECT ? AS quoted, ? AS missing, ? AS quantity', [attack, null, 0]),
      [{ quoted: attack, missing: null, quantity: 0 }])
    assert.deepEqual(await fixture.query('SELECT uid FROM accounts WHERE uid = ?', ["' OR 1=1 --"]), [])
    await assert.rejects(fixture.execute('INSERT INTO accounts (uid, trusted_role, lifecycle) VALUES (?, ?, ?)',
      [A, 'user', 'active']), /unique|primary|constraint/i)
    await assert.rejects(fixture.execute('INSERT INTO accounts (uid, trusted_role, lifecycle) VALUES (?, ?, ?)',
      ['10000000-0000-4000-8000-000000000099', 'forged-admin', 'active']), /check|constraint/i)
    await assert.rejects(fixture.execute(`INSERT INTO water_reports
      SELECT ?, owner_uid, client_id, lat, lng, private_name, note, photo_paths_json, status, public_name,
        published_water_body_id, reviewed_at, reviewed_by, created_at, version FROM water_reports WHERE id = ?`,
    ['20000000-0000-4000-8000-000000000099', '20000000-0000-4000-8000-000000000002']), /unique|constraint/i)
    await assert.rejects(fixture.execute('INSERT INTO user_profiles (uid, display_name, is_public, unsubscribe_token) VALUES (?, ?, ?, ?)',
      ['10000000-0000-4000-8000-000000000099', '合成の孤立行', 0, 'fixture-only-orphan']), /foreign|constraint/i)
    await assert.rejects(fixture.query('SELECT definitely_missing_column FROM accounts'), /column|identifier|resolve/i)
    assert.equal((await snapshotFixture(fixture)).counts.accounts, 4)
    // Audit target UUIDs outlive their records; deleted actors may be NULL.
    await fixture.execute(`INSERT INTO audit_logs
      (id, actor_uid, action, target_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ['60000000-0000-4000-8000-000000000099', null, 'fixture-retained-audit',
      '20000000-0000-4000-8000-000000000099', '{}', '2026-11-15T00:00:09.000Z'])
    assert.equal((await fixture.query('SELECT actor_uid FROM audit_logs WHERE action = ?', ['fixture-retained-audit']))[0].actor_uid, null)
  })

  test(`${engine}: fresh runs are isolated, close/reopen persists, reset destroys only its own state`, async t => {
    const first = await createLocalFixture(engine)
    const second = await createLocalFixture(engine)
    t.after(() => Promise.all([first.destroy(), second.destroy()]))
    const firstDirectory = first.stateDirectory
    const secondDirectory = second.stateDirectory
    assert.notEqual(firstDirectory, secondDirectory)
    const initial = await snapshotFixture(first)
    assert.deepEqual(initial, await snapshotFixture(second))
    await first.execute('UPDATE user_profiles SET display_name = ? WHERE uid = ?', ['変更した合成人物', A])
    assert.notDeepEqual(await snapshotFixture(first), await snapshotFixture(second))
    await first.close()
    await first.close()
    await assert.rejects(first.query('SELECT 1'), /closed/i)
    await access(firstDirectory)
    await first.reopen()
    assert.equal(first.stateDirectory, firstDirectory)
    assert.equal((await first.query('SELECT display_name FROM user_profiles WHERE uid = ?', [A]))[0].display_name,
      '変更した合成人物')
    await first.reset()
    assert.notEqual(first.stateDirectory, firstDirectory)
    await assert.rejects(access(firstDirectory), { code: 'ENOENT' })
    assert.deepEqual(await snapshotFixture(first), initial)
    assert.deepEqual(await snapshotFixture(second), initial)
    await access(secondDirectory)
    const resetDirectory = first.stateDirectory
    await first.destroy()
    await first.destroy()
    await assert.rejects(access(resetDirectory), { code: 'ENOENT' })
    await assert.rejects(first.reopen(), /destroyed/i)
    await assert.rejects(first.reset(), /destroyed/i)
    await access(secondDirectory)
  })

  test(`${engine}: cleanup refuses a substituted directory instead of following its symlink`, async t => {
    const first = await createLocalFixture(engine)
    const second = await createLocalFixture(engine)
    t.after(() => Promise.all([first.destroy(), second.destroy()]))
    await first.close()
    const original = first.stateDirectory
    const parked = `${original}-parked`
    await rename(original, parked)
    try {
      await symlink(second.stateDirectory, original)
      await assert.rejects(first.destroy(), /owned|ownership|symlink/i)
      await access(second.stateDirectory)
    } finally {
      await unlink(original)
      await rename(parked, original)
    }
  })
}

test('Turso rewrite and D1 local binding produce identical normalized fixtures', async t => {
  const turso = await createLocalFixture('turso')
  const d1 = await createLocalFixture('d1')
  t.after(() => Promise.all([turso.destroy(), d1.destroy()]))
  assert.deepEqual(await snapshotFixture(turso), await snapshotFixture(d1))
})

test('fixture API only accepts the two local engines', async () => {
  await assert.rejects(createLocalFixture('libsql'), /local engine/i)
  await assert.rejects(createLocalFixture('https://remote.example.invalid'), /local engine/i)
  await assert.rejects(createLocalFixture({ engine: 'turso', directory: '/tmp' }), /local engine/i)
})

test('isolated lock resolves the pinned engines without a remote Turso or legacy libSQL client', async () => {
  const manifest = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))
  const lock = JSON.parse(await readFile(new URL('./package-lock.json', import.meta.url), 'utf8'))
  assert.equal(manifest.private, true)
  assert.deepEqual(manifest.dependencies, {
    '@tursodatabase/database': '0.8.3', miniflare: '5.20261113.0-beta',
  })
  assert.equal(lock.packages['node_modules/@tursodatabase/database'].version, '0.8.3')
  assert.equal(lock.packages['node_modules/miniflare'].version, '5.20261113.0-beta')
  assert.equal(lock.packages['node_modules/@libsql/client'], undefined)
  assert.equal(lock.packages['node_modules/@tursodatabase/serverless'], undefined)
  assert.equal(lock.packages['node_modules/wrangler'], undefined)
})

test('SDK setup made no credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 1, externalRequests: 1 }, 'only the two denied guard self-probes')
})
