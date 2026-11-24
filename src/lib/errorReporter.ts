/**
 * エラーレポーターインターフェース
 *
 * logError() から呼び出されるコールバック。
 * Sentry 等の外部サービスを差し込むための抽象レイヤー。
 *
 * ## Sentry を導入する場合の設定例:
 *
 * ```ts
 * // src/lib/sentryReporter.ts
 * import * as Sentry from '@sentry/react';
 *
 * Sentry.init({
 *   dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
 *   environment: process.env.NODE_ENV,
 *   tracesSampleRate: 0.2,
 * });
 *
 * export const sentryReporter: ErrorReporter = (err, context) => {
 *   Sentry.withScope((scope) => {
 *     if (context) scope.setTag('context', context);
 *     Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
 *   });
 * };
 * ```
 *
 * ```ts
 * // src/app/providers.tsx (or entry point)
 * import { setErrorReporter } from '@/lib/errorHandler';
 * import { sentryReporter } from '@/lib/sentryReporter';
 *
 * setErrorReporter(sentryReporter);
 * ```
 */

/**
 * エラーレポーターの型定義
 * @param err - 発生したエラー
 * @param context - エラーの発生箇所を示す文字列（例: "PostForm", "AuthContext"）
 */
export type ErrorReporter = (err: unknown, context: string) => void

/** 何もしないデフォルトレポーター */
export const noopReporter: ErrorReporter = () => {
  // No-op: 外部レポーターが設定されるまで何もしない
}
