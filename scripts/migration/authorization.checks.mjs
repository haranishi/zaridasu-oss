import { observations } from './setup-guard.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { denied, POST, RECEIVED, REPORT, trial, UID, unchanged } from './trial-test-helpers.mjs'

const review = { id: REPORT(2), expectedVersion: 0, status: 'accepted', publicName: '確認済みの合成池' }
const privateFields = ['owner_uid', 'lat', 'lng', 'private_locality', 'private_water_body',
  'metadata_json', 'source_hash', 'research_status', 'unsubscribe_token', 'photo_paths_json', 'note']

for (const engine of ['turso', 'd1']) {
  test(`${engine}: public operations select only public projections and allowed profile columns`, async t => {
    const { api, fixture, credentials } = await trial(engine, t)
    await fixture.execute(`INSERT INTO posts_raw
      SELECT ?, owner_uid, observed_at, created_at, species, count, lat, lng, location_disclosure,
        private_locality, private_water_body, metadata_json, source_hash, research_status
      FROM posts_raw WHERE id = ?`, [POST(99), POST(2)])
    for (const credential of [null, ...Object.values(credentials)]) {
      const posts = await api.publicPosts(credential)
      assert.equal(posts.length, 3, 'a raw-only record must not be published')
      assert.equal(posts.some(row => row.id === POST(99)), false)
      assert.deepEqual(posts.map(row => [row.location_disclosure, row.display_lat, row.display_lng]), [
        ['precise', 40.1234567, 140.2345678], ['coarsened', 40.346, 140.457], ['hidden', null, null],
      ])
      assert.equal(posts[0].observed_at, '2026-01-02')
      assert.equal(posts[0].created_at, RECEIVED)
      assert.equal(posts[0].count, null)
      assert.equal(posts[1].count, 0)
      assert.equal(posts[2].locality, null)
      assert.equal(posts[2].water_body, null)
      for (const row of posts) for (const key of privateFields) assert.equal(Object.hasOwn(row, key), false, key)
      const profile = await api.publicProfile(UID.a)
      assert.deepEqual(Object.keys(profile).sort(), ['display_name', 'uid'])
      assert.equal(await api.publicProfile(UID.b), null, 'a non-public profile is absent')
      assert.equal(await api.publicProfile(UID.unknown), null)
      assert.equal(await api.publicProfile("' OR 1=1 --").catch(error => error.code), 'INVALID_INPUT')
      const water = await api.publicWaterBodies()
      assert.equal(water.length, 1, 'pending reports have no public projection')
      assert.deepEqual(Object.keys(water[0]).sort(), ['created_at', 'id', 'lat', 'lng', 'name'])
      assert.equal(water[0].lat, 40.988)
      assert.equal(water[0].lng, 140.457)
    }
    assert.equal(Object.hasOwn(api, 'database'), false)
    assert.equal(Object.hasOwn(api, 'query'), false)
  })

  test(`${engine}: verified owner, other owner, admin and internal have distinct read permissions`, async t => {
    const { api, credentials: c } = await trial(engine, t)
    assert.deepEqual(await api.readProfile(c.a, UID.a), { uid: UID.a, display_name: '合成人物A', is_public: 1 })
    for (const credential of [c.a, c.b, c.admin]) {
      const ownId = credential === c.a ? UID.a : credential === c.b ? UID.b : UID.admin
      assert.equal(Object.hasOwn(await api.readProfile(credential, ownId), 'unsubscribe_token'), false)
    }
    assert.equal(await api.readProfile(c.b, UID.a), null)
    assert.equal(await api.readProfile(c.admin, UID.a), null, 'review permission is not blanket private profile access')
    assert.equal(await api.readProfile(c.a, UID.b), null)
    assert.equal((await api.readProfile(c.b, UID.b)).display_name, "合成人物B's")
    assert.equal((await api.readWaterReport(c.a, REPORT(2))).owner_uid, UID.a)
    assert.equal(await api.readWaterReport(c.b, REPORT(2)), null)
    assert.equal(await api.readWaterReport(c.a, REPORT(3)), null)
    assert.equal((await api.readWaterReport(c.b, REPORT(3))).owner_uid, UID.b)
    const adminRaw = await api.readWaterReport(c.admin, REPORT(3))
    assert.equal(adminRaw.lat, 40.5556667)
    assert.deepEqual(JSON.parse(adminRaw.photo_paths_json), [`${UID.b}/50000000-0000-4000-8000-000000000003.jpg`])
    assert.equal(await api.readWaterReport(c.admin, REPORT(99)), null)
    await assert.rejects(api.readProfile(c.internal, UID.a), denied)
    await assert.rejects(api.readWaterReport(c.internal, REPORT(2)), denied)
    const internal = await api.internalOutbox(c.internal)
    assert.equal(internal.length, 1)
    for (const credential of [null, c.a, c.b, c.admin]) await assert.rejects(api.internalOutbox(credential), denied)
    for (const credential of [null, c.a, c.b, c.internal]) await assert.rejects(api.reviewWaterReport(credential, review), denied)
  })

  test(`${engine}: null, unknown, expired, revoked, malformed and forged identities default deny`, async t => {
    const { api, authority, credentials: c, advance, fixture } = await trial(engine, t)
    const expired = authority.issuer.user(UID.a, { lifetimeMs: 1 })
    const revoked = authority.issuer.user(UID.a)
    authority.issuer.revoke(revoked)
    advance(2)
    const identities = [null, undefined, '', UID.a, c.unknown, expired, revoked, `${c.a}x`,
      { uid: UID.a, admin: true }, { sub: UID.a, role: 'admin', user_metadata: { role: 'admin' } },
      JSON.stringify({ sub: UID.admin, app_metadata: { role: 'admin' } })]
    for (const identity of identities) {
      await unchanged(fixture, async () => {
        await assert.rejects(api.readProfile(identity, UID.a), denied)
        await assert.rejects(api.readWaterReport(identity, REPORT(2)), denied)
        await assert.rejects(api.changeProfile(identity, { display_name: '偽装' }), denied)
        await assert.rejects(api.reviewWaterReport(identity, review), denied)
        await assert.rejects(api.reserveQuota(identity, 'hourly'), denied)
        await assert.rejects(api.internalOutbox(identity), denied)
      })
    }
    // Tokens are opaque fixture credentials; a different issuer cannot mint accepted credentials.
    const { createTestIdentityAuthority } = await import('./test-identity.mjs')
    const foreign = createTestIdentityAuthority()
    await assert.rejects(api.readProfile(foreign.issuer.user(UID.a), UID.a), denied)
  })

  test(`${engine}: own profile writes bind values and reject owner, role and server fields`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    const name = "合成 '); DROP TABLE accounts; --"
    const changed = await api.changeProfile(c.a, { display_name: name, is_public: 0 })
    assert.equal(changed.uid, UID.a)
    assert.equal(changed.display_name, name)
    assert.equal(await api.publicProfile(UID.a), null)
    assert.equal((await api.readProfile(c.b, UID.b)).display_name, "合成人物B's")
    for (const field of ['uid', 'owner_uid', 'user_id', 'trusted_role', 'role', 'admin', 'user_metadata',
      'unsubscribe_token', 'status', 'public_name', 'reviewed_by', 'reviewed_at', 'source_hash',
      'research_status', 'ai_result', 'created_at']) {
      await unchanged(fixture, async () => {
        await assert.rejects(api.changeProfile(c.a, { display_name: '偽装', [field]: UID.b }),
          error => error.code === 'INVALID_INPUT', field)
      })
    }
    for (const invalid of [null, [], {}, { display_name: '' }, { display_name: 'x'.repeat(81) }, { is_public: null }]) {
      await assert.rejects(api.changeProfile(c.a, invalid), error => error.code === 'INVALID_INPUT')
    }
    await assert.rejects(api.reserveQuota(c.a, { owner_uid: UID.b, limit: 9000 }), error => error.code === 'INVALID_INPUT')
    assert.equal((await fixture.query('SELECT count(*) AS n FROM accounts'))[0].n, 4)
  })

  test(`${engine}: stale verified credentials cannot retain a revoked role or write while deleting`, async t => {
    const { api, fixture, credentials: c } = await trial(engine, t)
    assert.equal((await api.readWaterReport(c.admin, REPORT(2))).id, REPORT(2))
    await fixture.execute('UPDATE accounts SET trusted_role = ? WHERE uid = ?', ['user', UID.admin])
    await unchanged(fixture, async () => {
      await assert.rejects(api.reviewWaterReport(c.admin, review), denied)
      assert.equal(await api.readWaterReport(c.admin, REPORT(2)), null)
    })
    await api.changeProfile(c.a, { display_name: '有効な主体' })
    await fixture.execute('UPDATE accounts SET lifecycle = ? WHERE uid = ?', ['deleting', UID.a])
    await unchanged(fixture, async () => {
      await assert.rejects(api.changeProfile(c.a, { display_name: '古い認証' }), denied)
      await assert.rejects(api.reserveQuota(c.a, 'hourly'), denied)
      await assert.rejects(api.readProfile(c.a, UID.a), denied)
    })
    await assert.rejects(api.changeProfile(c.deleting, { display_name: '退会中' }), denied)
    await fixture.execute('UPDATE accounts SET lifecycle = ? WHERE uid = ?', ['deleted', UID.b])
    await assert.rejects(api.changeProfile(c.b, { display_name: '退会済み' }), denied)
  })
}

test('authorization trial made no known credential-file reads or external Node requests', () => {
  assert.deepEqual(observations, { credentialReads: 0, externalRequests: 0 })
})
