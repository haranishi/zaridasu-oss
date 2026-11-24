// REQ-330: 端末の送信待ち（圏外で記録したもの）。
//
// 秋田の水辺は圏外が多い。「いなかった」「飛ばす」「元に戻す」「写真なしの希少種」は、押した時点の中身を
// 端末（localStorage）に残し、電波が戻ったら送る。投稿の「いた」が作れたあとの地点とのつながりも、
// 送り損ねたらここに入れる。
//
// - **利用者ごとに別の保存先**（キーに利用者 ID）。項目にも利用者 ID を持たせ、送る直前にも照合する。
//   同じ端末で別の人がログインしても、前の人の記録をその人の名義で送らない（REQ-316 と同じ考え方）。
// - **同じ client_id を二重に送らない**。積むときは client_id で重複を外し、送るときは同じ画面の中で
//   送信中の項目を飛ばす（navigator.locks がある端末ではタブをまたいでも 1 本にする）。
//   希少種の記録は DB の一意制約（user_id, client_id）でも弾く。不在の投稿は posts に鍵が無いので、
//   作れた投稿の id を項目に書き残し、送り直しでは作らない（postIds）。
// - 送る直前にも端末の保存先を読み直し、もう無い項目（別の送信が先に送り終えたもの）は送らない
//   （navigator.locks の無い端末で、2 本目の送信が先に終わったときの二重送信を防ぐ）。

import type { Species } from '@/types'

import type { StopStatus } from '../data/stops'
import type { StopPostKind } from '../data/stopPosts'
import { queueStorageKey } from './localData'

export { queueStorageKey }

/** 端末に溜める上限。超えたら積まない（黙って古いものを捨てない）。 */
export const MAX_QUEUE_ITEMS = 100

interface QueuedBase {
  /** 端末で作った uuid。希少種の記録ではそのまま rare_sightings.client_id になる。 */
  clientId: string
  userId: string
  /** 押した時刻（ISO）。地点の visited_at にもこの時刻を使う。 */
  at: string
  /** 送り直しても通らなかった理由（画面の文言 fieldwork.error.* のキー）。次の送信でまた試す。 */
  lastError?: string
}

export interface QueuedAbsence extends QueuedBase {
  type: 'absence'
  stopId: string
  species: Species[]
  surveyDurationMinutes: number | null
  lat: number
  lng: number
  accuracy: number | null
  locationSource: 'gps' | 'manual'
  locationPrivate: boolean
  /** 観察日（端末の日付 YYYY-MM-DD）。 */
  observedOn: string
  /** 作れた投稿（種 → 投稿 id）。送り直しではこの種の投稿を作らない。 */
  postIds?: Partial<Record<Species, string>>
}

export interface QueuedStatus extends QueuedBase {
  type: 'status'
  stopId: string
  status: StopStatus
  /** 飛ばした理由を足したメモ（変えないなら undefined）。 */
  note?: string | null
}

export interface QueuedRare extends QueuedBase {
  type: 'rare'
  stopId: string | null
  speciesKey: string
  speciesLabel: string | null
  count: number | null
  note: string | null
  lat: number
  lng: number
  accuracy: number | null
  locationSource: 'gps' | 'map'
  observedAt: string
}

export interface QueuedLink extends QueuedBase {
  type: 'link'
  stopId: string
  postId: string
  kind: StopPostKind
}

/** 希少種を記録できたあと、近くの地点につながる自分の投稿を非公開にする（送れなかった分の続き）。 */
export interface QueuedProtect extends QueuedBase {
  type: 'protect'
  lat: number
  lng: number
  /** 記録を付けた地点（無ければ null）。 */
  rareStopId: string | null
}

export type QueueItem = QueuedAbsence | QueuedStatus | QueuedRare | QueuedLink | QueuedProtect

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // randomUUID の無い古い端末。uuid の形にそろえる（rare_sightings.client_id は uuid 型）。
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** localStorage は利用者が触れるので、形の崩れた項目は読まない。 */
function isQueueItem(v: unknown): v is QueueItem {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (!isStr(o.clientId) || !isStr(o.userId) || !isStr(o.at)) return false
  switch (o.type) {
    case 'absence':
      return isStr(o.stopId) && Array.isArray(o.species) && o.species.length > 0 && isNum(o.lat) && isNum(o.lng) && isStr(o.observedOn)
    case 'status':
      return isStr(o.stopId) && (o.status === 'pending' || o.status === 'done' || o.status === 'skipped')
    case 'rare':
      return isStr(o.speciesKey) && isNum(o.lat) && isNum(o.lng) && isStr(o.observedAt)
    case 'link':
      return isStr(o.stopId) && isStr(o.postId) && (o.kind === 'sighting' || o.kind === 'absence')
    case 'protect':
      return isNum(o.lat) && isNum(o.lng)
    default:
      return false
  }
}

/** その人の送信待ち（積んだ順）。別の人の名義の項目は、同じキーに紛れ込んでいても返さない。 */
export function readQueue(userId: string): QueueItem[] {
  try {
    const raw = localStorage.getItem(queueStorageKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isQueueItem).filter((i) => i.userId === userId) : []
  } catch {
    return []
  }
}

