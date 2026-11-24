'use client'

import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { NAV_TABS, isBottomNavVisible, useNavTap, type BottomNavProps } from './BottomNav'

/**
 * REQ-323 FR-323-01: 1024px 以上で出すヘッダー水平ナビ。
 *
 * ■ なぜ要るのか
 * REQ-320 FR-320-01 がボトムタブを全ページへ広げたとき、レスポンシブ分岐を入れなかった。
 * `BottomNav` の中身は `max-w-md mx-auto`（448px）で中央寄せされるため、1440/768 では
 * 画面下中央に 386px の「浮いた島」が残っていた（Round 4 採点 🔴）。
 * 直し方は「対象パスを狭める」ではなく「幅で出し分ける」＝広い画面はヘッダーに水平ナビを置く。
 *
 * ■ 単一の定義
 * 項目（NAV_TABS）・表示対象パス（isBottomNavVisible）・タップ挙動（useNavTap）は
 * すべてボトムナビと共有する。2 箇所に書くと「片方だけ増えた／語が違う」が必ず起きる。
 *
 * ■ 置き場所が 2 つある理由
 * アプリ本体（/ /trends /ranking /dashboard …）は Header.tsx、下層ページ
 * （/about /dataset /species /area）は PageHeaderShell の `nav` スロットから描画する。
 * どちらも中身はこのコンポーネント 1 つ。
 */
export default function HeaderDesktopNav({ onPostClick, onLoginClick }: BottomNavProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const pathname = usePathname()
  const { isActive, handleTap } = useNavTap({ onPostClick, onLoginClick })

  if (!isBottomNavVisible(pathname)) return null

  return (
    <nav aria-label={t('header.mainNav')} className="hidden lg:flex items-center gap-0.5 shrink-0">
      {NAV_TABS.map((tab) => {
        const active = isActive(tab.path)
        const Icon = tab.icon
        const isPost = tab.key === 'post'
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTap(tab)}
            aria-current={active ? 'page' : undefined}
            // 投稿だけは主 CTA なのでブランド赤のピル。他は無彩色 → 選択中はブランド赤。
            // 可視ラベル「投稿」はアクセシブル名「投稿する」に含まれる（label-content-name-mismatch 回避）。
            aria-label={isPost ? t('bottomNav.postAction') : undefined}
            // px は 2（8px）まで詰める。ヘッダーのコンテナは PAGE_CONTAINER（768px 固定・REQ-320 FR-320-05）で
            // 幅が増えないため、ここが太いと下層ページの h1（例「このサービスについて」）が truncate する。
            className={`inline-flex items-center gap-1 rounded-full px-2 min-h-11 text-sm font-semibold transition-colors ${
              isPost
                ? 'bg-accent text-white hover:bg-(--color-accent-hover)'
                : active
                  // 選択中は red-50 の淡赤地に載るので brand-600(4.41:1) では AA を割る。
                  // REQ-320 FR-320-04 の「白地タブの選択中ラベル」と同じ brand-700（5.91:1）。
                  ? dark ? 'text-red-400 bg-slate-800' : 'text-brand-700 bg-red-50'
                  : dark ? 'text-slate-300 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon size={16} strokeWidth={active || isPost ? 2.2 : 1.8} aria-hidden="true" />
            <span>{t(tab.labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
}
