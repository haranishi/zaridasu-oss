import { describe, it, expect } from 'vitest'
import { xpForLevel, levelForXp, XP_LEVEL_COEFF, XP_DAILY_CAP } from '../constants'

// REQ-248: レベル曲線のクライアント単一ソースが DB（xp_for_level / level_for_xp）と一致することを固定する。
// DB 側 pgTAP（supabase/tests/rls_user_progress.sql）と同じ既知値を突き合わせる。

describe('xpForLevel（累積しきい値）', () => {
  it('DB xp_for_level(L)=25*(L-1)*L と同じ既知値を返す', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(50)
    expect(xpForLevel(3)).toBe(150)
    expect(xpForLevel(4)).toBe(300)
    expect(xpForLevel(5)).toBe(500)
    expect(xpForLevel(10)).toBe(2250)
    expect(xpForLevel(20)).toBe(9500)
  })

  it('係数 XP_LEVEL_COEFF に基づく（式の単一ソース）', () => {
    expect(XP_LEVEL_COEFF).toBe(25)
    expect(xpForLevel(6)).toBe(XP_LEVEL_COEFF * 5 * 6)
  })

  it('レベル1未満は0（下限クランプ）', () => {
    expect(xpForLevel(0)).toBe(0)
    expect(xpForLevel(-3)).toBe(0)
  })

  it('単調増加で、隣接レベル差は 50*L（低レベルは軽く上位ほど重い）', () => {
    for (let l = 1; l < 30; l++) {
      expect(xpForLevel(l + 1) - xpForLevel(l)).toBe(50 * l)
    }
  })
})

describe('levelForXp（XP→レベル逆算）', () => {
  it('DB level_for_xp と同じ境界挙動', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(49)).toBe(1)
    expect(levelForXp(50)).toBe(2)
    expect(levelForXp(149)).toBe(2)
    expect(levelForXp(150)).toBe(3)
    expect(levelForXp(2249)).toBe(9)
    expect(levelForXp(2250)).toBe(10)
  })

  it('負値・非数はレベル1', () => {
    expect(levelForXp(-1)).toBe(1)
    expect(levelForXp(NaN)).toBe(1)
  })

  it('xpForLevel との往復整合（各レベル境界でちょうど昇格）', () => {
    for (let l = 1; l <= 50; l++) {
      const at = xpForLevel(l)
      expect(levelForXp(at)).toBe(l)
      if (l > 1) expect(levelForXp(at - 1)).toBe(l - 1)
    }
  })

  it('XP に対して単調非減少', () => {
    let prev = 1
    for (let xp = 0; xp <= 10000; xp += 7) {
      const lv = levelForXp(xp)
      expect(lv).toBeGreaterThanOrEqual(prev)
      prev = lv
    }
  })
})

describe('XP_DAILY_CAP（ファーミング抑止・DB xp_daily_cap と同期）', () => {
  it('正の定数である', () => {
    expect(XP_DAILY_CAP).toBe(120)
    expect(XP_DAILY_CAP).toBeGreaterThan(0)
  })
})