function writeQueue(userId: string, items: QueueItem[]): boolean {
  try {
    const key = queueStorageKey(userId)
    if (items.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

/**
 * 積む。同じ client_id がもう入っていれば積まずに true（二重に積まない）。
 * 上限に達している・書き込めない（容量超過・プライベートモード）ときは false。
 */
export function enqueue(item: QueueItem): boolean {
  const items = readQueue(item.userId)
  if (items.some((i) => i.clientId === item.clientId)) return true
  if (items.length >= MAX_QUEUE_ITEMS) return false
  if (!writeQueue(item.userId, [...items, item])) return false
  // 書けたかを読み直して確かめる（容量超過で黙って失われるのを防ぐ）
  return readQueue(item.userId).some((i) => i.clientId === item.clientId)
}

/** 送信の途中経過（作れた投稿の id など）を書き残す。 */
export function patchQueued(userId: string, clientId: string, patch: Partial<QueueItem>): void {
  const items = readQueue(userId)
  writeQueue(
    userId,
    items.map((i) => (i.clientId === clientId ? ({ ...i, ...patch, clientId: i.clientId, userId: i.userId } as QueueItem) : i))
  )
}

export function removeQueued(userId: string, clientId: string): void {
  writeQueue(
    userId,
    readQueue(userId).filter((i) => i.clientId !== clientId)
  )
}

/** 1 件を送る関数。途中経過は save で書き残す。失敗は投げる。 */
export type QueueSender = (item: QueueItem, save: (patch: Partial<QueueItem>) => void) => Promise<void>

export interface FlushResult {
  sent: string[]
  failed: { clientId: string; error: unknown }[]
  /** 圏外などで途中でやめた */
  interrupted: boolean
}

// 同じ画面（このタブ）で送信中の項目。online イベントとパネルを開いたときが重なっても二重に送らない。
const inFlight = new Set<string>()

/** この画面（タブ）で、その人の送信待ちを送っている最中か。 */
export function isFlushing(userId: string): boolean {
  for (const key of inFlight) if (key.startsWith(`${userId}:`)) return true
  return false
}

/**
 * タブをまたいで 1 本にする（navigator.locks がある端末）。
 * waitMs を渡すと、別のタブの送信が終わるのをその時間まで待ってから送る（ログアウト前の送信。すぐ諦めない）。
 * 渡さなければ、別のタブが送っている最中はそのタブに任せて何もしない。
 */
async function withTabLock<T>(userId: string, fn: () => Promise<T>, waitMs?: number): Promise<T | null> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks?.request) return fn()
  const name = `zaridasu-fieldwork-queue:${userId}`
  if (waitMs === undefined) return locks.request(name, { ifAvailable: true }, (lock) => (lock ? fn() : null))
  try {
    return await locks.request(name, { signal: AbortSignal.timeout(waitMs) }, () => fn())
  } catch {
    return null
  }
}

/**
 * その人の送信待ちを積んだ順に送る。送れたものは消す。
 * - 別の人の名義の項目は送らない（readQueue が外し、ここでも照合する）
 * - 送信中の項目は飛ばす（同じ client_id を二重に送らない）
 * - 送る直前に読み直し、もう無い項目は送らない（別の送信が先に送り終えた。navigator.locks の無い端末の備え）
 * - 圏外・タイムアウトなら途中でやめ、残りは次の機会に送る
 * - 送り直しても通らない失敗（上限・権限）は理由を書き残して残し、次の項目へ進む（黙って捨てない）
 */
export async function flushQueue(
  userId: string,
  send: QueueSender,
  isNetworkError: (err: unknown) => boolean,
  describe: (err: unknown) => string = (err) => {
    const code = (err as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : 'failed'
  },
  options: { waitForOtherTabMs?: number } = {}
): Promise<FlushResult> {
  const result: FlushResult = { sent: [], failed: [], interrupted: false }
  await withTabLock(userId, async () => {
    for (const listed of readQueue(userId)) {
      if (listed.userId !== userId) continue
      const key = `${userId}:${listed.clientId}`
      if (inFlight.has(key)) continue
      // 読み始めた時の写しでなく、いまの中身で送る（途中経過の postIds を拾う・送り終えた項目を飛ばす）
      const item = readQueue(userId).find((i) => i.clientId === listed.clientId)
      if (!item) continue
      inFlight.add(key)
      try {
        await send(item, (patch) => patchQueued(userId, item.clientId, patch))
        removeQueued(userId, item.clientId)
        result.sent.push(item.clientId)
      } catch (error) {
        if (isNetworkError(error)) {
          result.interrupted = true
          break
        }
        patchQueued(userId, item.clientId, { lastError: describe(error) })
        result.failed.push({ clientId: item.clientId, error })
      } finally {
        inFlight.delete(key)
      }
    }
  }, options.waitForOtherTabMs)
  return result
}
