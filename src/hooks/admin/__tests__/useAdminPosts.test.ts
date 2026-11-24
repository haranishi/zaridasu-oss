import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, render, screen, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import userEvent from '@testing-library/user-event'
import { useAdminPosts } from '../useAdminPosts'
import type { AdminPost } from '@/types/post'
import ReviewCardAI from '@/components/features/admin/ReviewCardAI'
import AIBadge from '@/components/features/admin/AIBadge'

// REQ-247 (M1): useAdminPosts のデータアクセスの回帰テスト。useEditPost.test の chainable
// supabase モックパターンを踏襲し、from(...).select/eq/update/delete/... を builder で連結する。
const {
  fromMock, selectMock, eqMock, updateMock, deleteMock, orderMock, rangeMock, ilikeMock,
  abortSignalMock, rpcMock, storageRemoveMock, invokeMock,
  writeAuditLogMock, toastSuccessMock, toastErrorMock, logErrorMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(), selectMock: vi.fn(), eqMock: vi.fn(), updateMock: vi.fn(), deleteMock: vi.fn(),
  orderMock: vi.fn(), rangeMock: vi.fn(), ilikeMock: vi.fn(), abortSignalMock: vi.fn(),
  rpcMock: vi.fn(), storageRemoveMock: vi.fn(), invokeMock: vi.fn(),
  writeAuditLogMock: vi.fn(), toastSuccessMock: vi.fn(), toastErrorMock: vi.fn(), logErrorMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
    i18n: { language: 'ja' },
  }),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin-1' } }) }))
vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}))
vi.mock('@/lib/auditLog', () => ({ writeAuditLog: writeAuditLogMock }))
vi.mock('@/lib/errorHandler', () => ({ logError: logErrorMock }))
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock,
    storage: { from: () => ({ remove: storageRemoveMock }) },
    functions: { invoke: invokeMock },
  },
}))

// await されると currentResult を返す thenable builder。連結メソッドはすべて builder を返す。
let currentResult: { data?: unknown; count?: number | null; error?: unknown }
const builder = {
  select: selectMock, eq: eqMock, update: updateMock, delete: deleteMock,
  order: orderMock, range: rangeMock, ilike: ilikeMock, abortSignal: abortSignalMock,
  then: (resolve: (v: unknown) => void) => resolve(currentResult),
}

const post = (over: Partial<AdminPost> = {}): AdminPost =>
  ({ id: 'p1', species: 'american', info_type: 'sighting', municipality: 'X', photos: null, is_official: false, ...over } as unknown as AdminPost)

