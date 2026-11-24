'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { detectDeviceOS, detectBrowser, type DeviceOS, type DeviceBrowser } from '@/lib/audio/inAppBrowser'

interface Props {
  onClose: () => void
  dark: boolean
}

const SUPPORTED_KEYS = ['safariIos', 'chromeAndroid', 'safariMacos', 'chromeDesktop', 'generic'] as const
type GuideKey = (typeof SUPPORTED_KEYS)[number]

function pickPrimaryGuide(os: DeviceOS, browser: DeviceBrowser): GuideKey {
  if (os === 'ios' && browser === 'safari') return 'safariIos'
  if (os === 'ios') return 'safariIos' // iOS では Chrome 含め最終的に WebKit + iOS 設定
  if (os === 'android') return 'chromeAndroid'
  if (os === 'macos' && browser === 'safari') return 'safariMacos'
  if (os === 'macos' || os === 'windows' || os === 'linux') return 'chromeDesktop'
  return 'generic'
}

// REQ-081 FR-081-05: マイク権限の OS / ブラウザ別再設定手順を表示するモーダル
export default function MicPermissionGuide({ onClose, dark }: Props) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)

  const primary = useMemo<GuideKey>(() => pickPrimaryGuide(detectDeviceOS(), detectBrowser()), [])
  const order: GuideKey[] = useMemo(() => {
    const rest = SUPPORTED_KEYS.filter((k) => k !== primary)
    return [primary, ...rest]
  }, [primary])

  // ESC で閉じる + 初期フォーカス
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    dialogRef.current?.focus()
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mic-guide-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="document"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl ${
          dark ? 'bg-slate-900 text-slate-200' : 'bg-white text-gray-800'
        }`}
      >
        <div className={`sticky top-0 flex items-center justify-between px-4 py-3 border-b ${
          dark ? 'border-slate-700 bg-slate-900' : 'border-gray-100 bg-white'
        }`}>
          <h2 id="mic-guide-title" className="text-base font-bold">
            {t('audio.permission.guideTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', { defaultValue: '閉じる' })}
            className={`p-1.5 rounded-lg transition-colors ${
              dark ? 'hover:bg-slate-800' : 'hover:bg-gray-100'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 text-sm leading-relaxed">
          <p className={dark ? 'text-slate-400' : 'text-gray-600'}>
            {t('audio.permission.guideIntro')}
          </p>

          {order.map((key, i) => (
            <section
              key={key}
              className={`rounded-lg border p-3 ${
                i === 0
                  ? dark
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-amber-300 bg-amber-50/50'
                  : dark
                    ? 'border-slate-700'
                    : 'border-gray-200'
              }`}
            >
              <h3 className="text-sm font-semibold mb-1.5">
                {i === 0 && '✨ '}
                {t(`audio.permission.guide.${key}.title`)}
              </h3>
              <p className={`text-xs whitespace-pre-line ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                {t(`audio.permission.guide.${key}.steps`)}
              </p>
            </section>
          ))}
        </div>

        <div className={`px-4 py-3 border-t ${dark ? 'border-slate-700' : 'border-gray-100'}`}>
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-colors"
          >
            {t('audio.permission.guideClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
