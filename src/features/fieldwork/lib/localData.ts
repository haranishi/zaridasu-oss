// REQ-330: 端末に置く調査のデータ（計画の控え・送信待ち）の保存先と、ログアウト・退会のときの片付け。
//
// どちらにも非公開の地点や希少種の記録の座標が入るので、キーに利用者 ID を入れて人ごとに分け、
// ログアウトでは控えを消す（送信待ちは確認してから送るか破棄する。AuthContext）。退会では両方消す。
// 圏外で保存した非公開スポットの送信待ち（座標が入る）も同じ扱いにする（下の countPendingPrivateSpots など）。
// AuthContext から静的に読まれ、全ページの共通部分に入るので、ここにはほかの部品を import しない。

const PLAN_CACHE_PREFIX = 'zaridasu_fieldwork_plan_v1:'
const QUEUE_PREFIX = 'zaridasu_fieldwork_queue_v1:'

export function planCacheKey(userId: string): string {
  return `${PLAN_CACHE_PREFIX}${userId}`
}

export function queueStorageKey(userId: string): string {
  return `${QUEUE_PREFIX}${userId}`
}

/** 送信待ちの件数。中身は検めない（ログアウト前の確認に使う。送るときは queue.ts の readQueue が検める）。 */
export function countQueuedItems(userId: string): number {
  try {
    const raw = localStorage.getItem(queueStorageKey(userId))
    if (!raw) return 0
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* プライベートモードなど。読めない保存先には何も残っていない */
  }
}

export function clearPlanCache(userId: string): void {
  removeKey(planCacheKey(userId))
}

export function clearQueue(userId: string): void {
  removeKey(queueStorageKey(userId))
}

// ── 圏外で保存した非公開スポットの送信待ち（REQ-329） ─────────────────────────────
// 保存先は src/lib/privateSpots.ts の QUEUE_KEY と同じ。全員の分が 1 つの配列に入り、各要素が userId を持つ。
// 正確な座標と名前が入るので、ログアウト前の確認（送る／破棄する）と退会で片付ける。
// ここは import を増やせないので値を持ち直している。2 つの値が同じことは privateSpots の試験で確かめる。
export const PRIVATE_SPOT_QUEUE_KEY = 'zaridasu_pending_private_spots'

function readSpotQueue(): Record<string, unknown>[] {
  try {
    const raw = localStorage.getItem(PRIVATE_SPOT_QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      : []
  } catch {
    return []
  }
}

/** その人の非公開スポットの送信待ちの件数（ログアウト前の確認に使う）。 */
export function countPendingPrivateSpots(userId: string): number {
  return readSpotQueue().filter((spot) => spot.userId === userId).length
}

/** その人の非公開スポットの送信待ちを端末から消す。同じ端末の、ほかの人の分は残す。 */
export function clearPendingPrivateSpots(userId: string): void {
  try {
    const list = readSpotQueue()
    const rest = list.filter((spot) => spot.userId !== userId)
    if (rest.length === list.length) return
    if (rest.length === 0) localStorage.removeItem(PRIVATE_SPOT_QUEUE_KEY)
    else localStorage.setItem(PRIVATE_SPOT_QUEUE_KEY, JSON.stringify(rest))
  } catch {
    /* プライベートモードなど。読めない保存先には何も残っていない */
  }
}
