import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import TrendsPage from '../TrendsPage'

// ── モック ───────────────────────────────────────────────────────────────
const mockStats = {
  totalAll: 150,
  totalThisMonth: 12,
  municipalityCount: 8,
  monthly: [
    { label: '2025-04', count: 10 },
    { label: '2025-05', count: 15 },
  ],
  speciesCounts: { american: 100, bullfrog: 50 },
  infoTypeCounts: { sighting: 80, capture: 40, trace: 20, damage: 10 },
  municipalityRank: [
    { name: '秋田市', count: 30 },
    { name: '横手市', count: 20 },
  ],
}

vi.mock('@/hooks/useStats', () => ({
  useStats: vi.fn(() => ({ stats: mockStats, loading: false })),
}))

// REQ-320 FR-320-08: 見出しに実件数を補間しているかを検証したいので、t を spy にする
// （返り値はこれまでどおりキーのまま＝既存アサーションに影響しない）。
const { tSpy } = vi.hoisted(() => ({ tSpy: vi.fn((key: string) => key) }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: tSpy,
    i18n: {
      language: 'ja',
      changeLanguage: vi.fn(),
    },
  }),
}))

vi.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ dark: false }),
}))

vi.mock('@/components/ui/PageSEO', () => ({
  default: () => null,
}))

vi.mock('@/components/layout/Footer', () => ({
  default: () => <footer data-testid="footer">Footer</footer>,
}))

vi.mock('@/components/ui/charts/BarChart', () => ({
  default: ({ data }: { data?: unknown[] }) => <div data-testid="bar-chart">{data?.length ?? 0} months</div>,
}))

vi.mock('@/components/ui/charts/DonutChart', () => ({
  default: ({ segments }: { segments?: unknown[] }) => <div data-testid="donut-chart">{segments?.length ?? 0} segments</div>,
}))

function renderTrendsPage() {
  return render(<TrendsPage />)
}

// ── テスト ───────────────────────────────────────────────────────────────
describe('TrendsPage', () => {
  // REQ-322 FR-322-06: KPI の主役は「累計」と「報告市区町村」の 2 つ。
  // 「今月の投稿」は月初に必ず 0 になり、0 が画面 2 番目に大きい数字として居座っていたため
  // 副次行へ降格した（数字自体は捨てず、件数も集計も変えない）。
  it('KPI の主役は累計と報告市区町村の2つ', () => {
    renderTrendsPage()
    expect(screen.getByText('150')).toBeInTheDocument()   // 累計投稿数
    expect(screen.getByText('8')).toBeInTheDocument()     // 報告市区町村
    // 今月ぶんは大きい数字としては出さない（補間つきの副次行として渡す）
    expect(tSpy).toHaveBeenCalledWith('trends.kpi.thisMonthInline', { count: 12 })
    expect(screen.queryByText('12')).not.toBeInTheDocument()
  })

  it('BarChart に月別データが渡される', () => {
    renderTrendsPage()
    expect(screen.getByTestId('bar-chart')).toHaveTextContent('2 months')
  })

  it('DonutChart に種類別データが渡される', () => {
    renderTrendsPage()
    expect(screen.getByTestId('donut-chart')).toHaveTextContent('2 segments')
  })

  it('市区町村ランキングが表示される', () => {
    renderTrendsPage()
    expect(screen.getByText('秋田市')).toBeInTheDocument()
    expect(screen.getByText('横手市')).toBeInTheDocument()
  })

  // REQ-320 FR-320-08: 旧見出しは「（上位10件）」の固定文で、実データが 1 件でもそう名乗っていた。
  it('市区町村ランキングの見出しに実件数を渡す（「上位10件」の固定文にしない）', () => {
    tSpy.mockClear()
    renderTrendsPage()
    expect(tSpy).toHaveBeenCalledWith('trends.municipalityRank', { count: 2 })
  })

  // REQ-321 FR-321-01: KPI「累計投稿数」と市区町村内訳の合計が食い違う理由を注記で示す。
  // 集計は変えない（AC-06）ので、注記に渡す数字が **内訳の実際の合計** であることを固定する。
  it('内訳の合計が累計に届かないときだけ、差の理由を注記する', async () => {
    const mod = await import('@/hooks/useStats')
    const useStats = mod.useStats as ReturnType<typeof vi.fn>

    // 秋田市30 + 横手市20 = 50 < 累計150 → 注記を出す
    useStats.mockReturnValue({ stats: mockStats, loading: false })
    tSpy.mockClear()
    const gap = render(<TrendsPage />)
    expect(tSpy).toHaveBeenCalledWith('trends.municipalityCoverage', { listed: 50, total: 150 })
    gap.unmount()

    // 内訳の合計＝累計なら説明する差が無いので注記も出さない（余計な但し書きを常設しない）
    useStats.mockReturnValue({ stats: { ...mockStats, totalAll: 50 }, loading: false })
    tSpy.mockClear()
    render(<TrendsPage />)
    expect(tSpy).not.toHaveBeenCalledWith('trends.municipalityCoverage', expect.anything())
  })

  // REQ-320 FR-320-08: 報告が少ないうちは、空白の多いグラフに前向きな注記と投稿導線を添える。
  it('報告が少ないときだけ「まだ少ない」注記と投稿導線を出す', async () => {
    const mod = await import('@/hooks/useStats')
    const useStats = mod.useStats as ReturnType<typeof vi.fn>

    useStats.mockReturnValue({ stats: { ...mockStats, totalAll: 8 }, loading: false })
    const sparse = render(<TrendsPage />)
    expect(screen.getByText('trends.earlyStageNote')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'empty.postCta' })).toHaveAttribute('href', '/map?post=1')
    sparse.unmount()

    // 件数が増えたら注記は自然に消える（データを偽らないための出し分け）
    useStats.mockReturnValue({ stats: mockStats, loading: false })
    render(<TrendsPage />)
    expect(screen.queryByText('trends.earlyStageNote')).not.toBeInTheDocument()
  })

  it('ローディング時にスケルトンが表示される', async () => {
    const mod = await import('@/hooks/useStats')
    ;(mod.useStats as ReturnType<typeof vi.fn>).mockReturnValue({ stats: {}, loading: true })

    renderTrendsPage()
    // REQ-222: スピナー(Loader2)→スケルトン化。skeleton(.animate-pulse) もしくは
    // LoadingState の role="status" のいずれかでローディングが提示される。
    const loading = document.querySelector('.animate-pulse, [role="status"]')
    expect(loading).toBeTruthy()
  })

  it('Footer が表示される', () => {
    renderTrendsPage()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })
})
