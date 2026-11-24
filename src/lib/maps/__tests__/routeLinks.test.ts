// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  ROUTE_PROVIDERS,
  buildAppleDirectionsUrl,
  buildGoogleDirectionsUrl,
  buildRouteLinks,
  buildYahooRouteUrl,
  isValidCoord,
} from '../routeLinks'

describe('isValidCoord (REQ-329)', () => {
  it('通常の座標は有効', () => {
    expect(isValidCoord(39.7186, 140.1023)).toBe(true)
  })
  it.each([
    [Number.NaN, 140],
    [39, Number.POSITIVE_INFINITY],
    [91, 140],
    [39, -181],
  ])('不正な値 (%s, %s) は無効', (lat, lng) => {
    expect(isValidCoord(lat, lng)).toBe(false)
  })
})

describe('経路 URL の組み立て (REQ-329)', () => {
  it('Google は Maps URLs の経路モードで、目的地だけを小数 6 桁で渡す', () => {
    expect(buildGoogleDirectionsUrl(39.7186, 140.1023)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=39.718600%2C140.102300&travelmode=driving'
    )
  })

  it('Yahoo! は /route/car に to / toLat / toLon を付ける（出発地は渡さない）', () => {
    const url = new URL(buildYahooRouteUrl(39.7186, 140.1023, '目的地'))
    expect(url.origin + url.pathname).toBe('https://map.yahoo.co.jp/route/car')
    expect(url.searchParams.get('to')).toBe('目的地')
    expect(url.searchParams.get('toLat')).toBe('39.718600')
    expect(url.searchParams.get('toLon')).toBe('140.102300')
    expect(url.searchParams.has('from')).toBe(false)
  })

  it('Apple は iOS 18.4 以降の統一 Maps URL（/directions?destination=）を使う', () => {
    expect(buildAppleDirectionsUrl(39.7186, 140.1023)).toBe(
      'https://maps.apple.com/directions?destination=39.718600%2C140.102300&mode=driving'
    )
  })

  it('buildRouteLinks は 3 社を決まった順で返す', () => {
    const links = buildRouteLinks(39.7, 140.1, '目的地')
    expect(links.map((l) => l.provider)).toEqual([...ROUTE_PROVIDERS])
    expect(links.every((l) => l.href.startsWith('https://'))).toBe(true)
  })

  it('座標が不正なら空配列（何も描かない）', () => {
    expect(buildRouteLinks(Number.NaN, 140.1, '目的地')).toEqual([])
  })

  it('座標以外の情報（スポット名など）は URL に載らない：行き先名は呼び出し側の固定語だけ', () => {
    const links = buildRouteLinks(39.7, 140.1, '目的地')
    for (const { href } of links) {
      expect(href).not.toContain('%E3%80%87') // 「〇」などスポット名由来の文字は入り得ない
    }
  })
})
