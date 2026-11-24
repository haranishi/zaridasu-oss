// REQ-330: 失敗を画面の文言（fieldwork.error.*）に振り分ける。
//
// RLS は UPDATE / DELETE を拒否しても 0 行の成功で返すが、データ層（../data）は 0 行を例外にしているので、
// 権限の失敗もここに届く。届いた失敗は必ず画面に出す（黙って成功に見せない）。
// 上限（P0001）は DB の文言で種類を分ける（supabase/migrations/20261001000001_req330_fieldwork.sql と
// posts の check_post_rate_limit）。どの上限に当たったかが分からないと、利用者は何を待てばよいか分からない。

import type { TFunction } from 'i18next'
import { isNetworkError } from '@/lib/privateSpots'

export type FieldworkErrorReason =
  | 'offline'
  | 'postLimit'
  | 'planDayLimit'
  | 'planTotalLimit'
  | 'stopHourLimit'
  | 'stopPlanLimit'
  | 'rareHourLimit'
  | 'rareTotalLimit'
  | 'limit'
  | 'reorderStale'
  | 'denied'
  | 'queueFull'
  | 'photosOffline'
  | 'partialQueued'
  | 'failed'

/** 画面側で決まる失敗（圏外での編集・送信待ちの満杯など）。 */
export class FieldworkError extends Error {
  readonly reason: FieldworkErrorReason
  /** partialQueued のときの、残りが送れなかった理由。 */
  readonly detail?: FieldworkErrorReason

  constructor(reason: FieldworkErrorReason, detail?: FieldworkErrorReason) {
    super(reason)
    this.name = 'FieldworkError'
    this.reason = reason
    this.detail = detail
  }
}

/** DB の上限の文言 → 理由。上から順に見る。 */
const LIMIT_MESSAGES: [string, FieldworkErrorReason][] = [
  ['投稿上限', 'postLimit'],
  ['調査計画の作成上限（1日', 'planDayLimit'],
  ['調査計画の作成上限（1人', 'planTotalLimit'],
  ['調査地点の追加上限', 'stopHourLimit'],
  ['地点は100か所まで', 'stopPlanLimit'],
  ['希少種の記録の上限（1時間', 'rareHourLimit'],
  ['希少種の記録の上限（1人', 'rareTotalLimit'],
  ['読み込み直して', 'reorderStale'],
]

export function errorReason(err: unknown): FieldworkErrorReason {
  if (err instanceof FieldworkError) return err.reason
  if (isNetworkError(err)) return 'offline'
  const o = (err ?? {}) as { code?: unknown; message?: unknown }
  const message = typeof o.message === 'string' ? o.message : ''
  if (o.code === 'P0001') {
    for (const [needle, reason] of LIMIT_MESSAGES) if (message.includes(needle)) return reason
    return 'limit'
  }
  if (o.code === '42501' || message.includes('RLS deny')) return 'denied'
  return 'failed'
}

/** 失敗を画面の文言にする。partialQueued は残りが送れなかった理由も添える。 */
export function errorMessage(err: unknown, t: TFunction): string {
  const reason = errorReason(err)
  if (reason === 'partialQueued' && err instanceof FieldworkError) {
    return t('fieldwork.error.partialQueued', { reason: t(`fieldwork.error.${err.detail ?? 'failed'}`) })
  }
  return t(`fieldwork.error.${reason}`)
}
