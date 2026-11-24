import type { CloudflareOptions } from '@sentry/nextjs/cloudflare'
import { SENTRY_DATA_COLLECTION, SENTRY_TRACE_LIFECYCLE, scrubEvent, scrubTransaction } from '../src/lib/sentryScrub'

/** Next's normal init does not configure the client owned by the Cloudflare wrapper. */
export function sentryWorkerOptions(environment: string, dsn?: string): CloudflareOptions {
  const production = environment === 'production'
  return {
    enabled: production && !!dsn,
    // Empty explicitly: the SDK otherwise falls back to env.SENTRY_DSN in preview.
    dsn: production ? dsn : '',
    environment,
    tracesSampleRate: 0.1,
    // SDK 11 defaults to streaming spans, which bypasses beforeSendTransaction.
    traceLifecycle: SENTRY_TRACE_LIFECYCLE,
    dataCollection: SENTRY_DATA_COLLECTION,
    maxValueLength: 8192,
    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value ?? ''
      if (message.includes('Validation') || message.includes('ValidationError')) return null
      return scrubEvent(event)
    },
    beforeSendTransaction: scrubTransaction,
  }
}
