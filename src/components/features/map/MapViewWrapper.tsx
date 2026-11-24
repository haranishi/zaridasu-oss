'use client'

import dynamic from 'next/dynamic'
import i18n from '@/lib/i18n'

function MapSkeleton() {
  return (
    // 背景は半透明にし、下敷きのLCP用先行タイル(HomePage側でSSR配置)を隠さない
    <div className="w-full h-full bg-gray-100/40 dark:bg-slate-800/60 relative overflow-hidden" role="status" aria-label="地図を読み込み中">
      {/* スケルトングリッド */}
      <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-px opacity-30">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="bg-gray-200 dark:bg-slate-700 animate-pulse" style={{ animationDelay: `${i * 0.05}s` }} />
        ))}
      </div>
      {/* 中央のローディング */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs rounded-2xl px-6 py-4 shadow-lg">
          <div className="text-3xl mb-2 animate-bounce">🗺️</div>
          <div className="text-sm font-medium text-gray-600 dark:text-slate-300">地図を読み込み中...</div>
          <div className="mt-2 h-1 w-24 mx-auto bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full animate-[skeleton-progress_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * NFR-201-02: 非フック文脈（ErrorBoundary の fallback から呼ばれる）でも安全に翻訳する。
 * i18n 未初期化時は defaultValue（既定言語=ja）を返す。
 */
function tr(key: string, defaultValue: string): string {
  try {
    if (i18n?.isInitialized) {
      return i18n.t(key, { defaultValue })
    }
  } catch {
    /* fail-soft */
  }
  return defaultValue
}

/**
 * REQ-201 (FR-201-01 / FR-201-02 / NFR-201-01): 地図区画専用のエラーフォールバック。
 * 地図枠と同じ寸法（w-full h-full）に収まり、ダークモード対応の再試行ボタンを持つ。
 * `onRetry` は ErrorBoundary の reset（配下 MapView を再マウント＝チャンク再取得・再描画を試行）。
 */
export function MapErrorFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="w-full h-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center p-4"
      role="alert"
    >
      <div className="text-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs rounded-2xl px-6 py-5 shadow-lg max-w-xs">
        <div className="text-3xl mb-2" aria-hidden="true">🗺️</div>
        <p className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">
          {tr('errorBoundary.mapTitle', '地図の読み込みに失敗しました')}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
          {tr('errorBoundary.mapDescription', '通信状況をご確認のうえ、もう一度お試しください。')}
        </p>
        <button
          onClick={onRetry}
          className="bg-brand-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors focus:outline-hidden focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          {tr('errorBoundary.mapRetry', '再試行')}
        </button>
      </div>
    </div>
  )
}

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

export default MapView
