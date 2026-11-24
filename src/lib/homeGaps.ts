// ホームの「次に足りない記録」と、新着の「写真なしの記録」の集計。画面・通信に依存しない純関数。
// 数字はすべて承認済みの公開記録から出す。座標・投稿者は扱わない。
import { DEX_MUNICIPALITY_TOTAL, MUNICIPALITIES, SPECIES } from '@/lib/constants'
import type { PostPreset } from '@/lib/postPreset'
import { jstDay } from '@/lib/jstDate'

/** 種ごとの記録がこの件数に満たなければ「足りない」とみなす。 */
export const GAP_SPECIES_FEW = 5
/** 「見つからなかった」の記録がこの件数に満たなければ「足りない」とみなす。 */
export const GAP_ABSENCE_FEW = 20

/** 公開記録1件の、集計に使う列だけ。 */
export interface CoverageRow {
  species: string
  info_type: string
  municipality: string | null
}

export interface Coverage {
  total: number
  bySpecies: Record<string, number>
  absence: number
  /** 記録のある秋田県の市町村の数（県外・表記ゆれは数えない）。 */
  municipalities: number
}

export function summarizeCoverage(rows: readonly CoverageRow[]): Coverage {
  const bySpecies: Record<string, number> = {}
  for (const species of SPECIES) bySpecies[species.value] = 0
  const places = new Set<string>()
  let absence = 0
  for (const row of rows) {
    if (row.species in bySpecies) bySpecies[row.species] = (bySpecies[row.species] ?? 0) + 1
    if (row.info_type === 'absence') absence += 1
    if (row.municipality && MUNICIPALITIES.includes(row.municipality)) places.add(row.municipality)
  }
  return { total: rows.length, bySpecies, absence, municipalities: places.size }
}

export type GapKind = 'species' | 'absence' | 'area'

export interface Gap {
  kind: GapKind
  /** 画面に出す数字（species・absence は件数、area は記録のある市町村数）。 */
  count: number
  /** area だけ。市町村の総数。 */
  total?: number
  /** species だけ。足りない種。 */
  species?: string
  /** 押したときに開く投稿画面の事前選択。 */
  preset: PostPreset
}

/** 足りない記録を、研究で優先したい順（種 → 不在 → 場所）に最大3つ返す。 */
export function computeGaps(coverage: Coverage): Gap[] {
  const gaps: Gap[] = []
  const fewest = SPECIES
    .map((s) => ({ value: s.value, count: coverage.bySpecies[s.value] ?? 0 }))
    .sort((a, b) => a.count - b.count)[0]
  if (fewest && fewest.count < GAP_SPECIES_FEW) {
    gaps.push({ kind: 'species', count: fewest.count, species: fewest.value, preset: { species: fewest.value as PostPreset['species'] } })
  }
  if (coverage.absence < GAP_ABSENCE_FEW) {
    gaps.push({ kind: 'absence', count: coverage.absence, preset: { infoType: 'absence' } })
  }
  if (coverage.municipalities < DEX_MUNICIPALITY_TOTAL) {
    gaps.push({ kind: 'area', count: coverage.municipalities, total: DEX_MUNICIPALITY_TOTAL, preset: {} })
  }
  return gaps
}

/** 新着の「写真なし」の行に必要な列。 */
export interface PhotolessPost {
  id: string
  species: string
  info_type: string
  municipality: string | null
  created_at: string
}

export interface PhotolessGroup extends PhotolessPost {
  /** 同じ日・市町村・種・種類でまとめた件数。id・日付は最新の1件のもの。 */
  count: number
}

// 日本時間の日付の計算は、マイページの「活動の記録」と共通の jstDate.ts に置く（ここからも従来どおり使える）。
export { jstDay }

/**
 * 写真なしの記録を、同じ日（日本時間）・市町村・種・種類でまとめる。新しい順の入力を前提に、
 * まとめた行は最初（最新）の記録で代表させ、出てきた順を保つ。
 */
export function groupPhotoless(posts: readonly PhotolessPost[]): PhotolessGroup[] {
  const groups = new Map<string, PhotolessGroup>()
  for (const post of posts) {
    const key = [post.species, post.info_type, post.municipality ?? '', jstDay(post.created_at)].join('|')
    const found = groups.get(key)
    if (found) found.count += 1
    else groups.set(key, { ...post, count: 1 })
  }
  return [...groups.values()]
}
