/**
 * REQ-bug: 「🗑 削除」ボタンが押しても消えないバグの再現/回帰テスト。
 *
 * 期待動作:
 *   1. ReviewCard 上の「🗑 削除」を押すと DeletePostDialog がレンダーされる
 *   2. DeletePostDialog の「削除する」ボタンを押すと supabase.from('posts').delete().eq('id', X) が発火する
 *   3. writeAuditLog が delete_post で呼ばれる
 *   4. 削除完了後にダイアログが閉じ、fetchPosts が再走する
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminPostsPage from '../AdminPostsPage'

// ── Supabase モック ──
// REQ-bug-delete: handleDelete は .delete().eq().select('id') と繋ぐようになったため、
// eq() の戻り値で select() も生やしてあげる
const deleteSelect = vi.fn().mockResolvedValue({ data: [{ id: 'p-del-1' }], error: null })
const deleteEq = vi.fn(() => ({ select: deleteSelect }))
const deleteFn = vi.fn(() => ({ eq: deleteEq }))
const storageRemove = vi.fn().mockResolvedValue({ data: [], error: null })

const rangeResult = {
  data: [
    {
      id: 'p-del-1',
      species: 'american',
      info_type: 'sighting',
      municipality: '秋田市',
      lat: 39.7,
      lng: 140.1,
      comment: 'delete me',
      photos: ['https://example.test/storage/v1/object/public/post-photos/u1/photo1.jpg'],
      status: 'pending',
      is_anonymous: false,
      is_official: false,
      is_flagged: false,
      user_id: 'u1',
      created_at: '2026-04-20T00:00:00Z',
      ai_result: null,
    },
  ],
  count: 1,
  error: null,
}
const abortSignalFn = vi.fn().mockResolvedValue(rangeResult)
const rangeFn = vi.fn(() => ({ abortSignal: abortSignalFn }))
const orderFn = vi.fn(() => ({ range: rangeFn }))
const eqFn = vi.fn(() => ({ eq: eqFn, order: orderFn }))
const selectFn = vi.fn(() => ({
  eq: eqFn,
  order: orderFn,
  range: rangeFn,
  ilike: vi.fn(() => ({ eq: eqFn, order: orderFn, range: rangeFn })),
}))

const fromFn = vi.fn((_table: string) => ({
  select: selectFn,
  delete: deleteFn,
  update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => fromFn(table),
    storage: {
      from: () => ({ remove: storageRemove }),
    },
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-id', email: 'admin@example.com' }, isAdmin: true }),
}))

vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ success: vi.fn(), error: vi.fn() }),
}))

const writeAuditLogMock = vi.fn()
vi.mock('@/lib/auditLog', () => ({
  writeAuditLog: (...args: unknown[]) => writeAuditLogMock(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <span data-testid="next-image" data-alt={alt} />,
}))

// 実 ReviewCard を使うと react-leaflet 等が混ざるため、削除フローに必要なものだけ持つスタブを利用
vi.mock('@/components/features/admin/ReviewCard', () => ({
  default: ({ post, onDelete }: { post: { id: string }; onDelete: () => void }) => (
    <article data-testid={`review-${post.id}`}>
      <button data-testid={`delete-${post.id}`} onClick={onDelete}>delete-trigger</button>
    </article>
  ),
}))

vi.mock('@/components/features/admin/BulkActionBar', () => ({
  default: () => null,
}))
vi.mock('@/components/features/admin/AIBadge', () => ({ default: () => null }))
vi.mock('@/components/ui/PhotoViewer', () => ({ default: () => null }))
vi.mock('@/components/ui/Skeleton', () => ({ SkeletonCard: () => <div /> }))
vi.mock('@/components/modals/MapModal', () => ({ default: () => null }))
vi.mock('@/components/modals/RejectDialog', () => ({ default: () => null }))

// DeletePostDialog は実装をそのまま使い、「削除する」ボタンを描画させる
// （これにより onConfirm の配線まで検証できる）

beforeEach(() => {
  deleteEq.mockClear()
  deleteFn.mockClear()
  deleteSelect.mockClear()
  deleteSelect.mockResolvedValue({ data: [{ id: 'p-del-1' }], error: null })
  storageRemove.mockClear()
  storageRemove.mockResolvedValue({ data: [], error: null })
  writeAuditLogMock.mockClear()
  rangeFn.mockClear()
})

describe('AdminPostsPage delete flow', () => {
  it('🗑 削除 → 確認モーダルの「削除する」で posts を DELETE する', async () => {
    const user = userEvent.setup()
    render(<AdminPostsPage />)

    // 投稿がレンダーされるまで待つ
    await waitFor(() => expect(screen.getByTestId('review-p-del-1')).toBeInTheDocument())

    // 1) 「🗑 削除」をクリック → 確認モーダル表示
    await user.click(screen.getByTestId('delete-p-del-1'))

    // 2) 確認モーダルの「削除する」ボタン (i18n key: admin.posts.deleteDialog.confirm)
    const confirmBtn = await screen.findByRole('button', {
      name: 'admin.posts.deleteDialog.confirm',
    })
    await user.click(confirmBtn)

    // 3) supabase.from('posts').delete().eq('id', 'p-del-1').select('id') が呼ばれること
    await waitFor(() => {
      expect(deleteFn).toHaveBeenCalled()
      expect(deleteEq).toHaveBeenCalledWith('id', 'p-del-1')
      expect(deleteSelect).toHaveBeenCalledWith('id')
    })

    // 4) writeAuditLog が delete_post で呼ばれること
    await waitFor(() => expect(writeAuditLogMock).toHaveBeenCalled())
    const [args] = writeAuditLogMock.mock.calls[0] as [Record<string, unknown>]
    expect(args).toMatchObject({
      adminId: 'admin-id',
      action: 'delete_post',
      targetType: 'post',
      targetId: 'p-del-1',
    })

    // 5) storage 側の photo も削除リクエストされること
    expect(storageRemove).toHaveBeenCalledWith(['u1/photo1.jpg', 'u1/photo1.ai.jpg'])
  })

  it('RLS で 0 行削除（サイレント失敗）の場合はエラーメッセージを表示する', async () => {
    const user = userEvent.setup()
    // 「成功扱いだが 0 行削除」を模擬：error なし、 data は空配列
    deleteSelect.mockResolvedValueOnce({ data: [], error: null })

    render(<AdminPostsPage />)

    await waitFor(() => expect(screen.getByTestId('review-p-del-1')).toBeInTheDocument())
    await user.click(screen.getByTestId('delete-p-del-1'))
    const confirmBtn = await screen.findByRole('button', {
      name: 'admin.posts.deleteDialog.confirm',
    })
    await user.click(confirmBtn)

    // DELETE は走るが writeAuditLog は呼ばれない（削除されていないので）
    await waitFor(() => expect(deleteSelect).toHaveBeenCalled())
    expect(writeAuditLogMock).not.toHaveBeenCalled()

    // i18n キーがそのまま表示される（モック上）= エラーバナーが出る
    await waitFor(() =>
      expect(screen.getByText('admin.posts.error.deleteFailed')).toBeInTheDocument()
    )
  })
})
