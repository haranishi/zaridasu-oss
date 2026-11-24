interface Segment {
  value: number
  color: string
}

interface AdminDonutChartProps {
  segments: Segment[]
  size?: number
}

export default function AdminDonutChart({ segments, size = 90 }: AdminDonutChartProps) {
  const total = segments.reduce((s: number, d: Segment) => s + d.value, 0) || 1
  const r = 34, cx = size / 2, cy = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0
  const arcs = segments.map(seg => {
    const dash = (seg.value / total) * circumference
    const arc = { ...seg, dash, offset }
    offset += dash
    return arc
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {/* REQ-224 FR-224-07: トラックをダーク対応トークンに（旧ハードコード #f3f4f6） */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={12} />
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={arc.color} strokeWidth={12}
          strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
          strokeDashoffset={-arc.offset}
          className="transition-all duration-700"
        />
      ))}
    </svg>
  )
}
