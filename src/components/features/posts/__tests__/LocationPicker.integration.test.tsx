import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { describe, expect, it, vi } from 'vitest'
import LocationPicker from '../LocationPicker'

describe('LocationPicker（実 react-leaflet）', () => {
  it('フォーカス可能な地図 container に名前と実在する操作説明を関連付ける', () => {
    const instructionsId = 'test-map-instructions'
    const instructions = '矢印キーで中心を動かし、Enter または Space で確定します。'
    const ariaLabel = '位置選択の地図'
    const { container } = render(
      <>
        <p id={instructionsId}>{instructions}</p>
        <MapContainer
          center={[39.7186, 140.1024]}
          zoom={10}
          style={{ height: '100px', width: '100px' }}
        >
          <LocationPicker
            position={null}
            setPosition={vi.fn()}
            ariaLabel={ariaLabel}
            describedById={instructionsId}
          />
        </MapContainer>
      </>,
    )

    const mapContainer = container.querySelector<HTMLElement>('.leaflet-container')
    if (!mapContainer) throw new Error('Leaflet の地図 container が見つかりません')

    expect(mapContainer).toHaveAttribute('aria-label', ariaLabel)
    expect(mapContainer).toHaveAttribute('aria-describedby', instructionsId)
    expect(container.querySelector(`#${instructionsId}`)).toHaveTextContent(instructions)
    expect(mapContainer).toHaveAttribute('tabindex', '0')
  })
})
