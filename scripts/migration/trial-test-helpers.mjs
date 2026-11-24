import assert from 'node:assert/strict'
import { createLocalFixture, snapshotFixture } from './local-fixture.mjs'

export const UID = Object.freeze({
  a: '10000000-0000-4000-8000-000000000001',
  b: '10000000-0000-4000-8000-000000000002',
  admin: '10000000-0000-4000-8000-000000000003',
  deleting: '10000000-0000-4000-8000-000000000004',
  unknown: '10000000-0000-4000-8000-000000000099',
})
export const REPORT = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const POST = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const RECEIVED = '2026-11-14T23:59:58.123Z'
export const denied = error => ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code)
export const conflict = error => error.code === 'CONFLICT'

export async function trial(engine, t, controls = {}) {
  const fixture = await createLocalFixture(engine)
  t.after(() => fixture.destroy())
  // Dynamic imports allow RED to demonstrate the missing behavior after real DB setup.
  const { createTestIdentityAuthority } = await import('./test-identity.mjs')
  const { createReferenceApi } = await import('./reference-api.mjs')
  let instant = Date.parse(RECEIVED)
  const now = () => instant
  const authority = createTestIdentityAuthority({ now })
  const credentials = Object.fromEntries(Object.entries(UID).map(([key, uid]) => [key, authority.issuer.user(uid)]))
  credentials.internal = authority.issuer.internal()
  const options = { now, ...controls }
  return { fixture, authority, credentials, options,
    api: createReferenceApi(fixture, authority.verify, options),
    createApi: database => createReferenceApi(database, authority.verify, options),
    advance: milliseconds => { instant += milliseconds },
  }
}

export async function unchanged(fixture, operation) {
  const before = await snapshotFixture(fixture)
  await operation()
  assert.deepEqual(await snapshotFixture(fixture), before)
}

export async function reviewState(fixture) {
  const state = await snapshotFixture(fixture)
  assert.ok(Object.hasOwn(state.rows, 'review_claims'), 'operational claims are included in rollback/backup state')
  return state
}
