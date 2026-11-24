import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditPost } from '../useEditPost'

const {
  validatePostMock,
  deletePhotosMock,
  uploadPhotoMock,
  updateMock,
  updateSelectMock,
  eqMock,
  fromMock,
  invokeMock,
} = vi.hoisted(() => ({
  validatePostMock: vi.fn(),
  deletePhotosMock: vi.fn(),
  uploadPhotoMock: vi.fn(),
  updateMock: vi.fn(),
  updateSelectMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock('@/lib/postValidation', () => ({
  validatePost: validatePostMock,
}))

// REQ-243 FR-243-04: useEditPost は useAuth の user.id で追加写真の保存先プレフィックスを決める。
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner-1' } }),
}))

vi.mock('@/lib/storage', () => ({
  deletePhotos: deletePhotosMock,
  uploadPhoto: uploadPhotoMock,
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: fromMock,
    functions: {
      invoke: invokeMock,
    },
  },
}))

describe('useEditPost', () => {
  const post = {
    id: 'post-1',
    species: 'american',
    photos: ['https://example.com/a.jpg'],
  }

  const params = {
    species: 'american',
    info_type: 'sighting',
    municipality: '秋田市',
    comment: 'comment',
    count: 1,
    observed_at: '2026-03-10T00:00:00.000Z',
    deletedPhotoUrls: [] as string[],
    newPhotoFiles: [] as File[],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    validatePostMock.mockReturnValue({ valid: true })
    deletePhotosMock.mockResolvedValue(undefined)
    uploadPhotoMock.mockResolvedValue('https://example.com/new.jpg')
    // 編集は `.update().eq().select('id')` まで繋いで**影響行数**を見る（RLS 拒否は error に
    // ならず 0 行で返るため）。モックも実際のクエリ形に合わせる。
    eqMock.mockReturnValue({ select: updateSelectMock })
    updateSelectMock.mockResolvedValue({ data: [{ id: 'post-1' }], error: null })
    updateMock.mockReturnValue({ eq: eqMock })
    fromMock.mockReturnValue({ update: updateMock })
    invokeMock.mockResolvedValue({ data: null, error: null })
  })

  it('バリデーション失敗時は保存せずエラーを返す', async () => {
    validatePostMock.mockReturnValue({ valid: false, error: '入力エラー' })

    const { result } = renderHook(() => useEditPost(post))

    await act(async () => {
      await result.current.saveEdit(params)
    })

    expect(result.current.error).toBe('入力エラー')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('保存成功時に更新し onSuccess を呼ぶ', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useEditPost(post, { onSuccess }))

    await act(async () => {
      await result.current.saveEdit({ ...params, comment: 'updated' })
    })

    expect(deletePhotosMock).toHaveBeenCalledWith([])
    expect(fromMock).toHaveBeenCalledWith('posts')
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(eqMock).toHaveBeenCalledWith('id', 'post-1')
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.saving).toBe(false)
  })

  it('種類変更時は ai_result をリセットし再分析を起動する', async () => {
    const { result } = renderHook(() => useEditPost(post))

    await act(async () => {
      await result.current.saveEdit({
        ...params,
        species: 'bullfrog',
      })
    })

    const fields = updateMock.mock.calls[0]?.[0]
    expect(fields.ai_result).toBeNull()
    expect(invokeMock).toHaveBeenCalledWith('analyze-image', expect.any(Object))
  })

  it('追加した写真が 1 枚でも上げられなかったら、何も消さず・更新せず中断する（位置情報つきの原本を送らない）', async () => {
    const good = new File(['ok'], 'good.jpg', { type: 'image/jpeg' })
    const bad = new File(['gps'], 'bad.jpg', { type: 'image/jpeg' })
    // 1 枚目は上がり、2 枚目は変換に失敗して uploadPhoto が null を返す
    uploadPhotoMock.mockResolvedValueOnce('https://example.com/new1.jpg').mockResolvedValueOnce(null)

    const { result } = renderHook(() => useEditPost(post))
    await act(async () => {
      await result.current.saveEdit({
        ...params,
        newPhotoFiles: [good, bad],
        deletedPhotoUrls: ['https://example.com/old.jpg'],
      })
    })

    expect(result.current.error).toContain('写真を保存できませんでした')
    expect(updateMock).not.toHaveBeenCalled()
    // 古い写真は消さない。上がった分は、どの投稿にも結び付かないまま残さない
    expect(deletePhotosMock).not.toHaveBeenCalledWith(['https://example.com/old.jpg'])
    expect(deletePhotosMock).toHaveBeenCalledWith(['https://example.com/new1.jpg'])
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('0 行更新（RLS 拒否）を失敗として扱う', async () => {
    // RLS 拒否は error にならず 0 行で返る。行数を見ないと保存できていないのに成功に見える。
    updateSelectMock.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useEditPost(post))
    let returned: unknown
    await act(async () => { returned = await result.current.saveEdit({ ...params, comment: 'updated' }) })
    expect(returned).toBeFalsy()
  })

  it('更新失敗時はエラーを設定する', async () => {
    updateSelectMock.mockResolvedValue({ data: null, error: new Error('db failed') })

    const { result } = renderHook(() => useEditPost(post))

    await act(async () => {
      await result.current.saveEdit(params)
    })

    expect(result.current.error).toContain('db failed')
    expect(result.current.saving).toBe(false)
  })
})
