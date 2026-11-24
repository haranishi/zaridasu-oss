import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePostForm } from '../usePostForm'
import { SPAM_LIMIT_POSTS, SPAM_LIMIT_WINDOW_MS, MAX_FILE_SIZE, MAX_INPUT_IMAGE_SIZE } from '../../../lib/constants'
import type { PostFormData } from '@/types'
import { processImage } from '@/lib/imageProcessor'
import ja from '@/locales/ja/translation.json'

function translationValue(key: string): unknown {
  let value: unknown = ja
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

// REQ-183: usePostForm はハードコード日本語を t() 化した。テスト環境では i18n を
// 初期化していない（vitest.setup.ts は i18n を import しない）ため、react-i18next を
// モックして ja の実文言＋補間を返す（PostCard.test 等と同じ方式）。これにより
// 文字列アサーションがユーザー向け文言の正しさも検証する。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = translationValue(key)
      if (typeof value !== 'string') return key
      if (!opts) return value
      return value.replace(/\{\{(\w+)\}\}/g, (_match: string, name: string) =>
        opts[name] != null ? String(opts[name]) : ''
      )
    },
    i18n: { language: 'ja' },
  }),
}))

// ── Supabase モック（vi.hoisted で vi.mock ホイスティングに対応）──
const {
  uploadMock, removeMock, getPublicUrlMock,
  singleMock, insertMock, invokeMock,
} = vi.hoisted(() => {
  const singleMock = vi.fn()
  const selectMock = vi.fn(() => ({ single: singleMock }))
  const insertMock = vi.fn(() => ({ select: selectMock }))
  return {
    uploadMock: vi.fn(),
    removeMock: vi.fn(),
    getPublicUrlMock: vi.fn(),
    singleMock,
    selectMock,
    insertMock,
    invokeMock: vi.fn(),
  }
})

type AuthMockValue = {
  user: { id: string } | null
  isAdmin: boolean
}

const { useAuthMock } = vi.hoisted(() => ({
  // vi.mock は実装モジュールの完全な AuthContextValue を返す必要がないため、
  // このテストで usePostForm が読む2フィールドだけを明示する。
  useAuthMock: vi.fn<() => AuthMockValue>(),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        remove: removeMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
    from: vi.fn(() => ({
      insert: insertMock,
    })),
    functions: {
      invoke: invokeMock,
    },
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: useAuthMock,
}))

// REQ-183: getErrorMessage は ErrorMessage { key, params?, raw? } を返し、
// 表示側は resolveErrorMessage(msg, t) で文字列化する。モックも同じ契約に合わせる。
vi.mock('@/lib/errorHandler', () => ({
  getErrorMessage: vi.fn((err: { message?: string } | null | undefined) => ({ key: 'errors.generic', raw: err?.message })),
  resolveErrorMessage: vi.fn((
    msg: { key: string; params?: Record<string, unknown>; raw?: string },
    translate: (key: string, options?: Record<string, unknown>) => string,
  ) =>
    msg?.raw != null && msg.raw !== '' ? msg.raw : translate(msg.key, msg.params)
  ),
  logError: vi.fn(),
}))

vi.mock('@/lib/imageProcessor', () => ({
  processImage: vi.fn((file: File) => Promise.resolve(new File(['prepared'], file.name, { type: 'image/jpeg' }))),
}))

vi.mock('@/lib/offlineStore', () => ({
  addPendingPost: vi.fn(),
}))

const { exifGpsMock } = vi.hoisted(() => ({ exifGpsMock: vi.fn() }))
vi.mock('exifr', () => ({ default: { gps: exifGpsMock } }))

// URL.createObjectURL / revokeObjectURL モック
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
globalThis.URL.revokeObjectURL = vi.fn()

const LEGACY_SPAM_KEY = 'zarigani_submit_timestamps'
const SPAM_KEY = `${LEGACY_SPAM_KEY}:success:v1:test-user-id`

