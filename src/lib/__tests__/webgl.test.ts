import { describe, it, expect, vi, afterEach } from 'vitest'
import { isWebGLAvailable } from '../webgl'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isWebGLAvailable（REQ-250: 3D の可否判定・2D フォールバックの分岐）', () => {
  it('WebGL 非実装環境（jsdom 既定）では false を返す', () => {
    // jsdom は canvas.getContext を実装しない（null もしくは throw）→ どちらでも false。
    expect(isWebGLAvailable()).toBe(false)
  })

  it('getContext が context を返す環境では true', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      {} as unknown as RenderingContext,
    )
    expect(isWebGLAvailable()).toBe(true)
  })

  it('getContext がスローしても安全に false（try/catch ガード）', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('context blocked')
    })
    expect(isWebGLAvailable()).toBe(false)
  })
})
