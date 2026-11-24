// REQ-329: 非公開スポット（クイック保存）の純粋ロジック。名前の正規化と、圏外で保存したときの端末内キュー。
//
// 現地（山間の沼など）は圏外のことが多い。保存ボタンを押した時点の位置と名前は
// 端末（localStorage）に残し、次にオンラインになったとき自動で送る。送るまでは端末から出ない。
// キューには利用者 ID を持たせ、同じ端末で別の人がログインしても他人の名義で送らない。

import { PRIVATE_SPOT_NAME_MAX, PRIVATE_SPOT_NOTE_MAX } from '@/lib/constants'

const QUEUE_KEY = 'zaridasu_pending_private_spots'
/** 端末に溜める上限。超えたら古い順ではなく「これ以上は保存しない」（黙って捨てない）。 */
export const MAX_PENDING_SPOTS = 50

export interface PendingPrivateSpot {
  /** 端末内の識別子（送信前の表示・削除に使う） */
  localId: string
  userId: string
  name: string
  note: string | null
  lat: number
  lng: number
  accuracy: number | null
  recordedAt: string
}

/** 前後の空白を落とし、連続する空白を 1 つにして上限で切る。空なら ''。 */
export function normalizeSpotName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, PRIVATE_SPOT_NAME_MAX)
}

/** メモを正規化する。空なら null。 */
export function normalizeSpotNote(raw: string): string | null {
  const v = raw.trim().slice(0, PRIVATE_SPOT_NOTE_MAX)
  return v === '' ? null : v
}

/** 名前を入れずに保存したときの既定名（例: 「非公開スポット 9/26 14:05」）。 */
export function defaultSpotName(prefix: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return normalizeSpotName(
    `${prefix} ${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function isPendingSpot(v: unknown): v is PendingPrivateSpot {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.localId === 'string' &&
    typeof o.userId === 'string' &&
    typeof o.name === 'string' &&
    typeof o.lat === 'number' &&
    typeof o.lng === 'number' &&
    typeof o.recordedAt === 'string'
  )
}

/** 端末内キューを読む。壊れた要素は無視する（localStorage は利用者が触れるため）。 */
export function readPendingSpots(): PendingPrivateSpot[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPendingSpot) : []
  } catch {
    return []
  }
}

function writePendingSpots(list: PendingPrivateSpot[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  } catch {
    /* 容量超過・プライベートモード等。呼び出し側は戻り値で判断する */
  }
}

/** キューに積む。上限に達していたら false（呼び出し側がエラー表示する）。 */
export function enqueuePendingSpot(spot: Omit<PendingPrivateSpot, 'localId'>): PendingPrivateSpot | null {
  const list = readPendingSpots()
  if (list.length >= MAX_PENDING_SPOTS) return null
  const localId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const item: PendingPrivateSpot = { ...spot, localId }
  writePendingSpots([...list, item])
  // 書き込めたかを読み直して確かめる（容量超過で黙って失われるのを防ぐ）
  return readPendingSpots().some((s) => s.localId === localId) ? item : null
}

/** 送信できた・消したい要素をキューから外す。 */
export function removePendingSpot(localId: string): void {
  writePendingSpots(readPendingSpots().filter((s) => s.localId !== localId))
}

/** 通信エラー（圏外・タイムアウト）か。RLS 拒否や CHECK 違反のような「送り直しても通らない」失敗は false。 */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err)
  return /Failed to fetch|NetworkError|Load failed|network|timeout/i.test(message)
}
