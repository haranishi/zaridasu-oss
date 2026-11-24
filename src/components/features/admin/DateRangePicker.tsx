import { useTranslation } from 'react-i18next'
import { toLocalISODate } from '@/lib/localDate'

interface DateRange {
  from: Date | null
  to: Date | null
}

interface DateRangePickerProps {
  from: Date | null
  to: Date | null
  onChange: (range: DateRange) => void
}

// REQ-272: <input type="date"> はローカルカレンダーで解釈するため、表示文字列も
// ローカル成分で作る（toISOString() だと JST でプリセットの表示が前日になる）。
// クエリ境界は Date インスタンス（onChange）側で扱うため挙動は表示のみの修正。
function toDateInput(d: Date | null): string {
  if (!d) return ''
  return toLocalISODate(d)
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const { t } = useTranslation()

  const PRESETS = [
    { key: 'thisMonth',   getValue: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: new Date() } } },
    { key: 'lastMonth',   getValue: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1); return { from: s, to: new Date(n.getFullYear(), n.getMonth(), 0) } } },
    { key: 'last3Months', getValue: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth() - 2, 1), to: n } } },
    { key: 'last6Months', getValue: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth() - 5, 1), to: n } } },
    { key: 'thisYear',    getValue: () => { const n = new Date(); return { from: new Date(n.getFullYear(), 0, 1), to: n } } },
    { key: 'allPeriod',   getValue: () => ({ from: null, to: null }) },
  ]

  const activePreset = PRESETS.findIndex(p => {
    const v = p.getValue()
    return toDateInput(v.from) === toDateInput(from) && toDateInput(v.to) === toDateInput(to)
  })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => onChange(p.getValue())}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePreset === i
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t(`admin.dashboard.dateRange.${p.key}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <input
          type="date"
          value={toDateInput(from)}
          max={toDateInput(to) || undefined}
          onChange={e => onChange({ from: e.target.value ? new Date(e.target.value) : null, to })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-300"
        />
        <span>〜</span>
        <input
          type="date"
          value={toDateInput(to)}
          min={toDateInput(from) || undefined}
          onChange={e => onChange({ from, to: e.target.value ? new Date(e.target.value) : null })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-300"
        />
      </div>
    </div>
  )
}
