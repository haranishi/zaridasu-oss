// 投稿画面を「種」「種類」を選んだ状態で開くための入口（/map?post=1&postSpecies=…&postType=…）。
// ホームの「次に足りない記録」から使う。URL は誰でも書き換えられるので、定義にない値は無視し、
// 投稿画面は通常どおり開く。種・種類の絞り込み用の `species` クエリ（地図の検索）とは別名にしてある。
import { INFO_TYPES, SPECIES } from '@/lib/constants'
import type { InfoType, Species } from '@/types'

export interface PostPreset {
  species?: Species
  infoType?: InfoType
}

/** URL から事前選択を読む。有効な値が1つもなければ null。 */
export function parsePostPreset(params: URLSearchParams): PostPreset | null {
  const species = SPECIES.find((s) => s.value === params.get('postSpecies'))?.value
  const infoType = INFO_TYPES.find((t) => t.value === params.get('postType'))?.value
  if (!species && !infoType) return null
  return {
    ...(species ? { species: species as Species } : {}),
    ...(infoType ? { infoType } : {}),
  }
}

/** 投稿画面を開く地図ページの URL。事前選択がなければ `/map?post=1`。 */
export function postPresetHref(preset?: PostPreset | null): string {
  const query = new URLSearchParams({ post: '1' })
  if (preset?.species) query.set('postSpecies', preset.species)
  if (preset?.infoType) query.set('postType', preset.infoType)
  return `/map?${query}`
}
