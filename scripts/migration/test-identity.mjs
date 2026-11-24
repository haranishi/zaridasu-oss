import { randomBytes } from 'node:crypto'
import { failure, uuid } from './trial-validation.mjs'

/** TEST authority only. Opaque credentials are issued out of band by fixture setup, never from a request. */
export function createTestIdentityAuthority({ now = Date.now } = {}) {
  const credentials = new Map()
  function issue(principal, lifetimeMs = 60000) {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1 || lifetimeMs > 3600000 || credentials.size >= 1000) {
      throw failure('INVALID_INPUT', 'Bounded fixture identity lifetime/count required')
    }
    const credential = `fixture_${randomBytes(32).toString('hex')}`
    credentials.set(credential, { principal: Object.freeze(principal), expiresAt: now() + lifetimeMs })
    return credential
  }
  return Object.freeze({
    issuer: Object.freeze({
      user(uid, { lifetimeMs } = {}) { return issue({ kind: 'user', uid: uuid(uid) }, lifetimeMs) },
      internal() { return issue({ kind: 'internal', purpose: 'outbox' }) },
      deletion() { return issue({ kind: 'internal', purpose: 'deletion' }) },
      revoke(credential) { credentials.delete(credential) },
    }),
    verify(credential) {
      if (typeof credential !== 'string' || !/^fixture_[a-f0-9]{64}$/.test(credential)) return null
      const entry = credentials.get(credential)
      const instant = now()
      if (!entry || !Number.isFinite(instant) || instant >= entry.expiresAt) return null
      return entry.principal
    },
  })
}
