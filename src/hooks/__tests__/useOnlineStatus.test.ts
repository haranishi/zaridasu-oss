import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnlineStatus } from '../useOnlineStatus'

// navigator.onLine を任意の値に差し替えるユーティリティ。
// jsdom では navigator.onLine は getter のみのため defineProperty で上書きする。
function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    setNavigatorOnLine(true)
  })

  afterEach(() => {
    setNavigatorOnLine(true)
  })

  // AC-01
  it('offline イベントで isOnline=false、online イベントで isOnline=true に変わる', () => {
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      setNavigatorOnLine(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it('初期マウント時、navigator.onLine の値を反映する（オフライン初期）', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  // NFR-197-01: 購読リスナーをアンマウント時にリークさせない
  it('アンマウント後はイベントを受けても更新されない（リスナー解除）', () => {
    const { result, unmount } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
    unmount()
    // 解除済みなのでエラーなく完了すれば良い（tearing/leak が無いこと）
    act(() => {
      setNavigatorOnLine(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(true)
  })
})
