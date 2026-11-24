'use client'

import { usePathname, useRouter } from 'next/navigation'
import { House, Map, Plus, BookOpen, User, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'

export interface Tab {
  key: string
  icon: LucideIcon
  // REQ-183 FR-183-06: 描画時に t(tab.labelKey) で翻訳する（DrawerMenu の MAP_LAYERS.labelKey と同方式）
  labelKey: string
  path: string | null
}

/**
 * REQ-323 FR-323-01: ナビ項目の唯一の定義。
 * 1024px 以上は Header の水平ナビ、1023px 以下はこのボトムナビが同じ配列を描く。
 * 2 箇所に書くと「片方だけ増えた／語が違う」が必ず起きるので、配列とタップ挙動を共有する。
 */
export const NAV_TABS: Tab[] = [
  { key: 'home', icon: House, labelKey: 'homeHub.home', path: '/' },
  { key: 'map', icon: Map, labelKey: 'bottomNav.map', path: '/map' },
  { key: 'post', icon: Plus, labelKey: 'bottomNav.post', path: null },
  { key: 'collection', icon: BookOpen, labelKey: 'homeHub.dex', path: '/collection' },
  { key: 'mypage', icon: User, labelKey: 'bottomNav.mypage', path: '/dashboard' },
]

// REQ-320 FR-320-01: `/species` `/area` `/about` `/dataset` を追加。
// 前 4 つは sitemap.ts に載り ISR 生成される＝**検索エンジンからの着地ページ**なのに、
// ヘッダーもナビもフッターも無く、地図・投稿へ進む導線が 1 本も無かった（Round 1 採点 #1）。
// isBottomNavVisible は InstallBanner の位置決めにも使われるため、
// ここへ足すとバナー側も自動的にナビの上へ逃げる（REQ-268 FR-268-03）。
const VISIBLE_PATHS = [
  '/', '/map', '/guide', '/trends', '/ranking', '/dashboard', '/profile', '/collection',
  '/species', '/area', '/about', '/dataset',
]

// REQ-268 FR-268-03: BottomNav が表示されるパスか。グローバルな下部バナー（InstallBanner 等）が
// nav と重ならないよう同じ判定を共有する。
export function isBottomNavVisible(pathname: string): boolean {
  return VISIBLE_PATHS.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  )
}

export interface BottomNavProps {
  onPostClick: () => void
  onLoginClick: (mode: string) => void
}

/**
 * REQ-323 FR-323-01: タブのタップ挙動（投稿＝未ログインなら signup / マイページ＝未ログインなら
 * login / それ以外は遷移）。ヘッダー水平ナビとボトムナビで同じ判定を使う。
 */
export function useNavTap({ onPostClick, onLoginClick }: BottomNavProps) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isActive = (path: string | null) => {
    if (!path) return false
    return path === '/' ? pathname === '/' : pathname.startsWith(path)
  }

  const handleTap = (tab: Tab) => {
    if (tab.key === 'post') {
      if (user) {
        if (pathname === '/map') onPostClick?.()
        else router.push('/map?post=1')
      } else {
        if (pathname === '/' || pathname === '/map') onLoginClick?.('signup')
        else router.push('/?auth=signup')
      }
      return
    }
    if ((tab.key === 'mypage' || tab.key === 'collection') && !user) {
      if (pathname === '/' || pathname === '/map') onLoginClick?.('login')
      else router.push('/?auth=login')
      return
    }
    router.push(tab.path!)
  }

  return { isActive, handleTap }
}

export default function BottomNav({ onPostClick, onLoginClick }: BottomNavProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const pathname = usePathname()
  const { isActive, handleTap } = useNavTap({ onPostClick, onLoginClick })

  if (!isBottomNavVisible(pathname)) return null

  return (
    <nav
      // REQ-323 FR-323-01: 1024px 以上ではヘッダー水平ナビへ切り替えるのでボトムタブは出さない。
      // 旧実装は全幅に見えて中身が `max-w-md mx-auto`（448px）だったため、1440/768 では
      // 画面下中央に 386px の「浮いた島」が残っていた（Round 4 採点 🔴）。
      // REQ-320 FR-320-01 が対象パスを広げたときにレスポンシブ分岐を入れ損ねた副作用で、
      // 直し方は「対象パスを狭める」ではなく「幅で出し分ける」。isBottomNavVisible は変えない。
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-420 border-t ${
        dark
          ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80'
          : 'bg-white/95 backdrop-blur-md border-gray-200'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* 5等分し、各タブの44px以上の操作域と端末の下部余白を確保する。 */}
      <div className="grid grid-cols-5 items-center h-16 px-1 mx-auto">
        {NAV_TABS.map((tab) => {
          const active = isActive(tab.path)
          const Icon = tab.icon

          if (tab.key === 'post') {
            return (
              <button
                key={tab.key}
                onClick={() => handleTap(tab)}
                // REQ-321 FR-321-06: グリッドの 3 列目いっぱいに広がり、その中で FAB が中央に来る。
                className="flex flex-col items-center justify-center gap-0.5 min-w-0 min-h-14"
                aria-label={t('bottomNav.postAction')}
              >
                {/* REQ-322 FR-322-03: 主 CTA のグラデ（下端 rose-600 #e11d48）を廃し
                    ブランド赤の単色へ。同じ「押せる赤」が 2 種類の意匠に割れていた（Round 3 採点 #7）。 */}
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center active:scale-95 transition-transform">
                  <Plus size={24} className="text-white" strokeWidth={2} />
                </div>
                <span className={`text-[11px] leading-tight font-semibold ${dark ? 'text-red-400' : 'text-red-600'}`}>
                  {t('bottomNav.post')}
                </span>
              </button>
            )
          }

          return (
            <button
              key={tab.key}
              aria-current={active ? 'page' : undefined}
              onClick={() => handleTap(tab)}
              // REQ-180 a11y(color-contrast)/REQ-224: 11px ラベルは白地で 4.5:1 必須。
              // 旧 light: active=text-red-500(#ef4444→3.76:1) / inactive=text-gray-400(#9ca3af→2.53:1) は不足。
              // active=red-600(#dc2626→4.83:1)、inactive=gray-500(#6b7280→4.83:1) へ底上げ（dark は既存で合格のため不変）。
              // REQ-321 FR-321-06: px-3 → px-1（上の grid のコメント参照）。
              className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-w-0 min-h-14 transition-colors ${
                active
                  ? dark ? 'text-red-400' : 'text-red-600'
                  : dark ? 'text-slate-400' : 'text-gray-500'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className={`text-[11px] leading-tight ${active ? 'font-semibold' : 'font-medium'}`}>
                {t(tab.labelKey)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