function makeFile(name = 'test.jpg', type = 'image/jpeg', size = 1024) {
  const file = new File(['x'.repeat(size)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function makeFileEvent(files: File[]): React.ChangeEvent<HTMLInputElement> {
  // フックが参照する target.files だけを持つ合成イベント。DOM dispatch は行わない。
  return { target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>
}

const validPostData: PostFormData = {
  position: { lat: 39.7, lng: 140.1 },
  species: 'american',
  infoType: 'sighting',
  municipality: '',
  comment: '',
  count: '',
  observedAt: '2026-03-14',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  exifGpsMock.mockResolvedValue(undefined)
  vi.mocked(processImage).mockImplementation((file) => Promise.resolve(new File(['prepared'], file.name, { type: 'image/jpeg' })))
  useAuthMock.mockReturnValue({ user: { id: 'test-user-id' }, isAdmin: false })
  // デフォルトのモック実装
  uploadMock.mockResolvedValue({ data: { path: 'anon/test.jpg' }, error: null })
  removeMock.mockResolvedValue({ data: null, error: null })
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/anon/test.jpg' } })
  // insert(...).select('id').single() は成功時に作った行を返す（REQ-331: insertPost が id を返す）
  singleMock.mockResolvedValue({ data: { id: 'post-1' }, error: null })
  invokeMock.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

// ── handleFileChange ──────────────────────────────────────────────────────
describe('handleFileChange()', () => {
  it('許可形式（JPEG）は受け入れる', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('photo.jpg', 'image/jpeg')])) })
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.error).toBe('')
  })

  it('許可形式（PNG, WebP）は受け入れる', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => {
      await result.current.handleFileChange(makeFileEvent([
        makeFile('a.png', 'image/png'),
        makeFile('b.webp', 'image/webp'),
      ]))
    })
    expect(result.current.photos).toHaveLength(2)
  })

  it('不許可形式（GIF）はエラーをセットして弾く', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('anim.gif', 'image/gif')])) })
    expect(result.current.photos).toHaveLength(0)
    expect(result.current.error).toContain('対応していないファイル形式')
    expect(result.current.error).toContain('anim.gif')
  })

  it('原本25MB超過ファイルはエラーをセットして弾く', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('big.jpg', 'image/jpeg', MAX_INPUT_IMAGE_SIZE + 1)])) })
    expect(result.current.photos).toHaveLength(0)
    expect(result.current.error).toContain('25MBを超えています')
  })

  it('5MBを超える原本は選択時に縮小し、送信時に再変換しない', async () => {
    const { result } = renderHook(() => usePostForm())
    const original = makeFile('camera.jpg', 'image/jpeg', MAX_FILE_SIZE + 1)
    await act(async () => { await result.current.handleFileChange(makeFileEvent([original])) })
    expect(result.current.photos[0]!.size).toBeLessThan(MAX_FILE_SIZE)
    expect(result.current.photos[0]).not.toBe(original)
    await act(async () => { await result.current.submitPost(validPostData) })
    expect(processImage).toHaveBeenCalledTimes(1)
    expect(uploadMock.mock.calls[0]![1]).toBe(result.current.photos[0])
  })

  it('原本へのフォールバックは添付せず、処理後に選び直せる', async () => {
    vi.mocked(processImage).mockImplementationOnce(async (file) => file)
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('broken.heic', 'image/heic')])) })
    expect(result.current.photos).toHaveLength(0)
    expect(result.current.photoProcessing).toBeNull()
    expect(result.current.error).toContain('変換できませんでした')
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile()])) })
    expect(result.current.photos).toHaveLength(1)
    expect(result.current.error).toBe('')
  })

  it('準備中の連続選択、送信、下書き保存を同期ガードで防ぐ', async () => {
    let finish!: (file: File) => void
    vi.mocked(processImage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { result } = renderHook(() => usePostForm())
    let preparation!: void | Promise<void>
    await act(async () => {
      preparation = result.current.handleFileChange(makeFileEvent([makeFile()]))
      await result.current.handleFileChange(makeFileEvent([makeFile('second.jpg')]))
      expect(await result.current.submitPost(validPostData)).toBe(false)
      expect(await result.current.saveOffline(validPostData)).toBe(false)
    })
    expect(processImage).toHaveBeenCalledTimes(1)
    expect(insertMock).not.toHaveBeenCalled()
    expect(result.current.photoProcessing).toEqual({ current: 0, total: 1 })
    await act(async () => {
      finish(new File(['prepared'], 'photo.jpg', { type: 'image/jpeg' }))
      await preparation
    })
    expect(result.current.photoProcessing).toBeNull()
    expect(result.current.photos).toHaveLength(1)
  })

  it('閉じたフォームの準備完了でプレビューURLを作らない', async () => {
    let finish!: (file: File) => void
    vi.mocked(processImage).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { result, unmount } = renderHook(() => usePostForm())
    const preparation = result.current.handleFileChange(makeFileEvent([makeFile()]))
    const createsBefore = vi.mocked(URL.createObjectURL).mock.calls.length
    unmount()
    await act(async () => {
      finish(new File(['prepared'], 'photo.jpg', { type: 'image/jpeg' }))
      await preparation
    })
    expect(URL.createObjectURL).toHaveBeenCalledTimes(createsBefore)
  })

  it('後から別の写真を追加しても、添付済み原本の撮影位置を取得する', async () => {
    let finishGps!: (gps: { latitude: number; longitude: number }) => void
    exifGpsMock.mockImplementationOnce(() => new Promise((resolve) => { finishGps = resolve }))
    const { result } = renderHook(() => usePostForm())
    const first = makeFile('first.jpg')
    await act(async () => { await result.current.handleFileChange(makeFileEvent([first])) })
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('second.jpg')])) })
    await act(async () => { finishGps({ latitude: 39.7, longitude: 140.1 }) })
    expect(exifGpsMock).toHaveBeenCalledWith(first)
    expect(result.current.exifPosition).toEqual({ lat: 39.7, lng: 140.1 })
    expect(result.current.showExifBanner).toBe(true)
  })

  it('別の写真を削除しても、残っている写真の撮影位置を保つ', async () => {
    exifGpsMock.mockResolvedValueOnce({ latitude: 39.7, longitude: 140.1 })
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('gps.jpg')])) })
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('other.jpg')])) })
    act(() => result.current.removePhoto(1))
    expect(result.current.exifPosition).toEqual({ lat: 39.7, lng: 140.1 })
    expect(result.current.showExifBanner).toBe(true)
    act(() => result.current.removePhoto(0))
    expect(result.current.exifPosition).toBeNull()
    expect(result.current.showExifBanner).toBe(false)
  })

  it('MAX_PHOTOS(3枚)を超える選択は先頭3枚に切り捨てる', async () => {
    const { result } = renderHook(() => usePostForm())
    const files = [1, 2, 3, 4].map((i) => makeFile(`photo${i}.jpg`, 'image/jpeg'))
    await act(async () => { await result.current.handleFileChange(makeFileEvent(files)) })
    expect(result.current.photos).toHaveLength(3)
  })
})

