import { describe, expect, it } from 'vitest'
import { DEX_MUNICIPALITY_TOTAL } from '@/lib/constants'
import {
  GAP_ABSENCE_FEW,
  GAP_SPECIES_FEW,
  computeGaps,
  groupPhotoless,
  jstDay,
  summarizeCoverage,
  type Coverage,
  type CoverageRow,
} from '@/lib/homeGaps'

const row = (species: string, info_type: string, municipality: string | null): CoverageRow => ({ species, info_type, municipality })

describe('summarizeCoverage（ホームの「次に足りない記録」の材料）', () => {
  it('種・「見つからなかった」・市町村を数える。県外や表記ゆれの市町村は数えない', () => {
    const coverage = summarizeCoverage([
      row('american', 'sighting', '由利本荘市'),
      row('american', 'absence', '由利本荘市'),
      row('american', 'absence', '八郎潟町'),
      row('bullfrog', 'sighting', null),
      row('american', 'sighting', '青森市'),
    ])
    expect(coverage).toEqual({ total: 5, bySpecies: { american: 4, bullfrog: 1 }, absence: 2, municipalities: 2 })
  })

  it('記録がなくても、対象の種は0件として持つ（見本の数値は出さない）', () => {
    expect(summarizeCoverage([])).toEqual({ total: 0, bySpecies: { american: 0, bullfrog: 0 }, absence: 0, municipalities: 0 })
  })

  it('対象外の種は種別の集計に入れないが、全体の件数には含める', () => {
    const coverage = summarizeCoverage([row('unknown', 'sighting', '秋田市')])
    expect(coverage.bySpecies).toEqual({ american: 0, bullfrog: 0 })
    expect(coverage.total).toBe(1)
  })
})

describe('computeGaps', () => {
  const base: Coverage = { total: 15, bySpecies: { american: 15, bullfrog: 0 }, absence: 5, municipalities: 2 }

  it('ウシガエルが0件なら、種 → 不在 → 場所の順に出し、押したときの事前選択を持つ', () => {
    const gaps = computeGaps(base)
    expect(gaps.map(g => g.kind)).toEqual(['species', 'absence', 'area'])
    expect(gaps[0]).toMatchObject({ kind: 'species', count: 0, species: 'bullfrog', preset: { species: 'bullfrog' } })
    expect(gaps[1]).toMatchObject({ kind: 'absence', count: 5, preset: { infoType: 'absence' } })
    expect(gaps[2]).toMatchObject({ kind: 'area', count: 2, total: DEX_MUNICIPALITY_TOTAL, preset: {} })
  })

  it('種は記録がいちばん少ない1種だけ出す', () => {
    const gaps = computeGaps({ ...base, bySpecies: { american: 2, bullfrog: 3 } })
    expect(gaps.filter(g => g.kind === 'species')).toEqual([expect.objectContaining({ species: 'american', count: 2 })])
  })

  it('目安の件数にそろった項目は出さない。すべてそろえば欄ごと出さない', () => {
    const enough: Coverage = {
      total: 999,
      bySpecies: { american: GAP_SPECIES_FEW, bullfrog: GAP_SPECIES_FEW },
      absence: GAP_ABSENCE_FEW,
      municipalities: DEX_MUNICIPALITY_TOTAL,
    }
    expect(computeGaps(enough)).toEqual([])
    expect(computeGaps({ ...enough, absence: GAP_ABSENCE_FEW - 1 }).map(g => g.kind)).toEqual(['absence'])
  })
})

describe('jstDay / groupPhotoless（新着の「写真なし」を1行にまとめる）', () => {
  it('日付は日本時間で区切る（UTCの15時以降は翌日）', () => {
    expect(jstDay('2026-10-08T14:59:59Z')).toBe('2026-10-08')
    expect(jstDay('2026-10-08T15:00:00Z')).toBe('2026-10-09')
  })

  const post = (id: string, created_at: string, over: Partial<{ species: string; info_type: string; municipality: string | null }> = {}) => ({
    id, created_at, species: 'american', info_type: 'absence', municipality: '由利本荘市', ...over,
  })

  it('同じ日・市町村・種・種類は1行にまとめ、最新の記録で代表させる', () => {
    const groups = groupPhotoless([
      post('a', '2026-10-08T05:00:00Z'),
      post('b', '2026-10-08T04:00:00Z'),
      post('c', '2026-10-08T03:00:00Z'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ id: 'a', count: 3 })
  })

  it('日・市町村・種類のどれかが違えば別の行にし、新しい順を保つ', () => {
    const groups = groupPhotoless([
      post('a', '2026-10-08T05:00:00Z'),
      post('b', '2026-10-08T04:00:00Z', { municipality: '八郎潟町' }),
      post('c', '2026-10-07T04:00:00Z'),
      post('d', '2026-10-08T03:00:00Z', { info_type: 'trace' }),
    ])
    expect(groups.map(g => [g.id, g.count])).toEqual([['a', 1], ['b', 1], ['c', 1], ['d', 1]])
  })

  it('市町村が非公開（null）の記録は、非公開どうしでまとめる', () => {
    const groups = groupPhotoless([
      post('a', '2026-10-08T05:00:00Z', { municipality: null }),
      post('b', '2026-10-08T04:00:00Z', { municipality: null }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.count).toBe(2)
  })
})
