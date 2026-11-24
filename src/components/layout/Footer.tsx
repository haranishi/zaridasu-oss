'use client'

import Link from 'next/link'
import { useTheme } from '@/context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { FEEDBACK_FORM_URL } from '@/lib/constants'

export default function Footer() {
  const { dark } = useTheme()
  const { t } = useTranslation()
  // REQ-323 FR-323-07: 390px 実測でフッターのリンクは 21px 高しか無く、7 本すべてが
  // タップ域 44px 未満だった（AC-05 は button / a を例外なく見る）。
  // 擬似要素でヒットエリアだけ広げる手（REQ-203）は、行間 8px のこの 2 段組では
  // **上下の行の当たり判定が重なる**ので使えない。リンク自体を 44px にして、
  // 増えたぶんは行間・外側パディングを詰めて相殺する。
  // hover の赤は red-500(3.76:1) → red-600(4.83:1)。リンク色は「押せる赤」の 1 系統に合わせる。
  const linkCls = `inline-flex items-center justify-center min-h-11 min-w-11 px-1 transition-colors ${
    dark ? 'text-slate-400 hover:text-red-400' : 'hover:text-red-600'
  }`

  return (
    <footer className={`border-t py-3 px-4 text-center text-sm ${dark ? 'bg-slate-900 border-slate-800/60 text-slate-400' : 'bg-white border-gray-200 text-gray-500'}`}>
      {/* 主要ページリンク */}
      <div className="flex flex-wrap justify-center gap-x-4">
        <Link href="/trends" className={linkCls}>{t('nav.trends')}</Link>
        {/* REQ-277: 兄弟リンクと同様に t() 経由へ（言語切替後も日本語が残っていた） */}
        <Link href="/ranking" className={linkCls}>{t('nav.ranking')}</Link>
        <Link href="/area" className={linkCls}>{t('nav.area')}</Link>
        <Link href="/about" className={linkCls}>{t('footer.aboutService')}</Link>
      </div>
      {/* サービスリンク */}
      <div className="flex flex-wrap justify-center gap-x-4 mb-2">
        <Link href="/terms" className={linkCls}>{t('footer.terms')}</Link>
        <Link href="/privacy" className={linkCls}>{t('footer.privacy')}</Link>
        <a
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkCls}
        >
          {t('footer.contact')}
        </a>
      </div>
      {/* REQ-318 FR-318-11: 「© 2024」が固定文言で 4 言語とも取り残されていた。
          年は文言ではなく実行時の値なので `{{year}}` 補間へ移す。
          静的プリレンダ（ビルド時の年）とクライアント（現在の年）は年をまたぐ瞬間だけ
          食い違うので、その 1 点のみ suppressHydrationWarning で許容する。 */}
      <p suppressHydrationWarning className={`text-xs ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
        {t('footer.copyright', { year: new Date().getFullYear() })}
      </p>
    </footer>
  )
}
