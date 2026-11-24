// Run explicitly with node --test; .checks is excluded from Playwright discovery.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTestAuthFetch } from './admin-auth-transport.mjs'
import { TEST_ADMIN, TEST_ADMIN_TOKEN, TEST_MEMBER_TOKEN, TEST_SUPABASE_ORIGIN } from './admin-auth.mjs'

test('only the exact fake admin token gets an admin response', async () => {
  const fetch = createTestAuthFetch(() => { throw new Error('Unexpected network') })
  const response = await fetch(`${TEST_SUPABASE_ORIGIN}/auth/v1/user`, { headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), TEST_ADMIN)
})

test('fake member stays non-admin; anonymous and forged tokens stay rejected', async () => {
  const fetch = createTestAuthFetch(() => { throw new Error('Unexpected network') })
  const member = await fetch(new Request(`${TEST_SUPABASE_ORIGIN}/auth/v1/user`, { headers: { authorization: `Bearer ${TEST_MEMBER_TOKEN}` } }))
  assert.equal(member.status, 200)
  assert.equal((await member.json()).app_metadata.role, undefined)
  for (const token of ['', `${TEST_ADMIN_TOKEN}tampered`, 'arbitrary-admin-claim']) {
    const response = await fetch(`${TEST_SUPABASE_ORIGIN}/auth/v1/user`, { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 401)
  }
})

test('all other hosts, auth paths and methods delegate unchanged', async () => {
  const calls = []
  const original = async (...args) => { calls.push(args); return new Response('delegated') }
  const fetch = createTestAuthFetch(original)
  for (const [url, init] of [
    ['https://other.supabase.co/auth/v1/user', { headers: { authorization: `Bearer ${TEST_ADMIN_TOKEN}` } }],
    [`${TEST_SUPABASE_ORIGIN}/rest/v1/posts`, {}],
    [`${TEST_SUPABASE_ORIGIN}/auth/v1/user`, { method: 'POST' }],
    [`${TEST_SUPABASE_ORIGIN}/auth/v1/token`, { method: 'POST' }],
  ]) {
    assert.equal(await (await fetch(url, init)).text(), 'delegated')
    assert.deepEqual(calls.at(-1), [url, init])
  }
  assert.equal(calls.length, 4)
})
