'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { PAGE_CONTAINER } from '@/lib/layout'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

/**
 * REQ-323 FR-323-07: 390px 実測でパンくずのリンクは 35×15px しか無く、タップ域 44px 未満だった。
 * 擬似要素でヒットエリアだけ広げると、真上のヘッダー（ハンバーガー）と当たり判定が重なるので
 * リンク自体を 44px にし、増えたぶんは nav の縦パディング（py-2 → py-0）で相殺する。
 */
const CRUMB_LINK = 'inline-flex items-center min-h-11 min-w-11 justify-center px-1 transition-colors'

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()

  return (
    // REQ-320 FR-320-05: 旧実装はコンテナ無しの `px-4` だけで、1440px ではパンくずが x=17、
    // 直下の本文カードが x=352 と 335px もずれていた。PAGE_CONTAINER へ寄せて縦線を通す。
    // overflow-x-auto は「長いパンくずが折り返さず横に逃げる」ための既存挙動なので内側の ol へ移す
    // （コンテナ側に付けると max-width と競合して中央寄せが崩れる）。
    // REQ-322 FR-322-04: リンクの灰を gray-500(#6b7280) → gray-600(#4b5563) へ。
    // 評価者の実測「#747A88 on #F9FAFB = 4.12:1」は 12px 文字のアンチエイリアス画素で、
    // CSS 上の実値は #6b7280 on #f9fafb = 4.63:1 と AA 自体は満たしていた（診断は不正確）。
    // ただし余裕が 0.13 しか無く、下地が白でもグレーでも通る値へ底上げする（7.23:1）。
    // 区切りは ChevronRight（＝視覚上の「›」）。全ページこの 1 コンポーネントを通す（FR-322-02）。
    <nav aria-label="パンくず" className={`${PAGE_CONTAINER} text-xs`}>
      <ol className="flex items-center gap-1 whitespace-nowrap overflow-x-auto">
        <li>
          <Link
            href="/"
            className={`${CRUMB_LINK} ${dark ? 'text-slate-400 hover:text-red-400' : 'text-gray-600 hover:text-red-600'}`}
          >
            {/* REQ-322 FR-322-01: 起点だけ日本語ベタ書きで、en/ko/zh でも「ホーム」と出ていた。
                パンくずは AC-04 が語の一致を見る面なので 4 言語すべてで解決する。 */}
            {t('nav.home')}
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1">
            <ChevronRight size={12} className={dark ? 'text-slate-600' : 'text-gray-300'} />
            {item.href && i < items.length - 1 ? (
              <Link
                href={item.href}
                className={`${CRUMB_LINK} ${dark ? 'text-slate-400 hover:text-red-400' : 'text-gray-600 hover:text-red-600'}`}
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                className={dark ? 'text-slate-200' : 'text-gray-800'}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
