// 日本時間（JST・UTC+9）の日付（YYYY-MM-DD）の計算。画面の日付表示と、日の区切りをそろえる。通信・画面に依存しない純関数。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** ISO 時刻を日本時間の日付（YYYY-MM-DD）にする。読めない文字列は先頭10文字をそのまま返す。 */
export function jstDay(iso: string): string {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? iso.slice(0, 10) : new Date(time + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 今日（日本時間）の日付。 */
export function jstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** 1970-01-01 からの日数。うるう日・年またぎも、UTC の暦どおりに数える。 */
function dayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return Math.round(Date.UTC(year!, month! - 1, date!) / DAY_MS)
}

/** 日付に日数を足す（引くときは負の数）。 */
export function addDays(day: string, days: number): string {
  return new Date((dayNumber(day) + days) * DAY_MS).toISOString().slice(0, 10)
}

/** a − b の日数。 */
export function diffDays(a: string, b: string): number {
  return dayNumber(a) - dayNumber(b)
}

/** 月曜を0、日曜を6とした曜日。 */
export function weekdayMonday0(day: string): number {
  return (new Date(dayNumber(day) * DAY_MS).getUTCDay() + 6) % 7
}
