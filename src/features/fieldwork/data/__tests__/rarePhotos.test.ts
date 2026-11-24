import { describe, it, expect, vi } from 'vitest'

import { RARE_PHOTOS_BUCKET, RARE_PHOTO_SIGNED_URL_TTL_SECONDS } from '../../constants'
import {
  createRarePhotoUrls,
  isMissingBucketError,
  RarePhotoPurgeError,
  removeAllOwnRarePhotos,
  removeRarePhotos,
  uploadRarePhoto,
} from '../rarePhotos'
import type { FieldworkClient } from '../shared'

const USER = '66666666-6666-6666-6666-666666666666'

/** storage だけを持つ偽クライアント。公開 URL を作ろうとしたら落ちる。 */
function fakeStorage(results: { upload?: unknown; signed?: unknown; remove?: unknown } = {}) {
  const bucket = {
    upload: vi.fn(() => Promise.resolve(results.upload ?? { data: { path: 'x' }, error: null })),
    createSignedUrls: vi.fn(() => Promise.resolve(results.signed ?? { data: [], error: null })),
    remove: vi.fn(() => Promise.resolve(results.remove ?? { data: [], error: null })),
    getPublicUrl: vi.fn(() => {
      throw new Error('公開 URL を作ってはいけない')
    }),
  }
  const storage = { from: vi.fn(() => bucket) }
  return { client: { storage } as unknown as FieldworkClient, bucket, storage }
}

const jpeg = (size = 10) => new File([new Uint8Array(size)], 'processed.jpg', { type: 'image/jpeg' })
const original = () => new File([new Uint8Array(10)], 'IMG_0001.HEIC', { type: 'image/heic' })

