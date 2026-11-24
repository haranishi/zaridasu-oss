import { useTranslation } from 'react-i18next'

interface SummaryCardProps {
  current: number
  previous: number
  trend: number
}

export default function SummaryCard({ current, previous, trend }: SummaryCardProps) {
  const { t } = useTranslation()
  const unit = t('admin.components.summaryCard.unit')
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col justify-between">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('admin.components.summaryCard.title')}</h2>
      <div className="space-y-3 flex-1">
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <span className="text-xs text-gray-500">{t('admin.components.summaryCard.previousPeriod')}</span>
          <span className="text-sm font-semibold text-gray-600 tabular-nums">{previous}{unit}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-gray-50">
          <span className="text-xs text-gray-500">{t('admin.components.summaryCard.currentPeriod')}</span>
          <span className="text-sm font-bold text-gray-900 tabular-nums">{current}{unit}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-xs text-gray-500">{t('admin.components.summaryCard.change')}</span>
          <span className={`text-sm font-bold tabular-nums ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}{unit}
          </span>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">{t('admin.components.summaryCard.vsPrevious')}</span>
          <span className="text-xs font-semibold text-gray-600">
            {previous ? `${Math.round((current / previous) * 100)}%` : '—'}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-700 bg-linear-to-r from-blue-400 to-blue-600"
            style={{ width: `${Math.min(previous ? (current / previous) * 100 : 0, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}
