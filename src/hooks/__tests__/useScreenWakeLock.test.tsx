import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScreenWakeLock } from '../useScreenWakeLock'

interface FakeSentinel { released: boolean; release: ReturnType<typeof vi.fn> }

const sentinels: FakeSentinel[] = []
const request = vi.fn(async (_type: string) => {
  const sentinel: FakeSentinel = { released: false, release: vi.fn(async () => { sentinel.released = true }) }
  sentinels.push(sentinel)
  return sentinel
})

const flush = () => act(async () => { await Promise.resolve() })
const setVisibility = async (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
}

beforeEach(() => {
  sentinels.length = 0
  request.mockClear()
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('useScreenWakeLock', () => {
  it('使わないあいだは画面を点けたままにしない', async () => {
    renderHook(() => useScreenWakeLock(false))
    await flush()
    expect(request).not.toHaveBeenCalled()
  })

  it('使うあいだは画面を点けたままにし、使い終わったら解放する', async () => {
    const view = renderHook(({ active }) => useScreenWakeLock(active), { initialProps: { active: true } })
    await flush()
    expect(request).toHaveBeenCalledExactlyOnceWith('screen')
    view.rerender({ active: false })
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1)
  })

  it('画面から外れる（アンマウント）と解放する', async () => {
    const view = renderHook(() => useScreenWakeLock(true))
    await flush()
    view.unmount()
    expect(sentinels[0]!.release).toHaveBeenCalledTimes(1)
  })

  it('ページが隠れて OS に解放されても、見える状態に戻ったら取り直す', async () => {
    renderHook(() => useScreenWakeLock(true))
    await flush()
    await setVisibility('hidden')
    sentinels[0]!.released = true
    await setVisibility('visible')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('まだ有効なうちは、見える状態に戻っても取り直さない', async () => {
    renderHook(() => useScreenWakeLock(true))
    await flush()
    await setVisibility('visible')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('隠れているあいだは要求せず、見えたときに要求する（隠れた状態の要求は失敗する）', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    renderHook(() => useScreenWakeLock(true))
    await flush()
    expect(request).not.toHaveBeenCalled()
    await setVisibility('visible')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('拒否されても落ちず、次に見えたときに取り直す', async () => {
    request.mockRejectedValueOnce(new DOMException('battery saver', 'NotAllowedError'))
    renderHook(() => useScreenWakeLock(true))
    await flush()
    expect(sentinels).toHaveLength(0)
    await setVisibility('visible')
    expect(sentinels).toHaveLength(1)
  })

  it('取得を待つあいだに使い終わったら、あとから届いたものをすぐ解放する', async () => {
    let resolve: (sentinel: FakeSentinel) => void = () => {}
    request.mockImplementationOnce(() => new Promise<FakeSentinel>((r) => { resolve = r }))
    const view = renderHook(({ active }) => useScreenWakeLock(active), { initialProps: { active: true } })
    view.rerender({ active: false })
    const late: FakeSentinel = { released: false, release: vi.fn(async () => {}) }
    await act(async () => { resolve(late) })
    expect(late.release).toHaveBeenCalledTimes(1)
  })

  it('画面ロックに対応していない環境でも落ちない', async () => {
    Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
    expect(() => renderHook(() => useScreenWakeLock(true))).not.toThrow()
    await flush()
    expect(request).not.toHaveBeenCalled()
  })
})