beforeEach(() => {
  vi.clearAllMocks()
  currentResult = { data: [], count: 0, error: null }
  for (const m of [selectMock, eqMock, updateMock, deleteMock, orderMock, rangeMock, ilikeMock, abortSignalMock, fromMock]) {
    m.mockReturnValue(builder)
  }
  rpcMock.mockResolvedValue({ data: [], error: null })
  storageRemoveMock.mockResolvedValue({ data: null, error: null })
  invokeMock.mockResolvedValue({ data: null, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

async function mountLoaded() {
  const hook = renderHook(() => useAdminPosts())
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('useAdminPosts', () => {
  it('取得境界で不正AI JSONを除外し、審査カードと詳細バッジを描画できる', async () => {
    const user = userEvent.setup()
    currentResult = { data: [{
      ...post({ photos: ['https://example.com/photo.jpg'] }),
      ai_result: {
        detected_species: 'american', confidence: 0.9, species_match: true, is_appropriate: true,
        notes: { reason: 'nested' }, image_quality: { quality: 'good' },
        audio_analysis: { detected_species: 'bullfrog', confidence: 0.8, notes: [] },
        combined_decision: { reason: { nested: true } },
        per_photo: [null, { confidence: 'bad', species_match: {}, error: {} }, { confidence: 0.9, species_match: true }],
      },
    }], count: 1, error: null }
    const { result } = await mountLoaded()
    const loaded = result.current.posts[0]!
    expect(loaded.ai_result?.notes).toBeUndefined()
    expect(loaded.ai_result?.confidence).toBe(0.9)
    expect(loaded.ai_result?.combined_decision?.reason).toBe('needs_manual_review')
    expect(loaded.ai_result?.per_photo).toHaveLength(2)

    render(createElement('div', null,
      createElement(ReviewCardAI, { post: loaded }),
      createElement(AIBadge, { post: loaded }),
    ))
    expect(screen.getByText('統合判定: needs_manual_review')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /90% 一致/ }))
    expect(screen.getByText('要手動確認')).toBeInTheDocument()
    expect(screen.getAllByText('アメリカザリガニ')).toHaveLength(2)
  })

  it('マウント時に一覧と審査待ち件数を取得する', async () => {
    currentResult = { data: [post()], count: 1, error: null }
    const { result } = await mountLoaded()
    expect(fromMock).toHaveBeenCalledWith('posts')
    expect(result.current.posts).toHaveLength(1)
    expect(result.current.total).toBe(1)
    expect(result.current.pendingCount).toBe(1)
  })

  it('approve は status を approved に更新し監査ログ + トーストを出す', async () => {
    const { result } = await mountLoaded()
    // 更新が1行に当たった状態。0行は RLS 拒否 or 対象なしとして失敗扱いになる（下のテスト）。
    currentResult = { data: [{ id: 'p1' }], count: 1, error: null }
    await act(async () => { await result.current.approve(post()) })
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved', reviewed_by: 'admin-1' }))
    expect(eqMock).toHaveBeenCalledWith('id', 'p1')
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'approve_post', adminId: 'admin-1', targetId: 'p1' }),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith('承認しました')
  })

  it('approve は 0 行更新（RLS 拒否）を失敗として扱い監査ログを書かない', async () => {
    // RLS 拒否は error にならず 0 行で返る。行数を見ないと「承認しました」と出てしまう。
    const { result } = await mountLoaded()
    currentResult = { data: [], count: 0, error: null }
    await act(async () => { await result.current.approve(post()) })
    expect(result.current.opError).toBe('承認に失敗しました')
    expect(writeAuditLogMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('approve は更新失敗時に opError を立て監査ログを書かない', async () => {
    const { result } = await mountLoaded()
    currentResult = { data: null, count: null, error: { message: 'fail' } }
    await act(async () => { await result.current.approve(post()) })
    expect(result.current.opError).toBe('承認に失敗しました')
    expect(writeAuditLogMock).not.toHaveBeenCalled()
  })

  it('reject は却下理由付きで更新し監査ログを残す', async () => {
    const { result } = await mountLoaded()
    currentResult = { data: [{ id: 'p1' }], count: 1, error: null }
    await act(async () => { await result.current.reject(post(), { reason: 'spam', message: null }) })
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected', rejection_reason: 'spam' }),
    )
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject_post', details: expect.objectContaining({ rejection_reason: 'spam' }) }),
    )
  })

  it('deletePost は写真を Storage から掃除して削除し true を返す', async () => {
    const { result } = await mountLoaded()
    currentResult = { data: [{ id: 'p1' }], count: null, error: null }
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.deletePost(post({ photos: ['https://x/post-photos/admin-1/a.jpg'] }))
    })
    expect(storageRemoveMock).toHaveBeenCalledWith(['admin-1/a.jpg', 'admin-1/a.ai.jpg'])
    expect(deleteMock).toHaveBeenCalled()
    expect(writeAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete_post', targetId: 'p1' }))
    expect(ok).toBe(true)
  })

  it('deletePost は 0 行削除（RLS 拒否）で false を返し opError を立てる', async () => {
    const { result } = await mountLoaded()
    currentResult = { data: [], count: null, error: null }
    let ok: boolean | undefined
    await act(async () => { ok = await result.current.deletePost(post({ photos: null })) })
    expect(ok).toBe(false)
    expect(result.current.opError).toBe('admin.posts.error.deleteFailed')
  })

  it('bulkApprove は選択中の投稿をすべて承認する', async () => {
    currentResult = { data: [post({ id: 'p1' }), post({ id: 'p2', species: 'bullfrog' })], count: 2, error: null }
    const { result } = await mountLoaded()
    act(() => { result.current.toggleSelect('p1'); result.current.toggleSelect('p2') })
    await act(async () => { await result.current.bulkApprove() })
    expect(updateMock).toHaveBeenCalledTimes(2)
    expect(writeAuditLogMock).toHaveBeenCalledTimes(2)
    expect(toastSuccessMock).toHaveBeenCalledWith(
      'admin.posts.bulkResult.success:{"succeeded":2}',
    )
    expect(result.current.selectedIds).toEqual([])
  })

  it('bulkApprove は全件失敗時に成功トーストを出さず失敗件数を提示し選択を残す', async () => {
    currentResult = { data: [post({ id: 'p1' }), post({ id: 'p2', species: 'bullfrog' })], count: 2, error: null }
    const { result } = await mountLoaded()
    act(() => { result.current.toggleSelect('p1'); result.current.toggleSelect('p2') })

    currentResult = { data: null, count: null, error: { message: 'RLS denied' } }
    await act(async () => { await result.current.bulkApprove() })

    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      'admin.posts.bulkResult.withFailures:{"succeeded":0,"failed":2}',
    )
    expect(result.current.selectedIds).toEqual(['p1', 'p2'])
  })

  it('bulkDelete は DB DELETE が 0 行なら Storage remove を呼ばず選択を残す', async () => {
    currentResult = {
      data: [post({ id: 'p1', photos: ['https://x/post-photos/admin-1/a.jpg'] })],
      count: 1,
      error: null,
    }
    const { result } = await mountLoaded()
    act(() => { result.current.toggleSelect('p1') })

    currentResult = { data: [], count: null, error: null }
    await act(async () => { await result.current.bulkDelete() })

    expect(deleteMock).toHaveBeenCalled()
    expect(selectMock).toHaveBeenCalledWith('id')
    expect(storageRemoveMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(
      'admin.posts.bulkResult.withFailures:{"succeeded":0,"failed":1}',
    )
    expect(result.current.selectedIds).toEqual(['p1'])
  })

  it('一覧取得失敗時は fetchError と件数不明を立て空状態と区別する', async () => {
    currentResult = { data: null, count: null, error: { message: 'network unavailable' } }
    const { result } = await mountLoaded()

    expect(result.current.fetchError).toBe(true)
    expect(result.current.pendingCount).toBeNull()
    expect(result.current.posts).toEqual([])
  })

  it('タブ切替後に後着した先行クエリの結果を一覧へ反映しない', async () => {
    let resolveFirst: ((value: { data: AdminPost[]; count: number; error: null }) => void) | undefined
    const delayedQuery = {
      abortSignal: vi.fn(() => ({
        then: (resolve: (value: { data: AdminPost[]; count: number; error: null }) => void) => {
          resolveFirst = resolve
        },
      })),
    }
    rangeMock.mockReturnValueOnce(delayedQuery)
    currentResult = { data: [], count: 0, error: null }
    const hook = renderHook(() => useAdminPosts())
    await waitFor(() => expect(rangeMock).toHaveBeenCalledTimes(1))

    currentResult = {
      data: [post({ id: 'approved-post', status: 'approved' })],
      count: 1,
      error: null,
    }
    act(() => { hook.result.current.changeTab('approved') })
    await waitFor(() => expect(hook.result.current.posts[0]?.id).toBe('approved-post'))

    await act(async () => {
      resolveFirst?.({
        data: [post({ id: 'stale-pending', status: 'pending' })],
        count: 1,
        error: null,
      })
      await Promise.resolve()
    })

    expect(hook.result.current.statusTab).toBe('approved')
    expect(hook.result.current.posts.map(p => p.id)).toEqual(['approved-post'])
  })

  it('setDisclosure は RPC を正しい引数で呼ぶ', async () => {
    const { result } = await mountLoaded()
    await act(async () => { await result.current.setDisclosure(post(), 'hidden') })
    expect(rpcMock).toHaveBeenCalledWith('set_post_location_disclosure', { p_post_id: 'p1', p_level: 'hidden' })
    expect(toastSuccessMock).toHaveBeenCalled()
  })

  it('changeFilter はページを 0 に戻し選択を解除する', async () => {
    const { result } = await mountLoaded()
    act(() => { result.current.toggleSelect('p1'); result.current.setPage(2) })
    act(() => { result.current.changeFilter('species', 'american') })
    expect(result.current.filters.species).toBe('american')
    expect(result.current.page).toBe(0)
    expect(result.current.selectedIds).toEqual([])
  })
})
