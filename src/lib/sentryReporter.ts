/**
 * Sentry エラーレポーター実装（REQ-099）
 *
 * `setErrorReporter()` に渡すことで `logError()` から発生した例外を
 * Sentry に転送する。Sentry SDK 自体の初期化は
 * `sentry.{client,server,edge}.config.ts` で行う前提。
 *
 * 本番環境以外では `noopReporter` 相当として動作させたいので、
 * このレポーターを `setErrorReporter()` に登録するかどうかは
 * 呼び出し側（`src/app/providers.tsx`）でガードする。
 */

import * as Sentry from '@sentry/nextjs'
import type { ErrorReporter } from '@/lib/errorReporter'
import { scrubString } from '@/lib/sentryScrub'

/**
 * REQ-211 FR-211-07: captureException に渡す前段で例外メッセージの PII を除去する最終防波堤。
 * 一次防御は init の beforeSend（scrubEvent）だが、ここでも message を scrubString して
 * 二重に網を張る。stack 等はそのまま渡し、beforeSend / scrubEvent 側で処理させる
 * （ここで Error を作り直すとスタックフレームを失うため、message のみ無害化する）。
 *
 * 規律: 上流で `new Error(\`... ${userInput}\`)` のようにメール・IP・本文を直接埋め込まないこと。
 * 埋め込まれてしまった場合でも本関数 + beforeSend で除去されるが、そもそも埋め込まない方が安全。
 */
export const sentryReporter: ErrorReporter = (err, context) => {
  Sentry.withScope((scope) => {
    if (context) scope.setTag('context', context)
    if (err instanceof Error) {
      // 既存 Error はスタックトレースを保持したまま message のみスクラブする。
      err.message = scrubString(err.message)
      Sentry.captureException(err)
    } else {
      Sentry.captureException(new Error(scrubString(String(err))))
    }
  })
}
