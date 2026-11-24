/**
 * エラーハンドリングユーティリティ
 * Supabase エラーコードを i18n キー（または生メッセージ）にマッピングして返す
 *
 * ## i18n（REQ-183 FR-183-01/02）
 * getErrorMessage() は React 外の純 TS 関数で useTranslation() を呼べないため、
 * 完成した日本語文字列ではなく {@link ErrorMessage}（i18n キー + 補間 params、
 * またはサーバ由来の生メッセージ raw）を返す。表示側のフック/コンポーネントが
 * t() で翻訳してから描画する（resolveErrorMessage を利用）。
 *
 * ## 外部エラーレポーター連携
 * setErrorReporter() で Sentry 等のコールバックを登録すると、
 * logError() が呼ばれるたびにそのコールバックへもエラーを転送する。
 * 詳細は src/lib/errorReporter.ts を参照。
 *
 * ## PII を埋め込まない規律（REQ-211 FR-211-07）
 * logError() / 例外メッセージにメールアドレス・IP（reporter_ip / request_ip 含む）・
 * トークン・投稿本文/コメント/通報内容などの PII を **直接埋め込まないこと**。
 * 具体的には `new Error(\`...${email}\`)` や `logError(err, \`user ${email}\`)` のように
 * ユーザー入力を文字列補間しない。万一含まれても sentryReporter（scrubString）と
 * Sentry init の beforeSend（scrubEvent）で除去されるが、最初から渡さない方が安全。
 * context 引数は 'PostForm' 等の発生箇所ラベル（固定文字列）に限定する。
 */

import type { ErrorReporter } from '@/lib/errorReporter'
import { noopReporter } from '@/lib/errorReporter'

type AnyError = Record<string, unknown>

/**
 * 表示側で t() してから描画するためのエラー記述。
 * - `key`: `errors.*` 名前空間の i18n キー
 * - `params`: t() の補間に渡す任意パラメータ
 * - `raw`: サーバ由来などキー化しないメッセージ（指定時はそのまま表示する）
 */
export interface ErrorMessage {
  key: string
  params?: Record<string, unknown>
  raw?: string
}

/**
 * {@link getErrorMessage} の戻り値を、与えられた translate 関数で
 * 表示用文字列に解決する。`raw` があればそれを優先する。
 *
 * @example
 * const { t } = useTranslation()
 * setError(resolveErrorMessage(getErrorMessage(err), t))
 */
export function resolveErrorMessage(
  msg: ErrorMessage,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (msg.raw != null && msg.raw !== '') return msg.raw
  return translate(msg.key, msg.params)
}

/** 現在のレポーター（デフォルトは no-op） */
let currentReporter: ErrorReporter = noopReporter

/**
 * 外部エラーレポーターを設定する
 *
 * アプリ起動時に一度だけ呼び出す。
 * @example
 * ```ts
 * import { sentryReporter } from '@/lib/sentryReporter';
 * setErrorReporter(sentryReporter);
 * ```
 */
export function setErrorReporter(reporter: ErrorReporter): void {
  currentReporter = reporter
}

/**
 * 現在のレポーターをリセットする（テスト用）
 */
export function resetErrorReporter(): void {
  currentReporter = noopReporter
}

function asError(err: unknown): AnyError {
  return (err && typeof err === 'object' ? err : {}) as AnyError
}

/**
 * エラーを表示用の {@link ErrorMessage}（i18n キー or 生メッセージ）に変換する。
 *
 * REQ-183 FR-183-01: 完成した日本語文字列ではなく `errors.*` のキーを返し、
 * 表示側で {@link resolveErrorMessage} を介して t() する。サーバ由来のメッセージ
 * （P0001 のレートリミット文言など）はキー化せず `raw` でそのまま通す。
 */
export function getErrorMessage(err: unknown): ErrorMessage {
  if (!err) return { key: 'errors.unexpected' }

  const e = asError(err)

  // PostgreSQL トリガーによるレートリミット（サーバ由来メッセージを優先表示）
  if (e.code === 'P0001') {
    const raw = typeof e.message === 'string' ? e.message : ''
    return raw ? { key: 'errors.rateLimitServer', raw } : { key: 'errors.rateLimitServer' }
  }

  // ネットワーク接続エラー
  if (err instanceof TypeError && err.message?.includes('fetch')) {
    return { key: 'errors.network' }
  }

  // 認証エラー
  if (e.status === 401 || e.code === 'PGRST301') {
    return { key: 'errors.sessionExpired' }
  }

  // 権限エラー
  if (e.status === 403 || e.code === 'PGRST116') {
    return { key: 'errors.forbidden' }
  }

  // ストレージエラー
  if (e.statusCode === '404' || e.error === 'not_found') {
    return { key: 'errors.notFound' }
  }

  // レート制限
  if (e.status === 429) {
    return { key: 'errors.tooManyRequests' }
  }

  return { key: 'errors.generic' }
}

/**
 * エラーをログに記録する
 * 開発環境ではスタックトレースを含む詳細ログ
 * 本番環境でもコンソールにエラー出力
 * 外部レポーターが設定されていればそちらにも転送する
 */
export function logError(err: unknown, context = ''): void {
  const prefix = context ? `[${context}]` : '[Error]'
  if (process.env.NODE_ENV === 'development') {
    console.error(prefix, err) // eslint-disable-line no-console
  } else {
    const message = err instanceof Error ? err.message : String(err)
    console.error(prefix, message) // eslint-disable-line no-console
  }

  // 外部レポーター（Sentry 等）への転送
  try {
    currentReporter(err, context || 'unknown')
  } catch {
    // レポーター自体のエラーでアプリを壊さない
  }
}
