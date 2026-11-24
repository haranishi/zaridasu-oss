import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  user: { current: '66666666-6666-6666-6666-666666666666' },
  prepare: vi.fn(), upload: vi.fn(), insert: vi.fn(), remove: vi.fn(),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: m.user.current } }) }))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('../data/photos', async (original) => ({
  ...await original<typeof import('../data/photos')>(),
  prepareWaterPhoto: m.prepare, uploadWaterPhoto: m.upload, removeWaterPhotos: m.remove,
}))
vi.mock('../data/reports', () => ({ insertWaterReport: m.insert }))

import { useWaterReport } from '../useWaterReport'

const USER = '66666666-6666-6666-6666-666666666666'
const POSITION = { lat: 39.7, lng: 140.1 }
const file = () => new File(['original'], 'IMG.HEIC', { type: 'image/heic' })
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  m.user.current = USER
  m.prepare.mockImplementation(() => Promise.resolve(new File(['jpeg'], 'safe.jpg', { type: 'image/jpeg' })))
  m.upload.mockResolvedValue(`${USER}/a.jpg`)
  m.insert.mockResolvedValue({ report: {}, duplicate: false })
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('water report submission', () => {
  it('does not submit while photos are decoding and prevents another selection batch', async () => {
    const decoding = deferred<File>()
    m.prepare.mockReturnValue(decoding.promise)
    const { result } = renderHook(() => useWaterReport(USER, POSITION))
    let adding!: Promise<void>
    act(() => { adding = result.current.addPhotos([file()]) })
    expect(result.current.photoProcessing).toEqual({ current: 0, total: 1 })
    await act(async () => { expect(await result.current.submit('池', '')).toBe(false); await result.current.addPhotos([file()]) })
    expect(m.prepare).toHaveBeenCalledTimes(1)
    expect(m.insert).not.toHaveBeenCalled()
    await act(async () => { decoding.resolve(new File(['safe'], 'x.jpg', { type: 'image/jpeg' })); await adding })
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.photoProcessing).toBeNull()
  })

  it('retains exact input, position, client UUID and photos after an ambiguous INSERT, then accepts a duplicate', async () => {
    m.insert.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ report: {}, duplicate: true })
    const { result, rerender } = renderHook(({ position }) => useWaterReport(USER, position), { initialProps: { position: POSITION } })
    await act(async () => { await result.current.addPhotos([file()]) })
    // Even handlers retained before the first attempt must observe the synchronous snapshot guard.
    const oldAdd = result.current.addPhotos, oldRemove = result.current.removePhoto
    await act(async () => { expect(await result.current.submit('  小さな池  ', '  岸から撮影  ')).toBe(false) })
    expect(result.current.locked).toBe(true)
    expect(result.current.errorKey).toBe('water.report.errors.save')
    const first = structuredClone(m.insert.mock.calls[0]![1])
    rerender({ position: { lat: 40, lng: 141 } })
    await act(async () => { oldRemove(0); await oldAdd([file()]) })
    expect(result.current.photos).toHaveLength(1)
    await act(async () => { expect(await result.current.submit('変更しない', '変更しない')).toBe(true) })
    expect(m.insert.mock.calls[1]![1]).toEqual(first)
    expect(first).toMatchObject({ name: '小さな池', note: '岸から撮影', ...POSITION, photoPaths: [`${USER}/a.jpg`] })
    expect(first.clientId).toMatch(/^[0-9a-f-]{36}$/)
    expect(m.upload).toHaveBeenCalledTimes(1)
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('keeps a successful first upload when the second fails, so retry only uploads the missing photo', async () => {
    m.upload.mockResolvedValueOnce(`${USER}/a.jpg`).mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(`${USER}/b.jpg`)
    const { result } = renderHook(() => useWaterReport(USER, POSITION))
    await act(async () => { await result.current.addPhotos([file(), file()]) })
    await act(async () => { expect(await result.current.submit('池', '')).toBe(false) })
    expect(m.insert).not.toHaveBeenCalled()
    await act(async () => { expect(await result.current.submit('池', '')).toBe(true) })
    expect(m.upload).toHaveBeenCalledTimes(3)
    expect(m.insert.mock.calls[0]![1].photoPaths).toEqual([`${USER}/a.jpg`, `${USER}/b.jpg`])
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('two immediate submit calls create only one upload and one INSERT', async () => {
    const uploading = deferred<string>()
    m.upload.mockReturnValue(uploading.promise)
    const { result } = renderHook(() => useWaterReport(USER, POSITION))
    await act(async () => { await result.current.addPhotos([file()]) })
    let first!: Promise<boolean>
    let second!: Promise<boolean>
    act(() => { first = result.current.submit('池', ''); second = result.current.submit('池', '') })
    expect(m.upload).toHaveBeenCalledTimes(1)
    await act(async () => { expect(await second).toBe(false); uploading.resolve(`${USER}/a.jpg`); expect(await first).toBe(true) })
    expect(m.insert).toHaveBeenCalledTimes(1)
  })

  it('requires a name and 1..3 photos; overlength note is rejected before any upload', async () => {
    const { result } = renderHook(() => useWaterReport(USER, POSITION))
    await act(async () => { expect(await result.current.submit(' ', '')).toBe(false) })
    expect(result.current.errorKey).toBe('water.report.errors.name')
    await act(async () => { expect(await result.current.submit('池', '')).toBe(false) })
    expect(result.current.errorKey).toBe('water.report.errors.photos')
    await act(async () => { await result.current.addPhotos([file(), file(), file(), file()]) })
    expect(result.current.photos).toHaveLength(3)
    await act(async () => { expect(await result.current.submit('池', 'a'.repeat(1001))).toBe(false) })
    expect(result.current.errorKey).toBe('water.report.errors.note')
    expect(m.upload).not.toHaveBeenCalled()
  })

  it('account changes during conversion discard late photos without creating previews', async () => {
    const decoding = deferred<File>()
    m.prepare.mockReturnValue(decoding.promise)
    const { result, rerender } = renderHook(() => useWaterReport(USER, POSITION))
    let adding!: Promise<void>
    act(() => { adding = result.current.addPhotos([file()]) })
    m.user.current = '77777777-7777-7777-7777-777777777777'
    rerender()
    await act(async () => { decoding.resolve(new File(['safe'], 'x.jpg', { type: 'image/jpeg' })); await adding })
    expect(result.current.photos).toHaveLength(0)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('account changes during upload stop before INSERT and never delete the old owner photos', async () => {
    const uploading = deferred<string>()
    m.upload.mockReturnValue(uploading.promise)
    const { result, rerender } = renderHook(() => useWaterReport(USER, POSITION))
    await act(async () => { await result.current.addPhotos([file()]) })
    let pending!: Promise<boolean>
    act(() => { pending = result.current.submit('池', '') })
    m.user.current = '77777777-7777-7777-7777-777777777777'
    rerender()
    await act(async () => { uploading.resolve(`${USER}/a.jpg`); expect(await pending).toBe(false) })
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('unmount revokes previews and suppresses a late successful response', async () => {
    const inserted = deferred<{ report: object; duplicate: boolean }>()
    m.insert.mockReturnValue(inserted.promise)
    const { result, unmount } = renderHook(() => useWaterReport(USER, POSITION))
    await act(async () => { await result.current.addPhotos([file()]) })
    let pending!: Promise<boolean>
    await act(async () => { pending = result.current.submit('池', ''); await Promise.resolve() })
    expect(m.insert).toHaveBeenCalledTimes(1)
    unmount()
    inserted.resolve({ report: {}, duplicate: false })
    expect(await pending).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(m.remove).not.toHaveBeenCalled()
  })
})
