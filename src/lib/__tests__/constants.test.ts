import { describe, it, expect } from 'vitest'
import {
  SPECIES,
  INFO_TYPES,
  MUNICIPALITIES,
  PERIODS,
  BADGES,
  speciesLabel,
  infoTypeLabel,
  heatIntensity,
  heatWeight,
  CPUE_HOT_PER_HOUR,
  CPUE_COUNT_HOT,
} from '../constants'

describe('SPECIES', () => {
  it('2種類が定義されている', () => {
    expect(SPECIES).toHaveLength(2)
  })

  it('各種類に value, label, color, image が含まれる', () => {
    SPECIES.forEach(s => {
      expect(s).toHaveProperty('value')
      expect(s).toHaveProperty('label')
      expect(s).toHaveProperty('color')
      expect(s).toHaveProperty('image')
    })
  })

  it('american, bullfrog の2種類が含まれる', () => {
    const values = SPECIES.map(s => s.value)
    expect(values).toContain('american')
    expect(values).toContain('bullfrog')
  })
})

describe('INFO_TYPES', () => {
  it('5種類が定義されている', () => {
    expect(INFO_TYPES).toHaveLength(5)
  })

  it('各タイプに value, label, emoji が含まれる', () => {
    INFO_TYPES.forEach(t => {
      expect(t).toHaveProperty('value')
      expect(t).toHaveProperty('label')
      expect(t).toHaveProperty('emoji')
    })
  })

  it('sighting, capture, trace, damage が含まれる', () => {
    const values = INFO_TYPES.map(t => t.value)
    expect(values).toContain('sighting')
    expect(values).toContain('capture')
    expect(values).toContain('trace')
    expect(values).toContain('damage')
  })
})

describe('MUNICIPALITIES', () => {
  it('25市町村が定義されている', () => {
    expect(MUNICIPALITIES).toHaveLength(25)
  })

  it('秋田市が含まれる', () => {
    expect(MUNICIPALITIES).toContain('秋田市')
  })
})

describe('PERIODS', () => {
  it('4期間が定義されている', () => {
    expect(PERIODS).toHaveLength(4)
  })

  it('全期間 (value: "0") が含まれる', () => {
    expect(PERIODS.find(p => p.value === '0')).toBeDefined()
  })
})

describe('BADGES', () => {
  it('4バッジが定義されている', () => {
    expect(BADGES).toHaveLength(4)
  })

  it('各バッジに min, label, emoji, desc が含まれる', () => {
    BADGES.forEach(b => {
      expect(b).toHaveProperty('min')
      expect(b).toHaveProperty('label')
      expect(b).toHaveProperty('emoji')
      expect(b).toHaveProperty('desc')
    })
  })
})

describe('speciesLabel', () => {
  it('既知の value のラベルを返す', () => {
    expect(speciesLabel('american')).toBe('アメリカザリガニ')
    expect(speciesLabel('bullfrog')).toBe('ウシガエル')
  })

  it('未知の value はそのまま返す', () => {
    expect(speciesLabel('unknown_value')).toBe('unknown_value')
  })
})

describe('infoTypeLabel', () => {
  it('既知の value のラベルを返す', () => {
    expect(infoTypeLabel('sighting')).toBe('目撃')
    expect(infoTypeLabel('capture')).toBe('捕獲')
  })

  it('未知の value はそのまま返す', () => {
    expect(infoTypeLabel('unknown_type')).toBe('unknown_type')
  })
})

// REQ-258: CPUE（捕獲努力量あたり密度）ヒートマップ重み
describe('heatWeight', () => {
  it('absence（不在確認）は count/努力量に関わらず 0（熱源に含めない）', () => {
    expect(heatWeight({ info_type: 'absence' })).toBe(0)
    expect(heatWeight({ info_type: 'absence', count: 50, survey_duration_minutes: 10 })).toBe(0)
  })

  it('count も努力量も無ければ info_type 基準（heatIntensity）にフォールバック', () => {
    expect(heatWeight({ info_type: 'sighting' })).toBe(heatIntensity('sighting'))
    expect(heatWeight({ info_type: 'capture' })).toBe(heatIntensity('capture'))
    expect(heatWeight({ info_type: 'trace' })).toBe(heatIntensity('trace'))
  })

  it('count と survey_duration_minutes があれば CPUE（1時間あたり確認数）で上振れする', () => {
    // 目撃(基準0.7) を 10匹/30分 = 20匹/時 = CPUE_HOT_PER_HOUR → 正規化 1.0
    expect(heatWeight({ info_type: 'sighting', count: 10, survey_duration_minutes: 30 })).toBeCloseTo(1)
    // 半分の密度（10匹/時）→ 0.5 だが info_type 基準 0.7 が下限 → 0.7
    expect(heatWeight({ info_type: 'sighting', count: 5, survey_duration_minutes: 30 })).toBeCloseTo(0.7)
  })

  it('少数報告でも info_type 基準より暗くはならない（正直な少数報告を罰しない）', () => {
    // 捕獲(基準1.0) は低 CPUE でも 1.0 を維持
    expect(heatWeight({ info_type: 'capture', count: 1, survey_duration_minutes: 480 })).toBeCloseTo(1)
  })

  it('努力量が無く count だけなら CPUE_COUNT_HOT で正規化（基準を下限に）', () => {
    // trace(基準0.3): count = CPUE_COUNT_HOT → 1.0
    expect(heatWeight({ info_type: 'trace', count: CPUE_COUNT_HOT })).toBeCloseTo(1)
    // count 少なめ→ 基準 0.3 が下限
    expect(heatWeight({ info_type: 'trace', count: 1 })).toBeCloseTo(0.3)
  })

  it('極端値は 1.0 に上限クリップされる', () => {
    expect(heatWeight({ info_type: 'capture', count: 999, survey_duration_minutes: 1 })).toBe(1)
  })

  it('count/努力量が 0・負・非数なら効果なし（info_type 基準にフォールバック）', () => {
    expect(heatWeight({ info_type: 'sighting', count: 0, survey_duration_minutes: 30 })).toBeCloseTo(0.7)
    expect(heatWeight({ info_type: 'sighting', count: 10, survey_duration_minutes: 0 })).toBeCloseTo(0.7)
    expect(heatWeight({ info_type: 'sighting', count: -5, survey_duration_minutes: 30 })).toBeCloseTo(0.7)
    expect(heatWeight({ info_type: 'sighting', count: NaN, survey_duration_minutes: 30 })).toBeCloseTo(0.7)
  })

  it('CPUE_HOT_PER_HOUR / CPUE_COUNT_HOT が妥当な正の基準値', () => {
    expect(CPUE_HOT_PER_HOUR).toBeGreaterThan(0)
    expect(CPUE_COUNT_HOT).toBeGreaterThan(0)
  })
})
