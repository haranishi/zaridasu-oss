import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  selectOwnRareSightings: vi.fn(),
  insertRareKeepingRecord: vi.fn(),
  deleteRareSighting: vi.fn(),
  uploadRarePhoto: vi.fn(),
  removeRarePhotos: vi.fn(),
  hideLinkedPostsNear: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
vi.mock('../../data/rareSightings', () => ({
  selectOwnRareSightings: m.selectOwnRareSightings,
  insertRareKeepingRecord: m.insertRareKeepingRecord,
  deleteRareSighting: m.deleteRareSighting,
}))
vi.mock('../../data/rarePhotos', () => ({ uploadRarePhoto: m.uploadRarePhoto, removeRarePhotos: m.removeRarePhotos }))
vi.mock('../../data/protect', () => ({ hideLinkedPostsNear: m.hideLinkedPostsNear }))

import { useRareSightings, type RareInput } from '../useRareSightings'
import type { QueueItem } from '../../lib/queue'

// REQ-330: 希少種の記録。圏外では写真なしだけ送信待ちへ（client_id で二重登録を防ぐ）。消したら写真も消す。
// 記録できたら、近くの地点につながる自分の投稿の位置を非公開にする（点検 B3）。

const A = '00000000-0000-0000-0000-00000000aaaa'
const enqueue = vi.fn(() => true)
const row = { id: 'r1', client_id: 'cid-1', stop_id: null, species_key: 'medaka', species_label: null, count: 3, note: null, lat: 39.7, lng: 140.1, accuracy: 8, location_source: 'gps', observed_at: '2026-10-01T04:00:00Z', photo_paths: [], created_at: '' }

function input(extra: Partial<RareInput> = {}): RareInput {
  return {
    clientId: 'cid-1',
    stopId: null,
    speciesKey: 'medaka',
    speciesLabel: null,
    count: 3,
    note: null,
    position: { lat: 39.7, lng: 140.1, accuracy: 8, source: 'gps' },
    observedAt: '2026-10-01T04:00:00.000Z',
    photos: [],
    ...extra,
  }
}

const photo = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' })

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  setOnline(true)
  m.selectOwnRareSightings.mockResolvedValue({ data: [], error: null })
  m.insertRareKeepingRecord.mockResolvedValue({ sighting: row, duplicate: false, stopDropped: false })
  m.hideLinkedPostsNear.mockResolvedValue(0)
})

