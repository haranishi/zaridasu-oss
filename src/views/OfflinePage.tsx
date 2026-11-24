'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'

export default function OfflinePage() {
  const { dark } = useTheme()
  const { t } = useTranslation()

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen gap-6 px-4 ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <div className={`flex flex-col items-center gap-4 text-center max-w-sm`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${dark ? 'bg-slate-800' : 'bg-gray-100'}`}>
          <WifiOff size={28} className={dark ? 'text-slate-400' : 'text-gray-400'} />
        </div>

        <div>
          <h1 className={`text-xl font-bold mb-2 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>
            {t('offline.title')}
          </h1>
          <p className={`text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
            {t('offline.body1')}<br />
            {t('offline.body2')}
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 bg-accent text-white font-bold py-3 rounded-xl hover:bg-(--color-accent-hover) transition-all shadow-md shadow-red-500/20 active:scale-[0.98]"
          >
            <RefreshCw size={16} />
            {t('offline.reconnect')}
          </button>
          <Link
            href="/"
            className={`text-center py-2.5 rounded-xl text-sm transition-colors ${
              dark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t('offline.backToTop')}
          </Link>
        </div>
      </div>

      <p className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
        🦞 ザリダス
      </p>
    </div>
  )
}
