// Deliberately fake credentials shared by the browser fixture and next-start transport.
// No signing key or real account is involved. Do not import this module from product code.
export const TEST_SUPABASE_ORIGIN = 'https://placeholder.supabase.co'
export const TEST_AUTH_COOKIE_NAME = 'sb-placeholder-auth-token'
export const TEST_SESSION_EXPIRY = 4102444800 // 2100-01-01; never refresh during E2E.

export const TEST_ADMIN = {
  id: '00000000-0000-4000-8000-000000000101',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin-e2e@example.invalid',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email', role: 'admin' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
}

export const TEST_MEMBER = {
  ...TEST_ADMIN,
  id: '00000000-0000-4000-8000-000000000102',
  email: 'member-e2e@example.invalid',
  app_metadata: { provider: 'email' },
}

function testToken(user, signature) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ sub: user.id, aud: user.aud, role: user.role, app_metadata: user.app_metadata, exp: TEST_SESSION_EXPIRY }),
    signature,
  ].join('.')
}

export const TEST_ADMIN_TOKEN = testToken(TEST_ADMIN, 'zaridasu-e2e-fake-admin-signature')
export const TEST_MEMBER_TOKEN = testToken(TEST_MEMBER, 'zaridasu-e2e-fake-member-signature')

export function knownTestUser(token) {
  if (token === TEST_ADMIN_TOKEN) return TEST_ADMIN
  if (token === TEST_MEMBER_TOKEN) return TEST_MEMBER
  return null
}

export function testSessionCookie(admin = true) {
  const session = {
    access_token: admin ? TEST_ADMIN_TOKEN : TEST_MEMBER_TOKEN,
    token_type: 'bearer',
    expires_in: TEST_SESSION_EXPIRY - Math.floor(Date.now() / 1000),
    expires_at: TEST_SESSION_EXPIRY,
    refresh_token: 'zaridasu-e2e-never-refresh',
    user: admin ? TEST_ADMIN : TEST_MEMBER,
  }
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}
