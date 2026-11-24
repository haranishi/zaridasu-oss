'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useGeminiAuthBanner } from '@/hooks/useGeminiAuthBanner'

interface NavItem {
  path: string
  label: string
  icon: string
  exact?: boolean
}

interface MobileBottomNavProps {
  navItems: NavItem[]
  isActive: (item: NavItem) => boolean
  onSignOut: () => void
  t: (key: string) => string
}

function MobileBottomNav({ navItems, isActive, onSignOut, t }: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)

  // 主要4項目をボトムナビに表示
  const primaryItems = navItems.slice(0, 4) // ダッシュボード, 投稿, 通報, ユーザー
  // 残りを「その他」メニューに格納
  const secondaryItems = navItems.slice(4) // コメント, 非公開スポット, ログ

  const isSecondaryActive = secondaryItems.some(item => isActive(item))

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800 text-white border-t border-gray-700 z-50"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* その他メニュー（上に展開） */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label={t('admin.nav.more') || 'メニューを閉じる'}
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default border-0 p-0 bg-transparent"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-full left-0 right-0 bg-gray-800 border-t border-gray-700 z-50 shadow-lg">
            {secondaryItems.map(item => (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors min-h-grid-6 ${
                  isActive(item) ? 'text-white bg-gray-600' : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <Link
              href="/"
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 px-5 py-3 text-sm text-gray-300 hover:bg-gray-700 transition-colors min-h-grid-6"
            >
              <span className="text-lg">🌐</span>
              <span>{t('admin.nav.publicSite')}</span>
            </Link>
            <button
              onClick={() => { setMoreOpen(false); onSignOut() }}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-red-400 hover:bg-gray-700 transition-colors min-h-grid-6"
            >
              <span className="text-lg">🚪</span>
              <span>{t('admin.nav.signOut')}</span>
            </button>
          </div>
        </>
      )}

      <div className="flex">
        {primaryItems.map(item => (
          <Link
            key={item.path}
            href={item.path}
            className={`flex-1 flex flex-col items-center py-2.5 transition-colors min-h-grid-6 ${
              isActive(item) ? 'text-white bg-gray-600' : 'text-gray-400'
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[11px] leading-tight mt-0.5 truncate w-full text-center px-0.5">{item.label}</span>
          </Link>
        ))}
        {/* その他ボタン */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={`flex-1 flex flex-col items-center py-2.5 transition-colors min-h-grid-6 ${
            moreOpen || isSecondaryActive ? 'text-white bg-gray-600' : 'text-gray-400'
          }`}
          aria-label={t('admin.nav.more') || 'その他'}
          aria-expanded={moreOpen}
        >
          <span className="text-lg leading-none">⋯</span>
          <span className="text-[11px] leading-tight mt-0.5">その他</span>
        </button>
      </div>
    </nav>
  )
}

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const { user, isAdmin, loading, signOut } = useAuth()

  const NAV_ITEMS = [
    { path: '/admin', label: t('admin.nav.dashboard'), icon: '📊', exact: true },
    { path: '/admin/posts', label: t('admin.nav.posts'), icon: '📋' },
    { path: '/admin/reports', label: t('admin.nav.reports'), icon: '🚨' },
    { path: '/admin/users', label: t('admin.nav.users'), icon: '👥' },
    { path: '/admin/comments', label: t('admin.nav.comments'), icon: '💬' },
    // REQ-329: 非公開スポット（研究用・閲覧専用）。モバイルは「その他」メニューに入る（先頭 4 件は変えない）
    { path: '/admin/spots', label: t('admin.nav.spots'), icon: '🔒' },
    // REQ-330: 希少種の記録（研究と保全用・閲覧専用）。画面は src/features/fieldwork/admin/
    { path: '/admin/rare-sightings', label: t('fieldwork.admin.nav'), icon: '🔐' },
    { path: '/admin/water-reports', label: t('water.admin.nav'), icon: '💧' },
    { path: '/admin/logs', label: t('admin.nav.logs'), icon: '🗒️' },
    { path: '/admin/ai-cost', label: 'AIコスト', icon: '💰' },
    { path: '/admin/experiments', label: '実験計測', icon: '🧪' },
    { path: '/admin/kpi', label: 'KPI', icon: '📈' }, // REQ-233: 研究 KPI ダッシュボード
  ]

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.push('/admin/login')
      return
    }
    if (!isAdmin) {
      router.push('/')
    }
  }, [loading, user, isAdmin, router])

  async function handleSignOut() {
    // REQ-330: 送信待ちの確認で「やめる」を選んだらログインしたまま（画面も移らない）
    if (await signOut()) router.push('/admin/login')
  }

  function isActive(item: { path: string; exact?: boolean }) {
    if (item.exact) return pathname === item.path
    return pathname.startsWith(item.path)
  }

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-sm">{t('admin.nav.authChecking')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-56 bg-gray-800 text-white h-screen sticky top-0 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🦞</span>
            <div>
              <div className="font-bold text-sm">{t('admin.nav.title')}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${isActive(item)
                ? 'bg-gray-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <span>🚪</span>
            <span>{t('admin.nav.signOut')}</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-700 hover:text-white transition-colors mt-1"
          >
            <span>🌐</span>
            <span>{t('admin.nav.publicSite')}</span>
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* REQ-126 FR-126-06: Gemini API キー失効バナー（ヘッダー直下） */}
        <GeminiAuthBanner />
        {/* REQ-187: ルートレイアウトの <main id="main-content"> と二重にならないよう div 化。クラス・レイアウトは不変。 */}
        <div className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </div>
      </div>

      {/* Bottom tab (mobile) */}
      <MobileBottomNav
        navItems={NAV_ITEMS}
        isActive={isActive}
        onSignOut={handleSignOut}
        t={t}
      />
    </div>
  )
}

/**
 * REQ-126 FR-126-06: 直近 1 時間に Gemini API キーの認証エラーがあれば
 * ヘッダー直下に常時表示する警告バナー。クローズ可（sessionStorage 永続）。
 */
function GeminiAuthBanner() {
  const { visible, dismiss } = useGeminiAuthBanner()
  if (!visible) return null
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="gemini-auth-banner"
      className="border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <span aria-hidden="true">⚠️</span>
          <p className="font-semibold leading-relaxed">
            Gemini API キーが無効です。
            <code className="mx-1 rounded-sm bg-red-100 px-1 py-0.5 font-mono text-xs">
              docs/runbooks/gemini-key-rotation.md
            </code>
            を参照してローテーションしてください。
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="バナーを閉じる"
          data-testid="gemini-auth-banner-dismiss"
          className="self-end rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 sm:self-auto"
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