describe('rare-photos への写真の保存 (REQ-330)', () => {
  it('EXIF を消した JPEG を自分のフォルダへ <uuid>.jpg で置き、上書きしない', async () => {
    const { client, bucket, storage } = fakeStorage()
    const processed = jpeg()
    const process = vi.fn(() => Promise.resolve(processed))
    const path = await uploadRarePhoto(client, USER, original(), { process })
    expect(process).toHaveBeenCalledTimes(1)
    expect(path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.jpg$`))
    expect(storage.from).toHaveBeenCalledWith(RARE_PHOTOS_BUCKET)
    expect(bucket.upload).toHaveBeenCalledWith(path, processed, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    })
    expect(bucket.getPublicUrl).not.toHaveBeenCalled()
  })

  it('利用者が付けたファイル名はパスに使わない', async () => {
    const { client } = fakeStorage()
    const path = await uploadRarePhoto(client, USER, original(), { process: () => Promise.resolve(jpeg()) })
    expect(path).not.toContain('IMG_0001')
  })

  it('EXIF を消せなかった（元のファイルのまま返った）写真は送らない', async () => {
    const { client, bucket } = fakeStorage()
    const file = original()
    await expect(uploadRarePhoto(client, USER, file, { process: (f) => Promise.resolve(f) })).rejects.toThrow(/EXIF/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('JPEG になっていない・5MB を超える写真は送らない', async () => {
    const { client, bucket } = fakeStorage()
    const png = new File([new Uint8Array(10)], 'x.png', { type: 'image/png' })
    await expect(uploadRarePhoto(client, USER, original(), { process: () => Promise.resolve(png) })).rejects.toThrow()
    await expect(
      uploadRarePhoto(client, USER, original(), { process: () => Promise.resolve(jpeg(5 * 1024 * 1024 + 1)) })
    ).rejects.toThrow(/5MB/)
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('利用者 ID が uuid でなければ（パスの書き換えを防ぐ）何もせずに投げる', async () => {
    const { client, bucket } = fakeStorage()
    const process = vi.fn(() => Promise.resolve(jpeg()))
    await expect(uploadRarePhoto(client, '../other', original(), { process })).rejects.toThrow()
    expect(process).not.toHaveBeenCalled()
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('置けなかったとき（他人のフォルダ・容量）はそのまま投げる', async () => {
    const { client } = fakeStorage({ upload: { data: null, error: { message: 'new row violates row-level security policy' } } })
    await expect(
      uploadRarePhoto(client, USER, original(), { process: () => Promise.resolve(jpeg()) })
    ).rejects.toMatchObject({ message: expect.stringContaining('row-level security') })
  })
})

describe('rare-photos の表示と削除 (REQ-330)', () => {
  it('表示は 1 時間の署名 URL だけ。読めなかった写真は結果に入れない', async () => {
    const { client, bucket } = fakeStorage({
      signed: {
        data: [
          { path: `${USER}/a.jpg`, signedUrl: 'https://example.test/signed/a', error: null },
          { path: `${USER}/b.jpg`, signedUrl: '', error: 'Object not found' },
        ],
        error: null,
      },
    })
    const urls = await createRarePhotoUrls(client, [`${USER}/a.jpg`, `${USER}/b.jpg`])
    expect(urls).toEqual([{ path: `${USER}/a.jpg`, url: 'https://example.test/signed/a' }])
    expect(bucket.createSignedUrls).toHaveBeenCalledWith([`${USER}/a.jpg`, `${USER}/b.jpg`], RARE_PHOTO_SIGNED_URL_TTL_SECONDS)
    expect(RARE_PHOTO_SIGNED_URL_TTL_SECONDS).toBe(3600)
    expect(bucket.getPublicUrl).not.toHaveBeenCalled()
  })

  it('写真が無ければ置き場に行かない', async () => {
    const { client, storage } = fakeStorage()
    await expect(createRarePhotoUrls(client, [])).resolves.toEqual([])
    await expect(removeRarePhotos(client, [])).resolves.toEqual([])
    expect(storage.from).not.toHaveBeenCalled()
  })

  it('消せた写真を返し、1 つも消せなければ（他人の写真・RLS 拒否）投げる', async () => {
    const ok = fakeStorage({ remove: { data: [{ name: `${USER}/a.jpg` }], error: null } })
    await expect(removeRarePhotos(ok.client, [`${USER}/a.jpg`])).resolves.toEqual([`${USER}/a.jpg`])
    const denied = fakeStorage({ remove: { data: [], error: null } })
    await expect(removeRarePhotos(denied.client, [`${USER}/a.jpg`])).rejects.toThrow()
    const failed = fakeStorage({ remove: { data: null, error: { message: 'network' } } })
    await expect(removeRarePhotos(failed.client, [`${USER}/a.jpg`])).rejects.toMatchObject({ message: 'network' })
  })
})

describe('退会の前に写真を全部消す (REQ-330 点検 B5)', () => {
  function fakeBucket(pages: unknown[][], removeResult?: (paths: string[]) => unknown) {
    const list = vi.fn(() => Promise.resolve({ data: pages.shift() ?? [], error: null }))
    const remove = vi.fn((paths: string[]) => Promise.resolve(removeResult ? removeResult(paths) : { data: paths.map((name) => ({ name })), error: null }))
    const bucket = { list, remove }
    const storage = { from: vi.fn(() => bucket) }
    return { client: { storage } as unknown as FieldworkClient, list, remove, storage }
  }

  it('自分のフォルダを一覧して消し、空になるまで繰り返す（フォルダの見出しは消さない）', async () => {
    const { client, list, remove, storage } = fakeBucket([
      [
        { id: 'o1', name: 'a.jpg' },
        { id: 'o2', name: 'b.jpg' },
        { id: null, name: 'sub' },
      ],
      [{ id: 'o3', name: 'c.jpg' }],
      [],
    ])
    await expect(removeAllOwnRarePhotos(client, USER)).resolves.toBe(3)
    expect(storage.from).toHaveBeenCalledWith(RARE_PHOTOS_BUCKET)
    expect(list).toHaveBeenCalledWith(USER, { limit: 1000 })
    expect(remove.mock.calls).toEqual([[[`${USER}/a.jpg`, `${USER}/b.jpg`]], [[`${USER}/c.jpg`]]])
  })

  it('写真が無ければ何も消さずに 0', async () => {
    const { client, remove } = fakeBucket([[]])
    await expect(removeAllOwnRarePhotos(client, USER)).resolves.toBe(0)
    expect(remove).not.toHaveBeenCalled()
  })

  it('C3: 退会を止めるべき失敗は種類つき（権限で 0 件＝denied・回数の上限＝tooMany）', async () => {
    const denied = fakeBucket([[{ id: 'o1', name: 'a.jpg' }]], () => ({ data: [], error: null }))
    await expect(removeAllOwnRarePhotos(denied.client, USER)).rejects.toMatchObject({ name: 'RarePhotoPurgeError', kind: 'denied' })
    const endless = fakeBucket(Array.from({ length: 30 }, () => [{ id: 'o1', name: 'a.jpg' }]))
    await expect(removeAllOwnRarePhotos(endless.client, USER)).rejects.toBeInstanceOf(RarePhotoPurgeError)
    await expect(removeAllOwnRarePhotos(fakeBucket(Array.from({ length: 30 }, () => [{ id: 'o1', name: 'a.jpg' }])).client, USER)).rejects.toMatchObject({ kind: 'tooMany' })
  })

  it('C3: 置き場が無い（進めてよい失敗）は見分けられる', () => {
    expect(isMissingBucketError({ statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' })).toBe(true)
    expect(isMissingBucketError(new RarePhotoPurgeError('denied'))).toBe(false)
    expect(isMissingBucketError(new TypeError('Failed to fetch'))).toBe(false)
  })

  it('消せなかった（権限で 0 件）・一覧できなかったときは投げる。利用者 ID が uuid でなければ何もしない', async () => {
    const denied = fakeBucket([[{ id: 'o1', name: 'a.jpg' }]], () => ({ data: [], error: null }))
    await expect(removeAllOwnRarePhotos(denied.client, USER)).rejects.toThrow()
    const listFailed = { storage: { from: () => ({ list: () => Promise.resolve({ data: null, error: { message: 'Failed to fetch' } }) }) } }
    await expect(removeAllOwnRarePhotos(listFailed as unknown as FieldworkClient, USER)).rejects.toMatchObject({ message: 'Failed to fetch' })
    const bad = fakeBucket([[{ id: 'o1', name: 'a.jpg' }]])
    await expect(removeAllOwnRarePhotos(bad.client, '../other')).rejects.toThrow()
    expect(bad.list).not.toHaveBeenCalled()
  })
})
