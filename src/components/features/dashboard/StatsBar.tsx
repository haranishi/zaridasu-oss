import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useTheme } from '@/context/ThemeContext'
import { useStats } from '@/hooks/useStats'
import { SPECIES } from '@/lib/constants'

/**
 * REQ-318 FR-318-02: 種別バーの短縮ラベル。
 * 幅の狭い統計バー専用の省略形なので `SPECIES.label`（正式和名）とは別に持つ。
 * 色・画像・正式名は `SPECIES` から引く（＝ここでは持たない）。
 */
const SHORT_LABEL: Record<string, string> = { american: 'ザリ', bullfrog: 'カエル' }

function useCountUp(target: number | undefined, duration = 900) {
  const [value, setValue] = useState(0)
  const prev = useRef(0)

  useEffect(() => {
    if (target == null) return
    const start = prev.current
    const end = target
    prev.current = target
    if (start === end) return

    const startTime = performance.now()
    let raf: number
    const update = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(start + (end - start) * eased))
      if (t < 1) raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

export default function StatsBar() {
  const { dark } = useTheme()
  const { stats: rawStats, loading } = useStats({ months: 1 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const totalVal     = useCountUp(rawStats?.totalAll)
  const thisMonthVal = useCountUp(rawStats?.totalThisMonth)
  const americanVal  = useCountUp(rawStats?.speciesCounts?.american)
  const bullfrogVal  = useCountUp(rawStats?.speciesCounts?.bullfrog)

  if (!mounted || loading || !rawStats) {
    return <div className={`h-9 shrink-0 border-b ${dark ? 'bg-slate-900 border-slate-800' : 'bg-red-50 border-red-100'}`} />
  }

  const { totalThisMonth, lastMonth, speciesCounts } = rawStats
  const totalSpecies = ((speciesCounts.american ?? 0) + (speciesCounts.bullfrog ?? 0)) || 1
  const monthDiff = totalThisMonth - lastMonth

  // REQ-318 FR-318-02: 色・画像・和名は SPECIES（単一の正）から引く。
  // 旧実装は american=#DC2626（赤）/ bullfrog=#16A34A（緑）をこのファイルに直書きしており、
  // REQ-224 で「P/D 型色覚に最も識別困難」として捨てたはずの赤×緑がここだけ生き残っていた。
  // 現在は青 #0072B2 × オレンジ #D55E00（Wong パレット）が SPECIES 側の正。
  const countByValue: Record<string, number> = { american: americanVal, bullfrog: bullfrogVal }
  const speciesItems = SPECIES.map((s) => ({
    key: s.value,
    label: SHORT_LABEL[s.value] ?? s.label,
    image: s.image,
    alt: s.label,
    count: countByValue[s.value] ?? 0,
    raw: speciesCounts[s.value] ?? 0,
    color: s.color,
  }))

  return (
    <div className={`border-b px-2 sm:px-3 py-1.5 sm:py-2 flex gap-2 sm:gap-3 items-center overflow-x-auto scrollbar-hide shrink-0 text-sm ${
      dark ? 'bg-slate-900 border-slate-800' : 'bg-red-50 border-red-100'
    }`}>
      {/* 総投稿数 */}
      <div className="flex items-baseline gap-1 shrink-0">
        <span className={`font-bold text-base tabular-nums ${dark ? 'text-red-400' : 'text-red-700'}`}>
          {totalVal.toLocaleString()}
        </span>
        <span className={dark ? 'text-slate-400' : 'text-gray-600'}>件</span>
      </div>

      <span className={`shrink-0 ${dark ? 'text-slate-700' : 'text-gray-300'}`}>|</span>

      {/* 今月 */}
      <div className="flex items-baseline gap-1 shrink-0">
        <span className={dark ? 'text-slate-400' : 'text-gray-600'}>今月</span>
        <span className={`font-bold tabular-nums ${dark ? 'text-slate-200' : 'text-gray-800'}`}>{thisMonthVal}</span>
        <span className={dark ? 'text-slate-400' : 'text-gray-600'}>件</span>
        {/* REQ-326 FR-326-01: 前月比。**色は意味を担わない**（増減は ▲▼ と数値が伝える）。
            旧: 増 = text-emerald-500 / 減 = text-red-400 の赤×緑。2 つの意味で不適切だった。
              1. 赤×緑は P/D 型色覚で最も識別困難な組で、REQ-224 が主役 2 種の色を
                 青×オレンジへ移した理由そのもの。REQ-321 FR-321-03（emerald 全廃）の取りこぼし。
              2. この行の下地は白ではなく bg-red-50 / bg-slate-900。淡赤面では
                 emerald-500 = 2.32:1、red-400 = 2.53:1 で AA(4.5:1) の半分ほどしか無い。
            新: 隣の「今月」「件」と同じ二次テキスト色に揃える（新しい色を増やさない）。
                gray-600 on red-50 = 6.91:1 / slate-400 on slate-900 = 6.96:1。
            aria-label は「色 + 記号 + テキスト」のテキスト側。▲▼ は読み上げでは方向にならない。 */}
        {monthDiff !== 0 && (
          <span
            className={`text-xs font-semibold ${dark ? 'text-slate-400' : 'text-gray-600'}`}
            aria-label={`前月比 ${monthDiff > 0 ? '+' : '-'}${Math.abs(monthDiff)}件`}
          >
            {monthDiff > 0 ? `▲${monthDiff}` : `▼${Math.abs(monthDiff)}`}
          </span>
        )}
      </div>

      <span className={`shrink-0 ${dark ? 'text-slate-700' : 'text-gray-300'}`}>|</span>

      {/* 種類別 */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {speciesItems.map(({ key, label, image, alt, count, raw, color }) => (
          <div key={key} className="flex items-center gap-1 sm:gap-1.5">
            <Image src={image} alt={alt} width={16} height={16} className="w-4 h-4 object-contain shrink-0" />
            <span className={dark ? 'text-slate-400' : 'text-gray-600'}>
              {label} <span className="tabular-nums font-medium">{count}</span>
            </span>
            {/* ミニバーはモバイルで非表示 */}
            <div className={`hidden sm:block w-8 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-red-200/60'}`}>
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${(raw / totalSpecies) * 100}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
