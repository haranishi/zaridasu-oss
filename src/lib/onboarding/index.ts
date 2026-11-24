import { AKITA_FIT_BOUNDS, REGION_FIT_BOUNDS } from '@/lib/constants'
import type { Database } from '@/types/database.types'

export const ONBOARDING_COMPLETED_EVENT = 'zaridasu:onboarding-completed'

export type Region = Database['public']['Tables']['user_onboarding']['Row']['region']
export type Seen = Database['public']['Tables']['user_onboarding']['Row']['seen_crayfish']
export type OnboardingMode = 'required' | 'optional'

export const REGIONS = [
  { value: 'akita_city', labelKey: 'onboarding.region.akita_city' },
  { value: 'north', labelKey: 'onboarding.region.north' },
  { value: 'central', labelKey: 'onboarding.region.central' },
  { value: 'south', labelKey: 'onboarding.region.south' },
  { value: 'other', labelKey: 'onboarding.region.other' },
] as const satisfies ReadonlyArray<{ value: Region; labelKey: string }>

export const SEEN = [
  { value: 'yes', labelKey: 'onboarding.seen.yes' },
  { value: 'no', labelKey: 'onboarding.seen.no' },
  { value: 'maybe', labelKey: 'onboarding.seen.maybe' },
] as const satisfies ReadonlyArray<{ value: Seen; labelKey: string }>

export function isRegion(value: unknown): value is Region {
  return REGIONS.some(region => region.value === value)
}

export function isSeen(value: unknown): value is Seen {
  return SEEN.some(seen => seen.value === value)
}

export interface OnboardingAnswers {
  introduced?: boolean
  region?: Region | null
  seen?: Seen | null
  factAcknowledged?: boolean
}

/** 確定済みの回答から次に表示する画面番号を返す。選択中の値はUI側で保持する。 */
export function stepFor(answers: OnboardingAnswers): 1 | 2 | 3 | 4 | 5 {
  if (!answers.introduced) return 1
  if (!isRegion(answers.region)) return 2
  if (!isSeen(answers.seen)) return 3
  if (!answers.factAcknowledged) return 4
  return 5
}

/** ストレージ由来の不正値・未回答も県全域にフォールバックする。 */
export function regionBounds(region: unknown): [[number, number], [number, number]] {
  const bounds = isRegion(region) ? REGION_FIT_BOUNDS[region] : AKITA_FIT_BOUNDS
  return [[...bounds[0]], [...bounds[1]]]
}

/**
 * 「登録直後」と見なす時間（ミリ秒）。REQ-326。
 *
 * この中に入る人は新規登録の流れの途中なので、必須のまま出す（回答が直後の体験＝地図の
 * 初期位置に効く）。これより前に登録した人は既存会員として扱い、1 画面目から「あとで」を出す。
 *
 * 30 分にしてあるのは、登録 → メール確認 → 戻ってくる、までを含めても収まり、かつ
 * 「昨日登録した人」を新規とは呼ばない長さだから。
 */
export const SIGNUP_GRACE_MS = 30 * 60 * 1000

/**
 * 登録直後かどうか。`user.created_at`（ISO 文字列）から判定する。
 * 追加の列もクエリも要らない。値が無い / 壊れているときは**既存会員として扱う**
 * （判定できないことを理由に閉じ込めない）。
 */
export function isFreshSignup(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return false
  return now - t < SIGNUP_GRACE_MS
}
