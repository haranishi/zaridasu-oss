/**
 * Next.js instrumentation hook（REQ-099）
 *
 * `@sentry/nextjs` v8+ では server / edge ランタイムの初期化を
 * `sentry.{server,edge}.config.ts` から `register()` で行う必要がある。
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// REQ-099: React Server Components で発生したエラーを Sentry に転送する
// （Next.js 15 の onRequestError フックを利用）
export { captureRequestError as onRequestError } from '@sentry/nextjs'
