/**
 * REQ-310 FR-310-04 / AC-04 / AC-05: クライアント側 JSON-LD の geo NULL ガード。
 *
 * SSR（`src/lib/seo.ts` の generatePostSEO）と**同型のバグ**がここにもあり、片方だけ直すと
 * クライアント経路に geo 0,0（ギニア湾沖）が残る。両経路を別々に固定する。
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ja' },
  }),
}))

import { useDetailSEO } from '../useDetailSEO'

const basePost = {
  id: 'post-1',
  species: 'american',
  info_type: 'sighting',
  municipality: '秋田市',
  created_at: '2026-06-01T00:00:00.000Z',
  comment: null,
  photos: null,
}

/** jsonLd.contentLocation を取り出すテスト用ヘルパ。 */
function contentLocation(post: Parameters<typeof useDetailSEO>[0]): Record<string, unknown> {
  const { result } = renderHook(() => useDetailSEO(post))
  return (result.current.jsonLd as { contentLocation: Record<string, unknown> }).contentLocation
}

describe('useDetailSEO の geo ガード (REQ-310 FR-310-04)', () => {
  it('座標があるときは geo を出力する（従来動作の維持）', () => {
    expect(contentLocation({ ...basePost, lat: 39.72, lng: 140.1 }).geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 39.72,
      longitude: 140.1,
    })
  })

  it('lat/lng が null（位置非公開）のとき geo キー自体を出力しない', () => {
    expect(contentLocation({ ...basePost, lat: null, lng: null })).not.toHaveProperty('geo')
  })

  it('位置非公開の投稿のシリアライズ結果に "latitude":0 / "longitude":0 が現れない（AC-04）', () => {
    const { result } = renderHook(() => useDetailSEO({ ...basePost, lat: null, lng: null }))
    const serialized = JSON.stringify(result.current.jsonLd)
    expect(serialized).not.toContain('"latitude":0')
    expect(serialized).not.toContain('"longitude":0')
    expect(serialized).not.toContain('GeoCoordinates')
  })

  it('位置非公開でも contentLocation.address の市区町村は残る（AC-05）', () => {
    const location = contentLocation({ ...basePost, lat: null, lng: null })
    expect((location.address as Record<string, unknown>).addressLocality).toBe('秋田市')
    expect(location).toHaveProperty('name')
  })

  it('片方だけ null / 非有限値でも geo を出さない', () => {
    expect(contentLocation({ ...basePost, lat: 39.72, lng: null })).not.toHaveProperty('geo')
    expect(contentLocation({ ...basePost, lat: null, lng: 140.1 })).not.toHaveProperty('geo')
    expect(contentLocation({ ...basePost, lat: NaN, lng: 140.1 })).not.toHaveProperty('geo')
    expect(contentLocation({ ...basePost, lat: 39.72, lng: Infinity })).not.toHaveProperty('geo')
  })

  it('緯度経度 0 が実在の観測値として渡された場合は出力する（NULL とは区別する）', () => {
    expect(contentLocation({ ...basePost, lat: 0, lng: 0 }).geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 0,
      longitude: 0,
    })
  })

  it('post が null のときは jsonLd 自体を生成しない（従来動作）', () => {
    const { result } = renderHook(() => useDetailSEO(null))
    expect(result.current.jsonLd).toBeNull()
    expect(result.current.breadcrumbLd).toBeNull()
  })
})
