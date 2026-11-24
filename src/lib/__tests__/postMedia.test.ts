import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  aiVariantPath,
  extractAudioPath,
  extractPhotoPath,
  postMediaPaths,
  removePostMedia,
} from '../postMedia'

const removeMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  supabase: { storage: { from: (bucket: string) => fromMock(bucket) } },
}))

const PHOTO = 'https://x.supabase.co/storage/v1/object/public/post-photos/u1/abc.jpg'
const PHOTO2 = 'https://x.supabase.co/storage/v1/object/public/post-photos/u1/def.jpg'
const AUDIO = 'https://x.supabase.co/storage/v1/object/public/post-audio/u1/voice.webm'

beforeEach(() => {
  vi.clearAllMocks()
  removeMock.mockResolvedValue({ data: [], error: null })
  fromMock.mockImplementation(() => ({ remove: removeMock }))
})

describe('パスの組み立て', () => {
  it('写真と音声のパスを URL から取り出す。想定外の URL は空文字', () => {
    expect(extractPhotoPath(PHOTO)).toBe('u1/abc.jpg')
    expect(extractAudioPath(AUDIO)).toBe('u1/voice.webm')
    expect(extractPhotoPath('https://example.com/none')).toBe('')
    expect(extractAudioPath('https://example.com/none')).toBe('')
  })

  it('AI 用の縮小版は <id>.ai.jpg（本体の隣）', () => {
    expect(aiVariantPath('u1/abc.jpg')).toBe('u1/abc.ai.jpg')
    expect(aiVariantPath('u1/ABC.JPG')).toBe('u1/ABC.ai.jpg')
    // .jpg でないものは変えない（呼び出し側が本体と同じパスを除外する）
    expect(aiVariantPath('u1/abc.png')).toBe('u1/abc.png')
  })

  it('写真ごとに本体と縮小版、音声は別にまとめる', () => {
    expect(postMediaPaths({ photos: [PHOTO, PHOTO2], audio_url: AUDIO })).toEqual({
      photoPaths: ['u1/abc.jpg', 'u1/def.jpg', 'u1/abc.ai.jpg', 'u1/def.ai.jpg'],
      audioPaths: ['u1/voice.webm'],
    })
  })

  it('写真も音声も無ければ空', () => {
    expect(postMediaPaths({ photos: null, audio_url: null })).toEqual({ photoPaths: [], audioPaths: [] })
    expect(postMediaPaths({})).toEqual({ photoPaths: [], audioPaths: [] })
  })

  it('.jpg でない写真は、縮小版のパスを足さない（本体と同じパスの重複を出さない）', () => {
    const png = 'https://x.supabase.co/storage/v1/object/public/post-photos/u1/legacy.png'
    expect(postMediaPaths({ photos: [png] }).photoPaths).toEqual(['u1/legacy.png'])
  })
})

describe('removePostMedia', () => {
  it('写真・縮小版は post-photos、音声は post-audio から消す', async () => {
    await removePostMedia({ photos: [PHOTO], audio_url: AUDIO })
    expect(fromMock).toHaveBeenNthCalledWith(1, 'post-photos')
    expect(removeMock).toHaveBeenNthCalledWith(1, ['u1/abc.jpg', 'u1/abc.ai.jpg'])
    expect(fromMock).toHaveBeenNthCalledWith(2, 'post-audio')
    expect(removeMock).toHaveBeenNthCalledWith(2, ['u1/voice.webm'])
  })

  it('消すものが無ければ、保管先を呼ばない', async () => {
    await removePostMedia({ photos: null, audio_url: null })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('写真の削除に失敗したら storage_remove_failed を投げ、音声には進まない', async () => {
    removeMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(removePostMedia({ photos: [PHOTO], audio_url: AUDIO })).rejects.toThrow('storage_remove_failed')
    expect(fromMock).toHaveBeenCalledTimes(1)
  })

  it('音声の削除に失敗したときも storage_remove_failed を投げる', async () => {
    removeMock.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(removePostMedia({ photos: [PHOTO], audio_url: AUDIO })).rejects.toThrow('storage_remove_failed')
  })
})
