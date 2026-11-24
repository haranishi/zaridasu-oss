'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BookOpen, HelpCircle, LogOut, Sun, Moon, ShieldCheck, FileText, Lock, Mail, X, Languages, Flame, Layers, Search, BarChart3, Trophy, Map } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useMapSettings } from '@/context/MapSettingsContext'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { useProgress } from '@/hooks/useProfile'
import { useUnlocks } from '@/hooks/useUnlocks'
import UnlockTeaser from '@/components/ui/UnlockTeaser'
import { MAP_LAYERS, FEEDBACK_FORM_URL } from '@/lib/constants'
import { requestIntroStory } from '@/lib/introStorage'

const LANGS = [
  { code: 'ja', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'en', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'zh', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'ko', flag: '\u{1F1F0}\u{1F1F7}' },
]

const DRAWER_TRANSITION_MS = 300

interface DrawerMenuProps {
  open: boolean
  onClose: () => void
  onPostClick: () => void
  onLoginClick: (mode: string) => void
  // REQ-090: 「調査依頼を立てる」を発火する。未指定なら項目を出さない
  onSurveyClick?: () => void
}

export default function DrawerMenu({ open, onClose, onPostClick, onLoginClick, onSurveyClick }: DrawerMenuProps) {
  const { t, i18n } = useTranslation()
  const { user, signOut, isAdmin } = useAuth()
  const { dark, toggle } = useTheme()
  const { showHeatmap, setShowHeatmap, activeLayerId, setActiveLayerId, defaultLayerId, setDefaultLayerId } = useMapSettings()
  const toast = useToastContext()
  const defaultLayer = MAP_LAYERS.find((layer) => layer.id === defaultLayerId) ?? MAP_LAYERS[0]
  // REQ-249: ヒートマップ（地図の拡張＝分析レイヤー）はレベル連動で解放する。地図の「閲覧」自体は
  // 中核貢献のため常時開放（マーカー/凡例/現在地/タイル切替は非ゲート）。匿名/未取得はフェイルオープン。
  // REQ-278 FR-278-01: DrawerMenu は初回の開操作で読み込み、その後は閉じてもマウントを保つ。
  // 閉じた状態で get_user_progress RPC を発火させず、開いた時だけフェッチする
  // （閉じても progress は保持されるため、開閉のたびの再フェッチはしない）。
  const { progress } = useProgress(open ? user?.id : undefined)
  const { isUnlocked, unlockLevelOf } = useUnlocks(progress?.level)
  const heatmapUnlocked = isUnlocked('heatmap')
  const heatmapUnlockLevel = unlockLevelOf('heatmap') ?? 0
  const handleClose = useCallback(() => { if (open) onClose() }, [open, onClose])
  const drawerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEscapeKey(handleClose)
  useFocusTrap(drawerRef, open && mounted)

  useEffect(() => {
    let firstFrame: number | undefined
    let secondFrame: number | undefined
    let unmountTimer: ReturnType<typeof setTimeout> | undefined

    if (open) {
      setMounted(true)
      // マウント直後の -translate-x-full を一度描画してからスライドインさせる。
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
      if (mounted) {
        unmountTimer = setTimeout(() => setMounted(false), DRAWER_TRANSITION_MS)
      }
    }

    return () => {
      if (firstFrame !== undefined) cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame)
      if (unmountTimer !== undefined) clearTimeout(unmountTimer)
    }
  }, [open, mounted])

  return mounted ? (
    <>
      {/* オーバーレイ */}
      <div
        className={`fixed inset-0 bg-black/50 z-438 transition-opacity duration-300 ${
          visible && open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ドロワー本体 — REQ-066: 左からスライドイン */}
      <div
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full w-4/5 max-w-xs z-440 flex flex-col transition-transform duration-300 ease-out ${
          visible && open ? 'translate-x-0' : '-translate-x-full'
        } ${dark ? 'bg-slate-900 border-r border-slate-700/60' : 'bg-white border-r border-gray-100'}`}
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label={t('drawer.settingsMenu')}
        aria-hidden={open ? undefined : true}
        inert={!open}
      >
        {/* ドロワーヘッダー */}
        <div className={`flex items-center justify-between px-5 h-12 shrink-0 border-b ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
          <span className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('drawer.menu')}</span>
          {/* REQ-323 FR-323-07: 390px 実測 36×36px。 */}
          <button
            onClick={onClose}
            className={`inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg transition-colors ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'}`}
            aria-label={t('header.menuClose')}
          >
            <X size={20} />
          </button>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="flex-1 overflow-y-auto py-3">

          {/* ユーザーエリア */}
          <div className="px-4 mb-3">
            {user ? (
              <div className={`rounded-xl border overflow-hidden ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
                <div className={`flex items-center gap-3 px-4 py-3.5 border-b ${dark ? 'bg-slate-800/50 border-slate-700/60' : 'bg-gray-50 border-gray-100'}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ring-1 shrink-0 ${
                    // REQ-325 FR-325-01: 頭文字は淡赤地の上の文字。red-600 は 4.41:1 で AA 未満、
                    // brand-700 で 5.91:1。以下 red-50 面の文字はすべて同じ規則。
                    dark ? 'bg-red-500/20 ring-red-500/40 text-red-400' : 'bg-red-50 ring-red-200 text-brand-700'
                  }`}>
                    {user.email?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className={`text-xs truncate ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{user.email}</span>
                </div>
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-4 text-sm font-medium transition-colors border-b ${
                      dark ? 'text-amber-400 hover:bg-slate-800 border-slate-700/60' : 'text-amber-600 hover:bg-amber-50 border-gray-100'
                    }`}
                  >
                    <ShieldCheck size={18} />
                    {t('nav.admin')}
                  </Link>
                )}
                <button
                  onClick={() => { void signOut(); onClose() }}
                  className={`flex items-center gap-3 w-full px-4 py-4 text-sm font-medium text-red-500 transition-colors ${
                    dark ? 'hover:bg-slate-800' : 'hover:bg-red-50'
                  }`}
                >
                  <LogOut size={18} />
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className={`rounded-xl border overflow-hidden ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
                <button
                  onClick={() => { onLoginClick('login'); onClose() }}
                  className={`flex items-center justify-center w-full px-4 py-4 text-sm font-bold transition-colors border-b ${
                    dark ? 'text-slate-200 hover:bg-slate-800 border-slate-700/60' : 'text-gray-700 hover:bg-gray-50 border-gray-100'
                  }`}
                >
                  {t('nav.login')}
                </button>
                <button
                  onClick={() => { onLoginClick('signup'); onClose() }}
                  className={`flex items-center justify-center w-full px-4 py-4 text-sm font-bold transition-colors ${
                    dark ? 'text-red-400 hover:bg-slate-800' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  {t('nav.signup')}
                </button>
              </div>
            )}
          </div>

          {/* REQ-066: マップ設定（ヒートマップ・地図タイプ） */}
          <div className={`mx-4 mb-3 rounded-xl border overflow-hidden ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
            <div className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${dark ? 'bg-slate-800/50 text-slate-400' : 'bg-gray-50 text-gray-500'}`}>
              {t('drawer.mapSettings')}
            </div>
            {/* ヒートマップトグル（REQ-249: ロック時は非表示にせず「無効＋解放予告」で見せる） */}
            <button
              onClick={() => { if (heatmapUnlocked) setShowHeatmap(!showHeatmap) }}
              disabled={!heatmapUnlocked}
              aria-disabled={!heatmapUnlocked}
              aria-describedby={heatmapUnlocked ? undefined : 'drawer-heatmap-lock'}
              className={`flex items-center justify-between w-full px-4 py-3.5 text-sm font-medium border-b transition-colors ${
                dark ? 'text-slate-200 hover:bg-slate-800 border-slate-700/60' : 'text-gray-700 hover:bg-gray-50 border-gray-100'
              } ${heatmapUnlocked ? '' : 'opacity-60 cursor-not-allowed hover:bg-transparent'}`}
              aria-pressed={heatmapUnlocked ? showHeatmap : undefined}
            >
              <span className="flex items-center gap-3">
                <Flame size={18} className={heatmapUnlocked && showHeatmap ? 'text-orange-500' : dark ? 'text-slate-400' : 'text-gray-400'} />
                {t('drawer.heatmap')}
              </span>
              {heatmapUnlocked ? (
                <span
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                    showHeatmap ? 'bg-orange-500' : dark ? 'bg-slate-700' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      showHeatmap ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              ) : (
                // a11y(NFR-249-04): 状態を色/形だけでなくテキストで示す（「レベル N で解放」）。
                <span className={`text-xs font-semibold ${dark ? 'text-amber-300' : 'text-amber-600'}`}>
                  {t('unlocks.lockedShort', { level: heatmapUnlockLevel })}
                </span>
              )}
            </button>
            {!heatmapUnlocked && (
              <div className={`px-4 py-2.5 border-b ${dark ? 'border-slate-700/60 bg-slate-800/30' : 'border-gray-100 bg-gray-50/60'}`}>
                <span id="drawer-heatmap-lock">
                  <UnlockTeaser unlockLevel={heatmapUnlockLevel} currentXp={progress?.xp} dark={dark} />
                </span>
              </div>
            )}
            {/* 地図タイプ */}
            <div className="px-4 py-3">
              <div className={`flex items-center gap-2 mb-2 text-xs font-medium ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                <Layers size={14} />
                {t('drawer.mapType')}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MAP_LAYERS.map((layer) => (
                  <button
                    key={layer.id}
                    onClick={() => setActiveLayerId(layer.id)}
                    aria-pressed={activeLayerId === layer.id}
                    // REQ-323 FR-323-07: 390px 実測 78×36px。min-h-11 で 44px にする。
                    className={`inline-flex items-center justify-center min-h-11 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      activeLayerId === layer.id
                        ? dark ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-red-50 text-brand-700 border-red-200'
                        : dark ? 'text-slate-300 border-slate-700/60 hover:bg-slate-800' : 'text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {t(layer.labelKey)}
                  </button>
                ))}
              </div>
              <p className={`mt-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                {t('drawer.defaultMap', { name: t(defaultLayer?.labelKey ?? 'map.layers.osm') })}
              </p>
              <button
                type="button"
                disabled={activeLayerId === defaultLayerId}
                onClick={() => {
                  if (setDefaultLayerId(activeLayerId)) toast.success(t('drawer.defaultMapSaved'))
                  else toast.error(t('drawer.defaultMapSaveError'))
                }}
                className={`mt-2 w-full min-h-11 px-3 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 disabled:cursor-default ${
                  dark ? 'text-slate-200 border-slate-700/60 enabled:hover:bg-slate-800' : 'text-gray-700 border-gray-200 enabled:hover:bg-gray-50'
                }`}
              >
                {t(activeLayerId === defaultLayerId ? 'drawer.isDefaultMap' : 'drawer.setDefaultMap')}
              </button>
              <p className={`mt-1.5 text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                {t('drawer.defaultMapHint')}
              </p>
            </div>
          </div>

          {/* その他リンク */}
          <nav className={`mx-4 rounded-xl overflow-hidden border ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
            {[{ href: '/map', icon: Map, label: 'bottomNav.map' }, { href: '/trends', icon: BarChart3, label: 'bottomNav.trends' }, { href: '/ranking', icon: Trophy, label: 'bottomNav.ranking' }, { href: '/guide', icon: BookOpen, label: 'homeHub.guideTitle' }].map(item => <Link key={item.href} href={item.href} onClick={onClose} className={`flex items-center gap-3 px-4 py-4 text-sm font-medium border-b ${dark ? 'text-slate-200 border-slate-700/60 hover:bg-slate-800' : 'text-gray-700 border-gray-100 hover:bg-gray-50'}`}><item.icon size={18} />{t(item.label)}</Link>)}
            {onSurveyClick && (
              <button
                type="button"
                onClick={() => { onSurveyClick(); onClose() }}
                aria-label={t('drawer.createSurvey')}
                className={`flex items-center gap-3 w-full px-4 py-4 text-sm font-medium transition-colors border-b ${
                  dark ? 'text-amber-300 hover:bg-slate-800 border-slate-700/60' : 'text-amber-700 hover:bg-amber-50 border-gray-100'
                }`}
              >
                <Search size={18} className="text-amber-500" />
                {t('drawer.createSurvey')}
              </button>
            )}
            <Link
              href="/requests"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-4 text-sm font-medium transition-colors border-b ${
                dark ? 'text-slate-200 hover:bg-slate-800 border-slate-700/60' : 'text-gray-700 hover:bg-gray-50 border-gray-100'
              }`}
            >
              <Search size={18} className={dark ? 'text-slate-400' : 'text-gray-400'} />
              {t('drawer.surveyList')}
            </Link>
            {/* REQ-284 FR-284-10 / AC-05: 誘いポップアップを見ていなくても、opt-out 済みでも
                ここからいつでもストーリーを読み直せる。ページ遷移ではなくモーダルで開く
                （実体は providers.tsx の OnboardingHost が 1 つだけ持つ）。 */}
            <button
              type="button"
              onClick={() => { requestIntroStory({ onPostClick }); onClose() }}
              data-testid="drawer-intro"
              className={`flex items-center gap-3 w-full px-4 py-4 text-sm font-medium transition-colors border-b ${
                dark ? 'text-slate-200 hover:bg-slate-800 border-slate-700/60' : 'text-gray-700 hover:bg-gray-50 border-gray-100'
              }`}
            >
              <BookOpen size={18} className={dark ? 'text-slate-400' : 'text-gray-400'} />
              {t('intro.drawer.label')}
            </button>
            <Link
              href="/about"
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-4 text-sm font-medium transition-colors border-b ${
                dark ? 'text-slate-200 hover:bg-slate-800 border-slate-700/60' : 'text-gray-700 hover:bg-gray-50 border-gray-100'
              }`}
            >
              <HelpCircle size={18} className={dark ? 'text-slate-400' : 'text-gray-400'} />
              {t('nav.about')}
            </Link>
          </nav>
        </div>

        {/* ドロワーフッター */}
        <div className={`shrink-0 px-5 py-4 pb-safe border-t ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
          {/* 言語切替 */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <Languages size={15} className={dark ? 'text-slate-400' : 'text-gray-400'} />
            <div className="flex gap-1 flex-wrap">
              {LANGS.map(({ code, flag }) => (
                <button
                  key={code}
                  onClick={() => i18n.changeLanguage(code)}
                  // REQ-323 FR-323-07: 390px 実測 高さ34px。min-h-11 で 44px にする。
                  className={`flex items-center justify-center gap-1 min-h-11 text-xs px-3 py-2 rounded-lg font-medium transition-colors ${
                    i18n.language === code
                      ? 'bg-brand-600 text-white'
                      : dark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <span>{flag}</span>
                  <span>{t(`lang.${code}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={toggle}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors mb-3 ${
              dark ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
            {dark ? t('common.lightMode') : t('common.darkMode')}
          </button>
          <div className="flex justify-center gap-4">
            <Link
              href="/terms"
              onClick={onClose}
              className={`inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-1 text-xs transition-colors ${dark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <FileText size={11} />
              {t('nav.terms')}
            </Link>
            <Link
              href="/privacy"
              onClick={onClose}
              className={`inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-1 text-xs transition-colors ${dark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Lock size={11} />
              {t('nav.privacy')}
            </Link>
            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center justify-center gap-1 min-h-11 min-w-11 px-1 text-xs transition-colors ${dark ? 'text-slate-400 hover:text-slate-300' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Mail size={11} />
              {t('nav.contact')}
            </a>
          </div>
        </div>
      </div>
    </>
  ) : null
}
