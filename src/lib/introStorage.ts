/**
 * REQ-284: 紹介ストーリー（IntroPrompt / OnboardingFlow）と、既存バナーの恒久 opt-out が使う
 * ストレージキーとアクセサ。
 *
 * FR-284-15 / AC-08: 保存・読み出しに失敗する環境（プライベートモード、ストレージ無効、
 * SSR）では **すべて try/catch でフェイルソフト**し、例外を UI へ伝播させない
 * （src/lib/achievement.ts:41-52 と同じ扱い）。この場合の挙動は「毎回出る」で構わない。
 *
 * 命名は REQ-284 §2-D の決定に従い、多数派の `zaridasu_` プレフィックスへ寄せる
 * （既存の素のスネークケース `signup_banner_dismissed_at` 等は互換のため変更しない）。
 */

// ── キー定数 ────────────────────────────────────────────────────────────────

/** 恒久 opt-out。設定済みなら誘いポップアップを二度と出さない（FR-284-04）。 */
export const INTRO_OPTOUT_KEY = 'zaridasu_intro_optout_v1'
/** ストーリーを読んだ（最後まで到達した / 閉じた）時刻 epoch ms（FR-284-06）。 */
export const INTRO_READ_AT_KEY = 'zaridasu_intro_read_at'
/** ［あとで］は「その訪問中だけ」非表示なので sessionStorage に置く（FR-284-04 / AC-03）。 */
export const INTRO_LATER_SESSION_KEY = 'zaridasu_intro_later_v1'
/** SignupBanner の恒久 opt-out（FR-284-13）。既存の期限付きスヌーズとは別キー。 */
export const SIGNUP_BANNER_OPTOUT_KEY = 'zaridasu_signup_banner_optout_v1'
/** InstallBanner の恒久 opt-out（FR-284-13）。 */
export const INSTALL_BANNER_OPTOUT_KEY = 'zaridasu_install_banner_optout_v1'

const FLAG_ON = '1'

// ── 低レベルアクセサ（フェイルソフト） ──────────────────────────────────────

export function readLocal(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* 書き込み不可でも UI は継続する（毎回出る挙動で構わない・FR-284-15） */
  }
}

export function readSession(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeSession(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    /* 同上 */
  }
}

// ── 紹介ストーリーの状態 ────────────────────────────────────────────────────

/** 恒久的に断られているか（FR-284-02 / AC-02）。 */
export function isIntroOptedOut(): boolean {
  return readLocal(INTRO_OPTOUT_KEY) === FLAG_ON
}

/** 既に読んでいるか（FR-284-02 / AC-04）。 */
export function hasReadIntro(): boolean {
  return readLocal(INTRO_READ_AT_KEY) != null
}

/** この訪問中は［あとで］で断られているか（FR-284-04 / AC-03）。 */
export function isIntroDeferredForSession(): boolean {
  return readSession(INTRO_LATER_SESSION_KEY) === FLAG_ON
}

export function markIntroOptedOut(): void {
  writeLocal(INTRO_OPTOUT_KEY, FLAG_ON)
}

/** FR-284-06: 読了（または閉じた）時刻を保存する。以後 誘いポップアップは出さない。 */
export function markIntroRead(now: number = Date.now()): void {
  writeLocal(INTRO_READ_AT_KEY, String(now))
}

export function deferIntroForSession(): void {
  writeSession(INTRO_LATER_SESSION_KEY, FLAG_ON)
}

/**
 * FR-284-02: 誘いポップアップを出してよいか。
 * opt-out 済み・読了済み・当セッションで［あとで］のいずれかなら出さない。
 */
export function shouldShowIntroPrompt(): boolean {
  return !isIntroOptedOut() && !hasReadIntro() && !isIntroDeferredForSession()
}

// ── バナーの恒久 opt-out（FR-284-13） ───────────────────────────────────────

export type BannerOptOutKey = typeof SIGNUP_BANNER_OPTOUT_KEY | typeof INSTALL_BANNER_OPTOUT_KEY

export function isBannerOptedOut(key: BannerOptOutKey): boolean {
  return readLocal(key) === FLAG_ON
}

export function markBannerOptedOut(key: BannerOptOutKey): void {
  writeLocal(key, FLAG_ON)
}

