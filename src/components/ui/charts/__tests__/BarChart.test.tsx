import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BarChart from '../BarChart'

describe('BarChart', () => {
  const data = [
    { count: 5, label: '月曜' },
    { count: 10, label: '火曜' },
    { count: 3, label: '水曜' },
  ]

  it('データがある場合にバーを描画する', () => {
    render(<BarChart data={data} dark={false} />)
    expect(screen.getByText('月曜')).toBeInTheDocument()
    expect(screen.getByText('火曜')).toBeInTheDocument()
    expect(screen.getByText('水曜')).toBeInTheDocument()
  })

  it('data が空の場合に null を返す', () => {
    const { container } = render(<BarChart data={[]} dark={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('data が未定義の場合に null を返す', () => {
    const { container } = render(<BarChart data={null} dark={false} />)
    expect(container.firstChild).toBeNull()
  })

  // REQ-323 FR-323-10 で縦軸（0 と最大値の目盛）が増えたため、`screen.getByText('10')` のような
  // 文書全体の検索では軸ラベルと棒の件数が両方ヒットする。「棒の上に出る件数」だけを見る。
  const barCounts = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('span.h-4')).map((el) => el.textContent)

  // REQ-268 FR-268-10: 件数は hover ツールチップではなく常時表示の数値（タッチ端末対応）。
  it('各データの件数が常時表示される', () => {
    const { container } = render(<BarChart data={data} dark={false} />)
    expect(barCounts(container)).toEqual(['5', '10', '3'])
  })

  // REQ-320 FR-320-08: 立ち上がり期は 12 本中 11 本が 0 で、棒の無い列に「0」だけが並び
  // グラフが壊れて見えていた。値のある月だけを読ませ、0 の数字は描かない。
  it('件数 0 の月はラベルの「0」を描かない（ラベル自体は残す）', () => {
    const { container } = render(
      <BarChart
        data={[{ count: 0, label: '1月' }, { count: 4, label: '2月' }, { count: 0, label: '3月' }]}
        dark={false}
      />,
    )
    expect(barCounts(container)).not.toContain('0')
    expect(barCounts(container)).toContain('4')
    // 月のラベル自体は残る（期間の連続性を壊さない）
    expect(screen.getByText('1月')).toBeInTheDocument()
    expect(screen.getByText('3月')).toBeInTheDocument()
  })

  // REQ-322 FR-322-07: 旧実装は「最新月だけブランド赤・他は --chart-neutral(灰)」だったため、
  // 最新月が 0 件の立ち上がり期は**唯一データのある棒が灰色**になり「読み込み失敗」に見えた。
  // 量を表す色は 1 系統に固定し、最新月の区別は色ではなくラベルの太さで示す。
  // REQ-323 FR-323-06: その 1 系統をブランド赤 → `--chart-quantity`（濃い無彩色）へ移した。
  // 「量（バー）」と「行動（CTA）」が同じ赤だと読み分けられない、という Round 4 の指摘への対応。
  it('FR-323-06: 棒は全月 --chart-quantity の1色で、最新月の区別は色ではなくラベルの太さ', () => {
    const { container } = render(
      <BarChart data={[{ count: 8, label: '3月' }, { count: 0, label: '8月' }]} dark={false} />,
    )
    const bars = container.querySelectorAll('div.rounded-t-sm')
    expect(bars.length).toBe(2)
    for (const bar of bars) {
      expect(bar.className).toContain('bg-(--chart-quantity)')
      // ブランド赤にも灰トークンにも戻していない（同じ「件数」を 2 色に割らない）
      expect(bar.className).not.toContain('bg-brand-600')
      expect(bar.className).not.toContain('chart-neutral')
    }
    // 最新月（配列末尾）のラベルだけ太字。色に頼らない強調（REQ-224）。
    expect(screen.getByText('8月').className).toContain('font-bold')
    expect(screen.getByText('3月').className).not.toContain('font-bold')
  })

  // REQ-323 FR-323-10: 旧実装は 0 の軸線も目盛も無く、棒が「どこから生えて、どれだけ大きいのか」を
  // 読む手がかりが 1 つも無かった。0 と最大値の 2 目盛だけを置く。
  it('FR-323-10: 0 のベースラインと最大値の目盛を描く', () => {
    const { container } = render(<BarChart data={data} dark={false} />)
    // 罫線は 2 本だけ（最大値のグリッド線と 0 のベースライン）
    expect(container.querySelectorAll('div.h-px').length).toBe(2)
    // 軸ラベル: 0 と最大値
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10').length).toBeGreaterThan(1) // 軸の目盛 + 火曜の件数
  })

  it('FR-323-10: maxLabel を渡すと最大値の目盛に単位付きで出る', () => {
    render(<BarChart data={data} dark={false} maxLabel="10件" />)
    expect(screen.getByText('10件')).toBeInTheDocument()
  })

  // REQ-323 FR-323-10: 12 ヶ月中 1 ヶ月しかデータが無いと「空の列 11 本と棒 1 本」になり、
  // 推移としては読めない。数値そのものを主役にした表示へ切り替える。
  it('FR-323-10: 値のある月が1つだけなら数値主役の表示に切り替わる', () => {
    render(
      <BarChart
        data={[{ count: 0, label: '1月' }, { count: 8, label: '3月' }, { count: 0, label: '8月' }]}
        dark={false}
        soleValueHeadline="3月に8件"
        soleValueNote="報告があったのはこの1ヶ月だけです。"
      />,
    )
    expect(screen.getByText('3月に8件')).toBeInTheDocument()
    expect(screen.getByText('報告があったのはこの1ヶ月だけです。')).toBeInTheDocument()
    // 空の列は描かない（月ラベルが並ばない）
    expect(screen.queryByText('1月')).not.toBeInTheDocument()
  })

  // 文言が渡らない呼び出し側（dashboard の KPI）では従来どおり棒グラフのままにする。
  it('FR-323-10: 文言が無ければ 1 ヶ月でも棒グラフのまま', () => {
    const { container } = render(
      <BarChart data={[{ count: 0, label: '1月' }, { count: 8, label: '3月' }]} dark={false} />,
    )
    expect(container.querySelectorAll('div.rounded-t-sm').length).toBe(2)
  })
})