// ── スパム制限 ────────────────────────────────────────────────────────────
describe('スパム制限（checkSpamLimit）', () => {
  it('初回投稿は許可される', async () => {
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(true)
    expect(result.current.error).toBe('')
  })

  it(`${SPAM_LIMIT_POSTS}件目は許可される`, async () => {
    const timestamps = Array.from({ length: SPAM_LIMIT_POSTS - 1 }, () => new Date().toISOString())
    localStorage.setItem(SPAM_KEY, JSON.stringify(timestamps))
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(true)
  })

  it(`${SPAM_LIMIT_POSTS + 1}件目はブロックされる`, async () => {
    const timestamps = Array.from({ length: SPAM_LIMIT_POSTS }, () => new Date().toISOString())
    localStorage.setItem(SPAM_KEY, JSON.stringify(timestamps))
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(false)
    expect(result.current.error).toContain('投稿上限')
  })

  it('SPAM_LIMIT_WINDOW_MS より古いタイムスタンプは無視される', async () => {
    const oldTs = new Date(Date.now() - SPAM_LIMIT_WINDOW_MS - 1000).toISOString()
    const timestamps = Array.from({ length: SPAM_LIMIT_POSTS }, () => oldTs)
    localStorage.setItem(SPAM_KEY, JSON.stringify(timestamps))
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(true)
  })

  it('isAdmin の場合はスパム制限をスキップする', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-id' }, isAdmin: true })
    const timestamps = Array.from({ length: SPAM_LIMIT_POSTS }, () => new Date().toISOString())
    localStorage.setItem(SPAM_KEY, JSON.stringify(timestamps))
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(true)
  })

  it('失敗を含む旧履歴や別の利用者の成功履歴では制限しない', async () => {
    const timestamps = Array.from({ length: SPAM_LIMIT_POSTS }, () => new Date().toISOString())
    localStorage.setItem(LEGACY_SPAM_KEY, JSON.stringify(timestamps))
    localStorage.setItem(`${LEGACY_SPAM_KEY}:success:v1:other-user`, JSON.stringify(timestamps))
    const { result } = renderHook(() => usePostForm())
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(true) })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })

  it('入力の不備では回数を消費せず、直した後に投稿できる', async () => {
    const { result } = renderHook(() => usePostForm())
    for (let i = 0; i < SPAM_LIMIT_POSTS; i++) {
      await act(async () => {
        expect(await result.current.submitPost({ ...validPostData, position: null })).toBe(false)
      })
    }
    expect(localStorage.getItem(SPAM_KEY)).toBeNull()
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(true) })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })

  it('DB の失敗では回数を消費せず、復旧後に投稿できる', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { result } = renderHook(() => usePostForm())
    for (let i = 0; i < SPAM_LIMIT_POSTS; i++) {
      await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(false) })
    }
    expect(localStorage.getItem(SPAM_KEY)).toBeNull()
    singleMock.mockResolvedValue({ data: { id: 'post-2' }, error: null })
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(true) })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })

  it('写真のアップロード失敗では回数を消費しない', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'upload failed' } })
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile()])) })
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(false) })
    expect(localStorage.getItem(SPAM_KEY)).toBeNull()
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('localStorage の読み取りや保存が拒否されても投稿を止めない', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage disabled', 'SecurityError')
    })
    const { result } = renderHook(() => usePostForm())
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(true) })
    expect(result.current.error).toBe('')
    expect(result.current.loading).toBe(false)
    get.mockRestore()
    set.mockRestore()
  })

  it('DB の上限エラーでは成功履歴を作らず、DB が再度許可したら投稿できる', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: '投稿上限に達しました' } })
    const { result } = renderHook(() => usePostForm())
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(false) })
    expect(localStorage.getItem(SPAM_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_SPAM_KEY)).toBeNull()
    expect(result.current.error).toContain('投稿上限')
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(true) })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })

  it('DB の上限エラーで、既存の実投稿の履歴を上書きしない', async () => {
    const previous = [new Date(Date.now() - 1000).toISOString()]
    localStorage.setItem(SPAM_KEY, JSON.stringify(previous))
    singleMock.mockResolvedValue({ data: null, error: { code: 'P0001', message: '投稿上限に達しました' } })
    const { result } = renderHook(() => usePostForm())
    await act(async () => { expect(await result.current.submitPost(validPostData)).toBe(false) })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toEqual(previous)
  })
})