// ── 多重ポップアップ抑止の共有ストア（FR-284-14） ───────────────────────────
//
// 誘いポップアップ / ストーリー本体が表示されている間は SignupBanner・InstallBanner を出さない。
// SignupBanner は HomePage 配下、InstallBanner は providers.tsx 配下と React ツリー上の位置が
// 離れているため、Context ではなくモジュールスコープの参照カウント + 購読で共有する
// （同一 webpack モジュールインスタンスを共有するので dynamic import 越しでも一致する）。
//
// useBodyScrollLock の参照カウント（src/hooks/useBodyScrollLock.ts:8）とは
// **別のカウンタ**で、body のスタイルには一切触れない（NFR: 衝突しない）。

let requiredOverlayCount = 0
export function isRequiredOnboardingOpen(): boolean { return requiredOverlayCount > 0 }

let overlayCount = 0
const overlayListeners = new Set<() => void>()

/** 現在、紹介系オーバーレイ（誘い or ストーリー）が表示中か。 */
export function isIntroOverlayOpen(): boolean {
  return overlayCount > 0
}

/**
 * オーバーレイの表示を宣言する。戻り値は解除関数（useEffect のクリーンアップにそのまま使う）。
 * 解除は多重呼び出しされてもカウントを 1 回しか戻さない。
 */
export function acquireIntroOverlay(required = false): () => void {
  if (required) requiredOverlayCount += 1
  overlayCount += 1
  notifyOverlay()
  let released = false
  return () => {
    if (released) return
    released = true
    if (required) requiredOverlayCount -= 1
    overlayCount = Math.max(0, overlayCount - 1)
    notifyOverlay()
  }
}

export function subscribeIntroOverlay(listener: () => void): () => void {
  overlayListeners.add(listener)
  return () => { overlayListeners.delete(listener) }
}

function notifyOverlay(): void {
  for (const listener of overlayListeners) listener()
}

/** テスト用: カウンタと購読者を初期化する（本番コードからは呼ばない）。 */
export function resetIntroOverlayForTest(): void {
  requiredOverlayCount = 0
  overlayCount = 0
  overlayListeners.clear()
  storyRequest = null
  storyListeners.clear()
}

// ── ストーリー本体の起動リクエスト（FR-284-01 / FR-284-10）─────────────────
//
// 任意モードの OnboardingFlow は OnboardingHost に集約し（必須は OnboardingGate）、
// 起動要求だけをこのストア経由で受け渡す。理由は 2 つある。
//
//  1. AC-05: 「ザリダスってなに？」は `/` 以外のページからも開ける必要がある。ホストを
//     providers に 1 つ置けば、どの画面からでも同じモーダルが開く。
//  2. AC-18（バンドル予算）: `dynamic(() => import(...))` を DrawerMenu のような**共有チャンクの
//     モジュール**に置くと、webpack のチャンク分割が変わり、共有チャンクにあった date-fns や
//     lucide のモジュールが `/` の page chunk へ押し出されて 10KB 予算を 0.63KB 超過した
//     （2026-08-05 実測: 9.41KB → 10.07KB）。動的 import の起点をホスト 1 箇所に閉じることで
//     共有モジュールから非同期エッジを無くし、予算内に収める。

export interface IntroStoryRequest {
  /** 最終画面［投稿してみる］の遷移先。呼び出し元（HomePage / DrawerMenu）の投稿導線。 */
  onPostClick?: () => void
}

let storyRequest: IntroStoryRequest | null = null
const storyListeners = new Set<() => void>()

/** ストーリー本体を開く。表示中なら要求を差し替える。 */
export function requestIntroStory(request: IntroStoryRequest = {}): void {
  storyRequest = request
  notifyStory()
}

export function closeIntroStory(): void {
  if (storyRequest === null) return
  storyRequest = null
  notifyStory()
}

export function getIntroStoryRequest(): IntroStoryRequest | null {
  return storyRequest
}

export function subscribeIntroStory(listener: () => void): () => void {
  storyListeners.add(listener)
  return () => { storyListeners.delete(listener) }
}

function notifyStory(): void {
  for (const listener of storyListeners) listener()
}
