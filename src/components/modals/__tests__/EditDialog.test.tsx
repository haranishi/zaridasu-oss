import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import EditDialog from '../EditDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}))

const basePost = {
  id: 'post-1',
  species: 'american',
  info_type: 'sighting',
  municipality: '秋田市',
  comment: 'old comment',
  count: 2,
  observed_at: '2026-03-10T00:00:00.000Z',
  photos: ['https://example.com/storage/v1/object/public/post-photos/anon/a.jpg'],
}

describe('EditDialog', () => {
  it('保存時に編集データを onSave へ渡す', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <EditDialog
        post={basePost}
        onSave={onSave}
        onCancel={vi.fn()}
        saving={false}
        dark={false}
        error=""
      />
    )

    const commentField = screen.getByDisplayValue('old comment')
    await user.clear(commentField)
    await user.type(commentField, 'new comment')

    const saveBtn = screen.getByRole('button', { name: 'edit.save' })
    await user.click(saveBtn)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      comment: 'new comment',
      species: 'american',
      info_type: 'sighting',
    })
  })

  it('既存写真を削除すると deletedPhotoUrls に含まれる', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()

    render(
      <EditDialog
        post={basePost}
        onSave={onSave}
        onCancel={vi.fn()}
        saving={false}
        dark={false}
        error=""
      />
    )

    const deleteButtons = screen.getAllByRole('button')
    // 先頭のXボタンが既存写真削除
    await user.click(deleteButtons[0]!)
    await user.click(screen.getByRole('button', { name: 'edit.save' }))

    expect(onSave.mock.calls[0]![0].deletedPhotoUrls).toContain(
      'https://example.com/storage/v1/object/public/post-photos/anon/a.jpg'
    )
  })

  it('キャンセルボタンで onCancel を呼ぶ', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    render(
      <EditDialog
        post={basePost}
        onSave={vi.fn()}
        onCancel={onCancel}
        saving={false}
        dark={false}
        error=""
      />
    )

    // REQ-188: 直書き aria-label="キャンセル" を撤去し、可視テキスト(=t('edit.cancel'))が
    // アクセシブルネームになった。テストの i18n モックは key を返すため name='edit.cancel'。
    await user.click(screen.getByRole('button', { name: 'edit.cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('全入力と写真追加ボタンに名前があり、重大な a11y 違反がない', async () => {
    const { container } = render(
      <EditDialog
        post={{ ...basePost, photos: [] }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
        dark={false}
        error=""
      />
    )

    expect(screen.getByRole('combobox', { name: 'edit.species' })).toHaveAttribute('id', 'edit-dialog-species')
    expect(screen.getByRole('combobox', { name: 'edit.infoType' })).toHaveAttribute('id', 'edit-dialog-info-type')
    expect(screen.getByRole('combobox', { name: 'edit.municipality' })).toHaveAttribute('id', 'edit-dialog-municipality')
    expect(screen.getByRole('spinbutton', { name: 'edit.countedit.countOptional' })).toBeInTheDocument()
    expect(screen.getByLabelText('edit.observedAtedit.observedAtOptional')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'edit.comment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'postForm.addPhoto' })).toBeInTheDocument()

    expect(await axe(container)).toHaveNoViolations()
  })
})
