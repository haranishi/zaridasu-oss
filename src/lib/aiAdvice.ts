// REQ-252 / REQ-170: AI「撮影アドバイス」コードの単一の真実（クライアント側）。
//
// analyze-image エッジ関数は improvement_advice を言語非依存の enum コード配列で返す
// （supabase/functions/_shared/aiSchema.ts の ADVICE_ENUM が受信側検証。ここはその表示側）。
// 表示文言は i18n の `detail.aiAdvice.<code>` を単一の真実とし、投稿者へフィードバックを出す
// 複数箇所（DetailPage / MyPostsSection 等）で本ヘルパを共有して重複を避ける（DRY）。

/** 既知の撮影アドバイスコード。aiSchema.ts の ADVICE_ENUM と一致させること。 */
export const ADVICE_CODES = [
  'angle',
  'distance',
  'lighting',
  'focus',
  'closer',
  'whole_body',
] as const

export type AdviceCode = (typeof ADVICE_CODES)[number]

const ADVICE_CODE_SET: ReadonlySet<string> = new Set(ADVICE_CODES)

/**
 * improvement_advice（Gemini 由来・未知コードが混入しうる）を既知コードだけに絞る（NFR-170-03）。
 * 未定義コードは露出させない。配列以外は空配列。
 */
export function filterAdviceCodes(
  codes: readonly string[] | null | undefined,
): AdviceCode[] {
  if (!Array.isArray(codes)) return []
  return codes.filter((c): c is AdviceCode => ADVICE_CODE_SET.has(c))
}

/** アドバイスコード → i18n 翻訳キー（`detail.aiAdvice.<code>`）。 */
export function adviceLabelKey(code: AdviceCode): string {
  return `detail.aiAdvice.${code}`
}
