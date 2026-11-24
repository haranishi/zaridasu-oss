import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReverseGeocode } from '../useReverseGeocode'

// ── 定数 ─────────────────────────────────────────────────────────────────
const AKITA_POSITION = { lat: 39.7186, lng: 140.1023 }
const NOMINATIM_RESPONSE = {
  address: { city: '秋田市', country: '日本' },
}

// ── モック ───────────────────────────────────────────────────────────────
vi.mock('@/lib/geocodeCache', () => ({
  getCachedGeocode: vi.fn(() => null),
  setCachedGeocode: vi.fn(),
  clearGeocodeCache: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
  // デフォルト: オンライン + Nominatim 成功
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(NOMINATIM_RESPONSE),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── テスト ───────────────────────────────────────────────────────────────
describe('useReverseGeocode', () => {
  describe('基本動作', () => {
    it('position が null の場合は API を呼ばない', async () => {
      renderHook(() => useReverseGeocode(null))
      await act(async () => { vi.runAllTimers() })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('デバウンス（500ms）後に API を呼ぶ', async () => {
      renderHook(() => useReverseGeocode(AKITA_POSITION))
      expect(fetch).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('同じ座標を2回渡した場合は1回だけ API を呼ぶ', async () => {
      const { rerender } = renderHook(({ pos }) => useReverseGeocode(pos), {
        initialProps: { pos: AKITA_POSITION },
      })
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      rerender({ pos: { ...AKITA_POSITION } }) // 同じ値の新しいオブジェクト
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('成功パターン', () => {
    it('API成功 + MUNICIPALITIESにマッチ → municipality が設定される', async () => {
      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.municipality).toBe('秋田市')
      // REQ-255: 秋田県の市区町村に一致 → 県は確定で秋田県
      expect(result.current.prefecture).toBe('秋田県')
      expect(result.current.geocodeError).toBe('')
      expect(result.current.geocoding).toBe(false)
    })

    it('API成功 + マッチなし → municipality 空、geocodeError=market', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ address: { city: '東京都千代田区' } }),
      })

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.municipality).toBe('')
      expect(result.current.geocodeError).toBe('market')
    })
  })

  describe('失敗パターン', () => {
    it('オフライン → geocodeError=offline、municipality 空', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false })

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.geocodeError).toBe('offline')
      expect(result.current.municipality).toBe('')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('HTTP エラー(res.ok=false) → geocodeError=timeout', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false })

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.geocodeError).toBe('timeout')
      expect(result.current.municipality).toBe('')
    })

    it('fetch 例外 → geocodeError=timeout', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network error'))

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.geocodeError).toBe('timeout')
    })
  })

  describe('retry()', () => {
    it('retry() 呼び出しで再度 API を呼ぶ', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(NOMINATIM_RESPONSE),
        })

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      expect(result.current.geocodeError).toBe('timeout')
      expect(fetch).toHaveBeenCalledTimes(1)

      await act(async () => { result.current.retry() })
      await act(async () => {})

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(result.current.municipality).toBe('秋田市')
      expect(result.current.geocodeError).toBe('')
    })

    it('retry() 完了後に geocoding が false に戻る', async () => {
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(NOMINATIM_RESPONSE),
        })

      const { result } = renderHook(() => useReverseGeocode(AKITA_POSITION))
      await act(async () => { vi.advanceTimersByTime(500) })
      await act(async () => {})

      await act(async () => { result.current.retry() })
      await act(async () => {})

      expect(result.current.geocoding).toBe(false)
      expect(result.current.municipality).toBe('秋田市')
    })
  })
})
