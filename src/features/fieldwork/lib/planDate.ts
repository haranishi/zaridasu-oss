// REQ-330: 計画の予定日の扱い（純粋関数）。
//
// 計画は前の晩に家で作り、翌朝に現地で使うことが多い。夕方（16 時）以降に作るときは、予定日の既定を明日にする。
// 予定日が今日の計画は「今日の計画」、明日の計画は「明日の計画」と出す（どの計画を開くかは pickDefaultPlan）。

import { toLocalISODate } from '@/lib/localDate'

/** この時刻（時）以降に作る計画は、既定で明日の分にする。 */
export const EVENING_HOUR = 16

/** YYYY-MM-DD に日数を足す（ローカルの暦で数える）。 */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return toLocalISODate(new Date(y, m - 1, d + days))
}

/** 新しく作る計画の予定日の既定（16 時より前は今日、16 時以降は明日）。 */
export function defaultPlannedOn(now: Date = new Date()): string {
  const today = toLocalISODate(now)
  return now.getHours() >= EVENING_HOUR ? addDays(today, 1) : today
}

/** 「10/2」の形（題名と小見出しに使う）。 */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return m && d ? `${Number(m)}/${Number(d)}` : ymd
}

/** 予定日が今日・明日・それ以外のどれか。 */
export function planDay(plannedOn: string, today: string): 'today' | 'tomorrow' | 'other' {
  if (plannedOn === today) return 'today'
  if (plannedOn === addDays(today, 1)) return 'tomorrow'
  return 'other'
}
