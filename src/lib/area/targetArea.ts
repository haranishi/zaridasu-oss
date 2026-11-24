import { TARGET_PREFECTURE, AKITA_BOUNDS } from '@/lib/constants'

/**
 * REQ-255: 投稿対象エリア（フォーカス県＝秋田県）の内外を判定する純粋ヘルパ。
 *
 * 用途はソフト（非ブロッキング）な注意喚起のみ。ハードな投稿制限には使わない
 * （市民科学の投稿は妨げない方針）。判定の主は「逆ジオコで解決した都道府県名」で、
 * bbox は座標しか無い場面向けの補助（矩形なので隣県の一部を含む点に注意）。
 */

/**
 * 県名の表記ゆれを吸収するための正規化。
 * - 前後空白除去 / 小文字化 / 空白・区切り除去
 * - 県/府/都、"prefecture"、"ken" などの接尾辞を末尾から除去
 * 例: "秋田県" → "秋田" / "Akita Prefecture" → "akita" / "Akita-ken" → "akita"
 */
function normalizePrefecture(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') // 空白除去（JS の \s は全角スペース U+3000 も含む）
    .replace(/[-_]/g, '') // 区切り除去（akita-ken → akitaken）
    .replace(/(県|府|都|prefecture|ken)$/u, '') // 一般的な県接尾辞を末尾から除去
}

// 対象県の正規化済み別名。kanji（秋田）は romaji（akita）の部分列にならないため、
// 両表記を明示的に別名として持つ（accept-language=ja でも state 側が英字で返る場合に備える）。
const TARGET_PREFECTURE_ALIASES: readonly string[] = Array.from(
  new Set([TARGET_PREFECTURE, 'Akita'].map(normalizePrefecture).filter(Boolean)),
)

/**
 * 逆ジオコで解決した都道府県名が対象県（秋田県）かどうか。
 * undefined / null / 空文字 / 未知の県は false（＝「県内である」と積極的に判定できるときのみ true）。
 * 呼び出し側は「県が判明していて、かつ対象外」のときだけ注意喚起を出すこと。
 */
export function isWithinTargetPrefecture(prefectureName?: string | null): boolean {
  if (!prefectureName) return false
  const normalized = normalizePrefecture(prefectureName)
  if (!normalized) return false
  // 別名（秋田 / akita）を部分列として含めば対象内とみなす
  //（"秋田市" のように市名が紛れ込んでも "秋田" を含むため許容する）。
  return TARGET_PREFECTURE_ALIASES.some((alias) => normalized.includes(alias))
}

/**
 * 座標が対象県のおおよその境界ボックス内か（AKITA_BOUNDS）。
 * 県名が取れない場面向けの補助判定。矩形のため隣県の一部を含む（＝あくまで概算）。
 * 非有限値は false。
 */
export function isWithinTargetBBox(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const { latMin, latMax, lngMin, lngMax } = AKITA_BOUNDS
  return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax
}
