import { useState, useEffect, useRef } from 'react'
import { todayLocalISODate } from '@/lib/localDate'
import type { LatLng, UseWeatherResult, WeatherData, WeatherCategory } from '@/types'

const DEBOUNCE_MS = 800
const CACHE_TTL_MS = 5 * 60 * 1000 // 5分

/** WMO天気コード → カテゴリ変換 */
function wmoToCategory(code: number): WeatherCategory {
  if (code === 0) return 'sunny'
  if (code <= 2) return 'cloudy'
  if (code === 3) return 'overcast'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rainy'
  if (code >= 71 && code <= 77) return 'snowy'
  if (code >= 95 && code <= 99) return 'thunderstorm'
  return 'unknown'
}

function makeCacheKey(lat: number, lng: number, date: string): string {
  return `zaridasu_weather_${lat.toFixed(3)}_${lng.toFixed(3)}_${date}`
}

function getSessionCache(key: string): WeatherData | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function setSessionCache(key: string, data: WeatherData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {
    // sessionStorage満杯時は無視
  }
}

/**
 * 座標と観察日から天気・気温・湿度を取得する（Open-Meteo API）
 * 今日 → 現在天気API、過去日付 → 履歴APIを使い分け
 * キャッシュヒット時はAPIコールなし（sessionStorage TTL 5分）
 * オフライン・API失敗時はnullをサイレント返却
 */
export function useWeather(
  position: LatLng | null,
  observedAt: string | null // YYYY-MM-DD 形式
): UseWeatherResult {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [fetching, setFetching] = useState(false)
  const [weatherError, setWeatherError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevKey = useRef<string | null>(null)
  // REQ-274 FR-274-02: 要求シーケンス（useReverseGeocode と同方針）。ピン連続移動時に
  // 古い座標/日付の天気が後から解決して上書きするのを防ぎ、アンマウント後 setState も抑止する。
  const seqRef = useRef(0)
  useEffect(() => () => { seqRef.current++ }, [])

  const fetchWeather = async (pos: LatLng, date: string) => {
    const cacheKey = makeCacheKey(pos.lat, pos.lng, date)
    const seq = ++seqRef.current

    const cached = getSessionCache(cacheKey)
    if (cached !== null) {
      setWeatherData(cached)
      return
    }

    setFetching(true)
    setWeatherError(false)
    try {
      if (!navigator.onLine) throw new Error('offline')

      // REQ-272: 観測日入力はローカルカレンダーの文字列なので、比較する「今日」も
      // ローカル日付で導出する（UTC だと JST 早朝に昨日扱いになり、昨日の観測へ
      // 「今の天気」を記録してしまう）。
      const today = todayLocalISODate()
      let data: WeatherData

      if (date >= today) {
        // 今日または未来日付 → 現在天気API
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lng}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Asia%2FTokyo`
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
        if (!res.ok) throw new Error('api_error')
        const json = await res.json()
        const current = json.current
        data = {
          weather: wmoToCategory(current.weather_code ?? -1),
          temperature: current.temperature_2m ?? null,
          humidity: current.relative_humidity_2m ?? null,
        }
      } else {
        // 過去日付 → 履歴API
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${pos.lat}&longitude=${pos.lng}&start_date=${date}&end_date=${date}&daily=weather_code,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean&timezone=Asia%2FTokyo`
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) throw new Error('api_error')
        const json = await res.json()
        const daily = json.daily
        const tempMax: number | null = daily.temperature_2m_max?.[0] ?? null
        const tempMin: number | null = daily.temperature_2m_min?.[0] ?? null
        const avgTemp =
          tempMax !== null && tempMin !== null
            ? Math.round(((tempMax + tempMin) / 2) * 10) / 10
            : tempMax
        data = {
          weather: wmoToCategory(daily.weather_code?.[0] ?? -1),
          temperature: avgTemp,
          humidity: daily.relative_humidity_2m_mean?.[0] ?? null,
        }
      }

      // キャッシュは (座標,日付) キーで常に正しいため stale 応答でも書く（重複コール防止）。
      setSessionCache(cacheKey, data)
      // REQ-274: 最新要求でなければ state を書かない（stale 上書き防止）。
      if (seq !== seqRef.current) return
      setWeatherData(data)
    } catch {
      if (seq !== seqRef.current) return
      // オフライン・タイムアウト・APIエラー時はnullのまま
      setWeatherData(null)
      setWeatherError(true)
    } finally {
      if (seq === seqRef.current) setFetching(false)
    }
  }

  useEffect(() => {
    if (!position || !observedAt) {
      setWeatherData(null)
      return
    }

    const key = makeCacheKey(position.lat, position.lng, observedAt)
    if (prevKey.current === key) return
    prevKey.current = key

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchWeather(position, observedAt), DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [position, observedAt])

  return { weatherData, fetching, weatherError }
}
