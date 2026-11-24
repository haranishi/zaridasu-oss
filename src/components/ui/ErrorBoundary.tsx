'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '@/lib/errorHandler'
import i18n from '@/lib/i18n'

/**
 * フォールバックのレンダー関数。`reset` を呼ぶとバウンダリ状態がリセットされ、
 * 配下の children が再マウントされる（チャンク再取得・再描画の再試行に使う）。
 */
export type ErrorBoundaryFallback = (reset: () => void, error: Error | null) => ReactNode

interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * REQ-201 (FR-201-01): 局所フォールバックを差し込む。未指定時は従来どおり
   * 全画面フォールバック（i18n 化済み）を表示する（providers/AdminLayoutClient の後方互換）。
   */
  fallback?: ErrorBoundaryFallback
  /** logError のコンテキストに付与するラベル（地図区画など発生源の識別用）。 */
  context?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * NFR-201-02: クラスコンポーネントは `useTranslation` フックを使えないため、
 * `@/lib/i18n` の i18n インスタンスを直接参照する。i18n 未初期化時でも
 * `defaultValue`（既定言語=ja）が必ず表示されるようフォールバックを与える。
 */
function tr(key: string, defaultValue: string): string {
  try {
    if (i18n?.isInitialized) {
      return i18n.t(key, { defaultValue })
    }
  } catch {
    /* fail-soft: i18n 未初期化／例外時は defaultValue を返す */
  }
  return defaultValue
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // NFR-201-03: 既存の logError 連携を維持（地図エラーも従来どおり記録）。
    const where = this.props.context
      ? `ErrorBoundary:${this.props.context}`
      : `ErrorBoundary:${errorInfo?.componentStack?.split('\n')[1]?.trim() ?? ''}`
    logError(error, where)
  }

  // FR-201-01 / AC-02: バウンダリ状態をリセットして children を再マウントさせる。
  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // FR-201-01: 局所フォールバックが指定されていれば、それを優先して描画する。
      if (this.props.fallback) {
        return this.props.fallback(this.reset, this.state.error)
      }

      // 既定（全画面）フォールバック。FR-201-03 で i18n 化。
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">{'⚠️'}</div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-slate-100 mb-2">
              {tr('errorBoundary.title', 'エラーが発生しました')}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
              {tr('errorBoundary.description', '予期しないエラーが発生しました。ページを再読み込みしてください。')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors"
            >
              {tr('errorBoundary.reload', 'ページを再読み込み')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
