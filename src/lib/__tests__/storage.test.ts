import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractPhotoPath, deletePhotos, uploadPhoto } from '../storage'

const removeMock = vi.fn()
const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        remove: removeMock,
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
  },
}))

// REQ-243 FR-243-04: uploadPhoto は processImage(EXIF 除去)を通す。既定では変換済みの JPEG（入力とは別のファイル）を返す。
// 変換に失敗すると実物の processImage は原本をそのまま返す。その場合は個別の試験で mockResolvedValueOnce する。
const processImageMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/imageProcessor', () => ({ processImage: processImageMock }))

describe('storage utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    processImageMock.mockImplementation(async (file: File) =>
      new File([`stripped-${file.size}`], 'stripped.jpg', { type: 'image/jpeg' })
    )
    removeMock.mockResolvedValue({ data: null, error: null })
    uploadMock.mockResolvedValue({ error: null })
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/post-photos/p1.jpg' } })
  })

  it('extractPhotoPath: post-photos 以下の相対パスを返す', () => {
    const url = 'https://example.com/storage/v1/object/public/post-photos/anon/a.jpg'
    expect(extractPhotoPath(url)).toBe('anon/a.jpg')
  })

  it('extractPhotoPath: 想定外URLは空文字を返す', () => {
    expect(extractPhotoPath('https://example.com/no-match')).toBe('')
  })

  it('deletePhotos: URL配列が空なら remove を呼ばない', async () => {
    await deletePhotos([])
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('deletePhotos: 抽出したパスで remove を呼ぶ', async () => {
    await deletePhotos([
      'https://example.com/storage/v1/object/public/post-photos/anon/a.jpg',
      'https://example.com/storage/v1/object/public/post-photos/anon/b.jpg',
    ])
    // AI 用の縮小版（<id>.ai.jpg）も一緒に消す
    expect(removeMock).toHaveBeenCalledWith(['anon/a.jpg', 'anon/b.jpg', 'anon/a.ai.jpg', 'anon/b.ai.jpg'])
  })

  it('uploadPhoto: 成功時は公開URLを返す', async () => {
    const file = new File(['abc'], 'sample.jpg', { type: 'image/jpeg' })
    const result = await uploadPhoto('user-1', file)
    expect(result).toBe('https://example.com/post-photos/p1.jpg')
    expect(uploadMock).toHaveBeenCalledTimes(1)
    // REQ-243 FR-243-04: 保存パスは `${userId}/${uuid}.jpg`（ホワイトリスト拡張子・所有者プレフィックス）。
    expect(uploadMock.mock.calls[0]?.[0]).toMatch(/^user-1\/[0-9a-f-]+\.jpg$/)
  })

  it('uploadPhoto: 変換に失敗して原本のまま返ってきたら、アップロードせず null を返す（位置情報つきの原本を公開しない）', async () => {
    const original = new File(['gps-original'], 'camera.jpg', { type: 'image/jpeg' })
    processImageMock.mockResolvedValueOnce(original)
    expect(await uploadPhoto('user-1', original)).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploadPhoto: JPEG に変換できていなければ、アップロードせず null を返す', async () => {
    processImageMock.mockResolvedValueOnce(new File(['x'], 'x.heic', { type: 'image/heic' }))
    expect(await uploadPhoto('user-1', new File(['abc'], 'a.heic', { type: 'image/heic' }))).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploadPhoto: 変換結果が空ファイルなら、アップロードせず null を返す', async () => {
    processImageMock.mockResolvedValueOnce(new File([], 'empty.jpg', { type: 'image/jpeg' }))
    expect(await uploadPhoto('user-1', new File(['abc'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploadPhoto: 失敗時は null を返す', async () => {
    uploadMock.mockResolvedValue({ error: { message: 'upload failed' } })
    const file = new File(['abc'], 'sample.jpg', { type: 'image/jpeg' })
    const result = await uploadPhoto('user-1', file)
    expect(result).toBeNull()
  })
})
