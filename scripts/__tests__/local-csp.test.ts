// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

async function configuration(mode: 'development' | 'production', url: string) {
  vi.stubEnv('NODE_ENV', mode)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url)
  vi.stubEnv('SENTRY_AUTH_TOKEN', '')
  vi.resetModules()
  const { default: config } = await import('../../next.config')
  const headers = await config.headers?.()
  const csp = headers?.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy')?.value
  return { images: config.images, csp }
}
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('explicit local Supabase connections', () => {
  it('allows the configured loopback origin and storage paths in development', async () => {
    const { images, csp } = await configuration('development', 'http://127.0.0.1:54321')
    expect(csp).toContain('http://127.0.0.1:54321')
    expect(csp).toContain('ws://127.0.0.1:54321')
    expect(images?.dangerouslyAllowLocalIP).toBe(true)
    expect(images?.remotePatterns?.[0]).toMatchObject({ protocol: 'http', hostname: '127.0.0.1', port: '54321', pathname: '/storage/v1/object/public/**' })
  })
  it('does not allow plaintext local connections or local image fetching in production', async () => {
    const { images, csp } = await configuration('production', 'http://127.0.0.1:54321')
    expect(csp).not.toContain('http://127.0.0.1:54321')
    expect(images?.dangerouslyAllowLocalIP).toBe(false)
    expect(images?.remotePatterns?.[0]).toMatchObject({ protocol: 'https', hostname: '*.supabase.co' })
  })
  it('keeps the configured HTTPS production backend and prevents local image fetching', async () => {
    const { images, csp } = await configuration('production', 'https://placeholder.supabase.co')
    expect(csp).toContain('https://placeholder.supabase.co')
    expect(images?.dangerouslyAllowLocalIP).toBe(false)
  })
  it.each(['http://localhost.example.com:54321', 'http://user:pass@localhost:54321'])(
    'does not treat an unrelated or credential-bearing URL as a local development origin: %s', async url => {
      const { images, csp } = await configuration('development', url)
      expect(csp).not.toContain(url)
      expect(images?.dangerouslyAllowLocalIP).toBe(false)
    },
  )
})
