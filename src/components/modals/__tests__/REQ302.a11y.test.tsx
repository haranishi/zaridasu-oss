import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import DeleteDialog from '../DeleteDialog'
import RejectDialog from '../RejectDialog'
import ReportModal from '../ReportModal'
import type { AdminPost } from '@/types/post'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const english: Record<string, string> = {
        'delete.cancel': 'Cancel',
        'delete.confirm': 'Delete',
        'delete.deleting': 'Deleting...',
      }
      return english[key] ?? key
    },
  }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  },
}))

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))

const adminPost = {
  id: 'post-1',
  species: 'american',
  info_type: 'sighting',
  municipality: '秋田市',
} as AdminPost

describe('REQ-302 modal a11y', () => {
  it('ReportModal は理由をグループ化し、任意コメントを必須扱いしない', async () => {
    const { container } = render(<ReportModal postId="post-1" onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'report.title' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('radiogroup', { name: 'report.reasonLabel' })).toHaveAttribute('aria-required', 'true')
    expect(screen.getByRole('textbox', { name: /report\.commentLabel/ })).not.toHaveAttribute('aria-required')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('RejectDialog は却下理由を legend でグループ化し、重大な違反がない', async () => {
    const { container } = render(
      <RejectDialog post={adminPost} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )

    expect(screen.getByRole('group', { name: /却下理由/ })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('DeleteDialog は英語の可視ラベルをそのままアクセシブルネームに使う', async () => {
    const { container } = render(
      <DeleteDialog
        post={adminPost}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        deleting={false}
        dark={false}
        error={null}
      />
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveTextContent('Cancel')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveTextContent('Delete')
    expect(screen.queryByLabelText('キャンセル')).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
