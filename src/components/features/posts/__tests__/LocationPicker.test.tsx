import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import LocationPicker from '../LocationPicker'

const leafletState = vi.hoisted(() => ({
  handlers: {} as Record<string, (event: unknown) => void>,
}))

vi.mock('react-leaflet', () => ({
  useMapEvents: (handlers: Record<string, (event: unknown) => void>) => {
    leafletState.handlers = handlers
  },
  Marker: () => null,
}))

vi.mock('leaflet', () => ({
  default: {
    Icon: class {},
  },
}))

describe('LocationPicker', () => {
  it('既存の地図クリックで位置を確定する', () => {
    const setPosition = vi.fn()
    render(<LocationPicker position={null} setPosition={setPosition} />)
    const clicked = { lat: 39.7, lng: 140.1 }

    leafletState.handlers.click?.({ latlng: clicked })

    expect(setPosition).toHaveBeenCalledWith(clicked)
  })

  it.each(['Enter', ' '])('%j で現在の地図中心を確定する', (key) => {
    const setPosition = vi.fn()
    const preventDefault = vi.fn()
    const center = { lat: 39.8, lng: 140.2 }
    render(<LocationPicker position={null} setPosition={setPosition} />)

    leafletState.handlers.keydown?.({
      originalEvent: { key, preventDefault },
      target: { getCenter: () => center },
    })

    expect(setPosition).toHaveBeenCalledWith(center)
    if (key === ' ') {
      expect(preventDefault).toHaveBeenCalledOnce()
    } else {
      expect(preventDefault).not.toHaveBeenCalled()
    }
  })
})
