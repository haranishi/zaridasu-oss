// REQ-330: 調査計画と希少種の記録の定数。
//
// 希少種の一覧は**ここ 1 か所**に置く。DB（rare_sightings.species_key）は形式
// `^[a-z][a-z0-9_]{0,39}$` しか検査しないので、種を足す・差し替えるのに migration は要らない。
// ただし一度保存された key は記録に残るので、**既存の key の綴りは変えない**（表示名は翻訳で変える）。
// 暫定の一覧（2026-10-01）。協力団体と相談して差し替える前提。

/** DB の CHECK と同じ形式。種を足すときはこれに合う key にする。 */
export const RARE_SPECIES_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/

/** 一覧に無い種。これを選んだときだけ名前（species_label）を必須にする（DB でも CHECK）。 */
export const RARE_SPECIES_OTHER = 'other'

export const RARE_SPECIES = [
  { key: 'nihon_zarigani', labelKey: 'fieldwork.rareSpecies.nihon_zarigani' },
  { key: 'medaka', labelKey: 'fieldwork.rareSpecies.medaka' },
  { key: 'zeni_tanago', labelKey: 'fieldwork.rareSpecies.zeni_tanago' },
  { key: 'shinai_motsugo', labelKey: 'fieldwork.rareSpecies.shinai_motsugo' },
  { key: 'tohoku_sanshouo', labelKey: 'fieldwork.rareSpecies.tohoku_sanshouo' },
  { key: 'kuro_sanshouo', labelKey: 'fieldwork.rareSpecies.kuro_sanshouo' },
  { key: 'gengorou', labelKey: 'fieldwork.rareSpecies.gengorou' },
  { key: 'tagame', labelKey: 'fieldwork.rareSpecies.tagame' },
  { key: RARE_SPECIES_OTHER, labelKey: 'fieldwork.rareSpecies.other' },
] as const

export type RareSpeciesKey = (typeof RARE_SPECIES)[number]['key']

/** 一覧にある key か。DB は一覧を知らないので、一覧外（古い key など）の表示判定に使う。 */
export function isKnownRareSpecies(key: string): key is RareSpeciesKey {
  return RARE_SPECIES.some((s) => s.key === key)
}

export const PLAN_STATUSES = ['active', 'done', 'archived'] as const
export const STOP_STATUSES = ['pending', 'done', 'skipped'] as const
export const STOP_SOURCES = ['pin', 'private_spot', 'survey_request', 'current_location'] as const
export const STOP_POST_KINDS = ['sighting', 'absence'] as const
export const RARE_LOCATION_SOURCES = ['gps', 'map'] as const

/**
 * 入力の長さと DB の上限。DB 側（supabase/migrations/20261001000001_req330_fieldwork.sql）の
 * CHECK とトリガーが正本で、ここは画面で先に止めるための写し。食い違ったら DB が勝つ。
 * 上限は管理者には効かない（DB のトリガーが素通りさせる）。
 */
export const FIELDWORK_LIMITS = {
  planTitleMax: 60,
  stopNameMax: 60,
  speciesLabelMax: 60,
  noteMax: 500,
  rareCountMin: 0,
  rareCountMax: 100_000,
  rarePhotosMax: 3,
  rarePhotoMaxBytes: 5 * 1024 * 1024,
  /** 計画: 1 日（直近 24 時間）30 件・1 人 1000 件 */
  plansPerDay: 30,
  plansPerUser: 1000,
  /** 地点: 1 時間 300 件・1 計画 100 か所 */
  stopsPerHour: 300,
  stopsPerPlan: 100,
  /** 希少種の記録: 1 時間 60 件・1 人 5000 件 */
  rarePerHour: 60,
  rarePerUser: 5000,
} as const

/** 写真置き場。公開しない（post-photos は誰でも一覧できるので絶対に使わない）。 */
export const RARE_PHOTOS_BUCKET = 'rare-photos'

/** 署名 URL の有効期限（秒）。公開 URL は作らない。 */
export const RARE_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 60
