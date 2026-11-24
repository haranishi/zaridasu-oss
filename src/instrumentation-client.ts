/**
 * Sentry client side init（REQ-099 / REQ-200 FR-200-03）
 *
 * REQ-200: Turbopack でも読み込まれるよう、旧 `sentry.client.config.ts` から本ファイルへ移設。
 * Next.js は `instrumentation-client.ts`（src 使用時は src 配下）をクライアント起動時に
 * webpack / Turbopack の双方で自動ロードする。サーバー/エッジ初期化は従来どおり
 * `src/instrumentation.ts` の register() が `sentry.{server,edge}.config.ts` を読み込む。
 *
 * - DSN と production ビルドに加え、信頼する配備環境が production のときだけ init
 * - 想定済みのバリデーションエラーは beforeSend でフィルタする
 * - REQ-211: PII を送信前にスクラブ（クライアント側の一次スクラブ）
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
    // Performance / Session Replay は容量を食うので OFF
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    // REQ-211 FR-211-01: IP・Cookie・ヘッダ・通信の本文などの自動収集を止める（v11 で sendDefaultPii から移行）。
    dataCollection: SENTRY_DATA_COLLECTION,
    // REQ-211 NFR-211-04: 過大な値の取り込みを抑え、スクラブ前段で長大文字列を制限する。
    maxValueLength: 8192,
    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value ?? ''
      if (message.includes('Validation') || message.includes('ValidationError')) {
        return null
      }
      // REQ-211 FR-211-03: 送信前に PII をスクラブ（クライアント側の一次スクラブ）。
      // 同じ scrubEvent をサーバー/エッジでも適用し多層防御にする。
      return scrubEvent(event)
    },
    // REQ-211 FR-211-04: トランザクション名・span・request から PII を除去。
    beforeSendTransaction(event) {
      return scrubTransaction(event)
    },
  })
}