describe('useRareSightings', () => {
  it('タブを開くか地図に表示するまでは読まない', async () => {
    const { result, rerender } = renderHook((p: { active: boolean }) => useRareSightings(A, { active: p.active, enqueue }), {
      initialProps: { active: false },
    })
    expect(m.selectOwnRareSightings).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(result.current.loadState).toBe('ready'))
    expect(m.selectOwnRareSightings).toHaveBeenCalledWith({}, A)
  })

  it('電波があれば client_id つきで記録し、一覧の先頭に出す', async () => {
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.create(input())
    })
    expect(outcome).toMatchObject({ status: 'saved', duplicate: false })
    expect(m.insertRareKeepingRecord).toHaveBeenCalledWith({}, expect.objectContaining({ userId: A, clientId: 'cid-1', locationSource: 'gps', photoPaths: [] }))
    expect(result.current.list[0]?.id).toBe('r1')
  })

  it('B3: 記録できたら、その場所の近くの地点につながる自分の投稿を非公開にする', async () => {
    m.insertRareKeepingRecord.mockResolvedValueOnce({ sighting: { ...row, stop_id: 's2' }, duplicate: false, stopDropped: false })
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    await act(async () => {
      await result.current.create(input({ stopId: 's2' }))
    })
    expect(m.hideLinkedPostsNear).toHaveBeenCalledWith({}, A, { lat: 39.7, lng: 140.1 }, 's2')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('B3: 非公開にする途中で通信が切れたら、続きを送信待ち（protect）に積む', async () => {
    m.hideLinkedPostsNear.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.create(input())
    })
    expect(outcome).toMatchObject({ status: 'saved' })
    expect((enqueue.mock.calls as unknown as [QueueItem][])[0]![0]).toMatchObject({ type: 'protect', userId: A, lat: 39.7, lng: 140.1, rareStopId: null })
  })

  it('C8: 非公開化の続きを送信待ちが満杯で積めなかったら、保存の結果で知らせる（黙って捨てない）', async () => {
    m.hideLinkedPostsNear.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const full = vi.fn(() => false)
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue: full }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.create(input())
    })
    expect(outcome).toMatchObject({ status: 'saved', protectFailed: true })
  })

  it('圏外で写真なしなら送信待ちに積む（同じ client_id）', async () => {
    setOnline(false)
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.create(input({ stopId: 's1' }))
    })
    expect(outcome).toEqual({ status: 'queued' })
    expect(m.insertRareKeepingRecord).not.toHaveBeenCalled()
    expect((enqueue.mock.calls as unknown as [QueueItem][])[0]![0]).toMatchObject({ type: 'rare', clientId: 'cid-1', userId: A, stopId: 's1' })
  })

  it('圏外で写真つきは保存しない（写真は電波のある場所だけ）', async () => {
    setOnline(false)
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    await act(async () => {
      await expect(result.current.create(input({ photos: [photo()] }))).rejects.toMatchObject({ reason: 'photosOffline' })
    })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('写真は先に置いてからパスを記録に入れる。届かなかったことが確かな失敗なら置いた写真を片付ける', async () => {
    m.uploadRarePhoto.mockResolvedValueOnce(`${A}/p1.jpg`)
    m.insertRareKeepingRecord.mockRejectedValueOnce({ code: '23514', message: 'check violation' })
    m.removeRarePhotos.mockResolvedValue([`${A}/p1.jpg`])
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    await act(async () => {
      await expect(result.current.create(input({ photos: [photo()] }))).rejects.toMatchObject({ code: '23514' })
    })
    expect(m.insertRareKeepingRecord).toHaveBeenCalledWith({}, expect.objectContaining({ photoPaths: [`${A}/p1.jpg`] }))
    expect(m.removeRarePhotos).toHaveBeenCalledWith({}, [`${A}/p1.jpg`])
  })

  it('写真を置いたあとに通信が切れたら、写真は残して投げる（同じ client_id で保存し直せる）', async () => {
    m.uploadRarePhoto.mockResolvedValueOnce(`${A}/p1.jpg`)
    m.insertRareKeepingRecord.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const onUploaded = vi.fn()
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    await act(async () => {
      await expect(result.current.create(input({ photos: [photo()], onUploaded }))).rejects.toThrow('Failed to fetch')
    })
    expect(m.removeRarePhotos).not.toHaveBeenCalled()
    expect(onUploaded).toHaveBeenLastCalledWith([`${A}/p1.jpg`])
    // 保存し直すときは置き直さない
    await act(async () => {
      await result.current.create(input({ photos: [photo()], uploadedPaths: [`${A}/p1.jpg`] }))
    })
    expect(m.uploadRarePhoto).toHaveBeenCalledTimes(1)
  })

  it('消したら写真の実体も消す', async () => {
    m.deleteRareSighting.mockResolvedValue({ photoPaths: [`${A}/p1.jpg`, `${A}/p2.jpg`] })
    m.removeRarePhotos.mockResolvedValue([`${A}/p1.jpg`, `${A}/p2.jpg`])
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.remove('r1')
    })
    expect(m.deleteRareSighting).toHaveBeenCalledWith({}, 'r1')
    expect(m.removeRarePhotos).toHaveBeenCalledWith({}, [`${A}/p1.jpg`, `${A}/p2.jpg`])
    expect(outcome).toEqual({ photosLeft: 0, photoCount: 2 })
  })

  it('写真だけ消せなかったら photosLeft で知らせる（記録は消えている）', async () => {
    m.deleteRareSighting.mockResolvedValue({ photoPaths: [`${A}/p1.jpg`] })
    m.removeRarePhotos.mockRejectedValue(new Error('RLS deny'))
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.remove('r1')
    })
    expect(outcome).toEqual({ photosLeft: 1, photoCount: 1 })
  })

  it('写真の一部だけ消せたら、残った枚数を返す（「一部残った」と出すため）', async () => {
    m.deleteRareSighting.mockResolvedValue({ photoPaths: [`${A}/p1.jpg`, `${A}/p2.jpg`, `${A}/p3.jpg`] })
    m.removeRarePhotos.mockResolvedValue([`${A}/p1.jpg`])
    const { result } = renderHook(() => useRareSightings(A, { active: false, enqueue }))
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.remove('r1')
    })
    expect(outcome).toEqual({ photosLeft: 2, photoCount: 3 })
  })
})
