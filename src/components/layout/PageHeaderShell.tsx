import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import BrandMark from './BrandMark'
import { PAGE_CONTAINER } from '@/lib/layout'

/**
 * REQ-320 FR-320-02: 下層ページ共通ヘッダーの**見た目そのもの**。
 *
 * Client Component にしないのは `/terms` `/privacy` のためで、
 * この 2 ページは「ヘッダーは静的（i18n を使わない）＝ Footer の island 以外は JS を要求しない」
 * という設計を明示的に選んでいる（TermsPage.tsx の冒頭コメント）。
 * i18n が要るページは PageHeader（'use client'）がこのシェルを包んで文言を解決する。
 *
 * 意匠は Header.tsx（アプリ本体）と同一に保つ。ここを変えるときは Header.tsx も一緒に変える。
 */
export interface PageHeaderShellProps {
  /** 中央に出すページ名（解決済みの文字列）。 */
  title: string
  /** 戻る先。既定はホーム（地図）。 */
  backHref?: string
  /** 戻るリンクのアクセシブル名（解決済みの文字列）。 */
  backLabel: string
  /** ページ名をこのヘッダーの h1 として描画するか（旧ヘッダーに h1 があったページ用）。 */
  asH1?: boolean
  /**
   * REQ-323 FR-323-01: 1024px 以上で右に出す水平ナビのスロット。
   * このシェルは Server Component のままにしたいので、ナビ本体（router / auth を触る
   * Client Component）は呼び出し側から差し込む。`/terms` `/privacy` は元々ナビを持たない
   * ページなので何も渡さない＝従来と同じ描画になる。
   */
  nav?: ReactNode
}

export default function PageHeaderShell({
  title,
  backHref = '/',
  backLabel,
  asH1 = false,
  nav,
}: PageHeaderShellProps) {
  const TitleTag = asH1 ? 'h1' : 'span'

  return (
    <header
      className="z-10 relative shrink-0 border-b bg-white/95 backdrop-blur-md border-gray-200 dark:bg-slate-950/95 dark:border-slate-800/80 dark:shadow-lg dark:shadow-black/20"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className={`${PAGE_CONTAINER} h-12 flex items-center gap-3`}>
        <Link
          href={backHref}
          aria-label={backLabel}
          className="p-3 -ml-3 rounded-lg transition-colors text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>

        <TitleTag className={`flex-1 flex items-center gap-2 font-bold text-base md:text-lg min-w-0 text-gray-800 dark:text-slate-100 ${
          nav ? 'justify-center lg:justify-start pr-8 lg:pr-0' : 'justify-center pr-8'
        }`}>
          <BrandMark className="h-6 w-6 shrink-0 rounded-md" />
          <span className="truncate">{title}</span>
        </TitleTag>

        {nav}

        {/* 左の戻るボタンと視覚的な釣り合いを取るための空要素（Header.tsx と同じ扱い）。
            ナビが入る幅（lg 以上）では釣り合いをナビが取るので出さない。 */}
        <div className={`w-10 shrink-0 ${nav ? 'lg:hidden' : ''}`} aria-hidden="true" />
      </div>
    </header>
  )
}