// ── uploadPhotos ロールバック（REQ-008）──────────────────────────────────
describe('uploadPhotos() ロールバック（REQ-008）', () => {
  it('全枚数成功時はロールバック（remove）を呼ばない', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('photo.jpg', 'image/jpeg')])) })
    await act(async () => { await result.current.submitPost(validPostData) })
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('2枚目失敗時に成功済み1枚（パス）をロールバック削除する', async () => {
    let callCount = 0
    uploadMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: { path: 'anon/first.jpg' }, error: null })
      return Promise.resolve({ data: null, error: { message: 'upload failed' } })
    })

    const { result } = renderHook(() => usePostForm())
    await act(async () => {
      await result.current.handleFileChange(makeFileEvent([
        makeFile('p1.jpg', 'image/jpeg'),
        makeFile('p2.jpg', 'image/jpeg'),
      ]))
    })

    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })

    expect(success).toBe(false)
    expect(removeMock).toHaveBeenCalledWith(['anon/first.jpg'])
    expect(result.current.error).toContain('2枚中1枚成功')
  })

  it('1枚目から失敗時はロールバックを呼ばない（削除対象ゼロ）', async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: 'upload failed' } })

    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('p.jpg', 'image/jpeg')])) })
    await act(async () => { await result.current.submitPost(validPostData) })

    expect(removeMock).not.toHaveBeenCalled()
  })

  it('完了後に uploadProgress が null になる', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.handleFileChange(makeFileEvent([makeFile('photo.jpg', 'image/jpeg')])) })
    await act(async () => { await result.current.submitPost(validPostData) })
    expect(result.current.uploadProgress).toBeNull()
  })
})

