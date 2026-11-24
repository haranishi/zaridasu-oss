'use client'

// REQ-329: 「ここへの経路」を Google マップ / Yahoo!マップ / Apple マップで開く 3 つのボタン。
// 地図のポップアップ（背景は常に白）と、詳細ページのカード（ダークモードあり）の両方で使う。
// URL の組み立てと座標の検証は lib/maps/routeLinks.ts が持つ。ここは見た目だけ。

import { ExternalLink, Navigation } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { buildRouteLinks } from '@/lib/maps/routeLinks'

interface RouteLinksProps {
  lat: number
  lng: number
  /** 粗化（約 111 m）した位置なら true。見出しに「おおよその位置」と添える。 */
  approximate?: boolean
  /** popup: Leaflet ポップアップ内（常に白背景）/ card: ページ内カード（ダークモード対応） */
  variant?: 'popup' | 'card'
  dark?: boolean
  className?: string
  /** md: 現地で読む画面（調査の地点シート）。見出しとボタンの文字を 14px にする。既定は sm（12px）。 */
  size?: 'sm' | 'md'
}

export default function RouteLinks({
  lat,
  lng,
  approximate = false,
  variant = 'card',
  dark = false,
  className = '',
  size = 'sm',
}: RouteLinksProps) {
  const { t } = useTranslation()
  const links = buildRouteLinks(Number(lat), Number(lng), t('route.destinationLabel'))
  if (links.length === 0) return null

  const onDark = variant === 'card' && dark
  const headingCls = onDark ? 'text-slate-400' : 'text-gray-500'
  const btnCls = onDark
    ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-200 border border-blue-500/30'
    : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'

  return (
    <div className={className} data-testid="route-links">
      <p className={`flex items-center gap-1 ${size === 'md' ? 'text-sm' : 'text-xs'} font-semibold mb-1.5 ${headingCls}`}>
        <Navigation size={size === 'md' ? 14 : 12} aria-hidden="true" />
        {t('route.title')}
        {approximate && <span className="font-normal">（{t('route.approximate')}）</span>}
      </p>
      {/* ポップアップは幅が狭いので 3 等分の 1 行に短い名前で並べる（縦に積むと上端が切れる）。
          読み上げ名（aria-label）はどちらでも正式名を使う。 */}
      <div className={variant === 'popup' ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap gap-1.5'}>
        {links.map(({ provider, href }) => {
          const name = t(`route.provider.${provider}`)
          const label = variant === 'popup' ? t(`route.providerShort.${provider}`) : name
          return (
            <a
              key={provider}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('route.openAria', { provider: name })}
              // REQ-203/323: タップ域 44px。Leaflet ポップアップの a 既定色（青）に負けないよう色は明示する。
              className={`inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-xl ${size === 'md' ? 'text-sm' : 'text-xs'} font-semibold no-underline transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 ${variant === 'popup' ? 'px-1.5' : ''} ${btnCls}`}
            >
              {label}
              <ExternalLink size={11} aria-hidden="true" className="shrink-0 opacity-70" />
            </a>
          )
        })}
      </div>
    </div>
  )
}
