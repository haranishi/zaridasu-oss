'use client'

/**
 * スケルトンローディングUI
 * データ読み込み中の表示に使用
 *
 * REQ-222 (FR-222-01/04/06): 一般ユーザー向け画面の Loading を
 * 「中央スピナー」から「実コンテンツと同じ骨格のスケルトン」へ寄せる。
 * - LoadingState: スケルトンを包み role="status" + aria-busy + sr-only(common.loading) を付与し、
 *   スクリーンリーダーへ「読み込み中」を通知する（FR-222-06 / AC-05）。
 * - SkeletonRow / SkeletonRows: リスト行（みんなの記録・マイ投稿など）用。
 * - SkeletonChart: トレンドのグラフ枠用。
 * いずれも実コンテンツ相当の寸法・グリッドにして CLS を防ぐ（FR-222-05）。
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-slate-700 rounded-sm ${className}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-16 rounded-lg" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {/* ヘッダー */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* 行 */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton key={col} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border border-gray-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  )
}

/**
 * リスト行 1 行分のスケルトン（アバター + 2 行テキスト + 末尾の数値）。
 * みんなの記録（多様性/品質/投稿数）・マイ投稿などの行と寸法を揃える。
 */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-6 w-8 shrink-0" />
    </div>
  )
}

/** SkeletonRow を rows 件繰り返す。 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

/**
 * グラフ枠のスケルトン（見出し + 棒/ドーナツ相当の高さブロック）。
 * トレンドの月別チャート/内訳の高さに合わせて CLS を防ぐ。
 */
export function SkeletonChart({ height = 'h-40' }: { height?: string }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className={`w-full ${height} rounded-xl`} />
    </div>
  )
}

/**
 * スケルトン/ローディング表現を包み、a11y の読み上げ（role="status" + aria-busy）を付与する。
 * 視覚的にはスケルトン子要素を見せ、SR には sr-only で common.loading を読み上げる。
 */
export function LoadingState({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{t('common.loading')}</span>
      {children}
    </div>
  )
}
