import { describe, expect, it, vi } from 'vitest'
import { StorageApiError } from '@supabase/supabase-js'

import { WATER_PHOTO_SIGNED_URL_TTL_SECONDS, WATER_REPORT_LIMITS, WATER_REPORT_PHOTOS_BUCKET } from '../../constants'
import { createWaterPhotoUrls, prepareWaterPhoto, removeAllOwnWaterPhotos, removeWaterPhotos, uploadWaterPhoto } from '../photos'
import type { WaterClient } from '../reports'

const USER = '66666666-6666-6666-6666-666666666666'
const jpeg = (size = 10) => new File([new Uint8Array(size)], 'processed.jpg', { type: 'image/jpeg' })
const heic = () => new File([new Uint8Array(10)], 'private-location.HEIC', { type: 'image/heic' })

function storage() {
  const bucket = {
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
    createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
    list: vi.fn().mockResolvedValue({ data: [], error: null }),
    remove: vi.fn().mockImplementation((paths: string[]) => Promise.resolve({ data: paths.map((name) => ({ name })), error: null })),
    getPublicUrl: vi.fn(() => { throw new Error('Private photos cannot have public URLs') }),
  }
  const from = vi.fn(() => bucket)
  return { bucket, from, client: { storage: { from } } as unknown as WaterClient }
}

