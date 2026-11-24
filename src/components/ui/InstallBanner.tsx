'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { X, Download, Share } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { isBottomNavVisible } from '@/components/layout/BottomNav'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useIntroOverlayOpen } from '@/hooks/useIntroStory'
import { isBannerOptedOut, markBannerOptedOut, readLocal, writeLocal, INSTALL_BANNER_OPTOUT_KEY } from '@/lib/introStorage'
import { trackEvent } from '@/lib/analytics'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'install_banner_dismissed_at'
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 7日間
const SHOW_DELAY_MS = 15 * 1000 // 15秒後（SignupBannerより後）

function isIOS(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  )
}

interface IOSGuideModalProps {
  onClose: () => void
  dark: boolean
}

function IOSGuideModal({ onClose, dark }: IOSGuideModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  useFocusTrap(dialogRef)
  useEscapeKey(onClose)

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-ios-guide-title"
      className="fixed inset-0 z-430 flex items-end justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('install.close')}
        className="fixed inset-0 cursor-default border-0 bg-transparent p-0"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-2xl p-5 ${
          dark ? 'bg-slate-900 border border-slate-700' : 'bg-white'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="install-ios-guide-title" className={`font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            {t('install.iosTitle')}
          </h3>
          <button type="button" onClick={onClose} aria-label={t('install.close')} className={dark ? 'text-slate-400' : 'text-gray-400'}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          {[
            { step: '1', icon: '\u2191', text: t('install.iosStep1') },
            { step: '2', icon: '+', text: t('install.iosStep2') },
            { step: '3', icon: '\u2713', text: t('install.iosStep3') },
          ].map((item) => (
            <div key={item.step} className="flex items-center gap-3">
              {/* REQ-325 FR-325-01: 手順番号は淡赤地（red-100 #fee2e2）の上の文字。
                  red-600 は 3.95:1 で AA 未満なので brand-700(#b91c1c・5.30:1) にする。 */}
              <div className="w-7 h-7 rounded-full bg-red-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                {item.step}
              </div>
              <p className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{item.text}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('install.gotIt')}
          className="mt-5 w-full bg-accent text-white font-bold py-2.5 rounded-xl text-sm"
        >
          {t('install.gotIt')}
        </button>
      </div>
    </div>
  )
}

export default function InstallBanner() {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const ios = isIOS()
  // REQ-268 FR-268-03: BottomNav 表示ページでは nav の上（4rem 上）にずらして重なりを避ける。
  // nav 非表示ページでは下端に置く（一律オフセットだと隙間が空くため出し分ける）。
  const pathname = usePathname()
  const aboveNav = isBottomNavVisible(pathname ?? '')
  // REQ-284 FR-284-14: 誘いポップアップ／ストーリー本体の表示中は出さない（多重ポップアップ禁止）。
  const introOverlayOpen = useIntroOverlayOpen()

  useEffect(() => {
    if (isInStandaloneMode()) return
    // REQ-284 FR-284-13: 恒久 opt-out は表示判定の最初で return する（7日経過でも復活させない）。
    if (isBannerOptedOut(INSTALL_BANNER_OPTOUT_KEY)) return

    // REQ-284 FR-284-15: localStorage が使えない環境でも例外で UI を壊さない。
    const dismissed = readLocal(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION_MS) return

    if (ios) {
      const timer = setTimeout(() => {
        setShowBanner(true)
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      }, SHOW_DELAY_MS)
      return () => clearTimeout(timer)
    }

    function handlePrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => {
        setShowBanner(true)
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      }, SHOW_DELAY_MS)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [ios])

  function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      deferredPrompt.userChoice.then(() => {
        setDeferredPrompt(null)
        handleDismiss()
      })
    } else if (ios) {
      setShowIOSGuide(true)
    }
  }

  function handleDismiss() {
    setVisible(false)
    writeLocal(DISMISS_KEY, String(Date.now()))
    setTimeout(() => setShowBanner(false), 300)
  }

  // REQ-284 FR-284-13 / AC-07: 恒久的に断る。期限付きスヌーズ（× / あとで）とは別の明示操作。
  function handleNeverShowAgain() {
    markBannerOptedOut(INSTALL_BANNER_OPTOUT_KEY)
    trackEvent('banner_optout', { banner: 'install' })
    setVisible(false)
    setTimeout(() => setShowBanner(false), 300)
  }

  if (!showBanner) return null
  if (!deferredPrompt && !ios) return null
  // AC-06: 紹介系オーバーレイを閉じたら従来どおりの条件で再表示される（showBanner は保持する）。
  if (introOverlayOpen) return null

  return (
    <>
      <div
        // 水域の一覧が開いている間は、一覧を覆うので globals.css が [data-bottom-promo] を隠す。
        data-bottom-promo
        className={`fixed left-0 right-0 z-40 p-3 transition-transform duration-300 ease-out ${
          aboveNav ? '' : 'bottom-0'
        } ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={
          aboveNav
            ? { bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }
            : { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }
        }
      >
        <div className={`max-w-lg mx-auto rounded-2xl shadow-2xl border p-4 ${
          dark
            ? 'bg-slate-900 border-slate-700 shadow-black/60'
            : 'bg-white border-gray-200 shadow-gray-300/50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{'\u{1F99E}'}</span>
              <p className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
                {t('install.useAsApp')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('install.close')}
              className={`rounded-full p-1.5 transition-colors ${
                dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <X size={15} />
            </button>
          </div>
          <p className={`text-xs mb-3 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            {t('install.description')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleInstall}
              aria-label={ios ? t('install.seeHow') : t('install.addToHome')}
              className="flex-1 flex items-center justify-center gap-1.5 bg-accent text-white text-sm font-bold py-2.5 rounded-xl hover:bg-(--color-accent-hover) transition-all shadow-md shadow-red-500/20 active:scale-[0.98]"
            >
              {ios ? <Share size={14} /> : <Download size={14} />}
              {ios ? t('install.seeHow') : t('install.addToHome')}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label={t('install.notNow')}
              // REQ-325 FR-325-01: 平常時は白カード上（gray-500 = 4.83:1）で通っていたが、
              // hover で下地が gray-100(#f3f4f6) に変わった瞬間 4.39:1 で AA を割っていた。
              // 「押している最中だけ読みにくい」は目視では気づけないので、下地が変わる側に合わせて
              // 常時 gray-600(#4b5563・gray-100 上 6.87:1) にする。
              className={`px-4 py-2.5 rounded-xl text-sm transition-colors ${
                dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('install.notNow')}
            </button>
          </div>

          {/* REQ-284 FR-284-13: 恒久的な「今後表示しない」 */}
          <div className="text-center">
            <button
              type="button"
              onClick={handleNeverShowAgain}
              data-testid="install-banner-never"
              className={`min-h-11 px-2 text-xs underline transition-colors ${
                dark ? 'text-slate-500 hover:text-slate-400' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {t('banner.neverShowAgain')}
            </button>
          </div>
        </div>
      </div>

      {showIOSGuide && (
        <IOSGuideModal onClose={() => setShowIOSGuide(false)} dark={dark} />
      )}
    </>
  )
}
