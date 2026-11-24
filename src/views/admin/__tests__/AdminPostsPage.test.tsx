import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminPostsPage from '../AdminPostsPage'

// ── Supabase モック（クエリチェーン）──
// 承認・却下は `.update().eq().select('id')` まで繋いで**影響行数**を見る（RLS 拒否は
// error にならず 0 行で返るため）。モックも実際のクエリ形に合わせ、1 行当たった状態を返す。
const updateSelect = vi.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null })
const updateEq = vi.fn(() => ({ select: updateSelect }))
const updateFn = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }))
const rangeResult = {
  data: [
    {
      id: 'p1',
      species: 'american',
      info_type: 'sighting',
      municipality: '秋田市',
      lat: 39.7,
      lng: 140.1,
      comment: 'test',
      photos: [],
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
const fromFn = vi.fn((_table: string) => ({ select: selectFn, update: updateFn }))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => fromFn(table),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-id', email: 'admin@example.com' }, isAdmin: true }),
}))

const toastSuccess = vi.fn()
vi.mock('@/context/ToastContext', () => ({
  useToastContext: () => ({ success: toastSuccess, error: vi.fn() }),
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

vi.mock('@/components/features/admin/ReviewCard', () => ({
  default: ({ post, onApprove }: { post: { id: string }; onApprove: () => void }) => (
    <article data-testid={`review-${post.id}`}>
      <button data-testid={`approve-${post.id}`} onClick={onApprove}>approve</button>
    </article>
  ),
}))

vi.mock('@/components/features/admin/BulkActionBar', () => ({
  default: () => null,
}))

vi.mock('@/components/features/admin/AIBadge', () => ({ default: () => null }))

vi.mock('@/components/ui/PhotoViewer', () => ({ default: () => null }))

vi.mock('@/components/ui/Skeleton', () => ({ SkeletonCard: () => <div data-testid="skeleton" /> }))

vi.mock('@/components/modals/MapModal', () => ({ default: () => null }))

vi.mock('@/components/modals/DeletePostDialog', () => ({ default: () => null }))

vi.mock('@/components/modals/RejectDialog', () => ({ default: () => null }))

beforeEach(() => {
  updateEq.mockClear()
  updateFn.mockClear()
  toastSuccess.mockClear()
  writeAuditLogMock.mockClear()
})

describe('AdminPostsPage', () => {
  it('承認ボタンで posts を approved に更新する', async () => {
    const user = userEvent.setup()
    render(<AdminPostsPage />)
    await waitFor(() => expect(screen.getByTestId('review-p1')).toBeInTheDocument())

    await user.click(screen.getByTestId('approve-p1'))

    await waitFor(() => expect(updateFn).toHaveBeenCalled())
    const firstCall = updateFn.mock.calls[0]
    const updatePayload = firstCall?.[0] as { status?: string; reviewed_by?: string } | undefined
    expect(updatePayload?.status).toBe('approved')
    expect(updatePayload?.reviewed_by).toBe('admin-id')
    expect(updateEq).toHaveBeenCalledWith('id', 'p1')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('承認時に writeAuditLog が approve_post / target と details を含んで呼ばれる', async () => {
    const user = userEvent.setup()
    render(<AdminPostsPage />)
    await waitFor(() => expect(screen.getByTestId('review-p1')).toBeInTheDocument())

    await user.click(screen.getByTestId('approve-p1'))

    await waitFor(() => expect(writeAuditLogMock).toHaveBeenCalled())
    const [args] = writeAuditLogMock.mock.calls[0] as [Record<string, unknown>]
    expect(args).toMatchObject({
      adminId: 'admin-id',
      action: 'approve_post',
      targetType: 'post',
      targetId: 'p1',
    })
    expect(args.details).toMatchObject({
      species: 'american',
      info_type: 'sighting',
      municipality: '秋田市',
    })
  })
})
