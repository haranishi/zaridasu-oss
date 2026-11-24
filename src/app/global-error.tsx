'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * REQ-200 (FR-200-01): root layout / Providers 自身の描画中クラッシュを捕捉する「最後の砦」。
 *
 * App Router の error.tsx は配下セグメント用で、layout.tsx / providers.tsx 自体のエラーは
 * 捕まえられない。global-error.tsx は <html>/<body> ごと差し替えるフォールバックを提供し、
 * 例外を必ず Sentry へ送る（本番のみ送信は SDK 側の init ガードに従う）。
 *
 * 注: ここはルートレイアウトの外側で描画されるため globals.css(Tailwind) の適用が保証されない。
 * 二次例外を避けるためインラインスタイルのみを使い、Providers / i18n には一切依存しない(NFR-200-03)。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // 最も重大な初期化クラッシュを必ず Sentry に記録する。
    Sentry.captureException(error)
  }, [error])

  const handleRetry = () => {
    try {
      reset()
    } catch {
      if (typeof window !== 'undefined') window.location.reload()
    }
  }

  return (
    <html lang="ja">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            textAlign: 'center',
            background: '#f9fafb',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <p style={{ fontSize: '3.75rem', margin: 0 }} role="img" aria-label="crayfish">
            🦞
          </p>
          <h1 style={{ marginTop: '1.5rem', fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' }}>
            エラーが発生しました
          </h1>
          <p style={{ marginTop: '0.5rem', maxWidth: '28rem', color: '#4b5563' }}>
            申し訳ありません。予期せぬ問題が発生しました。もう一度お試しください。
          </p>
          {error?.digest && (
            <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#9ca3af' }}>
              エラーID: {error.digest}
            </p>
          )}
          <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
            <button
              onClick={handleRetry}
              style={{
                borderRadius: '0.5rem',
                background: '#2563eb',
                color: '#fff',
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              再試行
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error はアプリ外で描画されるため full reload が必要 */}
            <a
              href="/"
              style={{
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                padding: '0.625rem 1.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              ホームに戻る
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
