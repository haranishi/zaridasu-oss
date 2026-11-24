'use client'

import { OSM_ATTRIBUTION } from '@/lib/constants'

import dynamic from 'next/dynamic'

// REQ-144: 親 (SurveyRequestPage 等) で dynamic import 済みだが、内部の
// react-leaflet を静的 import すると MiniMap chunk に leaflet 一式が乗る。
// 各レイヤーを dynamic に切り出し、地図表示時にのみ取得する。
const MapSkeleton = () => (
  <div className="w-full h-full bg-gray-100 dark:bg-slate-800 animate-pulse" aria-label="地図を読み込み中" role="status" />
)
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.MapContainer })),
  { ssr: false, loading: () => <MapSkeleton /> },
)
const TileLayer = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.TileLayer })),
  { ssr: false },
)
const CircleMarker = dynamic(
  () => import('react-leaflet').then((m) => ({ default: m.CircleMarker })),
  { ssr: false },
)

interface MiniMapProps {
  lat: number | string
  lng: number | string
  zoom?: number
  className?: string
  fillColor?: string
}

export default function MiniMap({ lat, lng, zoom = 13, className = 'w-full h-full', fillColor = '#F59E0B' }: MiniMapProps) {
  return (
    <MapContainer center={[parseFloat(String(lat)), parseFloat(String(lng))]} zoom={zoom} className={className} zoomControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} />
      <CircleMarker center={[parseFloat(String(lat)), parseFloat(String(lng))]} radius={12} pathOptions={{ fillColor, color: 'white', weight: 3, fillOpacity: 0.9 }} />
    </MapContainer>
  )
}
