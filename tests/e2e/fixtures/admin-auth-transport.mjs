// Loaded ONLY by `node --import ... next start` in playwright.config.ts.
// Keep server-side Proxy and protected-layout getUser() checks intact.
import { knownTestUser, TEST_SUPABASE_ORIGIN } from './admin-auth.mjs'

export function createTestAuthFetch(originalFetch) {
  return async function testAuthFetch(input, init) {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(requestUrl)
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    if (url.origin !== TEST_SUPABASE_ORIGIN || url.pathname !== '/auth/v1/user' || method.toUpperCase() !== 'GET') {
      return originalFetch(input, init)
    }
    const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined))
    const token = headers.get('authorization')?.replace(/^Bearer /, '')
    const user = knownTestUser(token)
    // Unknown tokens remain unauthenticated, including fake JWTs claiming admin.
    return Response.json(user ?? { code: 'bad_jwt', message: 'Unknown E2E credential' }, {
      status: user ? 200 : 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}

globalThis.fetch = createTestAuthFetch(globalThis.fetch.bind(globalThis))
