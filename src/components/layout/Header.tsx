'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { Menu, Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import BrandMark from './BrandMark'
import HeaderDesktopNav from './HeaderDesktopNav'
import { PAGE_CONTAINER } from '@/lib/layout'

const DrawerMenu = dynamic(() => import('./DrawerMenu'), { ssr: false })

// REQ-183 FR-183-07: map each path to an i18n key and resolve with t() at render time.
const PAGE_TITLE_KEYS: Record<string, string> = {
  '/': 'header.pageTitle.home',
  '/map': 'bottomNav.map',
  '/guide': 'homeHub.guideTitle',
  '/trends': 'header.pageTitle.trends',
  '/ranking': 'header.pageTitle.ranking',
  '/dashboard': 'header.pageTitle.dashboard',
  '/about': 'header.pageTitle.about',
  '/terms': 'header.pageTitle.terms',
  '/privacy': 'header.pageTitle.privacy',
}

interface HeaderProps {
  onPostClick: () => void
  onLoginClick: (mode: string) => void
  onSurveyClick?: () => void
}

export default function Header({ onPostClick, onLoginClick, onSurveyClick }: HeaderProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoaded, setDrawerLoaded] = useState(false)
  const pathname = usePathname()

  const pageTitle = t(PAGE_TITLE_KEYS[pathname] ?? 'header.pageTitle.home')
  const isHome = pathname === '/'

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-red-600 focus:text-white"
      >
        {t('header.skipToMain')}
      </a>

      <header
        className={`${isHome ? 'sticky top-0 z-410' : 'z-10 relative'} shrink-0 border-b ${
          dark
            ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80 shadow-lg shadow-black/20'
            : 'bg-white/95 backdrop-blur-md border-gray-200'
        }`}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* REQ-320 FR-320-05: 旧 `max-w-(--breakpoint-xl)`(1280) は本文コンテナ(768)と別値で、
            1440px でハンバーガー x=98 / 本文カード x=352 と左端が割れていた。
            PAGE_CONTAINER（単一の正）へ寄せて、ヘッダー・パンくず・本文の左端を 1 本に通す。 */}
        <div className={`${isHome ? 'mx-auto max-w-[1440px] w-full px-4' : PAGE_CONTAINER} min-h-14 flex items-center gap-3`}>

          {/* ハンバーガー（全サイズ共通、左） */}
          <button
            onClick={() => { setDrawerLoaded(true); setDrawerOpen((v) => !v) }}
            className={`p-3 -ml-3 rounded-lg transition-colors ${
              dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
            data-testid="header-menu"
            aria-label={drawerOpen ? t('header.menuClose') : t('header.menuOpen')}
            aria-expanded={drawerOpen}
          >
            <Menu size={20} />
          </button>

          {/* ページタイトル（全サイズ共通、中央）。REQ-225: ブランドマークを併記
              lg 以上は右に水平ナビが入るので左寄せにする。 */}
          {isHome ? <div className="flex-1 min-w-0 flex items-center justify-between gap-3"><Link href="/" aria-label={t('homeHub.backHome')}><Image src="/logo-horizontal.svg" alt="ザリダス" width={1000} height={306} className={`w-28 h-auto ${dark ? 'brightness-0 invert' : ''}`} priority /></Link><span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('homeHub.home')}</span></div> : <div className={`flex-1 min-w-0 flex flex-col justify-center items-center lg:items-start py-1 pr-8 lg:pr-0 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            <div className="flex items-center gap-2 font-bold text-base md:text-lg leading-tight">
              <BrandMark className="h-6 w-6 shrink-0 rounded-md" />
              <span className="truncate">{pageTitle}</span>
            </div>
            {/* REQ-323 FR-323-03: 地図ホームは「ザリダス」としか書いておらず、**何の地図か**が
                どこにも常設されていなかった（初回シートは問い返すだけ／閉じると説明が消える）。
                既存の header.subtitle（4 言語ぶん揃っている）を、シートに依存しない 1 行として
                ヘッダー内に常時出す。地図の可視領域を削らないよう 11px・leading-tight の 1 行に収め、
                ヘッダーは h-12 固定をやめて min-h-12（この 1 行ぶんだけ伸びる）にする。 */}
            {pathname === '/map' && (
              <p className={`text-[11px] leading-tight truncate max-w-full ${dark ? 'text-slate-300' : 'text-gray-600'}`}>
                {t('header.subtitle')}
              </p>
            )}
          </div>}

          {/* REQ-323 FR-323-01: デスクトップ（1024px 以上）の水平ナビ。
              項目・対象パス・タップ挙動はボトムナビと同じ定義を共有する（HeaderDesktopNav 参照）。 */}
          {!isHome && <HeaderDesktopNav onPostClick={onPostClick} onLoginClick={onLoginClick} />}

          {/* 1023px 以下: アクション類はドロワー/ボトムナビに統合済み。
              視覚的な余白バランスのため、右側に空の固定幅要素を置く */}
          {isHome ? <a href="#home-news" className={`flex items-center justify-center h-11 w-11 shrink-0 rounded-lg ${dark ? 'text-slate-200' : 'text-gray-700'}`} aria-label={t('homeHub.news')}><Bell size={24} /></a> : <div className="w-10 shrink-0 lg:hidden" aria-hidden="true" />}
        </div>
      </header>

      {/* 初めて開くまで設定UIを読まない。開いた後は閉じるアニメーションとフォーカス復帰のため残す。 */}
      {drawerLoaded && <DrawerMenu
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onPostClick={onPostClick}
        onLoginClick={onLoginClick}
        onSurveyClick={onSurveyClick}
      />}
    </>
  )
}
