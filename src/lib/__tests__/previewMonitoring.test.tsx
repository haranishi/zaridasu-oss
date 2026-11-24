import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { init } = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ init }))
vi.mock('next/font/google', () => ({ Inter: () => ({ className: '', variable: '' }) }))
vi.mock('next/script', () => ({ default: 'script' }))
vi.mock('@/app/providers', () => ({ Providers: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/components/layout/RootMain', () => ({ RootMain: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@/app/globals.css', () => ({}))

const configs = [
  ['browser', () => import('../../instrumentation-client')],
  ['Node', () => import('../../../sentry.server.config')],
  ['edge', () => import('../../../sentry.edge.config')],
] as const

beforeEach(() => {
  vi.resetModules()
  init.mockReset()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@telemetry.example.invalid/1')
  vi.stubEnv('NEXT_PUBLIC_GTM_ID', 'GTM-FIXTURE-ONLY')
  for (const name of ['NEXT_PUBLIC_DEPLOYMENT_ENV', 'ZARIDASU_DEPLOYMENT_ENV', 'VERCEL_ENV']) vi.stubEnv(name, undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe.each(configs)('%s monitoring', (_runtime, load) => {
  it.each(['VERCEL_ENV', 'ZARIDASU_DEPLOYMENT_ENV', 'NEXT_PUBLIC_DEPLOYMENT_ENV'])(
    'does not initialize in preview selected by %s even with a DSN and a production build', async name => {
      vi.stubEnv(name, 'preview')
      await load()
      expect(init).not.toHaveBeenCalled()
    },
  )
  it.each(['production', undefined])('keeps monitoring for Vercel production and legacy production (%s)', async environment => {
    vi.stubEnv('VERCEL_ENV', environment)
    await load()
    expect(init).toHaveBeenCalledOnce()
    const options = init.mock.calls[0]?.[0]
    expect(options.environment).toBe('production')
    expect(options.tracesSampleRate).toBe(0.1)
    expect(options.traceLifecycle).toBe('static')
    expect(options.maxValueLength).toBe(8192)
    expect(options.beforeSend({ exception: { values: [{ value: 'ValidationError' }] } })).toBeNull()
    expect(options.beforeSend({ message: 'contact fixture@example.invalid' }).message).not.toContain('fixture@example.invalid')
    expect(options.beforeSendTransaction({ transaction: '/profile/fixture@example.invalid' }).transaction).not.toContain('fixture@example.invalid')
  })
})

it('omits both GTM script and noscript in preview with a nonempty container ID', async () => {
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_ENV', 'preview')
  const { default: Layout } = await import('@/app/layout')
  const html = renderToStaticMarkup(<Layout>Fixture</Layout>)
  expect(html).not.toContain('GTM-FIXTURE-ONLY')
  expect(html).not.toContain('gtm-init')
})

it('keeps both GTM entry points in Vercel production', async () => {
  vi.stubEnv('VERCEL_ENV', 'production')
  const { default: Layout } = await import('@/app/layout')
  const html = renderToStaticMarkup(<Layout>Fixture</Layout>)
  expect(html).toContain('gtm-init')
  expect(html).toContain('ns.html?id=GTM-FIXTURE-ONLY')
})
