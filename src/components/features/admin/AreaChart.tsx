interface AreaChartDataPoint {
  count: number
  label: string
}

interface AreaChartProps {
  data: AreaChartDataPoint[]
}

interface ChartPoint extends AreaChartDataPoint {
  x: number
  y: number
}

export default function AreaChart({ data }: AreaChartProps) {
  if (!data || data.length === 0) return null
  const W = 600, H = 220
  const pad = { top: 20, right: 16, bottom: 36, left: 36 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom
  const max = Math.max(...data.map((d: AreaChartDataPoint) => d.count), 1)

  const points: ChartPoint[] = data.map((d: AreaChartDataPoint, i: number) => ({
    x: pad.left + (data.length === 1 ? cW / 2 : (i / (data.length - 1)) * cW),
    y: pad.top + cH - (d.count / max) * cH,
    ...d,
  }))

  function smoothPath(pts: ChartPoint[]) {
    if (pts.length < 2) return `M ${pts[0]!.x} ${pts[0]!.y}`
    let d = `M ${pts[0]!.x} ${pts[0]!.y}`
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1]!.x + pts[i]!.x) / 2
      d += ` C ${cpx} ${pts[i - 1]!.y}, ${cpx} ${pts[i]!.y}, ${pts[i]!.x} ${pts[i]!.y}`
    }
    return d
  }

  const linePath = smoothPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${pad.top + cH} L ${points[0]!.x} ${pad.top + cH} Z`
  const gridPcts = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* REQ-224 FR-224-07: グリッド/軸ラベルをダーク対応トークンに（旧ハードコード #f3f4f6 / #d1d5db）。
          軸数値は補助メタ情報のため 12px を許容（運用ルール）。 */}
      {gridPcts.map((pct, i) => (
        <g key={i}>
          <line
            x1={pad.left} y1={pad.top + (1 - pct) * cH}
            x2={W - pad.right} y2={pad.top + (1 - pct) * cH}
            stroke="var(--chart-track)" strokeWidth={1}
          />
          <text x={pad.left - 6} y={pad.top + (1 - pct) * cH + 4}
            textAnchor="end" fontSize={12} fill="var(--color-text-faint)">
            {Math.round(max * pct)}
          </text>
        </g>
      ))}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3.5} fill="white" stroke="#3b82f6" strokeWidth={2.5} />
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--color-text-faint)">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}
