'use client'

/**
 * REQ-222 (FR-222-02): データ取得画面の「空状態（Empty）」共通コンポーネント。
 *
 * デザイン基礎ノート（マイクロインタラクションとモーション.md）の方針に沿う:
 * - 空状態は「説明 2 : 楽しさ 1」のバランスで、肯定形コピー + 単一の CTA により
 *   オンボーディングの好機に変える（行き止まりの否定表現にしない）。
 * - CTA は 1 つに限定（複数アクションで意思決定を割らない）。フィルタ 0 件など
 *   「リセット」が主アクションになる場合はその 1 つを CTA にできる。
 *
 * a11y（FR-222-06 / AC-05）:
 * - 装飾アイコン（絵文字 / lucide / マスコット）は aria-hidden。
 * - 見出し・説明は通常テキストとして読み上げられる。
 *
 * ダーク/ライト（NFR-222-04）: 独自色を増やさず themeClasses（muted/faint）を流用する。
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { muted, faint } from '@/lib/themeClasses'

/**
 * 空状態用マスコット（線画・単色）をインライン SVG で描画する。
 * public/mascot-empty.svg を <img> で読むと currentColor が継承されず黒固定になるため、
 * インライン化して利用側の text-* 色（=faint トークン）を stroke に追従させる。
 * 装飾用途のため aria-hidden を付与する（FR-222-06 / AC-05）。
 */
function MascotEmpty({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 200"
      width="96"
      height="80"
      fill="none"
      stroke="currentColor"
      strokeWidth={6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* 触角 */}
      <path d="M104 64 C92 42 74 30 56 28" />
      <path d="M136 64 C148 42 166 30 184 28" />
      {/* 左ハサミ */}
      <path d="M86 108 C62 102 44 108 34 124" />
      <path d="M34 124 C22 112 22 96 32 86" />
      <path d="M34 124 C26 134 14 130 14 118" />
      {/* 右ハサミ */}
      <path d="M154 108 C178 102 196 108 206 124" />
      <path d="M206 124 C218 112 218 96 208 86" />
      <path d="M206 124 C214 134 226 130 226 118" />
      {/* 歩脚 */}
      <path d="M94 142 C80 150 72 160 68 172" />
      <path d="M146 142 C160 150 168 160 172 172" />
      {/* 尾扇（カール） */}
      <path d="M104 172 C108 190 132 190 136 172 C148 182 146 196 132 200" />
      {/* 体（丸） */}
      <ellipse cx="120" cy="118" rx="42" ry="46" />
      {/* 目・口 */}
      <circle cx="106" cy="110" r="6" fill="currentColor" stroke="none" />
      <circle cx="134" cy="110" r="6" fill="currentColor" stroke="none" />
      <path d="M110 132 C116 137 124 137 130 132" />
    </svg>
  )
}

interface EmptyStateAction {
  /** CTA ラベル（i18n 済みの文言を渡す） */
  label: string
  /** 遷移先（href か onClick のどちらか一方を使う） */
  href?: string
  onClick?: () => void
}

interface EmptyStateProps {
  /**
   * 装飾アイコン。
   * - string を渡すと絵文字 / 短いテキストとして大きく表示（例: '📷'）
   * - ReactNode（lucide アイコン要素など）を渡すとそのまま中央に表示
   * - 省略するとマスコット線画（/mascot-empty.svg）をやさしい挿絵として表示
   */
  icon?: ReactNode
  /** 肯定形の見出し（必須） */
  title: string
  /** 補足説明（任意） */
  description?: string
  /** 単一の CTA（任意） */
  action?: EmptyStateAction
  /** 既存カードの内側に置く場合などに padding を上書きしたいとき */
  className?: string
  /** アイコンの色トーンを抑えるか（既定は faint 相当） */
  iconClassName?: string
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = 'py-12',
  iconClassName,
}: EmptyStateProps) {
  // アイコン領域。string は絵文字想定で大きく、未指定はマスコット線画。
  const renderIcon = () => {
    if (typeof icon === 'string') {
      return (
        <span className="text-5xl leading-none" aria-hidden="true">
          {icon}
        </span>
      )
    }
    if (icon) {
      return (
        <span className={`${iconClassName ?? faint()}`} aria-hidden="true">
          {icon}
        </span>
      )
    }
    // 既定: ザリダスの空状態用マスコット（線画・単色）。currentColor で色を継承。
    return <MascotEmpty className={iconClassName ?? faint()} />
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${className}`}>
      <div className="mb-3">{renderIcon()}</div>
      <p className={`text-sm font-semibold ${muted()}`}>{title}</p>
      {/* 副文は faint() ではなく muted()。faint(#6b7280) は「白 4.83:1 / ページ背景 4.61:1」で
          設計された値で、EarlyStageNote が敷く淡い面（--color-surface-2 = #f8f6f6）の上では
          4.49:1 と AA を割る。EmptyState は面を選ばず置かれるので、いちばん暗い面ではなく
          **いちばん淡い面**を基準に選ぶ（muted は同じ面で 5.60:1）。
          faint() は残る装飾アイコン用（aria-hidden・非テキスト 3:1 判定）。 */}
      {description && <p className={`text-xs mt-1.5 max-w-xs ${muted()}`}>{description}</p>}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              href={action.href}
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-xs shadow-red-500/20 transition-colors active:scale-[0.98]"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-xs shadow-red-500/20 transition-colors active:scale-[0.98]"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
