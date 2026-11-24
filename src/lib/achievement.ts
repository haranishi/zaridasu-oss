/**
 * REQ-226: 達成感マイクロインタラクションの共通ユーティリティ。
 *
 * NFR-226-04 (DRY): いいね・コメント・バッジ・カウントアップで共有する小さな関数を 1 箇所に集約する。
 * NFR-226-02: アニメの有無は常に prefers-reduced-motion を尊重する（JS 駆動の演出も同様）。
 */

/**
 * `prefers-reduced-motion: reduce` が有効か（SSR では false）。
 * AudioRecorder.tsx の前例（window.matchMedia('(prefers-reduced-motion: reduce)')）に合わせる。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * FR-226-06 (b): 既知バッジ ID 集合を localStorage に保持し、未知 ID が増えたら「新規獲得」とみなす。
 *
 * - スコープを `scopeKey`（例: userId / 'dashboard'）で分け、別ユーザーのプロフィールや別端末で
 *   取り違えないようにする。
 * - 戻り値 = 今回新たに見つかった（前回の既知集合に無かった）バッジ ID の集合。
 *   localStorage が使えない環境（プライベートモード等）では「新規なし」とみなし、解放アニメは
 *   再生しない（実害は装飾の不再生のみ・NFR-226-03 のデータ整合性には無関係）。
 * - 既知集合は呼び出し時に現在値で更新する（＝同じ表示中に二重再生しない）。再訪時には既知集合に
 *   含まれるため再生されない（AC-05）。
 *
 * @param scopeKey  localStorage キーの末尾（profile は userId、dashboard は固定文字列）
 * @param currentIds 現在「獲得済み」のバッジ ID 一覧
 * @returns 新規に獲得したバッジ ID の Set（初回 = localStorage 未保存時は「新規なし」を返す）
 */
export function detectNewBadgeIds(scopeKey: string, currentIds: string[]): Set<string> {
  const storageKey = `zaridasu_seen_badges_${scopeKey}`
  const current = new Set(currentIds)

  if (typeof window === 'undefined') return new Set()

  let prev: Set<string>
  let hadRecord: boolean
  try {
    const raw = window.localStorage.getItem(storageKey)
    hadRecord = raw != null
    prev = new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    // localStorage / JSON が使えない環境では新規判定を行わない（通常表示にフォールバック）。
    return new Set()
  }

  // 既知集合を現在値で更新（同一表示中の二重発火と、再訪時の再生を防ぐ）。
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...current]))
  } catch {
    /* 書き込み不可でも判定結果は返す（次回また新規扱いになり得るが装飾のみ） */
  }

  // 初回（記録が無い）のときは「既存ユーザーの初表示で全バッジが pop する」のを避けるため新規なし扱い。
  if (!hadRecord) return new Set()

  const fresh = new Set<string>()
  for (const id of current) {
    if (!prev.has(id)) fresh.add(id)
  }
  return fresh
}

/**
 * FR-226-06: 数値しきい値ベース（BadgeSection の myTotal）で「今回新たに到達したしきい値」を判定する。
 *
 * - 前回見た合計値（lastSeenTotal）を localStorage に保持し、`thresholds` のうち
 *   `lastSeenTotal < min <= currentTotal` を満たすものを「新規解放」として返す。
 * - 初回（記録が無い）のときは新規なし扱い（既存ユーザーの初表示で全部 pop しない）。
 *
 * @returns 今回新たに到達したしきい値（min）の Set
 */
export function detectNewThresholds(scopeKey: string, currentTotal: number, thresholds: number[]): Set<number> {
  const storageKey = `zaridasu_seen_total_${scopeKey}`
  if (typeof window === 'undefined') return new Set()

  let lastSeen: number | null
  try {
    const raw = window.localStorage.getItem(storageKey)
    lastSeen = raw != null ? Number(raw) : null
  } catch {
    return new Set()
  }

  try {
    window.localStorage.setItem(storageKey, String(currentTotal))
  } catch {
    /* 書き込み不可でも判定結果は返す */
  }

  if (lastSeen == null || Number.isNaN(lastSeen)) return new Set()

  const fresh = new Set<number>()
  for (const min of thresholds) {
    if (lastSeen < min && min <= currentTotal) fresh.add(min)
  }
  return fresh
}
