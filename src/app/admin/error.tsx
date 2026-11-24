'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { logError } from '@/lib/errorHandler'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    logError(error, 'app/admin/error')
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh] bg-gray-50 px-4 dark:bg-slate-950">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4 dark:bg-red-950/50">
          <AlertTriangle className="text-red-500 dark:text-red-400" size={32} />
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-2 dark:text-slate-100">
          {t('admin.errorBoundary.title')}
        </h2>
        <p className="text-sm text-gray-500 mb-1 dark:text-slate-400">
          {t('admin.errorBoundary.description')}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4 font-mono dark:text-slate-500">
            {t('admin.errorBoundary.errorId', { id: error.digest })}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
          >
            <RotateCcw size={14} />
            {t('admin.errorBoundary.retry')}
          </button>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LayoutDashboard size={14} />
            {t('admin.errorBoundary.dashboard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
