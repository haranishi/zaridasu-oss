import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import FilterBar from '../FilterBar'

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const filters = {
  period: '0',
  municipality: '',
  species: '',
  infoType: '',
  search: '',
  sort: 'newest',
}

describe('FilterBar a11y', () => {
  it('ドロワーに名前・ラベル・初期フォーカスがあり、開いた直後の Escape で閉じる', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FilterBar
        filters={filters}
        onChange={vi.fn()}
        boundsFilterEnabled={false}
      />
    )

    await user.click(screen.getByRole('button', { name: 'filter.filter' }))

    const dialog = screen.getByRole('dialog', { name: 'filter.filterSettings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('combobox', { name: 'filter.period' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'filter.municipality' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'filter.species' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'filter.infoType' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'filter.sort' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'common.close' }).some((button) => button === document.activeElement)).toBe(true)
    expect(await axe(container)).toHaveNoViolations()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
