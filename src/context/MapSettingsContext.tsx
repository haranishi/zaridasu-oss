'use client'

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { MAP_LAYERS, MAP_LAYER_STORAGE_KEY } from '@/lib/constants'

interface MapSettings {
  showHeatmap: boolean
  setShowHeatmap: (v: boolean) => void
  activeLayerId: string
  setActiveLayerId: (id: string) => void
  defaultLayerId: string
  setDefaultLayerId: (id: string) => boolean
}

const MapSettingsContext = createContext<MapSettings | null>(null)

function getInitialLayer(): string {
  if (typeof window === 'undefined') return 'osm'
  try {
    const saved = localStorage.getItem(MAP_LAYER_STORAGE_KEY)
    if (saved && MAP_LAYERS.some((l) => l.id === saved)) return saved
  } catch { /* ignore */ }
  return 'osm'
}

function isMapLayer(id: string): boolean {
  return MAP_LAYERS.some((layer) => layer.id === id)
}

function useLocalMapSettings(enabled = true): MapSettings {
  const [showHeatmap, setShowHeatmap] = useState(false)
  // SSR と初回 hydration は同じ値にする。保存済みの設定はマウント後に読む。
  const [activeLayerId, setActiveLayerIdState] = useState('osm')
  const [defaultLayerId, setDefaultLayerIdState] = useState('osm')

  useEffect(() => {
    if (!enabled) return
    const saved = getInitialLayer()
    setActiveLayerIdState(saved)
    setDefaultLayerIdState(saved)
  }, [enabled])

  const setActiveLayerId = useCallback((id: string) => {
    if (!isMapLayer(id)) return
    setActiveLayerIdState(id)
  }, [])

  const setDefaultLayerId = useCallback((id: string) => {
    if (!isMapLayer(id)) return false
    try {
      localStorage.setItem(MAP_LAYER_STORAGE_KEY, id)
    } catch {
      return false
    }
    setDefaultLayerIdState(id)
    return true
  }, [])

  return useMemo(
    () => ({ showHeatmap, setShowHeatmap, activeLayerId, setActiveLayerId, defaultLayerId, setDefaultLayerId }),
    [showHeatmap, activeLayerId, setActiveLayerId, defaultLayerId, setDefaultLayerId]
  )
}

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const value = useLocalMapSettings()
  return (
    <MapSettingsContext.Provider value={value}>
      {children}
    </MapSettingsContext.Provider>
  )
}

// Provider 不在時はローカル state にフォールバック（テスト・単体利用向け）
export function useMapSettings(): MapSettings {
  const ctx = useContext(MapSettingsContext)
  const fallback = useLocalMapSettings(!ctx)
  return ctx ?? fallback
}
