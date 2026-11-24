'use client'

// REQ-330: 「保存したスポットから選ぶ」。REQ-329 の非公開スポットを選んで計画に入れる。
// スポットは読むだけ（usePrivateSpots を使わない。2 つ目のフックが同じ送信待ちを二重に送らないように）。
// 座標と名前は地点に複製する（元のスポットを消しても計画は壊れない）。名前は外部の地図アプリへは送らない。

import { useEffect, useState } from 'react'
import { Check, Loader2, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { selectOwnPrivateSpots, type PrivateSpot } from '@/lib/data/private-spots'
import { logError } from '@/lib/errorHandler'
import { supabase } from '@/lib/supabase/client'

import { smallBtn, tone } from './parts'

interface SpotPickerProps {
  userId: string
  /** 計画に入っている非公開スポットの id（選べなくする）。 */
  existingSourceIds: string[]
  onAdd: (spots: PrivateSpot[]) => Promise<void>
}

export default function SpotPicker({ userId, existingSourceIds, onAdd }: SpotPickerProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const c = tone(dark)
  const [spots, setSpots] = useState<PrivateSpot[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await selectOwnPrivateSpots(supabase, userId)
      if (cancelled) return
      if (error) {
        logError(error, 'SpotPicker:load')
        setFailed(true)
        return
      }
      setSpots(data ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (failed) return <p role="alert" className="text-sm text-red-600">{t('fieldwork.add.spotsFailed')}</p>
  if (!spots) return <p className={`text-sm ${c.muted}`}>{t('fieldwork.panel.loading')}</p>
  if (spots.length === 0) return <p className={`text-sm ${c.muted}`}>{t('fieldwork.add.spotsEmpty')}</p>

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))

  return (
    <div className={`space-y-2 rounded-xl border p-2 ${c.border}`} data-testid="fieldwork-spot-picker">
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {spots.map((s) => {
          const inPlan = existingSourceIds.includes(s.id)
          const on = picked.includes(s.id)
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={inPlan}
                onClick={() => toggle(s.id)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm disabled:opacity-60 ${
                  on ? (dark ? 'bg-violet-500/20' : 'bg-violet-50') : dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                    on ? 'border-violet-700 bg-violet-700 text-white' : dark ? 'border-slate-400' : 'border-gray-400'
                  }`}
                >
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
                <Lock size={13} aria-hidden="true" className="shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                {inPlan && <span className={`shrink-0 text-xs ${c.muted}`}>{t('fieldwork.add.spotsInPlan')}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        disabled={picked.length === 0 || busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onAdd(spots.filter((s) => picked.includes(s.id)))
            setPicked([])
          } finally {
            setBusy(false)
          }
        }}
        className={`${smallBtn} w-full border-violet-700 bg-violet-700 text-white hover:bg-violet-800`}
      >
        {busy && <Loader2 size={16} aria-hidden="true" className="animate-spin" />}
        {t('fieldwork.add.spotsAdd', { count: picked.length })}
      </button>
    </div>
  )
}
