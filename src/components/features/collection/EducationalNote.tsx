'use client'

import Link from 'next/link'
import { Info, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardCls, subheading, muted } from '@/lib/themeClasses'

interface EducationalNoteProps {
  dark: boolean
}

/**
 * REQ-250 FR-250-05: 教育メッセージ（必須・目立つ位置）。
 *
 * コレクション/水槽/図鑑が「集めて飼う」体験に読めないよう、対象が特定外来生物であること、
 * 外来生物法で飼育・運搬・放出が原則禁止であること、正しい対処（見つけたら通報・駆除）への導線を
 * 穏やかな文体（です・ます・「！」不使用）で必ず併記する。色/アイコンだけに依存せずテキストで伝える。
 */
export default function EducationalNote({ dark }: EducationalNoteProps) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('collection.edu.title')}
      className={`${cardCls(dark)} border-l-4 ${dark ? 'border-amber-500/70' : 'border-amber-400'}`}
    >
      <h2 className={`flex items-center gap-2 text-sm font-semibold mb-2 ${subheading(dark)}`}>
        <Info size={16} className={dark ? 'text-amber-400' : 'text-amber-600'} aria-hidden="true" />
        {t('collection.edu.title')}
      </h2>
      <p className={`text-sm leading-relaxed ${muted(dark)}`}>{t('collection.edu.body')}</p>
      <Link
        href="/about"
        className={`mt-3 inline-flex items-center gap-1 text-sm font-medium ${
          dark ? 'text-amber-300 hover:text-amber-200' : 'text-amber-700 hover:text-amber-800'
        }`}
      >
        {t('collection.edu.learnMore')}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}
