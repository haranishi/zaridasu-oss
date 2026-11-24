/**
 * REQ-138 Phase 1: PostgREST フィルタ文字列に渡すユーザー入力のエスケープ。
 *
 * - `escapePostgrestValue`: `.or()` / `.filter()` 等で値部に文字列連結する際の
 *   構文文字 (バックスラッシュ・カンマ・括弧・アスタリスク・ダブルクォート) を
 *   バックスラッシュでエスケープする。返り値はクオート無しのリテラル値。
 *   利用側で `"..."` でクオートする場合はそちらに任せる。
 * - `escapeIlikePattern`: `.ilike()` / ilike フィルタのパターン用に
 *   `%` と `_` のワイルドカードも追加でエスケープする。
 *
 * 共通の制約: 100 文字でクリップする (NFR-138-02 / FR-138-05)。
 *
 * 将来的には textSearch + GIN index への移行で `.or()` 文字列連結を撤廃したい。
 */

const MAX_INPUT_LENGTH = 100

/**
 * PostgREST の値部分で意味を持つ文字 (`\` `,` `(` `)` `*` `"`) をエスケープする。
 *
 * - 必ず `\\` (バックスラッシュ自身) を最初に置換し、後続の置換でのダブルエスケープを避ける。
 * - 100 文字でクリップする (defense in depth)。
 */
export function escapePostgrestValue(input: string): string {
  const clipped = input.slice(0, MAX_INPUT_LENGTH)
  return clipped
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*')
    .replace(/"/g, '\\"')
}

/**
 * `.ilike()` パターン用エスケープ。`%` / `_` ワイルドカードも追加で潰す。
 *
 * 順序:
 *   1. バックスラッシュを `\\` へ
 *   2. `%` / `_` (LIKE ワイルドカード) を `\%` / `\_` へ
 *   3. PostgREST DSL の `,` `(` `)` `*` `"` を `\` 付きへ
 *
 * 100 文字でクリップする。
 */
export function escapeIlikePattern(input: string): string {
  const clipped = input.slice(0, MAX_INPUT_LENGTH)
  return clipped
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*')
    .replace(/"/g, '\\"')
}
