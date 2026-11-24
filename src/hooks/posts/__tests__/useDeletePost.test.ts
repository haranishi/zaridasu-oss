import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDeletePost } from '../useDeletePost'
import type { Post } from '@/types'

// ── モック ───────────────────────────────────────────────────────────────
const mockRemove = vi.fn().mockResolvedValue({ data: null, error: null })
const mockDelete = vi.fn()
// 削除は `.delete().eq().select('id')` まで繋いで**影響行数**を見る（RLS 拒否は error に
// ならず 0 行で返るため）。モックも実際のクエリ形に合わせる。
const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'post-2' }], error: null })
const mockEq = vi.fn(() => ({ select: mockSelect }))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ remove: mockRemove })) },
    from: vi.fn(() => ({ delete: mockDelete })),
  },
}))

vi.mock('@/lib/errorHandler', () => ({
  logError: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockDelete.mockReturnValue({ eq: mockEq })
  mockEq.mockReturnValue({ select: mockSelect })
  mockSelect.mockResolvedValue({ data: [{ id: 'post-2' }], error: null })
  mockRemove.mockResolvedValue({ data: null, error: null })
})

// ── テスト ───────────────────────────────────────────────────────────────
describe('useDeletePost', () => {
  const photoUrl = 'https://example.com/storage/v1/object/public/post-photos/anon/abc.jpg'
  // useDeletePost が読む id/photos だけを持つ最小フィクスチャ。
  const postWithPhotos = { id: 'post-1', photos: [photoUrl] } as Post
  const postWithoutPhotos = { id: 'post-2', photos: null } as Post

  it('写真がある場合、写真とAI用の縮小版を storage.remove() で消す', async () => {
    const { result } = renderHook(() => useDeletePost(postWithPhotos, { onDeleted: vi.fn() }))
    await act(async () => { await result.current.handleDelete() })
    // AI 判定用の縮小版（<id>.ai.jpg）は本体と別のオブジェクト。本体だけ消すと公開 URL が生き残る
    expect(mockRemove).toHaveBeenCalledWith(['anon/abc.jpg', 'anon/abc.ai.jpg'])
  })

  it('音声がある場合、post-audio からも消す', async () => {
    const withAudio = {
      id: 'post-3',
      photos: null,
      audio_url: 'https://example.com/storage/v1/object/public/post-audio/anon/voice.webm',
    } as Post
    const { result } = renderHook(() => useDeletePost(withAudio, { onDeleted: vi.fn() }))
    await act(async () => { await result.current.handleDelete() })
    expect(mockRemove).toHaveBeenCalledWith(['anon/voice.webm'])
    const { supabase } = await import('@/lib/supabase/client')
    expect(supabase.storage.from).toHaveBeenCalledWith('post-audio')
  })

  it('音声の削除に失敗したときも、DB 削除を実行しない', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'audio storage failed' } })
    const withAudio = {
      id: 'post-3',
      photos: null,
      audio_url: 'https://example.com/storage/v1/object/public/post-audio/anon/voice.webm',
    } as Post
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useDeletePost(withAudio, { onDeleted }))
    await act(async () => { await result.current.handleDelete() })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('写真がない場合、storage.remove() を呼ばない', async () => {
    const { result } = renderHook(() => useDeletePost(postWithoutPhotos, { onDeleted: vi.fn() }))
    await act(async () => { await result.current.handleDelete() })
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('DB 削除成功後に onDeleted コールバックを呼ぶ', async () => {
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useDeletePost(postWithoutPhotos, { onDeleted }))
    await act(async () => { await result.current.handleDelete() })
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('0 行削除（RLS 拒否）を失敗として扱い onDeleted を呼ばない', async () => {
    // RLS 拒否は error にならず 0 行で返る。行数を見ないと「削除しました」になってしまう。
    mockSelect.mockResolvedValue({ data: [], error: null })
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useDeletePost(postWithoutPhotos, { onDeleted }))
    await act(async () => { await result.current.handleDelete() })
    expect(result.current.error).toContain('削除に失敗しました')
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('DB 削除失敗時にエラーをセットし onDeleted を呼ばない', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'delete failed' } })
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useDeletePost(postWithoutPhotos, { onDeleted }))
    await act(async () => { await result.current.handleDelete() })
    expect(result.current.error).toContain('削除に失敗しました')
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('Storage 削除失敗時は DB 削除を実行しない', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'storage failed' } })
    const onDeleted = vi.fn()
    const { result } = renderHook(() => useDeletePost(postWithPhotos, { onDeleted }))

    await act(async () => { await result.current.handleDelete() })

    expect(mockDelete).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(result.current.error).toContain('写真や音声の削除に失敗')
  })

  it('deleting フラグが処理中に true、完了後に false になる', async () => {
    // 保留を作るのは `.select('id')` の返り。`.eq()` はビルダーを返すだけになった。
    type DeleteResult = { data: { id: string }[]; error: null }
    let resolveFn: (value: DeleteResult) => void = () => {}
    mockSelect.mockReturnValue(new Promise<DeleteResult>((res) => { resolveFn = res }))

    const { result } = renderHook(() => useDeletePost(postWithoutPhotos, {}))
    act(() => { result.current.handleDelete() })
    expect(result.current.deleting).toBe(true)

    await act(async () => { resolveFn({ data: [{ id: 'post-2' }], error: null }) })
    expect(result.current.deleting).toBe(false)
  })

  it('post が null の場合は何もしない', async () => {
    const { result } = renderHook(() => useDeletePost(null, {}))
    await act(async () => { await result.current.handleDelete() })
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