describe('water photo conversion and private upload', () => {
  it('converts at selection, uploads that same sanitized File once and uses an opaque owner path', async () => {
    const { client, bucket, from } = storage()
    const processed = jpeg()
    const process = vi.fn().mockResolvedValue(processed)
    const preview = await prepareWaterPhoto(heic(), { process })
    const path = await uploadWaterPhoto(client, USER, preview, { process })
    expect(process).toHaveBeenCalledTimes(1)
    expect(path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.jpg$`))
    expect(path).not.toContain('private-location')
    expect(from).toHaveBeenCalledWith(WATER_REPORT_PHOTOS_BUCKET)
    expect(bucket.upload).toHaveBeenCalledWith(path, processed, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
    expect(bucket.getPublicUrl).not.toHaveBeenCalled()
  })

  it('an arbitrary JPEG cannot bypass EXIF removal; native decode fallback never uploads the original', async () => {
    const { client, bucket } = storage()
    const original = jpeg()
    const process = vi.fn().mockImplementation((file: File) => Promise.resolve(file))
    await expect(uploadWaterPhoto(client, USER, original, { process })).rejects.toMatchObject({ kind: 'conversion' })
    expect(process).toHaveBeenCalledWith(original)
    const unsupported = heic()
    await expect(uploadWaterPhoto(client, USER, unsupported, { process })).rejects.toMatchObject({ kind: 'conversion' })
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('rejects invalid inputs before decoding and empty, non-JPEG or oversized processed output', async () => {
    const process = vi.fn().mockResolvedValue(jpeg())
    await expect(prepareWaterPhoto(new File(['svg'], 'x.svg', { type: 'image/svg+xml' }), { process })).rejects.toMatchObject({ kind: 'fileType' })
    await expect(prepareWaterPhoto(jpeg(0), { process })).rejects.toMatchObject({ kind: 'fileSize' })
    await expect(prepareWaterPhoto(jpeg(WATER_REPORT_LIMITS.inputPhotoMaxBytes + 1), { process })).rejects.toMatchObject({ kind: 'fileSize' })
    expect(process).not.toHaveBeenCalled()
    for (const output of [jpeg(0), jpeg(WATER_REPORT_LIMITS.photoMaxBytes + 1), new File(['png'], 'x.png', { type: 'image/png' })]) {
      await expect(prepareWaterPhoto(heic(), { process: () => Promise.resolve(output) })).rejects.toMatchObject({ kind: 'conversion' })
    }
  })

  it('rejects a path-traversal owner before processing or storage', async () => {
    const { client, bucket } = storage()
    const process = vi.fn().mockResolvedValue(jpeg())
    await expect(uploadWaterPhoto(client, '../other', heic(), { process })).rejects.toThrow()
    expect(process).not.toHaveBeenCalled()
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('keeps an upload path after a lost response and recognizes only its subsequent 409 as accepted', async () => {
    const { client, bucket } = storage()
    bucket.upload.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: null, error: { statusCode: '409', message: 'The resource already exists' } })
    const file = await prepareWaterPhoto(heic(), { process: () => Promise.resolve(jpeg()) })
    await expect(uploadWaterPhoto(client, USER, file)).rejects.toThrow('Failed to fetch')
    const path = await uploadWaterPhoto(client, USER, file)
    expect(bucket.upload.mock.calls[0]![0]).toBe(path)
    expect(bucket.upload.mock.calls[1]![0]).toBe(path)
    await expect(uploadWaterPhoto(client, USER, file)).resolves.toBe(path)
    expect(bucket.upload).toHaveBeenCalledTimes(2)
    const firstConflict = storage()
    firstConflict.bucket.upload.mockResolvedValue({ data: null, error: { statusCode: '409' } })
    await expect(uploadWaterPhoto(firstConflict.client, USER, heic(), { process: () => Promise.resolve(jpeg()) })).rejects.toMatchObject({ statusCode: '409' })
  })

  it('never treats a non-conflict upload failure as success', async () => {
    const { client, bucket } = storage()
    bucket.upload.mockResolvedValue({ data: null, error: { statusCode: '403', message: 'denied' } })
    const file = await prepareWaterPhoto(heic(), { process: () => Promise.resolve(jpeg()) })
    await expect(uploadWaterPhoto(client, USER, file)).rejects.toMatchObject({ statusCode: '403' })
    await expect(uploadWaterPhoto(client, USER, file)).rejects.toMatchObject({ statusCode: '403' })
  })

  it.each(['ResourceAlreadyExists', 'KeyAlreadyExists'])('recognizes the installed SDK named %s only when retrying the same File/path', async (code) => {
    const duplicate = new StorageApiError('duplicate', 409, code, 'storage', code)
    const { client, bucket } = storage()
    bucket.upload.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: null, error: duplicate })
    const file = await prepareWaterPhoto(heic(), { process: () => Promise.resolve(jpeg()) })
    await expect(uploadWaterPhoto(client, USER, file)).rejects.toThrow('Failed to fetch')
    const path = await uploadWaterPhoto(client, USER, file)
    expect(bucket.upload.mock.calls[0]![0]).toBe(path)
    expect(bucket.upload.mock.calls[1]![0]).toBe(path)
    const firstConflict = storage()
    firstConflict.bucket.upload.mockResolvedValue({ data: null, error: duplicate })
    await expect(uploadWaterPhoto(firstConflict.client, USER, heic(), { process: () => Promise.resolve(jpeg()) })).rejects.toBe(duplicate)
  })
})

describe('private photo display and account purge', () => {
  it('uses short-lived signed URLs and omits inaccessible objects', async () => {
    const { client, bucket } = storage()
    bucket.createSignedUrls.mockResolvedValue({ data: [
      { path: `${USER}/a.jpg`, signedUrl: 'https://example.test/signed/a', error: null },
      { path: `${USER}/b.jpg`, signedUrl: '', error: 'denied' },
    ], error: null })
    await expect(createWaterPhotoUrls(client, [`${USER}/a.jpg`, `${USER}/b.jpg`])).resolves.toEqual([
      { path: `${USER}/a.jpg`, url: 'https://example.test/signed/a' },
    ])
    expect(bucket.createSignedUrls).toHaveBeenCalledWith([`${USER}/a.jpg`, `${USER}/b.jpg`], WATER_PHOTO_SIGNED_URL_TTL_SECONDS)
    expect(bucket.getPublicUrl).not.toHaveBeenCalled()
  })

  it('an empty request does not touch storage; partial deletion is a failure', async () => {
    const { client, bucket, from } = storage()
    await expect(createWaterPhotoUrls(client, [])).resolves.toEqual([])
    await expect(removeWaterPhotos(client, [])).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
    bucket.remove.mockResolvedValue({ data: [{ name: `${USER}/a.jpg` }], error: null })
    await expect(removeWaterPhotos(client, [`${USER}/a.jpg`, `${USER}/b.jpg`])).rejects.toMatchObject({ kind: 'denied' })
  })

  it('purges every page in the owner folder and skips folder placeholders', async () => {
    const { client, bucket } = storage()
    bucket.list.mockResolvedValueOnce({ data: [{ id: '1', name: 'a.jpg' }, { id: null, name: 'folder' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: '2', name: 'b.jpg' }], error: null })
    await expect(removeAllOwnWaterPhotos(client, USER)).resolves.toBe(2)
    expect(bucket.list).toHaveBeenCalledWith(USER, { limit: 1000 })
    expect(bucket.remove.mock.calls).toEqual([[[`${USER}/a.jpg`]], [[`${USER}/b.jpg`]]])
  })

  it('stops account deletion on silent RLS rejection, list failures or a stalled purge', async () => {
    const denied = storage()
    denied.bucket.list.mockResolvedValue({ data: [{ id: '1', name: 'a.jpg' }], error: null })
    denied.bucket.remove.mockResolvedValue({ data: [], error: null })
    await expect(removeAllOwnWaterPhotos(denied.client, USER)).rejects.toMatchObject({ kind: 'denied' })
    const failed = storage()
    failed.bucket.list.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } })
    await expect(removeAllOwnWaterPhotos(failed.client, USER)).rejects.toMatchObject({ message: 'Bucket not found' })
    const endless = storage()
    endless.bucket.list.mockResolvedValue({ data: [{ id: '1', name: 'a.jpg' }], error: null })
    await expect(removeAllOwnWaterPhotos(endless.client, USER)).rejects.toMatchObject({ kind: 'tooMany' })
    expect(endless.bucket.remove).toHaveBeenCalledTimes(20)
  })
})
