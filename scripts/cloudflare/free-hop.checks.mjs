import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { signHopRequest, restoreHopRequest } from '../../cloudflare/free/hop.mjs'
import { guardD1Binding } from '../../cloudflare/free/cache-guard.mjs'
import { RenderLifetime } from '../../cloudflare/free/render-lifetime.mjs'

const secret = randomBytes(32).toString('base64url')
const origin = 'https://free-preview.example.invalid'

test('private hop preserves URL method stream cookie Origin and framework headers while removing forged IP hints', async () => {
  const request = new Request(origin + '/api/test?q=%E7%A7%8B', { method: 'POST', headers: { cookie: 'app=synthetic',
    origin, rsc: '1', 'next-router-state-tree': 'encoded', 'cf-connecting-ip': '2001:db8::42',
    'x-zaridasu-forward': 'forged', 'x-zaridasu-actor': 'admin', 'x-forwarded-for': '1.2.3.4',
    'x-vercel-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4', forwarded: 'for=1.2.3.4' }, body: 'streamed-body' })
  const hop = signHopRequest(request, secret)
  const forwarded = restoreHopRequest(hop, secret)
  assert.equal(forwarded.url, request.url)
  assert.equal(forwarded.method, 'POST')
  assert.equal(await forwarded.text(), 'streamed-body')
  for (const key of ['cookie', 'origin', 'rsc', 'next-router-state-tree', 'cf-connecting-ip']) assert.equal(forwarded.headers.get(key), request.headers.get(key))
  for (const key of ['x-zaridasu-actor', 'x-forwarded-for', 'x-vercel-forwarded-for', 'x-real-ip', 'forwarded', 'x-zaridasu-forward']) assert.equal(forwarded.headers.get(key), null)
})

test('private hop rejects public forgery, URL/method mutation, bad secret and expiry; missing CF IP stays missing', () => {
  assert.equal(restoreHopRequest(new Request(origin, { headers: { 'x-zaridasu-forward': 'forged' } }), secret), null)
  const old = signHopRequest(new Request(origin), secret, 100)
  assert.equal(restoreHopRequest(old, secret, 131), null)
  const signed = signHopRequest(new Request(origin), secret)
  assert.equal(restoreHopRequest(signed, secret + 'wrong'), null)
  assert.equal(restoreHopRequest(new Request(origin + '/changed', signed), secret), null)
  assert.equal(restoreHopRequest(new Request(signed, { method: 'HEAD' }), secret), null)
  const cloudflareHop = new Request(signed, { headers: new Headers([...signed.headers, ['cf-connecting-ip', '198.51.100.99']]) })
  assert.equal(restoreHopRequest(cloudflareHop, secret).headers.get('cf-connecting-ip'), null)
})

test('native binding guard records chained session/statement async errors before adapter handling, per request', async () => {
  let calls = 0
  const db = { withSession() { return this }, prepare() { return { bind() { return this }, async first() { calls++; throw new Error('synthetic-private-marker') } } } }
  const a = { failed: false }; const b = { failed: false }
  const guarded = guardD1Binding(db, a)
  await assert.rejects(guarded.withSession('first-primary').prepare('SELECT 1').bind().first())
  assert.equal(calls, 1)
  assert.equal(a.failed, true)
  assert.equal(b.failed, false)
})


