import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type StatCardColor = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'gray'

interface AdminStatCardProps {
  label: string
  value: ReactNode
  icon: ReactNode
  trend?: number | null
  color: StatCardColor
}

export default function AdminStatCard({ label, value, icon, trend, color }: AdminStatCardProps) {
  const { t } = useTranslation()
  const styles: Record<StatCardColor, string> = {
    blue:   'bg-blue-500',
    green:  'bg-emerald-500',
    purple: 'bg-violet-500',
    amber:  'bg-amber-500',
    red:    'bg-red-500',
    gray:   'bg-gray-400',
  }
  const iconBg = styles[color] || styles.blue

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${iconBg} shadow-xs`}>
          {icon}
        </div>
        {trend != null && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
            trend >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
          }`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}{t('admin.components.statCard.unit')}
          </span>
        )}
      </div>
      <div>
        <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none mb-1">
          {value ?? <span className="text-2xl text-gray-300">—</span>}
        </p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}
