'use client'

import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { WEATHER_CATEGORIES } from '@/lib/constants'
import { formInputCls } from '@/lib/formStyles'
import { WeatherIcon } from '@/lib/weatherIcons'
import type { WeatherData } from '@/types'

interface WeatherSelectorProps {
  weatherManual: boolean
  setWeatherManual: (v: boolean) => void
  manualWeather: string
  setManualWeather: (v: string) => void
  manualTemperature: string
  setManualTemperature: (v: string) => void
  manualHumidity: string
  setManualHumidity: (v: string) => void
  weatherData: WeatherData | null
  weatherFetching: boolean
  weatherError: boolean
  position: { lat: number; lng: number } | null
}

export default function WeatherSelector({
  weatherManual, setWeatherManual, manualWeather, setManualWeather,
  manualTemperature, setManualTemperature, manualHumidity, setManualHumidity,
  weatherData, weatherFetching, weatherError, position,
}: WeatherSelectorProps) {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const inputCls = formInputCls(dark)
  const subLabel = `block text-xs font-medium mb-1 ${dark ? 'text-slate-400' : 'text-gray-600'}`

  const handleToggleManual = () => {
    if (!weatherManual) {
      setManualWeather(weatherData?.weather ?? '')
      setManualTemperature(weatherData?.temperature != null ? String(weatherData.temperature) : '')
      setManualHumidity(weatherData?.humidity != null ? String(weatherData.humidity) : '')
    }
    setWeatherManual(!weatherManual)
  }

  return (
    <div className={`rounded-xl border ${dark ? 'border-slate-700/60' : 'border-sky-200'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${dark ? 'bg-slate-800/50' : 'bg-sky-50'} rounded-t-xl`}>
        <span className={`text-xs font-semibold ${dark ? 'text-slate-400' : 'text-sky-700'}`}>{t('weather.sectionTitle')}</span>
        <button type="button" onClick={handleToggleManual}
          className={`text-xs underline transition-opacity hover:opacity-80 ${dark ? 'text-slate-400' : 'text-sky-500'}`}>
          {weatherManual ? t('weather.switchAuto') : t('weather.switchManual')}
        </button>
      </div>

      {!weatherManual && position && (
        <div className={`flex items-center gap-3 px-4 py-3 text-sm ${dark ? 'text-slate-300' : 'text-sky-700'}`}>
          {weatherFetching ? (
            <><Loader2 size={16} className="animate-spin shrink-0" /><span className="text-xs">{t('weather.fetching')}</span></>
          ) : weatherData ? (
            <>
              <WeatherIcon weather={weatherData.weather} />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{t(`weather.${weatherData.weather}`)}</span>
                {weatherData.temperature !== null && <span className="text-xs opacity-75">{weatherData.temperature}°C</span>}
                {weatherData.humidity !== null && <span className="text-xs opacity-75">{t('weather.humidity', { value: weatherData.humidity })}</span>}
              </div>
              <span className="ml-auto text-xs opacity-50">{t('weather.autoLabel')}</span>
            </>
          ) : weatherError ? (
            <span className={`text-xs ${dark ? 'text-amber-400' : 'text-amber-600'}`}>
              {t('weather.fetchError')}
              <button type="button" onClick={() => setWeatherManual(true)} className="underline ml-1 hover:opacity-80">{t('weather.switchManual')}</button>
            </span>
          ) : (
            <span className="text-xs opacity-50">{t('weather.noData')}</span>
          )}
        </div>
      )}

      {!weatherManual && !position && (
        <p className={`px-4 py-3 text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{t('weather.noPosition')}</p>
      )}

      {weatherManual && (
        <div className="px-4 py-3 space-y-3">
          <div>
            <span className={`block text-xs font-medium mb-1.5 ${dark ? 'text-slate-400' : 'text-gray-600'}`}>{t('weather.label')}</span>
            <div className="flex flex-wrap gap-1.5">
              {WEATHER_CATEGORIES.map((w) => (
                <button key={w} type="button" onClick={() => setManualWeather(w)}
                  className={`flex items-center gap-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                    manualWeather === w ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : dark ? 'border-slate-600 text-slate-400 hover:border-slate-500' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <WeatherIcon weather={w} />
                  {t(`weather.${w}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="weather-temperature" className={subLabel}>{t('weather.temperatureLabel')}</label>
              <input id="weather-temperature" type="number" inputMode="decimal" step="0.1" min="-50" max="50" value={manualTemperature}
                onChange={(e) => setManualTemperature(e.target.value)} placeholder={t('postForm.temperaturePlaceholder')} className={inputCls} />
            </div>
            <div>
              <label htmlFor="weather-humidity" className={subLabel}>{t('weather.humidityLabel')}</label>
              <input id="weather-humidity" type="number" inputMode="numeric" step="1" min="0" max="100" value={manualHumidity}
                onChange={(e) => setManualHumidity(e.target.value)} placeholder={t('postForm.humidityPlaceholder')} className={inputCls} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
