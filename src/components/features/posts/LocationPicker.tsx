'use client'

import { useEffect } from 'react'
import { Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const markerIcon = new L.Icon({
    iconUrl: '/images/leaflet/marker-icon.png',
    iconRetinaUrl: '/images/leaflet/marker-icon-2x.png',
    shadowUrl: '/images/leaflet/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
})

interface LocationPickerProps {
  position: L.LatLngExpression | null
  setPosition: (latlng: L.LatLng) => void
  ariaLabel?: string
  describedById?: string
}

export default function LocationPicker({
  position,
  setPosition,
  ariaLabel,
  describedById,
}: LocationPickerProps) {
  const map = useMapEvents({
    click(e) { setPosition(e.latlng) },
    keydown(e) {
      const key = e.originalEvent.key
      if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return
      if (key === ' ' || key === 'Spacebar') e.originalEvent.preventDefault()
      setPosition(e.target.getCenter())
    },
  })

  useEffect(() => {
    if (!ariaLabel && !describedById) return

    const container = map.getContainer()
    if (ariaLabel) container.setAttribute('aria-label', ariaLabel)
    if (describedById) container.setAttribute('aria-describedby', describedById)

    return () => {
      if (ariaLabel) container.removeAttribute('aria-label')
      if (describedById) container.removeAttribute('aria-describedby')
    }
  }, [map, ariaLabel, describedById])

  return position ? <Marker position={position} icon={markerIcon} /> : null
}
