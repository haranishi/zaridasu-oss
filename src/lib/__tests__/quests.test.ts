import { describe, it, expect } from 'vitest'
import {
  deriveCollectionSignals,
  computeQuests,
  collectionCompletionPct,
  QUESTS,
  type QuestState,
} from '../quests'
import type { CollectionEntry } from '@/hooks/useProfile'

/** id でクエストを引く（見つからなければ fail）。strict モードの undefined を排除。 */
function pick(quests: QuestState[], id: string): QuestState {
  const q = quests.find((x) => x.id === id)
  if (!q) throw new Error(`quest not found: ${id}`)
  return q
}

// テスト用 CollectionEntry ファクトリ（必要な列だけ埋める）。
function entry(partial: Partial<CollectionEntry> & { species: CollectionEntry['species'] }): CollectionEntry {
  return {
    species: partial.species,
    first_observed_at: partial.first_observed_at ?? null,
    info_types_seen: partial.info_types_seen ?? [],
    municipalities_seen: partial.municipalities_seen ?? [],
    verified_count: partial.verified_count ?? 0,
  }
}

describe('deriveCollectionSignals', () => {
  it('空コレクションはすべて 0 / false', () => {
    const s = deriveCollectionSignals([])
    expect(s).toEqual({
      speciesCount: 0,
      infoTypeCount: 0,
      municipalityCount: 0,
      hasAbsence: false,
      verifiedTotal: 0,
    })
  })

  it('複数種を横断して info_type / 市区町村の異なり数を集計する（重複排除）', () => {
    const s = deriveCollectionSignals([
      entry({ species: 'american', info_types_seen: ['sighting', 'capture'], municipalities_seen: ['秋田市', '横手市'], verified_count: 3 }),
      entry({ species: 'bullfrog', info_types_seen: ['sighting', 'trace'], municipalities_seen: ['秋田市'], verified_count: 2 }),
    ])
    expect(s.speciesCount).toBe(2)
    expect(s.infoTypeCount).toBe(3) // sighting, capture, trace（sighting は重複排除）
    expect(s.municipalityCount).toBe(2) // 秋田市, 横手市
    expect(s.hasAbsence).toBe(false)
    expect(s.verifiedTotal).toBe(5)
  })

  it('いずれかの種で不在(absence)を記録していれば hasAbsence=true', () => {
    const s = deriveCollectionSignals([
      entry({ species: 'american', info_types_seen: ['absence'], municipalities_seen: ['能代市'] }),
    ])
    expect(s.hasAbsence).toBe(true)
  })
})

describe('computeQuests', () => {
  it('達成状態を種類ごとに算出する（多様性クエストは true/false、質クエストの一部は null＝自由提案）', () => {
    const signals = deriveCollectionSignals([
      entry({ species: 'american', info_types_seen: ['sighting', 'capture', 'absence'], municipalities_seen: ['秋田市', '横手市'] }),
      entry({ species: 'bullfrog', info_types_seen: ['sighting'], municipalities_seen: ['秋田市'] }),
    ])
    const quests = computeQuests(signals)

    expect(pick(quests, 'info_variety').done).toBe(true) // 3 種類（sighting, capture, absence）>= 3
    expect(pick(quests, 'info_variety').current).toBe(3)
    expect(pick(quests, 'new_area').done).toBe(true) // 2 市町村 >= 2
    expect(pick(quests, 'both_species').done).toBe(true) // 2 種 >= 2
    expect(pick(quests, 'absence').done).toBe(true)
    // 定点観察 / GPS 精度はコレクションに現れないため常に自由提案（null）。罰しない。
    expect(pick(quests, 'structured').done).toBeNull()
    expect(pick(quests, 'gps_precise').done).toBeNull()
  })

  it('新規ユーザー（空コレクション）でも未達を false/null で返し、例外を投げない（無罰・任意参加）', () => {
    const quests = computeQuests(deriveCollectionSignals([]))
    expect(pick(quests, 'info_variety').done).toBe(false)
    expect(pick(quests, 'new_area').done).toBe(false)
    expect(pick(quests, 'both_species').done).toBe(false)
    expect(pick(quests, 'absence').done).toBe(false)
    expect(pick(quests, 'structured').done).toBeNull()
    // どのクエストにも「ペナルティ」を表す状態は存在しない（done は true/false/null のみ）。
    for (const q of quests) expect([true, false, null]).toContain(q.done)
  })

  it('すべてのクエスト定義に i18n キーが揃っている', () => {
    for (const q of QUESTS) {
      expect(q.titleKey).toMatch(/^quests\.items\./)
      expect(q.descKey).toMatch(/^quests\.items\./)
      expect(q.emoji.length).toBeGreaterThan(0)
    }
  })
})

describe('collectionCompletionPct', () => {
  it('観察なしは 0%', () => {
    expect(collectionCompletionPct([], 2, 5)).toBe(0)
  })

  it('両種すべての info_type を網羅したら 100%', () => {
    const full: CollectionEntry[] = [
      entry({ species: 'american', info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence'] }),
      entry({ species: 'bullfrog', info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence'] }),
    ]
    expect(collectionCompletionPct(full, 2, 5)).toBe(100)
  })

  it('片種のみ 5/5 網羅なら 50%（分母＝種数×info_type 総数）', () => {
    const half: CollectionEntry[] = [
      entry({ species: 'american', info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence'] }),
    ]
    expect(collectionCompletionPct(half, 2, 5)).toBe(50)
  })

  it('info_types_seen が総数を超えても分子は総数で頭打ち（100% を超えない）', () => {
    const over: CollectionEntry[] = [
      entry({ species: 'american', info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence', 'extra'] }),
      entry({ species: 'bullfrog', info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence'] }),
    ]
    expect(collectionCompletionPct(over, 2, 5)).toBe(100)
  })
})
