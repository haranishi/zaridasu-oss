'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslation } from 'react-i18next'
import { Box, Undo2 } from 'lucide-react'
import CrayfishIllustration from '@/components/ui/CrayfishIllustration'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { isWebGLAvailable } from '@/lib/webgl'
import { prefersReducedMotion } from '@/lib/achievement'
import { muted, faint } from '@/lib/themeClasses'

/**
 * REQ-250 FR-250-04 フェーズ2: 3D ザリガニ・ビューアの「入れ物」（軽量・分離の要）。
 *
 * ★ここには three / react-three-fiber を import しない★——重い実体は Crayfish3DViewer に閉じ込め、
 * 「3Dで見る」クリック時に dynamic() で初めて読み込む（load-on-interaction / NFR-250-01）。
 * これにより /collection の初期ロードにも他ルートにも 3D スタックは載らない。
 *
 * 2D フォールバック（常に安全な基準線 / FR-250-04(iii)）:
 *   - 未クリック（既定）      → 2D SVG（CrayfishIllustration）
 *   - WebGL 非対応            → 「3Dで見る」ボタンを出さない（2D のまま）
 *   - 読み込み中             → 2D プレースホルダ（dynamic の loading）
 *   - 読み込み/描画の失敗     → ErrorBoundary が 2D＋再試行にフォールバック
 * reduced-motion: 既定は 2D、3D を開いても自動回転しない（Crayfish3DViewer 側で無効化）。
 * CLS 安全（FR-250-04(iv)）: 2D/3D/読み込み中/エラーのすべてが同一の寸法予約ボックスに収まる。
 */

// dynamic() の import ファクトリはコンポーネントが実際にマウントされるまで呼ばれない。
// = show3D が true になる（＝ボタンクリック）まで three チャンクは取得されない。
const Crayfish3DViewer = dynamic(() => import('./Crayfish3DViewer'), {
  ssr: false,
  loading: () => <ViewerLoading />,
})

interface Crayfish3DStageProps {
  /** 3D モデルの基調色（SpeciesOption.color / 「種ごとに色分け」）。 */
  color: string
  dark: boolean
}

/** 読み込み中プレースホルダ（2D＋控えめなラベル。ボックス全面を占有＝CLS 安全）。 */
function ViewerLoading() {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center" role="status">
      <CrayfishIllustration className="w-36 h-auto opacity-70 drop-shadow-sm" />
      <p className="text-xs text-(--color-text-muted)">{t('collection.viewer3d.loading')}</p>
    </div>
  )
}

/** 2D フォールバック（未クリック時・エラー時共用）。エラー時は通知＋再試行を出す。 */
function Fallback2D({
  altText,
  dark,
  onRetry,
}: {
  altText: string
  dark: boolean
  /** ErrorBoundary の reset。渡されたときだけエラー通知＋再試行ボタンを表示する。 */
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      role="img"
      aria-label={altText}
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
    >
      <CrayfishIllustration className="w-40 h-auto drop-shadow-sm" />
      {onRetry && (
        <>
          <p className={`text-xs ${muted(dark)}`} role="alert">
            {t('collection.viewer3d.errorNotice')}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-(--color-brand-600) text-white hover:bg-(--color-brand-700) focus:outline-hidden focus:ring-2 focus:ring-(--color-brand-500) focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
          >
            {t('collection.viewer3d.retry')}
          </button>
        </>
      )}
    </div>
  )
}

export default function Crayfish3DStage({ color, dark }: Crayfish3DStageProps) {
  const { t } = useTranslation()
  // SSR/初回は「未対応」扱い（ボタン非表示）。マウント後にクライアントで判定する。
  const [mounted, setMounted] = useState(false)
  const [webgl, setWebgl] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [show3D, setShow3D] = useState(false)

  useEffect(() => {
    setMounted(true)
    setWebgl(isWebGLAvailable())
    setReduced(prefersReducedMotion())
  }, [])

  const altText = t('collection.viewer3d.alt')
  const canShow3D = mounted && webgl

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-xs font-semibold ${muted(dark)}`}>{t('collection.viewer3d.title')}</h3>
        {canShow3D && (
          <button
            type="button"
            onClick={() => setShow3D((v) => !v)}
            aria-pressed={show3D}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 min-h-11 rounded-lg bg-(--color-brand-600) text-white hover:bg-(--color-brand-700) focus:outline-hidden focus:ring-2 focus:ring-(--color-brand-500) focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors"
          >
            {show3D ? <Undo2 size={13} aria-hidden="true" /> : <Box size={13} aria-hidden="true" />}
            {show3D ? t('collection.viewer3d.back2d') : t('collection.viewer3d.view3d')}
          </button>
        )}
      </div>

      {/* 寸法予約ボックス（2D/3D/読み込み中/エラーで同一サイズ＝レイアウトシフトなし / CLS≤0.1）。 */}
      <div
        className={`relative w-full h-60 sm:h-64 rounded-2xl overflow-hidden border ${
          dark ? 'border-slate-700/60' : 'border-sky-300/60'
        } bg-linear-to-b from-cyan-50 to-sky-100 dark:from-slate-900 dark:to-slate-950`}
      >
        {show3D && canShow3D ? (
          <ErrorBoundary
            context="collection:crayfish3d"
            fallback={(reset) => <Fallback2D altText={altText} dark={dark} onRetry={reset} />}
          >
            <Crayfish3DViewer color={color} reducedMotion={reduced} label={altText} />
          </ErrorBoundary>
        ) : (
          <Fallback2D altText={altText} dark={dark} />
        )}
      </div>

      <p className={`text-[11px] mt-1.5 ${faint(dark)}`}>
        {canShow3D ? t('collection.viewer3d.hint') : t('collection.viewer3d.hint2dOnly')}
      </p>
    </div>
  )
}
