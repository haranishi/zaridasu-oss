import { describe, expect, it } from 'vitest'

import { insertWaterReport, reviewWaterReport, selectOwnWaterReports, selectWaterReportsForAdmin } from '../reports'
import { fakeWaterClient } from './fakeClient'

const NEW = { userId: 'owner', clientId: 'retry-id', name: ' 池 ', note: ' 補足 ', lat: 39.7123456, lng: 140.1234567, photoPaths: ['owner/photo.jpg'] }
const ROW = { id: 'r1', ...NEW, name: '池', status: 'pending' }

describe('private water reports', () => {
  it('scopes the owner list, caps both lists and selects no email or public photo URL', () => {
    const { client, calls } = fakeWaterClient({ data: [], error: null })
    void selectOwnWaterReports(client, 'owner')
    void selectWaterReportsForAdmin(client)
    expect(calls[0]?.ops).toContainEqual(['eq', ['user_id', 'owner']])
    expect(calls[1]?.ops.some(([op]) => op === 'eq')).toBe(false)
    expect(calls.every((call) => call.ops.some(([op, args]) => op === 'limit' && args[0] === 1000))).toBe(true)
    expect(calls[0]?.ops[0]?.[1][0]).not.toMatch(/email|photo_url/)
  })
  it('sends only submission fields and preserves the retained position and retry UUID', async () => {
    const { client, calls } = fakeWaterClient({ data: ROW, error: null })
    await expect(insertWaterReport(client, NEW)).resolves.toEqual({ report: ROW, duplicate: false })
    expect(calls[0]?.ops[0]).toEqual(['insert', [{ user_id: 'owner', client_id: 'retry-id', name: '池', note: '補足', lat: NEW.lat, lng: NEW.lng, photo_paths: NEW.photoPaths }]])
  })
  it('filters review status on the server before the limit and requests the exact count', () => {
    const { client, calls } = fakeWaterClient({ data: [], error: null, count: 1200 })
    void selectWaterReportsForAdmin(client, 'pending')
    expect(calls[0]?.ops).toContainEqual(['eq', ['status', 'pending']])
    expect(calls[0]?.ops[0]?.[1][1]).toEqual({ count: 'exact' })
  })
  it('returns the existing owner/client row after a unique retry without another insert', async () => {
    const { client, calls } = fakeWaterClient([{ data: null, error: { code: '23505' } }, { data: ROW, error: null }])
    await expect(insertWaterReport(client, NEW)).resolves.toEqual({ report: ROW, duplicate: true })
    expect(calls[1]?.ops).toContainEqual(['eq', ['user_id', 'owner']])
    expect(calls[1]?.ops).toContainEqual(['eq', ['client_id', 'retry-id']])
    expect(calls.flatMap((call) => call.ops).filter(([op]) => op === 'insert')).toHaveLength(1)
  })
  it('preserves database/network errors, including failures to confirm an existing retry', async () => {
    for (const code of ['P0001', '42501', '23514', 'network']) {
      const { client, calls } = fakeWaterClient({ data: null, error: { code } })
      await expect(insertWaterReport(client, NEW)).rejects.toMatchObject({ code })
      expect(calls).toHaveLength(1)
    }
    await expect(insertWaterReport(fakeWaterClient([{ data: null, error: { code: '23505' } }, { data: null, error: { code: 'PGRST116' } }]).client, NEW)).rejects.toMatchObject({ code: 'PGRST116' })
  })
  it('does not falsely report success if a response contains no saved report', async () => {
    await expect(insertWaterReport(fakeWaterClient({ data: null, error: null }).client, NEW)).rejects.toThrow('not returned')
  })
})

describe('atomic water review', () => {
  it('uses the guarded RPC with a checked name and never sends raw coordinates or a reviewer identity', async () => {
    const { client, rpcCalls } = fakeWaterClient({ data: null, error: null })
    await reviewWaterReport(client, 'r1', 'accepted', ' 公開池 ')
    await reviewWaterReport(client, 'r1', 'rejected', 'ignored')
    expect(rpcCalls).toEqual([
      ['review_water_report', { p_id: 'r1', p_status: 'accepted', p_public_name: '公開池' }],
      ['review_water_report', { p_id: 'r1', p_status: 'rejected', p_public_name: null }],
    ])
  })
  it('propagates rejection and detects a missing target instead of showing successful review', async () => {
    await expect(reviewWaterReport(fakeWaterClient({ data: null, error: null }, { data: null, error: { code: '42501' } }).client, 'r1', 'accepted', '池')).rejects.toMatchObject({ code: '42501' })
    await expect(reviewWaterReport(fakeWaterClient({ data: null, error: null }, { data: false, error: null }).client, 'gone', 'rejected')).rejects.toThrow('not found')
  })
})
