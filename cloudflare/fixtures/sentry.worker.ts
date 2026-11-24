// Isolated test entry only. This module is never imported by the application Worker.
import { captureEvent, captureException, getClient, startSpan, withSentry } from '@sentry/nextjs/cloudflare'
import { sentryWorkerOptions } from '../sentry'

export default withSentry(
  (env: CloudflareEnv) => sentryWorkerOptions(env.ZARIDASU_DEPLOYMENT_ENV, process.env.SENTRY_DSN),
  {
    async fetch(): Promise<Response> {
      await startSpan({ name: 'operation fixture@example.invalid from 203.0.113.55', op: 'fixture' }, async () => {
        await Promise.resolve()
      })
      captureException(new Error('ValidationError fixture-only'))
      captureEvent({
        message: 'fixture_failure contact fixture@example.invalid from 203.0.113.55',
        user: { email: 'fixture@example.invalid', ip_address: '203.0.113.55' },
        request: { url: 'https://fixture.example.invalid/private?token=fixture-private-token',
          headers: { authorization: 'Bearer fixture-private-token', cookie: 'fixture-private-cookie' },
          cookies: { fixture: 'fixture-private-cookie' }, data: 'fixture-private-body', query_string: 'token=fixture-private-token' },
        extra: { reporter_ip: '203.0.113.55', token: 'fixture-private-token' },
      })
      const now = Date.now() / 1000
      captureEvent({ type: 'transaction', transaction: '/private/fixture@example.invalid',
        start_timestamp: now - 0.01, timestamp: now,
        contexts: { trace: { trace_id: '1234567890abcdef1234567890abcdef', span_id: '1234567890abcdef', op: 'fixture' } },
        spans: [{ trace_id: '1234567890abcdef1234567890abcdef', span_id: 'abcdef1234567890',
          start_timestamp: now - 0.01, timestamp: now, op: 'fixture', status: 'ok', data: {}, description: 'contact fixture@example.invalid' }],
      })
      const options = getClient()?.getOptions()
      return Response.json({ dataCollection: options?.dataCollection, maxValueLength: options?.maxValueLength,
        tracesSampleRate: options?.tracesSampleRate, traceLifecycle: options?.traceLifecycle })
    },
  } satisfies ExportedHandler<CloudflareEnv>,
)
