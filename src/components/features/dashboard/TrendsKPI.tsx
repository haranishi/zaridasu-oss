import { useTranslation } from 'react-i18next'
import { MapPin, CalendarDays, Map, type LucideIcon } from 'lucide-react'

/**
 * トレンドページ KPI カードセクション
 */
interface TrendsKPIProps {
  stats: {
    totalAll: number
    totalThisMonth: number
    municipalityCount: number
  }
  card: string
  dark: boolean
  faint: string
}

export default function TrendsKPI({ stats, card, dark, faint }: TrendsKPIProps) {
  const { t } = useTranslation()

  // REQ-321 FR-321-05: 旧実装は 📍📅🗺 のフルカラー絵文字だった。絵文字は OS ごとに字形も
  // 色数も変わる（Apple の 🗺 は 5 色以上）ため、画面に「制御していない色」が入り込み、
  // 同じ画面の lucide 線アイコン（BottomNav・Header）と描画系統が混在して一貫性を壊していた。
  // lucide-react は既存依存なので新規依存は増えない（FR-321-05 の但し書き）。
  //
  // REQ-322 FR-322-06: 「今月の投稿」を KPI カードから外し、累計カードの副次行へ降格する。
  //  - 立ち上がり期は月初に必ず 0 になり、**ファーストビュー 2 番目に大きい数字が 0**という
  //    状態が続いていた（Round 3 採点 #19）。0 を大きく掲げるのは参加意欲を削ぐだけで情報量が無い。
  //  - 主役は「累計（totalAll）」と「分布の広がり（municipalityCount）」の 2 つにする。
  //    どちらも増えることはあっても 0 に戻らないので、少数データでも意味のある数字になる。
  //  - 集計は一切変えていない（AC-06）。totalThisMonth も捨てずに小さく併記する。
  //  - 副産物として 390px の 2 列グリッドで 3 枚目の空きセルが消える（同 #23）。
  const items: { label: string; value: number; Icon: LucideIcon; sub?: string }[] = [
    {
      label: t('trends.kpi.totalPosts'),
      value: stats.totalAll,
      Icon: MapPin,
      sub: t('trends.kpi.thisMonthInline', { count: stats.totalThisMonth }),
    },
    { label: t('trends.kpi.municipalities'), value: stats.municipalityCount, Icon: Map },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {items.map(({ label, value, Icon, sub }) => (
        <div key={label} className={`${card} text-center`}>
          {/* ラベルが真下に付く装飾アイコンなので aria からは外す（読み上げの重複を避ける）。
              色は本文より弱い faint（--color-text-faint）に置き、色数を増やさない。 */}
          <div className={`flex justify-center mb-0.5 sm:mb-1 ${faint}`}>
            <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className={`text-xl sm:text-2xl font-bold tabular-nums ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
            {value}
          </div>
          <div className={`text-xs sm:text-sm mt-0.5 ${faint}`}>{label}</div>
          {/* 副次行。主役の数字と同じ大きさにしないことが要点（FR-322-06）。 */}
          {sub && (
            <div className={`text-[11px] sm:text-xs mt-1 flex items-center justify-center gap-1 ${faint}`}>
              <CalendarDays size={12} strokeWidth={1.8} aria-hidden="true" />
              <span className="tabular-nums">{sub}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
