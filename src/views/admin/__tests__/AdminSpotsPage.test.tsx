import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ja from '@/locales/ja/translation.json'

function translationValue(key: string): unknown {
  let value: unknown = ja
  for (const part of key.split('.')) {
    if (value == null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const value = translationValue(key)
      if (typeof value !== 'string') return key
      return opts ? value.replace(/\{\{(\w+)\}\}/g, (_: string, n: string) => String(opts[n] ?? '')) : value
    },
  }),
}))
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))
vi.mock('@/lib/errorHandler', () => ({ logError: vi.fn() }))
const { selectForAdminMock } = vi.hoisted(() => ({ selectForAdminMock: vi.fn() }))
vi.mock('@/lib/data/private-spots', () => ({ selectPrivateSpotsForAdmin: selectForAdminMock }))

import AdminSpotsPage from '../AdminSpotsPage'

const row = {
  id: 's1',
  user_id: '12345678-aaaa-bbbb-cccc-1234567890ab',
  name: '=HYPERLINK("https://evil.example")',
  note: '10匹ほど',
  lat: 39.7011,
  lng: 140.1022,
  accuracy: 8,
  recorded_at: '2026-09-20T01:00:00Z',
  created_at: '2026-09-20T01:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  selectForAdminMock.mockResolvedValue({ data: [row], error: null })
})

describe('AdminSpotsPage (REQ-329)', () => {
  it('取り扱い注意・スポット・短縮した利用者 ID・経路リンクを出す（メールは出さない）', async () => {
    render(<AdminSpotsPage />)
    expect(await screen.findByText(row.name)).toBeInTheDocument()
    expect(screen.getByText('取り扱い注意（研究用・閲覧専用）')).toBeInTheDocument()
    expect(screen.getByText('12345678')).toBeInTheDocument()
    expect(screen.queryByText(row.user_id)).toBeNull()
    expect(screen.getByTestId('route-links').querySelectorAll('a')).toHaveLength(3)
  })

  it('CSV は数式インジェクションを無害化して書き出す', async () => {
    const createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = vi.fn()
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<AdminSpotsPage />)
    await screen.findByText(row.name)
    fireEvent.click(screen.getByRole('button', { name: 'CSV出力' }))
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    const blob = (createObjectURL.mock.calls as unknown as [Blob][])[0]![0]
    const text = await blob.text()
    expect(text).toContain(`"'=HYPERLINK(""https://evil.example"")"`)
    expect(clickSpy).toHaveBeenCalled()
    clickSpy.mockRestore()
  })

  it('読み込みに失敗したら再試行を出す', async () => {
    selectForAdminMock.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    render(<AdminSpotsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('読み込みに失敗しました')
  })
})
