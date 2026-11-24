import { useId } from 'react'

interface DonutSegment {
  value: number
  color: string
  label?: string
  /** REQ-224 FR-224-03: 色だけに依存させない補助。'hatch' で斜線パターンを重ね、白黒でも弧を区別可能にする。 */
  pattern?: 'solid' | 'hatch'
}

interface DonutChartProps {
  segments: DonutSegment[]
  size?: number
}

export default function DonutChart({ segments, size = 90 }: DonutChartProps) {
  const uid = useId()
  const total = segments.reduce((s, d) => s + d.value, 0) || 1
  const r = 38
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  let offset = 0
  const arcs = segments.map((seg) => {
    const dash = (seg.value / total) * circumference
    const arc = { ...seg, dash, offset }
    offset += dash
    return arc
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <defs>
        {arcs.map((arc, i) =>
          arc.pattern === 'hatch' ? (
            <pattern
              key={`p-${i}`}
              id={`${uid}-hatch-${i}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={arc.color} />
              <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeWidth="2" strokeOpacity="0.55" />
            </pattern>
          ) : null,
        )}
      </defs>
      {/* REQ-224 FR-224-07: トラックをダーク対応トークンに（旧ハードコード #f3f4f6） */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={14} />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.pattern === 'hatch' ? `url(#${uid}-hatch-${i})` : arc.color}
          strokeWidth={14}
          strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
          strokeDashoffset={-arc.offset}
          className="transition-all duration-700"
        />
      ))}
    </svg>
  )
}
