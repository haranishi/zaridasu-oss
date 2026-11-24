import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import CSVExportSection from '../CSVExportSection'

// react-i18next: キー＋補間引数をそのまま返す軽量モック（PostCard.test と同方針）。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja' },
  }),
}))

// useProgress を差し替えてレベルを制御（実 useUnlocks はそのまま動かす＝判定ロジックを実際に検証）。
const { progressMock } = vi.hoisted(() => ({ progressMock: vi.fn() }))
vi.mock('@/hooks/useProfile', () => ({ useProgress: () => progressMock() }))

vi.mock('@/hooks/useCsvExport', () => ({
  useCsvExport: () => ({
    csvFilters: { from: '', to: '', species: '', municipality: '', myOnly: false },
    setCsvFilters: vi.fn(),
    exporting: false,
    exportCSV: vi.fn(),
  }),
}))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/context/ToastContext', () => ({ useToastContext: () => ({ error: vi.fn() }) }))

describe('CSVExportSection ゲート（REQ-249 csv_export = Lv4）', () => {
  it('Lv3 はロック：解放予告を出し、ダウンロードフォームは出さない', () => {
    progressMock.mockReturnValue({ progress: { level: 3, xp: 100 }, loading: false, error: null })
    render(<CSVExportSection dark={false} />)
    // ロック見出し＝機能名ラベル（i18n キーで確認）
    expect(screen.getByText('unlocks.features.csv_export')).toBeInTheDocument()
    // a11y: ロック状態がテキストで判別可能（「レベル4で解放」）
    expect(screen.getByText(/unlocks\.lockedAtLevel/)).toBeInTheDocument()
    // フォームのダウンロードボタンは出ない
    expect(screen.queryByText('CSVをダウンロード')).not.toBeInTheDocument()
  })

  it('Lv4 で解放：ダウンロードフォームが出る（しきい値到達で解放）', () => {
    progressMock.mockReturnValue({ progress: { level: 4, xp: 300 }, loading: false, error: null })
    render(<CSVExportSection dark={false} />)
    expect(screen.getByText('CSVをダウンロード')).toBeInTheDocument()
    expect(screen.queryByText('unlocks.features.csv_export')).not.toBeInTheDocument()
  })

  it('進捗未取得（匿名/読み込み中）はフェイルオープン：フォームが出る（剥奪しない）', () => {
    progressMock.mockReturnValue({ progress: null, loading: false, error: null })
    render(<CSVExportSection dark={false} />)
    expect(screen.getByText('CSVをダウンロード')).toBeInTheDocument()
  })

  it('CSV条件4項目にプログラム的ラベルがあり、重大な a11y 違反がない', async () => {
    progressMock.mockReturnValue({ progress: { level: 4, xp: 300 }, loading: false, error: null })
    const { container } = render(<CSVExportSection dark={false} />)

    expect(screen.getByLabelText('開始日')).toHaveAttribute('id', 'csv-export-from')
    expect(screen.getByLabelText('終了日')).toHaveAttribute('id', 'csv-export-to')
    expect(screen.getByRole('combobox', { name: '種類' })).toHaveAttribute('id', 'csv-export-species')
    expect(screen.getByRole('combobox', { name: '市区町村' })).toHaveAttribute('id', 'csv-export-municipality')
    expect(await axe(container)).toHaveNoViolations()
  })
})