test('installed Sentry D1 instrumentation keeps assignments request-local and a later request recovers after a native failure', async () => {
  const { instrumentD1 } = await import('../../node_modules/@sentry/cloudflare/build/esm/dev/instrumentations/worker/instrumentD1.js')
  let fault = true; let reads = 0
  const nativeObjects = []
  const result = { success: true, results: [], meta: { duration: 1, rows_read: 1, rows_written: 0 } }
  const statement = () => {
    const value = {
      bind() { assert.equal(this, value); return value },
      async first() { assert.equal(this, value); reads++; if (fault) throw new Error('synthetic-quota'); return { value: 42 } },
      async run() { assert.equal(this, value); return result },
      async all() { assert.equal(this, value); return result },
      async raw() { assert.equal(this, value); return [] },
    }
    nativeObjects.push([value, Object.fromEntries(Object.entries(value))]); return value
  }
  const session = () => {
    const value = {
      prepare() { assert.equal(this, value); return statement() },
      async batch() { assert.equal(this, value); return [result] },
    }
    nativeObjects.push([value, Object.fromEntries(Object.entries(value))]); return value
  }
  const database = {
    prepare() { assert.equal(this, database); return statement() },
    async batch() { assert.equal(this, database); return [result] },
    async exec() { assert.equal(this, database); return { count: 1, duration: 1 } },
    withSession() { assert.equal(this, database); return session() },
  }
  nativeObjects.push([database, Object.fromEntries(Object.entries(database))])
  const first = { failed: false }; const second = { failed: false }
  const instrumentedFirst = instrumentD1(guardD1Binding(database, first))
  await assert.rejects(instrumentedFirst.withSession('first-primary').prepare('SELECT 1').bind().first())
  assert.equal(first.failed, true); assert.equal(reads, 1)
  fault = false
  const instrumentedSecond = instrumentD1(guardD1Binding(database, second))
  assert.deepEqual(await instrumentedSecond.withSession('first-primary').prepare('SELECT 1').bind().first(), { value: 42 })
  await instrumentedSecond.prepare('SELECT 1').bind().run()
  await instrumentedSecond.batch([]); await instrumentedSecond.exec('SELECT 1')
  assert.equal(second.failed, false); assert.equal(reads, 2)
  for (const [object, methods] of nativeObjects) for (const [name, method] of Object.entries(methods)) {
    assert.equal(object[name], method, 'SDK assignments must not mutate native binding, session or statement methods')
  }
})


test('coalesced and late waiters observe owner continuations and failure without waiting for future traffic', async () => {
  const lifetime = new RenderLifetime()
  const owner = lifetime.join(false); const waiter = lifetime.join(false)
  const first = Promise.withResolvers(); const later = Promise.withResolvers()
  owner.track(first.promise.then(() => { owner.track(later.promise) }))
  let waiterFinished = false
  const ownFinished = owner.finish()
  const peerFinished = waiter.finish().then(() => { waiterFinished = true })
  first.resolve(); await nextTurn()
  assert.equal(waiterFinished, false, 'owner late waitUntil must finish before a shared response can succeed')
  owner.failure.failed = true
  const late = lifetime.join(false); assert.equal(late.failure.failed, true)
  const lateFinished = late.finish()
  const future = lifetime.join(false); const futureWork = Promise.withResolvers()
  future.track(futureWork.promise)
  later.resolve()
  await Promise.all([ownFinished, peerFinished, lateFinished])
  assert.equal(waiterFinished, true)
  assert.equal(waiter.failure.failed, true); assert.equal(late.failure.failed, true)
  owner.close(); waiter.close(); late.close()
  futureWork.resolve(); await future.finish(); future.close()
  const recovered = lifetime.join(false)
  assert.equal(recovered.failure.failed, false)
  await recovered.finish(); recovered.close()
})

test('on-demand ISR does not wait for the parent normal-render scope, and completed failed work can retry', async () => {
  const lifetime = new RenderLifetime(); const parent = lifetime.join(false)
  const pending = Promise.withResolvers(); parent.track(pending.promise)
  const child = lifetime.join(true); let childFinished = false
  await child.finish().then(() => { childFinished = true })
  assert.equal(childFinished, true, 'the ISR child must not wait for parent completion')
  child.close()
  parent.failure.failed = true
  const completed = parent.finish(); pending.resolve(); await completed
  // An old response can still be returning after all its render work completed.
  const fresh = lifetime.join(false)
  assert.equal(fresh.failure.failed, false)
  await fresh.finish(); fresh.close(); parent.close()
})
