// REQ-272: 「今日の日付文字列」をローカルタイムゾーンで導出する共通ヘルパー。
//
// `new Date().toISOString().split('T')[0]` は **UTC** の日付を返すため、
// JST では 0:00〜8:59 の間「昨日」になる。<input type="date"> はローカル
// カレンダーで解釈するので、観測日の既定値・max・天気APIの今日/過去分岐・
// CSVファイル名がこの窓で1日ズレていた。日付文字列 (YYYY-MM-DD) が
// ユーザーの体感する「今日」を指すべき場所では必ずこちらを使うこと。
// （UTCで良い場所は理由をコメントで明示する）

/** Date をローカルタイムゾーンの YYYY-MM-DD 文字列にする。 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** ローカルタイムゾーンの「今日」を YYYY-MM-DD で返す。 */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date())
}
