'use client'
// REQ-173: 過少観測エリア（優先調査エリア）の算出。
// 直近 p_days 日の市区町村別 approved 件数を取得し、全市区町村リストと突合して
// 件数の少ない（ゼロ含む）エリアを上位 limit 件返す。
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { MUNICIPALITIES } from '@/lib/constants'

export interface PriorityArea {
  municipality: string
  recentCount: number
}

interface Options {
  days?: number
  limit?: number
}

export function usePriorityAreas({ days = 90, limit = 5 }: Options = {}): {
  areas: PriorityArea[]
  loading: boolean
} {
  const [areas, setAreas] = useState<PriorityArea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    async function run() {
      if (!navigator.onLine) { setLoading(false); return }
      setLoading(true)
      const { data, error } = await supabase.rpc('get_undersurveyed_areas', { p_days: days })
      if (controller.signal.aborted) return
      const counts = new Map<string, number>()
      if (!error && Array.isArray(data)) {
        for (const row of data as { municipality: string; recent_count: number }[]) {
          counts.set(row.municipality, Number(row.recent_count) || 0)
        }
      }
      // 全市区町村に対し件数を割り当て（未出現=0）、少ない順に limit 件
      const merged: PriorityArea[] = MUNICIPALITIES.map((m) => ({
        municipality: m,
        recentCount: counts.get(m) ?? 0,
      }))
        .sort((a, b) => a.recentCount - b.recentCount)
        .slice(0, limit)
      setAreas(merged)
      setLoading(false)
    }
    run()
    return () => controller.abort()
  }, [days, limit])

  return { areas, loading }
}
