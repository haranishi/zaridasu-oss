import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { formatDistance, PositionLine } from '../parts'
import { renderJa } from './withI18n'

// REQ-330（採点 2 周目 A2）: 数と単位を行またぎさせない。距離は 1000 m 未満は 10 m 単位、以上は km で小数 1 桁。
// 「記録の位置」は 1 行目に何を使うか、2 行目に理由。

describe('formatDistance', () => {
  it('1000 m 未満は 10 m 単位（最小 10m）、1000 m 以上は km で小数 1 桁、10 km 以上は整数', () => {
    expect(formatDistance(0)).toBe('10m')
    expect(formatDistance(57)).toBe('60m')
    expect(formatDistance(994)).toBe('990m')
    expect(formatDistance(996)).toBe('1.0km')
    expect(formatDistance(2844)).toBe('2.8km')
    expect(formatDistance(12_345)).toBe('12km')
    expect(formatDistance(Number.NaN)).toBe('10m')
  })
})

describe('PositionLine', () => {
  it('遠いときは「この地点の座標」と、2 行目に「（いまいる場所から約2.8km離れているため）」。距離は折り返さない固まり', () => {
    renderJa(
      <PositionLine dark={false} locating={false} position={{ source: 'map', lat: 39.72, lng: 140.1, accuracy: null, reason: 'far', distanceM: 2844 }} />
    )
    expect(screen.getByTestId('fieldwork-position')).toHaveTextContent('記録の位置：この地点の座標')
    expect(screen.getByTestId('fieldwork-position-reason')).toHaveTextContent('（いまいる場所から約2.8km離れているため）')
    expect(screen.getByText('約2.8km')).toHaveClass('whitespace-nowrap')
  })

  it('現在地のときは「誤差 約12m」を折り返さない固まりにし、理由の行は（取っておく指定が無ければ）出さない', () => {
    renderJa(<PositionLine dark={false} locating={false} position={{ source: 'gps', lat: 39.72, lng: 140.1, accuracy: 12.4, distanceM: 20 }} />)
    expect(screen.getByText('誤差 約12m')).toHaveClass('whitespace-nowrap')
    expect(screen.queryByTestId('fieldwork-position-reason')).toBeNull()
  })

  it('reserveReasonLine のときは理由が無くても 2 行目の高さを取っておく', () => {
    renderJa(<PositionLine dark={false} locating reserveReasonLine position={null} />)
    expect(screen.getByTestId('fieldwork-position-reason')).toBeEmptyDOMElement()
  })
})
