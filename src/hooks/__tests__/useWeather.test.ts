import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWeather } from '../useWeather'
import { todayLocalISODate } from '@/lib/localDate'

// ── sessionStorage モック ──
const sessionStorageMap = new Map<string, string>()
const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStorageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStorageMap.set(key, value) }),
  removeItem: vi.fn((key: string) => { sessionStorageMap.delete(key) }),
  clear: vi.fn(() => { sessionStorageMap.clear() }),
  get length() { return sessionStorageMap.size },
  key: vi.fn(),
}

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true })

// ── fetch モック ──
const fetchMock = vi.fn()
globalThis.fetch = fetchMock

// ── navigator.onLine モック ──
let navigatorOnLine = true
Object.defineProperty(navigator, 'onLine', {
  get: () => navigatorOnLine,
  configurable: true,
})

const DEBOUNCE_MS = 800

/**
 * Advance fake timers and flush microtasks so that the debounced
 * setTimeout callback fires AND the async fetch inside it resolves.
 */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  // Extra flush: give resolved promises a tick to settle
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  sessionStorageMap.clear()
  navigatorOnLine = true
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── ヘルパー ──
function makeForecastResponse(weatherCode = 0, temp = 20.5, humidity = 65) {
  return {
    ok: true,
    json: () => Promise.resolve({
      current: {
        weather_code: weatherCode,
        temperature_2m: temp,
        relative_humidity_2m: humidity,
      },
    }),
  }
}

function makeArchiveResponse(weatherCode = 3, tempMax = 25.0, tempMin = 15.0, humidity = 70) {
  return {
    ok: true,
    json: () => Promise.resolve({
      daily: {
        weather_code: [weatherCode],
        temperature_2m_max: [tempMax],
        temperature_2m_min: [tempMin],
        relative_humidity_2m_mean: [humidity],
      },
    }),
  }
}

const position = { lat: 39.7186, lng: 140.1023 }

// ── テスト ───────────────────────────────────────────────────────────────
describe('useWeather', () => {
  it('position か observedAt が null の場合、weatherData は null のまま', () => {
    const { result } = renderHook(() => useWeather(null, '2026-04-06'))
    expect(result.current.weatherData).toBeNull()
    expect(result.current.fetching).toBe(false)

    const { result: result2 } = renderHook(() => useWeather(position, null))
    expect(result2.current.weatherData).toBeNull()
  })

  it('今日の日付で現在天気APIを呼び、weatherDataをセットする', async () => {
    const today = todayLocalISODate()
    fetchMock.mockResolvedValue(makeForecastResponse(0, 22.3, 55))

    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherData).not.toBeNull()
    })

    expect(result.current.weatherData).toEqual({
      weather: 'sunny',
      temperature: 22.3,
      humidity: 55,
    })
    expect(result.current.fetching).toBe(false)
    expect(result.current.weatherError).toBe(false)

    // Verify the correct API was called (forecast, not archive)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('api.open-meteo.com/v1/forecast')
  })

  it('過去日付で履歴APIを呼び、平均気温を計算する', async () => {
    fetchMock.mockResolvedValue(makeArchiveResponse(61, 28.0, 18.0, 75))

    const { result } = renderHook(() => useWeather(position, '2025-06-15'))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherData).not.toBeNull()
    })

    expect(result.current.weatherData).toEqual({
      weather: 'rainy', // WMO code 61 = rainy
      temperature: 23.0, // (28+18)/2 = 23.0
      humidity: 75,
    })

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('archive-api.open-meteo.com/v1/archive')
  })

  it('API失敗時にweatherErrorがtrueになりweatherDataはnull', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    const today = todayLocalISODate()
    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherError).toBe(true)
    })

    expect(result.current.weatherData).toBeNull()
    expect(result.current.fetching).toBe(false)
  })

  it('オフライン時にweatherErrorがtrueになる', async () => {
    navigatorOnLine = false

    const today = todayLocalISODate()
    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherError).toBe(true)
    })

    expect(result.current.weatherData).toBeNull()
    // fetch should not have been called since we throw before it
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('キャッシュヒット時はfetchを呼ばずキャッシュデータを返す', async () => {
    const today = todayLocalISODate()
    const cacheKey = `zaridasu_weather_${position.lat.toFixed(3)}_${position.lng.toFixed(3)}_${today}`
    const cachedData = { weather: 'cloudy' as const, temperature: 18.0, humidity: 60 }

    sessionStorageMap.set(cacheKey, JSON.stringify({
      data: cachedData,
      timestamp: Date.now(),
    }))

    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherData).not.toBeNull()
    })

    expect(result.current.weatherData).toEqual(cachedData)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('キャッシュ期限切れ（5分超）の場合はAPIを呼ぶ', async () => {
    const today = todayLocalISODate()
    const cacheKey = `zaridasu_weather_${position.lat.toFixed(3)}_${position.lng.toFixed(3)}_${today}`
    const CACHE_TTL_MS = 5 * 60 * 1000

    sessionStorageMap.set(cacheKey, JSON.stringify({
      data: { weather: 'cloudy', temperature: 18.0, humidity: 60 },
      timestamp: Date.now() - CACHE_TTL_MS - 1000, // Expired
    }))

    fetchMock.mockResolvedValue(makeForecastResponse(0, 25.0, 50))

    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherData).not.toBeNull()
    })

    // Should have fetched fresh data since cache expired
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.weatherData?.temperature).toBe(25.0)
  })

  it('WMO天気コードが正しくカテゴリに変換される', async () => {
    // Test snow (code 71-77)
    fetchMock.mockResolvedValue(makeForecastResponse(73, -2.0, 80))

    const today = todayLocalISODate()
    const { result } = renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    await waitFor(() => {
      expect(result.current.weatherData).not.toBeNull()
    })

    expect(result.current.weatherData?.weather).toBe('snowy')
  })

  it('同じキーの場合は重複fetchしない（デバウンス＋キーチェック）', async () => {
    const today = todayLocalISODate()
    fetchMock.mockResolvedValue(makeForecastResponse())

    const { rerender } = renderHook(
      ({ pos, date }) => useWeather(pos, date),
      { initialProps: { pos: position, date: today } }
    )

    await advanceAndFlush(DEBOUNCE_MS + 100)

    // Re-render with same values
    rerender({ pos: position, date: today })

    await advanceAndFlush(DEBOUNCE_MS + 100)

    // fetch should only be called once since the cache key hasn't changed
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('成功時にsessionStorageにキャッシュが保存される', async () => {
    const today = todayLocalISODate()
    fetchMock.mockResolvedValue(makeForecastResponse(1, 20.0, 65))

    renderHook(() => useWeather(position, today))

    await advanceAndFlush(DEBOUNCE_MS + 100)

    // Wait for fetch to complete and cache to be set
    await waitFor(() => {
      expect(sessionStorageMock.setItem).toHaveBeenCalled()
    })

    const cacheKey = `zaridasu_weather_${position.lat.toFixed(3)}_${position.lng.toFixed(3)}_${today}`
    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      cacheKey,
      expect.stringContaining('"weather":"cloudy"')
    )
  })
})
