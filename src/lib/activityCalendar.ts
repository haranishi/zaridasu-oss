// マイページの「活動の記録（草）」の集計。通信にも画面にも依存しない純関数。
// 活動した日 = 本人が記録を投稿した日（審査待ちも数え、却下は数えない）。日付は観察日（なければ投稿日）を日本時間で区切る。
import { addDays, jstDay, weekdayMonday0 } from '@/lib/jstDate'

/** 1日の件数がこれ以上なら、同じ濃さ（頭打ち）。量産で稼ぐ動機を作らないため、件数に比例させない。 */
export const ACTIVITY_LEVEL_CAP = 5
/** 表示する週の数（過去365日を含む週を、月曜始まりで並べる）。 */
export const ACTIVITY_WEEKS = 53
/** 集計する日数（今日を含む）。 */
export const ACTIVITY_WINDOW_DAYS = 365

export type ActivityLevel = 0 | 1 | 2 | 3 | 4

/** 草に使う記録の状態。却下・その他は数えない。 */
const COUNTED_STATUSES = ['pending', 'approved']

/** 1件の記録の、集計に使う列だけ（座標・コメント・写真は扱わない）。 */
export interface ActivityRow {
  observed_at: string | null
  created_at: string
  info_type: string
  status: string
}

export interface ActivityDay {
  /** 日本時間の日付（YYYY-MM-DD）。 */
  date: string
  count: number
  level: ActivityLevel
  /** count のうち、審査待ちの件数。 */
  pending: number
  /** 種類（目撃・不在確認など）ごとの件数。 */
  byType: Record<string, number>
}

export interface ActivityCell {
  /** 左から数えた週の位置（0〜52）。 */
  week: number
  day: ActivityDay
}

export interface ActivityCalendar {
  /** 集計の最初の日（今日の364日前）と、今日。 */
  start: string
  end: string
  weeks: number
  /** 月曜〜日曜の7行。範囲の外（最初の週の前・今日より先）の日は含めない。 */
  rows: ActivityCell[][]
  byDate: Record<string, ActivityDay>
  /** 月の名前を置く週の位置。month は1〜12。 */
  monthLabels: { week: number; month: number }[]
  /** 活動した日を新しい順に。 */
  activeDays: ActivityDay[]
  totalDays: number
  totalRecords: number
  pendingRecords: number
}

/** その日の件数から、濃さ（0〜4）を決める。頭打ちはここだけで決める。 */
export function levelFor(count: number): ActivityLevel {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count < ACTIVITY_LEVEL_CAP) return 3
  return 4
}

/** 凡例の1段。from〜to 件が、この濃さ。to が null の最後の段は「from 件以上」。 */
export interface LegendStep {
  level: ActivityLevel
  from: number
  to: number | null
}

/** 凡例の段（濃さと件数の範囲）。levelFor から作るので、頭打ちを変えても凡例と食い違わない。 */
export function legendSteps(): LegendStep[] {
  const steps: LegendStep[] = []
  for (let count = 0; count <= ACTIVITY_LEVEL_CAP; count++) {
    const level = levelFor(count)
    const last = steps[steps.length - 1]
    if (last && last.level === level) last.to = count
    else steps.push({ level, from: count, to: count })
  }
  steps[steps.length - 1]!.to = null
  return steps
}

/** 集計する最初の日（今日の364日前）。取得の絞り込みにも使う。 */
export function activityStart(today: string): string {
  return addDays(today, -(ACTIVITY_WINDOW_DAYS - 1))
}

/**
 * 過去365日の記録を、週を列・曜日を行にしたカレンダーにする。
 * 今日を含む週が右端。月曜始まり。今日より先・365日より前の記録は数えない。
 */
export function buildActivityCalendar(rows: readonly ActivityRow[], today: string): ActivityCalendar {
  const start = activityStart(today)
  const byDate: Record<string, ActivityDay> = {}
  for (let i = 0; i < ACTIVITY_WINDOW_DAYS; i++) {
    const date = addDays(start, i)
    byDate[date] = { date, count: 0, level: 0, pending: 0, byType: {} }
  }

  for (const row of rows) {
    if (!COUNTED_STATUSES.includes(row.status)) continue
    const day = byDate[jstDay(row.observed_at ?? row.created_at)]
    if (!day) continue
    day.count += 1
    if (row.status === 'pending') day.pending += 1
    day.byType[row.info_type] = (day.byType[row.info_type] ?? 0) + 1
  }

  let totalDays = 0
  let totalRecords = 0
  let pendingRecords = 0
  const activeDays: ActivityDay[] = []
  for (const day of Object.values(byDate)) {
    day.level = levelFor(day.count)
    if (day.count > 0) {
      totalDays += 1
      totalRecords += day.count
      pendingRecords += day.pending
      activeDays.push(day)
    }
  }
  activeDays.sort((a, b) => (a.date < b.date ? 1 : -1))

  const lastMonday = addDays(today, -weekdayMonday0(today))
  const firstMonday = addDays(lastMonday, -(ACTIVITY_WEEKS - 1) * 7)
  const grid: ActivityCell[][] = Array.from({ length: 7 }, () => [])
  const monthLabels: { week: number; month: number }[] = []
  let lastMonth = 0
  for (let week = 0; week < ACTIVITY_WEEKS; week++) {
    let labelled = false
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = addDays(firstMonday, week * 7 + weekday)
      const day = byDate[date]
      if (!day) continue
      grid[weekday]!.push({ week, day })
      if (!labelled) {
        labelled = true
        const month = Number(date.slice(5, 7))
        if (month !== lastMonth) {
          monthLabels.push({ week, month })
          lastMonth = month
        }
      }
    }
  }
  // 最初の週が月の終わり数日だけのとき、次の月の名前と重なるので外す
  if (monthLabels.length >= 2 && monthLabels[1]!.week - monthLabels[0]!.week < 3) monthLabels.shift()

  return { start, end: today, weeks: ACTIVITY_WEEKS, rows: grid, byDate, monthLabels, activeDays, totalDays, totalRecords, pendingRecords }
}
