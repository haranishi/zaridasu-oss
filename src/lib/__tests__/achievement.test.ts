import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectNewBadgeIds, detectNewThresholds, prefersReducedMotion } from '../achievement'

// jsdom は localStorage / matchMedia を提供する（matchMedia は vitest.setup.ts で matches:false にモック済み）。
beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('detectNewBadgeIds', () => {
  it('初回（記録なし）は「新規なし」を返しつつ、現在の集合を永続化する', () => {
    // 既存ユーザーの初表示で全バッジが pop するのを避ける仕様。
    const fresh = detectNewBadgeIds('u1', ['a', 'b'])
    expect([...fresh]).toEqual([])
    expect(window.localStorage.getItem('zaridasu_seen_badges_u1')).toBe(JSON.stringify(['a', 'b']))
  })

  it('2 回目に増えた ID だけを「新規獲得」として返す', () => {
    detectNewBadgeIds('u1', ['a']) // 初回: 記録のみ
    const fresh = detectNewBadgeIds('u1', ['a', 'b', 'c'])
    expect(fresh).toEqual(new Set(['b', 'c']))
  })

  it('再訪（同じ集合）では新規なし（AC-05: 二重再生しない）', () => {
    detectNewBadgeIds('u1', ['a', 'b'])
    const again = detectNewBadgeIds('u1', ['a', 'b'])
    expect([...again]).toEqual([])
  })

  it('ID が減っても新規扱いにはしない', () => {
    detectNewBadgeIds('u1', ['a', 'b'])
    const fresh = detectNewBadgeIds('u1', ['a'])
    expect([...fresh]).toEqual([])
  })

  it('scopeKey ごとに独立（別ユーザーの既知集合を取り違えない）', () => {
    detectNewBadgeIds('u1', ['a']) // u1 初回
    const u2First = detectNewBadgeIds('u2', ['x', 'y']) // u2 初回 → 新規なし
    expect([...u2First]).toEqual([])
    const u2Next = detectNewBadgeIds('u2', ['x', 'y', 'z'])
    expect(u2Next).toEqual(new Set(['z']))
    // u1 は影響を受けない
    const u1Next = detectNewBadgeIds('u1', ['a', 'w'])
    expect(u1Next).toEqual(new Set(['w']))
  })

  it('localStorage が読めない環境では新規なしにフォールバック（例外を投げない）', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    const fresh = detectNewBadgeIds('u1', ['a', 'b'])
    expect([...fresh]).toEqual([])
  })
})

describe('detectNewThresholds', () => {
  it('初回（記録なし）は新規なし＋現在値を永続化する', () => {
    const fresh = detectNewThresholds('u1', 5, [1, 5, 10])
    expect([...fresh]).toEqual([])
    expect(window.localStorage.getItem('zaridasu_seen_total_u1')).toBe('5')
  })

  it('前回値 → 今回値の間に新しく到達したしきい値のみ返す', () => {
    detectNewThresholds('u1', 0, [1, 5, 10, 20]) // 記録 0
    const fresh = detectNewThresholds('u1', 12, [1, 5, 10, 20])
    // lastSeen=0 < min <= 12 を満たす 1,5,10（20 は未到達）
    expect(fresh).toEqual(new Set([1, 5, 10]))
  })

  it('すでに通過済みのしきい値は再解放しない', () => {
    detectNewThresholds('u1', 5, [1, 5, 10]) // 記録 5
    const fresh = detectNewThresholds('u1', 12, [1, 5, 10])
    // 1,5 は lastSeen=5 で既に通過 → 新規は 10 のみ
    expect(fresh).toEqual(new Set([10]))
  })

  it('同値の再訪では新規なし', () => {
    detectNewThresholds('u1', 10, [1, 5, 10])
    const again = detectNewThresholds('u1', 10, [1, 5, 10])
    expect([...again]).toEqual([])
  })

  it('scopeKey ごとに独立', () => {
    detectNewThresholds('a', 100, [50, 100]) // a: 記録 100
    const bFirst = detectNewThresholds('b', 0, [50, 100]) // b 初回
    expect([...bFirst]).toEqual([])
    const bNext = detectNewThresholds('b', 60, [50, 100])
    expect(bNext).toEqual(new Set([50]))
  })

  it('保存値が非数値（NaN）のときは新規なし扱い', () => {
    window.localStorage.setItem('zaridasu_seen_total_u1', 'not-a-number')
    const fresh = detectNewThresholds('u1', 12, [1, 5, 10])
    expect([...fresh]).toEqual([])
    // 現在値で上書きされる
    expect(window.localStorage.getItem('zaridasu_seen_total_u1')).toBe('12')
  })

  it('localStorage が読めない環境では新規なしにフォールバック', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    const fresh = detectNewThresholds('u1', 12, [1, 5, 10])
    expect([...fresh]).toEqual([])
  })
})

describe('prefersReducedMotion', () => {
  it('matchMedia が matches:false のとき false（vitest.setup の既定）', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('matchMedia が matches:true を返すとき true', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('matchMedia が使えない環境では false（SSR 相当のガード）', () => {
    const original = window.matchMedia
    // @ts-expect-error 意図的に未定義化して typeof !== 'function' 分岐を検証
    window.matchMedia = undefined
    expect(prefersReducedMotion()).toBe(false)
    window.matchMedia = original
  })
})
