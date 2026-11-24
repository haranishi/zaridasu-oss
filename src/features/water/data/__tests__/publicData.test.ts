import { describe, expect, it } from 'vitest'

import { PUBLIC_COORD_COLUMN, PUBLIC_POST_STATUS } from '@/lib/data/posts'
import {
  loadCommunityWaterBodies,
  loadPublicWaterSurveyPoints,
  PUBLIC_WATER_COORD_COLUMN,
  PUBLIC_WATER_POST_STATUS,
} from '../publicData'
import { fakeWaterClient } from './fakeClient'

const BOUNDS = { minLat: 39.6, maxLat: 39.8, minLng: 140, maxLng: 140.2 }
const ROW = { display_lat: 39.7, display_lng: 140.1 }

describe('public water survey classification', () => {
  it('keeps the chunk-local public post conditions aligned with the canonical definition', () => {
    expect(PUBLIC_WATER_POST_STATUS).toBe(PUBLIC_POST_STATUS)
    expect(PUBLIC_WATER_COORD_COLUMN).toEqual(PUBLIC_COORD_COLUMN)
  })
  it('reads approved public positions with exact count and independent bounds, without private fields or homepage filters', async () => {
    const { client, calls } = fakeWaterClient({ data: [ROW], count: 1, error: null })
    await expect(loadPublicWaterSurveyPoints(client, BOUNDS)).resolves.toEqual({ points: [{ lat: 39.7, lng: 140.1 }], complete: true })
    expect(calls[0]?.table).toBe('posts')
    expect(calls[0]?.ops).toContainEqual(['select', ['display_lat, display_lng', { count: 'exact' }]])
    expect(calls[0]?.ops).toContainEqual(['eq', ['status', 'approved']])
    expect(calls[0]?.ops).toContainEqual(['gte', ['display_lat', BOUNDS.minLat]])
    expect(calls[0]?.ops).toContainEqual(['lte', ['display_lng', BOUNDS.maxLng]])
    expect(calls[0]?.ops).toContainEqual(['limit', [1000]])
    expect(calls[0]?.ops.filter(([op]) => op === 'eq')).toHaveLength(1)
  })
  it('only a complete empty read proves no public point was found', async () => {
    await expect(loadPublicWaterSurveyPoints(fakeWaterClient({ data: [], count: 0, error: null }).client, BOUNDS)).resolves.toEqual({ points: [], complete: true })
    for (const result of [{ data: [], count: null, error: null }, { data: null, count: 0, error: null }, { data: [ROW], count: 2, error: null }]) {
      expect((await loadPublicWaterSurveyPoints(fakeWaterClient(result).client, BOUNDS)).complete).toBe(false)
    }
  })
  it('uses exact count to distinguish a complete 1000-row read from a truncated 1001-row result', async () => {
    const data = Array.from({ length: 1000 }, () => ROW)
    expect((await loadPublicWaterSurveyPoints(fakeWaterClient({ data, count: 1000, error: null }).client, BOUNDS)).complete).toBe(true)
    expect((await loadPublicWaterSurveyPoints(fakeWaterClient({ data, count: 1001, error: null }).client, BOUNDS)).complete).toBe(false)
  })
  it('marks unusable public coordinates as incomplete', async () => {
    const invalid = await loadPublicWaterSurveyPoints(fakeWaterClient({ data: [ROW, { display_lat: null, display_lng: 140.1 }], count: 2, error: null }).client, BOUNDS)
    expect(invalid).toEqual({ points: [{ lat: 39.7, lng: 140.1 }], complete: false })
  })
  it('propagates failures and forwards cancellation so they cannot be mistaken for an empty result', async () => {
    const error = { code: '57014', message: 'aborted' }
    const { client, calls } = fakeWaterClient({ data: null, error })
    const signal = new AbortController().signal
    await expect(loadPublicWaterSurveyPoints(client, BOUNDS, signal)).rejects.toBe(error)
    expect(calls[0]?.ops).toContainEqual(['abortSignal', [signal]])
  })
  it('rejects invalid bounds before sending any query', async () => {
    const { client, calls } = fakeWaterClient({ data: [], count: 0, error: null })
    await expect(loadPublicWaterSurveyPoints(client, { ...BOUNDS, minLat: NaN })).rejects.toThrow('bounds')
    await expect(loadCommunityWaterBodies(client, { ...BOUNDS, maxLat: 39 })).rejects.toThrow('bounds')
    expect(calls).toHaveLength(0)
  })
})

describe('reviewed community water', () => {
  it('reads only the coarse public projection and retains its independent identity', async () => {
    const row = { id: 'public-water', name: '公開池', lat: 39.7, lng: 140.1, created_at: 'now' }
    const { client, calls } = fakeWaterClient({ data: [row], error: null })
    await expect(loadCommunityWaterBodies(client, BOUNDS)).resolves.toEqual([row])
    expect(calls[0]?.table).toBe('community_water_bodies')
    expect(calls[0]?.ops).toContainEqual(['select', ['id, name, lat, lng, created_at']])
    expect(calls[0]?.ops).toContainEqual(['limit', [200]])
  })
  it('propagates public projection errors and cancellation', async () => {
    const { client, calls } = fakeWaterClient({ data: null, error: { code: '503' } })
    const signal = new AbortController().signal
    await expect(loadCommunityWaterBodies(client, BOUNDS, signal)).rejects.toMatchObject({ code: '503' })
    expect(calls[0]?.ops).toContainEqual(['abortSignal', [signal]])
  })
})
