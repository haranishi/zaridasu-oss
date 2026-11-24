import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'

export const WEATHER_ICONS: Record<string, React.ReactNode> = {
  sunny: <Sun size={16} className="text-yellow-400 shrink-0" />,
  cloudy: <Cloud size={16} className="text-slate-400 shrink-0" />,
  overcast: <Cloud size={16} className="text-slate-500 shrink-0" />,
  rainy: <CloudRain size={16} className="text-blue-400 shrink-0" />,
  snowy: <CloudSnow size={16} className="text-sky-300 shrink-0" />,
  thunderstorm: <CloudLightning size={16} className="text-purple-400 shrink-0" />,
  unknown: <Cloud size={16} className="text-slate-400 shrink-0" />,
}

export function WeatherIcon({ weather }: { weather: string }) {
  return <>{WEATHER_ICONS[weather] ?? WEATHER_ICONS.unknown}</>
}
