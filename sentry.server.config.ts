/**
 * Sentry server side init（REQ-099）
 *
 * Node.js ランタイム（API Route / Server Component / Server Action）で
 * 発生した例外を捕捉する。
 */

import * as Sentry from '@sentry/nextjs'
import { deploymentEnvironment, isProductionDeployment } from '@/lib/deploymentEnvironment'
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_TRACE_LIFECYCLE,
  scrubEvent,
  scrubTransaction,
} from '@/lib/sentryScrub'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const isProd = process.env.NODE_ENV === 'production'

if (dsn && isProd && isProductionDeployment()) {
  Sentry.init({
    dsn,
    // Trusted build labels also classify provider-neutral previews.
    environment: deploymentEnvironment(),
    tracesSampleRate: 0.1,
    // Streaming spans bypass the transaction scrub hook in SDK 11.
    traceLifecycle: SENTRY_TRACE_LIFECYCLE,
    // REQ-211 FR-211-01: IP・Cookie・ヘッダ・通信の本文などの自動収集を止める（v11 で sendDefaultPii から移行）。
    dataCollection: SENTRY_DATA_COLLECTION,
    // REQ-211 NFR-211-04: 過大な値の取り込みを抑え、スクラブ前段で長大文字列を制限する。
    maxValueLength: 8192,
    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value ?? ''
      if (message.includes('Validation') || message.includes('ValidationError')) {
        return null
      }
      // REQ-211 FR-211-03: 送信前に PII をスクラブ（サーバー側の二次スクラブ）。
      return scrubEvent(event)
    },
    // REQ-211 FR-211-04: トランザクション名・span・request から PII を除去。
    beforeSendTransaction(event) {
      return scrubTransaction(event)
    },
  })
}
