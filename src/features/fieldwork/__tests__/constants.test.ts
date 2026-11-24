import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import en from '@/locales/en/translation.json'
import ja from '@/locales/ja/translation.json'
import ko from '@/locales/ko/translation.json'
import zh from '@/locales/zh/translation.json'
import type { Database } from '@/types/database.types'

import {
  FIELDWORK_LIMITS,
  PLAN_STATUSES,
  RARE_LOCATION_SOURCES,
  RARE_PHOTOS_BUCKET,
  RARE_SPECIES,
  RARE_SPECIES_KEY_PATTERN,
  RARE_SPECIES_OTHER,
  STOP_POST_KINDS,
  STOP_SOURCES,
  STOP_STATUSES,
  isKnownRareSpecies,
} from '../constants'

type Tables = Database['public']['Tables']
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

// 型レベルの照合: 定数の列挙が DB の型（＝ schema.sql の CHECK。schema:check が保証）とずれたら type-check で落ちる。
const enumsMatchDb: [
  Equal<(typeof PLAN_STATUSES)[number], Tables['survey_plans']['Row']['status']>,
  Equal<(typeof STOP_STATUSES)[number], Tables['survey_plan_stops']['Row']['status']>,
  Equal<(typeof STOP_SOURCES)[number], Tables['survey_plan_stops']['Row']['source']>,
  Equal<(typeof STOP_POST_KINDS)[number], Tables['survey_stop_posts']['Row']['kind']>,
  Equal<(typeof RARE_LOCATION_SOURCES)[number], Tables['rare_sightings']['Row']['location_source']>,
] = [true, true, true, true, true]

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261001000001_req330_fieldwork.sql'),
  'utf8'
)
const schema = readFileSync(join(process.cwd(), 'supabase/schema.sql'), 'utf8')

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict)
}

describe('希少種の一覧 (REQ-330)', () => {
  it('key は重複せず、DB と同じ形式（英小文字の識別子）で、「その他」を含む', () => {
    const keys = RARE_SPECIES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(RARE_SPECIES_KEY_PATTERN)
    expect(keys).toContain(RARE_SPECIES_OTHER)
  })

  it('形式の正規表現は migration と schema.sql の CHECK と同じ文字列', () => {
    const check = `species_key ~ '${RARE_SPECIES_KEY_PATTERN.source}'`
    expect(migration).toContain(check)
    expect(schema).toContain(check)
    expect(migration).toContain(`species_key <> '${RARE_SPECIES_OTHER}' OR species_label IS NOT NULL`)
  })

  it('表示名の翻訳キーが 4 言語すべてにある', () => {
    for (const { labelKey } of RARE_SPECIES) {
      for (const [lang, dict] of Object.entries({ ja, en, ko, zh })) {
        expect(typeof lookup(dict, labelKey), `${lang}: ${labelKey}`).toBe('string')
      }
    }
  })

  it('一覧外の key（古い記録など）を見分けられる', () => {
    expect(isKnownRareSpecies('medaka')).toBe(true)
    expect(isKnownRareSpecies('unknown_fish')).toBe(false)
  })
})

describe('列挙と上限 (REQ-330)', () => {
  it('列挙は DB の型と一致する（型レベルの照合が通っている）', () => {
    expect(enumsMatchDb.every(Boolean)).toBe(true)
  })

  it('写真置き場は非公開の rare-photos（公開の post-photos ではない）', () => {
    expect(RARE_PHOTOS_BUCKET).toBe('rare-photos')
    expect(migration).toMatch(/'rare-photos',\s*'rare-photos',\s*false,/)
  })

  it('画面で先に止める上限は DB の CHECK・トリガーと同じ数', () => {
    expect(migration).toContain(`cardinality(photo_paths) <= ${FIELDWORK_LIMITS.rarePhotosMax}`)
    expect(migration).toContain(`count BETWEEN ${FIELDWORK_LIMITS.rareCountMin} AND ${FIELDWORK_LIMITS.rareCountMax}`)
    expect(migration).toContain(`IF v_in_plan >= ${FIELDWORK_LIMITS.stopsPerPlan} THEN`)
    expect(migration).toContain(`${FIELDWORK_LIMITS.rarePhotoMaxBytes}, -- 5MB`)
    expect(migration).toContain(`BETWEEN 1 AND ${FIELDWORK_LIMITS.planTitleMax}`)
  })
})
