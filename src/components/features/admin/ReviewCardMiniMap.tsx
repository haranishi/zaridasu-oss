import { OSM_ATTRIBUTION } from '@/lib/constants'
import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import { MapPin } from 'lucide-react'

interface ReviewCardMiniMapProps {
  lat: number
  lng: number
  speciesColor?: string
  onClick?: () => void
}

export default function ReviewCardMiniMap({ lat, lng, speciesColor = '#6B7280', onClick }: ReviewCardMiniMapProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]: IntersectionObserverEntry[]) => { if (entry!.isIntersecting) { setVisible(true); observer.disconnect() } },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors"
      style={{ width: '100%', height: 150 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={`地図を拡大（${Number(lat).toFixed(3)}, ${Number(lng).toFixed(3)}）`}
    >
      {visible ? (
        <MapContainer
          center={[lat, lng]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          touchZoom={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={OSM_ATTRIBUTION} />
          <CircleMarker
            center={[lat, lng]}
            radius={10}
            fillColor={speciesColor}
            color="white"
            weight={2}
            fillOpacity={0.9}
          />
        </MapContainer>
      ) : (
        <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400">
          <MapPin size={24} />
        </div>
      )}
    </div>
  )
}
