// REQ-330: 計画の控え（端末に置く写し）。
//
// 計画は家で作り、現地（圏外が多い）で見る。最後に同期した計画・地点・結果の印を、利用者ごとの保存先に
// 残しておき、圏外では「最後に同期した内容」として見せる。控えは表示のためだけに使い、書き換えは
// 電波のある場所で DB に対して行う（圏外の編集まで面倒を見ると送信待ちの衝突処理が大きくなるため）。
// 控えには非公開の地点の座標が入るので、キーに利用者 ID を入れ、別の人の画面には出さない。

import type { SurveyPlan } from '../data/plans'
import type { SurveyPlanStop } from '../data/stops'
import type { SurveyStopPost } from '../data/stopPosts'
import { planCacheKey } from './localData'

export { planCacheKey }

/**
 * 希少種の記録の位置（保護の判定用）。地点の id でなく場所（300 m 以内）で判定するので座標を持つ。
 * 古い控えには座標が無いことがあり、そのときは stop_id だけで判定する。
 */
export interface StopRareMark {
  id: string
  stop_id: string | null
  lat?: number
  lng?: number
  /**
   * 確かめ切れなかったための仮の印（地点を足した直後に周りの記録を取れなかった・範囲検索が上限まで返った）。
   * その地点を守る（伏せる側に倒す）が、「希少種 N」の数には入れない。次に読めたら消える。
   */
  unverified?: boolean
}

export interface PlanSnapshot {
  plans: SurveyPlan[]
  currentPlanId: string | null
  stops: SurveyPlanStop[]
  links: SurveyStopPost[]
  rare: StopRareMark[]
}

export interface PlanCache extends PlanSnapshot {
  /** 最後に同期した時刻（ISO）。 */
  savedAt: string
}

function isPlanCache(v: unknown): v is PlanCache {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.savedAt === 'string' &&
    Array.isArray(o.plans) &&
    Array.isArray(o.stops) &&
    Array.isArray(o.links) &&
    Array.isArray(o.rare) &&
    (o.currentPlanId === null || typeof o.currentPlanId === 'string')
  )
}

export function readPlanCache(userId: string): PlanCache | null {
  try {
    const raw = localStorage.getItem(planCacheKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isPlanCache(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writePlanCache(userId: string, snapshot: PlanSnapshot, now: Date = new Date()): void {
  try {
    const cache: PlanCache = { ...snapshot, savedAt: now.toISOString() }
    localStorage.setItem(planCacheKey(userId), JSON.stringify(cache))
  } catch {
    /* 容量超過・プライベートモード。控えが無くても電波のある場所では困らない */
  }
}
