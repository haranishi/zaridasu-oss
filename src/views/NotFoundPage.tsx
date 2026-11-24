'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import CrayfishIllustration from '@/components/ui/CrayfishIllustration'
import { useTheme } from '@/context/ThemeContext'

// REQ-282: 文言はあえてハードコード日本語のままにする（t() 化しない）。
//   - not-found は App Router のグローバル 404。i18n の言語検出は localStorage→navigator の順で、
//     初回訪問（localStorage 空）では navigator.language に従うため、SSR は日本語・クライアントは
//     ブラウザ言語（例: en）へ切り替わる「言語フラッシュ」が起きる。
//   - e2e（tests/e2e/error-boundary.spec.ts / REQ-267 FR-267-02）は「404 が日本語表示される」ことを
//     保証する。兄弟の app/error.tsx・global-error.tsx も同じ理由でハードコード日本語。
//   REQ-277 で一度 t() 化したが、上記の保証と一貫性のため差し戻した（i18n 化するなら 404 の
//   言語方針と e2e の見直しを伴う別 REQ で行うこと）。
export default function NotFoundPage() {
  const { dark } = useTheme()
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen ${dark ? 'bg-gray-900' : 'bg-gray-50'} px-4 text-center`}>
      <CrayfishIllustration className="w-56 sm:w-72 mb-6 opacity-80 drop-shadow-md" />
      <p className="text-5xl font-black text-red-200 -mt-2 mb-4 tracking-widest">404</p>
      <h1 className={`text-xl font-bold ${dark ? 'text-gray-200' : 'text-gray-700'} mb-2`}>ページが見つかりません</h1>
      <p className={`${dark ? 'text-gray-400' : 'text-gray-400'} text-sm mb-8 max-w-xs`}>
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="flex items-center gap-1.5 bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-md"
      >
        <ArrowLeft size={16} />
        トップに戻る
      </Link>
    </div>
  )
}
