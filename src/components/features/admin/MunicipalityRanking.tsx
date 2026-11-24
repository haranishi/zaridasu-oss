import { useTranslation } from 'react-i18next'
import { QUERY_LIMITS } from '@/lib/constants'

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#b45309', '#3b82f6']
const RANK_LABELS = ['🥇', '🥈', '🥉']

interface MunicipalityData {
  name: string
  count: number
}

interface MunicipalityRankingProps {
  data: MunicipalityData[]
}

export default function MunicipalityRanking({ data }: MunicipalityRankingProps) {
  const { t } = useTranslation()
  const max = Math.max(...data.map((d: MunicipalityData) => d.count), 1)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('admin.components.municipalityRanking.title')}</h2>
      {data.length === 0
        ? <p className="text-sm text-gray-400 text-center py-6">{t('admin.components.municipalityRanking.noData')}</p>
        : (
          <div className="space-y-3">
            {data.slice(0, QUERY_LIMITS.adminMunicipalityTop).map((d, i) => (
              <div key={d.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5 text-gray-700 font-medium">
                    <span className="w-5 text-center">{RANK_LABELS[i] ?? `${i + 1}.`}</span>
                    {d.name}
                  </span>
                  <span className="font-semibold text-gray-800 tabular-nums">
                    {d.count}<span className="text-gray-400 font-normal">{t('admin.components.municipalityRanking.unit')}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-1.5 rounded-full transition-all duration-700"
                    style={{
                      width: `${(d.count / max) * 100}%`,
                      backgroundColor: RANK_COLORS[i] ?? RANK_COLORS[3],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}
