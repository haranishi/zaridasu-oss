import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import ActivityGrass from '../ActivityGrass'
import { useMyActivity } from '@/hooks/posts/useMyActivity'
import type { ActivityRow } from '@/lib/activityCalendar'

// t は、キーに引数（JSON）を付けて返す。画面の文言ではなく、何をどんな値で出そうとしたかを確かめるため。Trans も同じ形で返す。
vi.mock('react-i18next', async () => {
  const { createElement } = await import('react')
  const render = (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key)
  return {
    useTranslation: () => ({ t: render, i18n: { language: 'ja' } }),
    Trans: ({ i18nKey, values }: { i18nKey: string; values?: Record<string, unknown> }) => createElement('span', null, render(i18nKey, values)),
  }
})
vi.mock('@/hooks/posts/useMyActivity', () => ({ useMyActivity: vi.fn() }))

const mockedHook = vi.mocked(useMyActivity)
const retry = vi.fn()
const TODAY = '2026-10-19'

const row = (created_at: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
  observed_at: null, created_at, info_type: 'sighting', status: 'approved', ...over,
})
const ROWS = [
  row('2026-10-10T03:00:00Z'),
  row('2026-10-10T05:00:00Z', { info_type: 'absence', status: 'pending' }),
  row('2026-10-03T03:00:00Z', { info_type: 'absence' }),
]

const show = (state: Partial<ReturnType<typeof useMyActivity>>) => {
  mockedHook.mockReturnValue({ rows: ROWS, loading: false, error: false, retry, ...state })
  return render(<ActivityGrass userId="user-1" today={TODAY} />)
}
const cell = (container: HTMLElement, date: string) => container.querySelector<HTMLElement>(`[role="gridcell"][data-date="${date}"]`)!

// jsdom には scrollIntoView が無い。一覧から選んだとき、詳細を見える位置へ動かすことを確かめるため、差し替える
const scrollIntoView = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = scrollIntoView
})

