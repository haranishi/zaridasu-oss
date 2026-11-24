import { Loader2 } from 'lucide-react'
import { SPECIES } from '@/lib/constants'
import StatCard from '@/components/ui/StatCard'
import BarChart from '@/components/ui/charts/BarChart'
import DonutChart from '@/components/ui/charts/DonutChart'
import BadgeSection from './BadgeSection'
import { cardCls, muted, faint, subheading } from '@/lib/themeClasses'

interface MunicipalityRankEntry {
  name: string
  count: number
}

interface KPIStats {
  totalAll: number
  totalThisMonth: number
  myTotal?: number
  // REQ-248 FR-248-06: 承認済み（検証済み）投稿数。バッジラダーはこの検証済み数で駆動する。
  myApproved?: number
  speciesCounts: Record<string, number>
  monthly: { label: string; count: number }[]
  municipalityRank: MunicipalityRankEntry[]
}

interface KPISectionProps {
  stats: KPIStats
  statsLoading: boolean
  dark: boolean
}

export default function KPISection({ stats, statsLoading, dark }: KPISectionProps) {
  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-red-500" size={24} />
      </div>
    )
  }

  const speciesSegments = SPECIES.map((s) => ({
    color: s.color,
    value: stats?.speciesCounts?.[s.value] || 0,
  }))

  return (
    <>
      {/* 統計サマリー */}
      <div>
        <h2 className={`text-lg font-bold mb-3 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>統計サマリー</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="全体の投稿数" value={stats.totalAll} icon="📍" accent="blue" dark={dark} />
          <StatCard label="今月の投稿数" value={stats.totalThisMonth} icon="📅" accent="green" dark={dark} />
          <StatCard label="自分の投稿数" value={stats.myTotal} icon="👤" accent="purple" dark={dark} />
        </div>
      </div>

      {/* バッジ（REQ-248: 検証済み＝承認済み投稿数で駆動。myTotal（未検証込み）は使わない） */}
      <BadgeSection verifiedCount={stats.myApproved ?? 0} dark={dark} />

      {/* 月別グラフ + 種類別ドーナツ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`md:col-span-2 ${cardCls(dark)}`}>
          <h2 className={`text-sm font-semibold mb-4 ${subheading(dark)}`}>月別投稿数（直近6ヶ月）</h2>
          <BarChart data={stats.monthly} dark={dark} />
        </div>
        <div className={cardCls(dark)}>
          <h2 className={`text-sm font-semibold mb-4 ${subheading(dark)}`}>種類別内訳</h2>
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <DonutChart segments={speciesSegments} />
            </div>
            <div className="flex-1 space-y-2">
              {SPECIES.map((s) => {
                const count = stats.speciesCounts[s.value] || 0
                const pct = stats.totalAll ? Math.round((count / stats.totalAll) * 100) : 0
                return (
                  <div key={s.value}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className={`flex items-center gap-1 ${muted(dark)}`}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                      <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{count}件</span>
                    </div>
                    <div className={`h-1 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                      <div className="h-1 rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 市区町村ランキング */}
      {stats.municipalityRank.length > 0 && (
        <div className={cardCls(dark)}>
          <h2 className={`text-sm font-semibold mb-4 ${subheading(dark)}`}>市区町村別ランキング（上位10件）</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stats.municipalityRank.map((item: MunicipalityRankEntry, i: number) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className={`text-xs font-bold w-5 text-right ${faint(dark)}`}>{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className={muted(dark)}>{item.name}</span>
                    <span className={`font-semibold ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{item.count}件</span>
                  </div>
                  <div className={`h-1 rounded-full ${dark ? 'bg-slate-700' : 'bg-gray-100'}`}>
                    <div
                      className="h-1 bg-linear-to-r from-red-400 to-red-600 rounded-full transition-all duration-700"
                      style={{ width: `${(item.count / (stats.municipalityRank[0]?.count || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
