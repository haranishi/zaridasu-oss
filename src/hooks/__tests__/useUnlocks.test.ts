import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUnlocks } from '../useUnlocks'
import { FEATURE_UNLOCKS, type FeatureKey } from '@/lib/constants'

describe('FEATURE_UNLOCKS（REQ-249 宣言的アンロック表）', () => {
  it('各エントリは level>=1・features 配下の labelKey・enforcement を持つ', () => {
    for (const def of Object.values(FEATURE_UNLOCKS)) {
      expect(def.level).toBeGreaterThanOrEqual(1)
      expect(def.labelKey).toMatch(/^unlocks\.features\./)
      expect(['client', 'server']).toContain(def.enforcement)
    }
  })

  it('中核貢献キーは表に載っていない（＝常時解放でデータ収集を減らさない）', () => {
    // 投稿/写真/位置/GPS/種選択/地図閲覧/コメント/通報は絶対にゲートしない = 未登録
    const core = ['post', 'photo', 'location', 'gps', 'species', 'map_view', 'comment', 'report']
    for (const k of core) expect(k in FEATURE_UNLOCKS).toBe(false)
  })

  it('コレクション(REQ-250)はサーバー強制フラグが付く（永続化＝書き込みのため）', () => {
    expect(FEATURE_UNLOCKS.collection.enforcement).toBe('server')
  })

  it('現状 UI に接続済みのゲートは client 判定で足りる印', () => {
    expect(FEATURE_UNLOCKS.heatmap.enforcement).toBe('client')
    expect(FEATURE_UNLOCKS.avatar_emoji_plus.enforcement).toBe('client')
    expect(FEATURE_UNLOCKS.csv_export.enforcement).toBe('client')
  })
})

describe('useUnlocks（REQ-249 解放判定）', () => {
  it('Lv1: しきい値2以上はロック。未登録キー（中核貢献相当）は常に解放', () => {
    const { result } = renderHook(() => useUnlocks(1))
    expect(result.current.isUnlocked('heatmap')).toBe(false) // Lv2
    expect(result.current.isUnlocked('avatar_emoji_plus')).toBe(false) // Lv2
    expect(result.current.isUnlocked('csv_export')).toBe(false) // Lv4
    // @ts-expect-error 未登録キー（中核貢献）は常時解放を検証
    expect(result.current.isUnlocked('post')).toBe(true)
    expect(result.current.level).toBe(1)
  })

  it('しきい値ちょうどで解放される（境界値）', () => {
    expect(renderHook(() => useUnlocks(2)).result.current.isUnlocked('heatmap')).toBe(true)
    expect(renderHook(() => useUnlocks(3)).result.current.isUnlocked('csv_export')).toBe(false)
    expect(renderHook(() => useUnlocks(4)).result.current.isUnlocked('csv_export')).toBe(true)
  })

  it('高レベルは全機能解放（既存の活動的ユーザーを剥奪しない = NFR-249-03）', () => {
    const { result } = renderHook(() => useUnlocks(99))
    for (const key of Object.keys(FEATURE_UNLOCKS) as FeatureKey[]) {
      expect(result.current.isUnlocked(key)).toBe(true)
    }
  })

  it('レベル不明（null/undefined/0/NaN）はフェイルオープン＝解放（匿名/未取得を剥奪しない）', () => {
    for (const lv of [null, undefined, 0, -1, NaN] as (number | null | undefined)[]) {
      const { result } = renderHook(() => useUnlocks(lv))
      expect(result.current.isUnlocked('heatmap')).toBe(true)
      expect(result.current.isUnlocked('csv_export')).toBe(true)
      expect(result.current.level).toBeNull()
    }
  })

  it('unlockLevelOf / labelKeyOf がティーザー用データを返す', () => {
    const { result } = renderHook(() => useUnlocks(1))
    expect(result.current.unlockLevelOf('heatmap')).toBe(2)
    expect(result.current.unlockLevelOf('csv_export')).toBe(4)
    expect(result.current.labelKeyOf('csv_export')).toBe('unlocks.features.csv_export')
  })
})
