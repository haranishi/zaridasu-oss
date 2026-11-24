import type { ReactNode } from 'react'

type AccentColor = 'blue' | 'green' | 'red' | 'purple' | 'gray'

interface AccentStyle {
  bg: string
  ring: { dark: string; light: string }
}

const ACCENTS: Record<AccentColor, AccentStyle> = {
  blue:   { bg: 'from-blue-500 to-blue-600',     ring: { dark: 'ring-blue-500/20',    light: 'ring-blue-200'    } },
  green:  { bg: 'from-emerald-500 to-green-600',  ring: { dark: 'ring-emerald-500/20', light: 'ring-emerald-200' } },
  red:    { bg: 'from-red-500 to-rose-600',        ring: { dark: 'ring-red-500/20',     light: 'ring-red-200'     } },
  purple: { bg: 'from-violet-500 to-purple-600',  ring: { dark: 'ring-violet-500/20',  light: 'ring-violet-200'  } },
  gray:   { bg: 'from-gray-400 to-gray-500',       ring: { dark: 'ring-slate-600',      light: 'ring-gray-200'    } },
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon: ReactNode
  accent: AccentColor
  dark: boolean
}

export default function StatCard({ label, value, icon, accent, dark }: StatCardProps) {
  const a = ACCENTS[accent] || ACCENTS.gray
  const ring = dark ? a.ring.dark : a.ring.light
  return (
    <div className={`relative rounded-2xl ring-1 ${ring} shadow-xs overflow-hidden p-5 ${dark ? 'bg-slate-800' : 'bg-white'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-medium uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{label}</p>
          <p className={`mt-2 text-4xl font-bold tabular-nums ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
            {value ?? <span className={`text-2xl ${dark ? 'text-slate-400' : 'text-gray-300'}`}>{'\u2014'}</span>}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${a.bg} flex items-center justify-center text-white text-lg shadow-md`}>
          {icon}
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-1 bg-linear-to-r ${a.bg}`} />
    </div>
  )
}
