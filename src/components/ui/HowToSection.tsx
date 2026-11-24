'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, ClipboardList, Map, MessageSquare, BarChart2, Download } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useTranslation } from 'react-i18next'

interface HowToSectionProps {
  onSignupClick?: () => void
}

export default function HowToSection({ onSignupClick }: HowToSectionProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  // モバイルではデフォルト閉じ、デスクトップでは開く
  const [open, setOpen] = useState(() => typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false)

  const STEPS = [
    {
      icon: <MapPin size={20} />,
      color: 'from-red-500 to-rose-600',
      title: t('howTo.step1Title'),
      desc: t('howTo.step1Desc'),
    },
    {
      icon: <ClipboardList size={20} />,
      color: 'from-orange-400 to-amber-500',
      title: t('howTo.step2Title'),
      desc: t('howTo.step2Desc'),
    },
    {
      icon: <Map size={20} />,
      color: 'from-emerald-500 to-green-600',
      title: t('howTo.step3Title'),
      desc: t('howTo.step3Desc'),
    },
  ]

  const MEMBER_BENEFITS = [
    { icon: <MessageSquare size={15} />, text: t('howTo.benefit1') },
    { icon: <BarChart2 size={15} />, text: t('howTo.benefit2') },
    { icon: <Download size={15} />, text: t('howTo.benefit3') },
  ]

  return (
    <div className={`shrink-0 border-b ${dark ? 'border-slate-800 bg-slate-900/80' : 'border-gray-100 bg-white'}`}>
      {/* アコーディオンヘッダー */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${
          dark ? 'text-slate-300 hover:bg-slate-800/60' : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{'\u{1F99E}\u{1F438}'}</span>
          {t('howTo.title')}
        </span>
        {open
          ? <ChevronUp size={16} className={dark ? 'text-slate-400' : 'text-gray-400'} />
          : <ChevronDown size={16} className={dark ? 'text-slate-400' : 'text-gray-400'} />
        }
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 sm:space-y-3">
          {/* 使い方ステップ — モバイルは横並びコンパクト、sm以上はカード */}
          <div className="hidden sm:grid sm:grid-cols-3 gap-2">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 flex flex-col items-center text-center gap-1.5 ${
                  dark ? 'bg-slate-800/70' : 'bg-gray-50'
                }`}
              >
                <div className={`w-8 h-8 rounded-full bg-linear-to-br ${s.color} flex items-center justify-center text-white shadow-xs`}>
                  {s.icon}
                </div>
                <span className={`text-xs font-bold ${dark ? 'text-slate-200' : 'text-gray-700'}`}>
                  STEP {i + 1}
                </span>
                <span className={`text-xs font-semibold leading-tight ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                  {s.title}
                </span>
                <span className={`text-xs leading-tight ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                  {s.desc}
                </span>
              </div>
            ))}
          </div>
          {/* モバイル用: 横一列コンパクト */}
          <div className="sm:hidden flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`flex-1 rounded-lg px-2 py-2 flex flex-col items-center text-center gap-1 ${
                  dark ? 'bg-slate-800/70' : 'bg-gray-50'
                }`}
              >
                <div className={`w-6 h-6 rounded-full bg-linear-to-br ${s.color} flex items-center justify-center text-white`}>
                  {React.cloneElement(s.icon, { size: 13 })}
                </div>
                <span className={`text-[10px] font-bold leading-none ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                  {s.title}
                </span>
              </div>
            ))}
          </div>

          {/* 会員特典（onSignupClick が渡された場合＝未ログイン時のみ表示） */}
          {onSignupClick && (
            <div className={`rounded-xl border px-3 py-2 sm:px-4 sm:py-3 ${
              dark ? 'border-slate-700 bg-slate-800/40' : 'border-red-100 bg-red-50/60'
            }`}>
              <p className={`text-xs font-bold mb-1.5 sm:mb-2 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                {t('howTo.benefitsTitle')}
              </p>
              <div className="hidden sm:flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
                {MEMBER_BENEFITS.map((b, i) => (
                  <div key={i} className={`flex items-center gap-1.5 text-xs ${dark ? 'text-slate-400' : 'text-gray-600'}`}>
                    <span className="text-red-500">{b.icon}</span>
                    {b.text}
                  </div>
                ))}
              </div>
              <button
                onClick={onSignupClick}
                className="w-full bg-accent text-white text-xs sm:text-sm font-bold py-1.5 sm:py-2 rounded-xl hover:bg-(--color-accent-hover) transition-all shadow-xs shadow-red-500/20 active:scale-[0.98]"
              >
                {t('howTo.signupButton')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