describe('ActivityGrass', () => {
  it('取得中は場所だけ出し、カレンダーは出さない', () => {
    const { container } = show({ rows: null, loading: true })
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('取得に失敗したら、空とは別の案内と再試行を出す', async () => {
    show({ rows: null, error: true })
    expect(screen.getByRole('alert')).toHaveTextContent('activityGrass.loadError')
    expect(screen.queryByRole('grid')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('記録が0件なら、空のカレンダーと、最初の記録を投稿する案内・ボタンを出す（合計・注記・操作の案内・詳細・一覧は出さない）', () => {
    const { container } = show({ rows: [] })
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(365)
    expect(screen.getByText('activityGrass.empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'activityGrass.emptyAction' })).toHaveAttribute('href', '/map?post=1')
    expect(screen.queryByText(/activityGrass\.summary/)).toBeNull() // 0日・0件の合計は、責めるように見えるので出さない
    expect(screen.queryByText('activityGrass.note')).toBeNull()
    expect(screen.queryByText('activityGrass.hintSelect')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'activityGrass.listOpen' })).toBeNull()
  })

  it('合計の日数・件数を出す。審査待ちも数える', () => {
    show({})
    expect(screen.getByText('activityGrass.summary{"days":2,"records":3}')).toBeInTheDocument()
    expect(screen.getByText('activityGrass.note')).toBeInTheDocument()
  })

  it('凡例は、濃さごとの件数（0・1・2・3〜4・5以上）を数字で書く。「少ない／多い」は使わない', () => {
    const { container } = show({})
    const legend = container.querySelector('[class*="legend"]') as HTMLElement
    expect(legend).toHaveTextContent('activityGrass.legendTitle')
    expect(within(legend).getAllByText(/^[012]$/).map(el => el.textContent)).toEqual(['0', '1', '2'])
    expect(legend).toHaveTextContent('activityGrass.legendRange{"from":3,"to":4}')
    expect(legend).toHaveTextContent('activityGrass.legendOrMore{"n":5}')
    expect([...legend.querySelectorAll('[data-level]')].map(el => el.getAttribute('data-level'))).toEqual(['0', '1', '2', '3', '4'])
    expect(legend).not.toHaveTextContent('legendLess')
  })

  it('横に動かせること・マスを押すと内訳が出ることを、表の下で案内する', () => {
    show({})
    expect(screen.getByText('activityGrass.hintScroll')).toBeInTheDocument()
    expect(screen.getByText('activityGrass.hintSelect', { exact: false })).toBeInTheDocument()
  })

  it('件数が多い日ほど濃い。0件は段階0。5件以上は同じ濃さ', () => {
    const many = Array.from({ length: 7 }, () => row('2026-10-12T03:00:00Z'))
    const { container } = show({ rows: [...ROWS, ...many] })
    expect(cell(container, '2026-10-10')).toHaveAttribute('data-level', '2') // 2件
    expect(cell(container, '2026-10-03')).toHaveAttribute('data-level', '1') // 1件
    expect(cell(container, '2026-10-12')).toHaveAttribute('data-level', '4') // 7件でも4
    expect(cell(container, '2026-10-11')).toHaveAttribute('data-level', '0')
  })

  it('各日は、日付と件数を読み上げる名前を持つ', () => {
    const { container } = show({})
    expect(cell(container, '2026-10-10').getAttribute('aria-label')).toContain('activityGrass.cellLabel')
    expect(cell(container, '2026-10-10').getAttribute('aria-label')).toContain('"count":2')
    expect(cell(container, '2026-10-11').getAttribute('aria-label')).toContain('activityGrass.cellLabelNone')
  })

  it('はじめは、いちばん新しい活動日を選び、その日の件数と内訳・審査待ちを出す', () => {
    const { container } = show({})
    expect(cell(container, '2026-10-10')).toHaveAttribute('aria-selected', 'true')
    const detail = screen.getByRole('status')
    expect(detail).toHaveTextContent('activityGrass.detailDay')
    expect(detail).toHaveTextContent('"count":2')
    expect(detail).toHaveTextContent('activityGrass.detailBreakdown')
    expect(detail).toHaveTextContent('activityGrass.detailPending{"count":1}')
  })

  it('Tab で止まるのは1つだけ（選んだ日）', () => {
    const { container } = show({})
    const stops = [...container.querySelectorAll('[role="gridcell"]')].filter(el => el.getAttribute('tabindex') === '0')
    expect(stops).toHaveLength(1)
    expect(stops[0]).toHaveAttribute('data-date', '2026-10-10')
  })

  it('矢印キーで日を移る（上下は前後の日、左右は前後の週）。Enter で選ぶ', async () => {
    const { container } = show({})
    cell(container, '2026-10-10').focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(cell(container, '2026-10-03'))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(cell(container, '2026-10-04'))
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    expect(document.activeElement).toBe(cell(container, '2026-10-02'))
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cell(container, '2026-10-09'))
    await userEvent.keyboard('{Enter}')
    expect(cell(container, '2026-10-09')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('activityGrass.detailNone')
  })

  it('Home・End は、その週の月曜・日曜へ。範囲の外（今日より先）には出ない', async () => {
    const { container } = show({})
    cell(container, '2026-10-10').focus() // 土
    await userEvent.keyboard('{Home}')
    expect(document.activeElement).toBe(cell(container, '2026-10-05'))
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(cell(container, '2026-10-11'))
    cell(container, TODAY).focus() // 今日は月曜。End は、今日より先へは出ず今日のまま
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(cell(container, TODAY))
  })

  it('一覧を開くと、活動した日が新しい順に並び、押すとその日を選ぶ。選んだら詳細を見える位置へ動かす', async () => {
    const { container } = show({})
    const toggle = screen.getByRole('button', { name: 'activityGrass.listOpen' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'activityGrass.listClose' })).toHaveAttribute('aria-expanded', 'true')
    const items = within(screen.getByRole('list')).getAllByRole('button')
    expect(items).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /activityGrass\.listMore/ })).toBeNull() // 7日以内なら「さらに表示」は出ない
    await userEvent.click(items[1]!) // 10/3
    expect(cell(container, '2026-10-03')).toHaveAttribute('aria-selected', 'true')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' })
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('status')) // 動かすのは詳細の枠
  })

  it('一覧は新しい7日から。「さらに表示」で14日ずつ足し、閉じて開き直すと7日に戻る（内側のスクロールは使わない）', async () => {
    const days = Array.from({ length: 30 }, (_, i) => row(`2026-09-${String(i + 1).padStart(2, '0')}T03:00:00Z`))
    show({ rows: days })
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listOpen' }))
    const list = () => within(screen.getByRole('list')).getAllByRole('button')
    expect(list()).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listMore{"count":23}' }))
    expect(list()).toHaveLength(21)
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listMore{"count":9}' }))
    expect(list()).toHaveLength(30)
    expect(screen.queryByRole('button', { name: /activityGrass\.listMore/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listClose' }))
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listOpen' }))
    expect(list()).toHaveLength(7)
  })

  it('去年の日付には年も付ける（一覧・詳細・読み上げ）。今年の日付には付けない', async () => {
    const { container } = show({ rows: [row('2025-11-03T03:00:00Z'), row('2026-10-10T03:00:00Z')] })
    expect(cell(container, '2025-11-03').getAttribute('aria-label')).toContain('2025年')
    expect(cell(container, '2026-10-10').getAttribute('aria-label')).not.toContain('2026年')
    await userEvent.click(screen.getByRole('button', { name: 'activityGrass.listOpen' }))
    const items = within(screen.getByRole('list')).getAllByRole('button')
    expect(items[0]).not.toHaveTextContent('年')
    expect(items[1]).toHaveTextContent('2025年11月3日')
    await userEvent.click(items[1]!)
    expect(screen.getByRole('status')).toHaveTextContent('2025年11月3日')
  })

  it('はじめは「最後に記録した日」、本人が選んだあとは「選んだ日」の見出しが付く（選んでいないのに「選んだ」とは出さない）', async () => {
    const { container } = show({})
    const detail = screen.getByRole('status')
    expect(detail).toHaveTextContent('activityGrass.detailLabelLatest')
    expect(detail).not.toHaveTextContent(/activityGrass\.detailLabel(?!Latest)/)
    await userEvent.click(cell(container, '2026-10-03'))
    expect(detail).toHaveTextContent(/activityGrass\.detailLabel(?!Latest)/)
    expect(detail).not.toHaveTextContent('detailLabelLatest')
  })

  it('凡例は表のすぐ下、操作の案内はその下（詳細の枠の直前）に並ぶ', () => {
    const { container } = show({})
    const grid = container.querySelector('[role="grid"]') as HTMLElement
    const legend = container.querySelector('[class*="legend"]') as HTMLElement
    const hint = screen.getByText('activityGrass.hintSelect', { exact: false })
    const detail = screen.getByRole('status')
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(grid, legend)).toBe(true)
    expect(follows(legend, hint)).toBe(true)
    expect(follows(hint, detail)).toBe(true)
  })

  it('アクセシビリティ違反がない', async () => {
    const { container } = show({})
    expect(await axe(container)).toHaveNoViolations()
  })
})
