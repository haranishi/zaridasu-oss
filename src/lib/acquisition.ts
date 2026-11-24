/**
 * REQ-289: 流入計測の台帳（`from` の許可値）と、施策用の計測 URL 生成。
 *
 * なぜ台帳が要るか:
 *   `/?auth=signup&from=<任意>` はホワイトリスト無しで動くため、施策を始める敷居は低い。
 *   その代わり `ig` / `instagram` / `Instagram` のような表記ゆれがそのまま計測に入り、
 *   後から名寄せできなくなる。集計軸は**閉じた集合**に保ち、未知の値は `other` へ丸める。
 *
 * なぜ先に決める必要があるか:
 *   **流入計測は後付けができない。** 一度配った URL・QR コード・SNS 投稿に、後から
 *   パラメータを足すことはできない。施策を開始したあとで「どれが効いたか分からない」と
 *   気づいても、その期間のデータは復元できない（REQ-289 §背景）。
 *
 * 関連: REQ-176（LP CTA `/?auth=signup&from=lp`）/ REQ-182（帰属の TTL・削除）/
 *       REQ-232（trackEvent 一本化）/ REQ-236（シェア UTM）
 */

/**
 * `from` の許可値（＝集計軸）。
 *
 * 追加するときは **施策を開始する前に**ここへ足すこと。ここに無い値で配信すると
 * `other` に丸められ、どの施策から来たのかが（rawFrom を追わない限り）分からなくなる。
 */
export const ACQUISITION_SOURCES = {
  /** マーケLP `/lp` の CTA（REQ-176 FR-176-08。既存の唯一の値） */
  lp: 'マーケLP（/lp）の CTA',
  /** ザリガニ環境リスク教育ゲームからの送客 */
  game: 'ザリガニゲームからの送客リンク',
  /** Instagram プロフィールのリンク */
  ig_profile: 'Instagram プロフィールのリンク',
  /** Instagram ストーリーズのリンクスタンプ */
  ig_story: 'Instagram ストーリーズ',
  /** Instagram フィード投稿（個別のクリエイティブは utm_content で分ける） */
  ig_post: 'Instagram フィード投稿',
  /** A4 チラシの QR コード（高校・大学の授業配布用教材） */
  flyer_qr: 'A4チラシのQRコード',
  /** 名刺の QR / URL */
  meishi: '名刺',
  /** 大学・ゼミ・研究会経由の紹介 */
  univ: '大学・ゼミ経由',
} as const

export type AcquisitionSource = keyof typeof ACQUISITION_SOURCES

/** 台帳に無い値をまとめる先。集計軸を汚さないための受け皿。 */
export const OTHER_SOURCE = 'other' as const

export type NormalizedFrom = AcquisitionSource | typeof OTHER_SOURCE

/** `from` の生値がそのまま送られてよい最大長（異常に長い値を計測へ流さない）。 */
const RAW_FROM_MAX_LENGTH = 64

/** sessionStorage のキー（REQ-182）。 */
export const AUTH_FROM_STORAGE_KEY = 'zaridasu:authFrom'

/**
 * 退避した `from` の有効期限。
 * REQ-289 NFR-289-03: 以前は AuthModal.tsx と AuthCallbackPage.tsx に同じ値が
 * 二重定義されていたため、ここへ集約した。
 */
export const AUTH_FROM_TTL_MS = 30 * 60 * 1000

/** 台帳に載っている値かどうか。 */
export function isKnownSource(value: string): value is AcquisitionSource {
  return Object.prototype.hasOwnProperty.call(ACQUISITION_SOURCES, value)
}

/**
 * 計測イベントへ載せる `from` を正規化する（REQ-289 FR-289-04）。
 *
 * - 台帳にある値はそのまま返す
 * - 台帳に無い値は `other` へ丸めたうえで、元の値を `rawFrom` として併せて返す
 *   （丸めるだけだと台帳の追加漏れに永久に気づけないため）
 * - 空・非文字列は `null`（`from` を載せない）
 */
export function normalizeAuthFrom(
  raw: string | null | undefined,
): { from: NormalizedFrom; rawFrom?: string } | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isKnownSource(trimmed)) return { from: trimmed }
  return { from: OTHER_SOURCE, rawFrom: trimmed.slice(0, RAW_FROM_MAX_LENGTH) }
}

/**
 * 計測イベントのプロパティへ展開する（`from` が無ければ空オブジェクト）。
 * 呼び出し側で `...toTrackingProps(raw)` として使う。
 */
export function toTrackingProps(
  raw: string | null | undefined,
): { from?: NormalizedFrom; from_raw?: string } {
  const normalized = normalizeAuthFrom(raw)
  if (!normalized) return {}
  return normalized.rawFrom
    ? { from: normalized.from, from_raw: normalized.rawFrom }
    : { from: normalized.from }
}