// ── submitPost ───────────────────────────────────────────────────────────
describe('submitPost()', () => {
  it('DB insert エラー時に setError が呼ばれ false を返す', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(false)
    expect(result.current.error).not.toBe('')
  })

  it('成功時に true を返し error が空', async () => {
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData) })
    expect(success).toBe(true)
    expect(result.current.error).toBe('')
  })

  it('photos が空の場合は upload を呼ばない', async () => {
    const { result } = renderHook(() => usePostForm())
    // photos を追加しない状態で送信
    await act(async () => { await result.current.submitPost(validPostData) })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('送信中の連打では INSERT を重複しない', async () => {
    let finish!: (value: { data: { id: string }; error: null }) => void
    singleMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { result } = renderHook(() => usePostForm())
    let first!: Promise<boolean>
    await act(async () => {
      first = result.current.submitPost(validPostData)
      expect(await result.current.submitPost(validPostData)).toBe(false)
    })
    expect(insertMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ data: { id: 'post-1' }, error: null })
      expect(await first).toBe(true)
    })
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })
})

// ── REQ-330 / REQ-331: 作られた投稿の id を呼び出し側へ渡す ─────────────────────
describe('submitPost() の onCreated', () => {
  it('投稿ができたら、作られた投稿の id で呼ぶ', async () => {
    const onCreated = vi.fn()
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData, { onCreated }) })
    expect(success).toBe(true)
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(onCreated).toHaveBeenCalledWith('post-1')
  })

  it('insert に失敗したら呼ばない', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    const onCreated = vi.fn()
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData, { onCreated }) })
    expect(success).toBe(false)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('onCreated が投げても、投稿はできているので成功のまま返す', async () => {
    const onCreated = vi.fn(() => { throw new Error('link failed') })
    const { result } = renderHook(() => usePostForm())
    let success
    await act(async () => { success = await result.current.submitPost(validPostData, { onCreated }) })
    expect(success).toBe(true)
    expect(result.current.error).toBe('')
  })

  it('onCreated が非同期に失敗しても、成功を返して履歴を保存する', async () => {
    const onCreated = vi.fn(async () => { throw new Error('link failed') })
    const { result } = renderHook(() => usePostForm())
    await act(async () => {
      expect(await result.current.submitPost(validPostData, { onCreated })).toBe(true)
    })
    expect(result.current.error).toBe('')
    expect(JSON.parse(localStorage.getItem(SPAM_KEY)!)).toHaveLength(1)
  })
})

// ── REQ-329: 位置の公開／非公開 ─────────────────────────────────────────────
describe('位置の非公開（REQ-329）', () => {
  it('非公開を選ぶと location_disclosure=hidden を送る', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.submitPost({ ...validPostData, locationPrivate: true }) })
    const payload = (insertMock.mock.calls as unknown as [Record<string, unknown>][])[0]?.[0]
    expect(payload).toMatchObject({ location_disclosure: 'hidden' })
  })

  it('公開（既定）のときは location_disclosure を送らない（DB が種の既定を入れる）', async () => {
    const { result } = renderHook(() => usePostForm())
    await act(async () => { await result.current.submitPost(validPostData) })
    const payload = (insertMock.mock.calls as unknown as [Record<string, unknown>][])[0]?.[0]
    expect(payload).toBeDefined()
    expect(payload).not.toHaveProperty('location_disclosure')
  })
})
