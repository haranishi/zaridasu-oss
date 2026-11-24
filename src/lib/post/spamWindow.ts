import { SPAM_KEY, SPAM_LIMIT_POSTS, SPAM_LIMIT_WINDOW_MS } from '@/lib/constants'

/**
 * REQ-247 (H2): usePostForm.checkSpamLimit の純粋部を切り出したユニット。
 *
 * 窓の計算と、利用者ごとに分けた成功履歴の安全な読み書きを持つ。
 * 保存が禁止された端末ではクライアント側の補助判定だけを省略する。
 *
 * ⚠️ このクライアント側チェックは UX 最適化のみを目的とする。localStorage は容易にクリア
 *    できるため、実レートリミットは DB トリガー (check_post_rate_limit) がサーバー側で強制する。
 */

/** 旧履歴には失敗した送信も混じるため移行しない。実投稿の上限は引き続き DB が担保する。 */
function successHistoryKey(userId: string): string {
  return `${SPAM_KEY}:success:v1:${userId}`
}

export function readSuccessfulPostTimestamps(userId: string): string[] {
  try {
    return parseTimestampList(localStorage.getItem(successHistoryKey(userId)))
  } catch {
    return []
  }
}

export function storeSuccessfulPostTimestamps(userId: string, timestamps: string[]): void {
  try {
    localStorage.setItem(successHistoryKey(userId), JSON.stringify(timestamps))
  } catch {
    // 投稿本体の成功／DB の上限エラーは、補助履歴の保存失敗で変えない。
  }
}

/**
 * localStorage に保存されたスパム判定用タイムスタンプ配列を安全にパースする。
 * 破損値・非配列・null は空配列へ丸め、配列中の文字列以外も除く。
 */
export function parseTimestampList(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export interface SpamWindowResult {
  allowed: boolean
  /** ブロック時のみ設定。次に投稿できる時刻（最古の有効投稿 + 窓長）。 */
  nextAvailable?: Date
  /** 窓内に残った（＝まだ有効な）タイムスタンプ列。許可時、呼び出し側はこれに現在時刻を足して保存する。 */
  recent: string[]
}

/**
 * スパム投稿制限の窓判定（純粋関数）。
 * - `storedTimestamps` のうち `now` から `SPAM_LIMIT_WINDOW_MS` 以内のものを「有効」とする。
 * - 有効件数が `SPAM_LIMIT_POSTS` 以上ならブロックし、最古の有効投稿を基準に次回可能時刻を返す。
 * - それ未満なら許可し、フィルタ後の `recent` を返す（保存は呼び出し側の責務）。
 */
export function evaluateSpamWindow(storedTimestamps: string[], now: number): SpamWindowResult {
  const recent = storedTimestamps.filter((t) => now - new Date(t).getTime() < SPAM_LIMIT_WINDOW_MS)
  if (recent.length >= SPAM_LIMIT_POSTS) {
    const oldest = Math.min(...recent.map((t) => new Date(t).getTime()))
    return { allowed: false, nextAvailable: new Date(oldest + SPAM_LIMIT_WINDOW_MS), recent }
  }
  return { allowed: true, recent }
}
