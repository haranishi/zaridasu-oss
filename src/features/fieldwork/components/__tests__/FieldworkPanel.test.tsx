import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { todayLocalISODate } from '@/lib/localDate'

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))

import FieldworkPanel, { type FieldworkPanelProps } from '../FieldworkPanel'
import { addDays } from '../../lib/planDate'
import type { FieldworkPlanApi, StopView } from '../../hooks/useFieldworkPlan'
import type { RareSightingsApi } from '../../hooks/useRareSightings'
import { renderJa } from './withI18n'

// REQ-330 §3 調査パネル（本物の i18next で描画）。進み具合・次の地点のカード・地点の一覧（↑↓）・
// 残りの地点をまとめて案内（安全の一言つき）・圏外の控え・今日の計画を作る・地図で選ぶの帯・希少種タブ・
// 送れない送信待ちの破棄。希少種の印は「希少種を自分の地図に表示」を入れたときだけ出す（採点 A1）。

const today = todayLocalISODate()
const planToday = { id: 'p1', title: '10/1 の調査', planned_on: today, status: 'active' as const, note: null, created_at: '', updated_at: '' }
const planOld = { id: 'p0', title: '9/20 の調査', planned_on: '2026-09-20', status: 'done' as const, note: null, created_at: '', updated_at: '' }

function stop(n: number, status: StopView['status']): StopView {
  return {
    id: `s${n}`,
    plan_id: 'p1',
    sort_order: n - 1,
    name: null,
    note: null,
    lat: 39.7 + n / 100,
    lng: 140.1,
    source: 'pin',
    source_id: null,
    status,
    visited_at: null,
    created_at: '',
    number: n,
    shownStatus: status,
    unsent: false,
    rare: n === 2,
    counts: { sighting: 0, absence: 0, rare: n === 2 ? 1 : 0 },
  }
}

function fakePlan(over: Partial<FieldworkPlanApi> = {}): FieldworkPlanApi {
  return {
    loadState: 'ready',
    plans: [planToday],
    currentPlan: planToday,
    stops: [stop(1, 'done'), stop(2, 'done'), stop(3, 'skipped'), stop(4, 'pending'), stop(5, 'pending')],
    cachedAt: null,
    canEdit: true,
    load: vi.fn(),
    ensureLoaded: vi.fn(),
    selectPlan: vi.fn(),
    createPlan: vi.fn().mockResolvedValue(planToday),
    updateCurrentPlan: vi.fn().mockResolvedValue(undefined),
    reusePlan: vi.fn(),
    addStops: vi.fn(),
    moveStop: vi.fn().mockResolvedValue(undefined),
    removeStop: vi.fn(),
    editStop: vi.fn(),
    recordStatus: vi.fn(),
    recordAbsenceAt: vi.fn(),
    linkPostAt: vi.fn(),
    markRare: vi.fn(),
    ...over,
  } as unknown as FieldworkPlanApi
}

const rare = { list: [], loadState: 'ready', load: vi.fn(), refresh: vi.fn(), create: vi.fn(), remove: vi.fn() } as unknown as RareSightingsApi

function renderPanel(over: Partial<FieldworkPanelProps> = {}) {
  const props: FieldworkPanelProps = {
    userId: 'u1',
    plan: fakePlan(),
    rare,
    queueItems: [],
    queueFlushing: false,
    onFlush: vi.fn(),
    onDiscardQueued: vi.fn(),
    online: true,
    tab: 'plan',
    onTabChange: vi.fn(),
    pickMode: false,
    onPickModeChange: vi.fn(),
    showRare: false,
    onShowRareChange: vi.fn(),
    nextStop: stop(4, 'pending'),
    onOpenStop: vi.fn(),
    onAddCurrentLocation: vi.fn().mockResolvedValue(undefined),
    onRecordRare: vi.fn(),
    newPlanTitle: () => '10/1 の調査',
    onCollapse: vi.fn(),
    onClose: vi.fn(),
    mapTop: 100,
    panelWidth: 400,
    ...over,
  }
  renderJa(<FieldworkPanel {...props} />)
  return props
}

beforeEach(() => vi.clearAllMocks())

describe('FieldworkPanel (REQ-330)', () => {
  it('題名・今日の計画・進み具合（済み 2・飛ばし 1 → 3 / 5 地点 終了）を出す', () => {
    renderPanel()
    expect(screen.getByRole('dialog', { name: '調査' })).toBeInTheDocument()
    expect(screen.getByText('今日の計画')).toBeInTheDocument()
    expect(screen.getByTestId('fieldwork-plan-title')).toHaveTextContent('10/1 の調査')
    // 数と単位の間は改行しない空白（NBSP）。toHaveTextContent は空白をまとめて比べる
    expect(screen.getByTestId('fieldwork-progress')).toHaveTextContent('3 / 5地点 終了（飛ばしを含む）')
    expect(screen.getByTestId('fieldwork-progress')).toHaveTextContent('済み 2・飛ばし 1・未調査 2')
    expect(screen.getByTestId('fieldwork-progress').textContent).toContain('3\u00a0/\u00a05地点')
  })

  it('次の地点のカード: 進み具合のすぐ下に「次：④ 地点 4」と主ボタン。押すと地点シート', () => {
    const props = renderPanel({ plan: fakePlan({ plans: [planToday, planOld] }) })
    const card = screen.getByTestId('fieldwork-next-card')
    expect(card).toHaveTextContent('次：')
    expect(card).toHaveTextContent('地点 4')
    // 進み具合 → 次の地点 → 地点の一覧 → これまでの計画 の順
    const progress = screen.getByTestId('fieldwork-progress')
    const list = screen.getByTestId('fieldwork-stop-list')
    const history = screen.getByText('これまでの計画')
    expect(progress.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(list.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'この地点を開く（案内・記録）' }))
    expect(props.onOpenStop).toHaveBeenCalledWith('s4')
    // リストの次の地点には「次」の札
    const rows = screen.getAllByTestId('fieldwork-stop-row')
    expect(within(rows[3]!).getByTestId('fieldwork-next-tag')).toHaveTextContent('次')
    expect(within(rows[4]!).queryByTestId('fieldwork-next-tag')).toBeNull()
  })

  it('次の地点が無ければ（全部終わった・今日の計画でない）カードを出さない', () => {
    renderPanel({ nextStop: null })
    expect(screen.queryByTestId('fieldwork-next-card')).toBeNull()
    expect(screen.queryByTestId('fieldwork-next-tag')).toBeNull()
  })

  it('地点の一覧: 状態を記号と文字で出し、↑↓ で並べ替える（先頭の↑は押せない）', () => {
    const props = renderPanel()
    const rows = screen.getAllByTestId('fieldwork-stop-row')
    expect(rows).toHaveLength(5)
    expect(within(rows[0]!).getByText('済み')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('飛ばし')).toBeInTheDocument()
    expect(within(rows[3]!).getByText('未調査')).toBeInTheDocument()
    expect(within(rows[0]!).getByRole('button', { name: /^地点\s1 を上へ$/ })).toBeDisabled()
    fireEvent.click(within(rows[0]!).getByRole('button', { name: /^地点\s1 を下へ$/ }))
    expect(props.plan.moveStop).toHaveBeenCalledWith('s1', 1)
    fireEvent.click(within(rows[3]!).getByText('地点 4'))
    expect(props.onOpenStop).toHaveBeenCalledWith('s4')
  })

  it('A1: 「希少種を自分の地図に表示」が切れている間は、一覧に「希少種あり」も番号の錠前も出さない', () => {
    renderPanel({ showRare: false })
    const rows = screen.getAllByTestId('fieldwork-stop-row')
    expect(screen.queryByText('希少種あり')).toBeNull()
    expect(screen.queryAllByTestId('fieldwork-rare-chip')).toHaveLength(0)
    expect(within(rows[1]!).queryByTestId('fieldwork-rare-lock')).toBeNull()
    expect(screen.queryAllByTestId('fieldwork-rare-lock')).toHaveLength(0)
  })

  it('A1: 入れているときだけ、希少種のある地点に「希少種あり」と番号の錠前を出す', () => {
    renderPanel({ showRare: true })
    const rows = screen.getAllByTestId('fieldwork-stop-row')
    expect(within(rows[1]!).getByTestId('fieldwork-rare-chip')).toHaveTextContent('希少種あり')
    expect(within(rows[1]!).getByTestId('fieldwork-rare-lock')).toBeInTheDocument()
    expect(within(rows[0]!).queryByTestId('fieldwork-rare-chip')).toBeNull()
  })

  it('案内: パネルに経路の 3 社ボタンは置かず、残りの地点をまとめて案内（開いた中に安全の一言、そのあとに URL）', () => {
    renderPanel()
    expect(screen.queryByTestId('route-links')).toBeNull()
    expect(screen.queryByTestId('fieldwork-bulk-link')).toBeNull()
    const bulk = screen.getByTestId('fieldwork-bulk-open')
    expect(bulk).toHaveTextContent('残りの地点をまとめて案内（2地点）')
    expect(bulk).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(bulk)
    const safety = screen.getByTestId('fieldwork-safety')
    expect(within(safety).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '水に入らない',
      '子どもだけで行かない',
      '立入禁止の場所・私有地に入らない',
    ])
    expect(screen.getByText('スマホでは一度に4地点まで（経由地3か所＋目的地）なので、4地点ずつに分けて開きます')).toBeInTheDocument()
    const links = screen.getAllByTestId('fieldwork-bulk-link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent('経路1：現在地 → 4 → 5')
    expect(links[0]!.getAttribute('href')).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
    expect(safety.compareDocumentPosition(links[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('圏外で控えを出しているときは「最後に同期した内容」と示し、編集を止める', () => {
    renderPanel({ plan: fakePlan({ cachedAt: '2026-10-01T01:02:00.000Z', canEdit: false }), online: false })
    expect(screen.getByTestId('fieldwork-offline-cache')).toHaveTextContent('圏外のため、最後に同期した内容')
    expect(screen.getByTestId('fieldwork-pick-on-map')).toBeDisabled()
    expect(screen.getAllByTestId('fieldwork-stop-up')[1]).toBeDisabled()
  })

  describe('計画が無いとき（A5: 前の晩に作る使い方）', () => {
    afterEach(() => vi.useRealTimers())

    it('「調査の計画はまだありません」と予定日の選択。16 時より前は今日を選んでおき、その日で作る', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 2, 10, 0))
      const plan = fakePlan({ plans: [], currentPlan: null, stops: [] })
      const title = vi.fn((d?: string) => `${d} の調査`)
      renderPanel({ plan, nextStop: null, newPlanTitle: title })
      expect(screen.getByText('調査の計画はまだありません')).toBeInTheDocument()
      // 説明の 2 つの文は別の行
      expect(screen.getByTestId('fieldwork-empty-lead').textContent).toContain('。\n前の晩')
      expect(screen.getByTestId('fieldwork-new-today')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('fieldwork-new-today')).toHaveTextContent('今日（10/2）')
      expect(screen.getByTestId('fieldwork-new-tomorrow')).toHaveTextContent('明日（10/3）')
      // 0 件なら「これまでの計画」は出さない
      expect(screen.queryByText(/これまでの計画/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /調査の計画を作る/ }))
      await waitFor(() => expect(plan.createPlan).toHaveBeenCalledWith({ title: '2026-10-02 の調査', plannedOn: '2026-10-02' }))
    })

    it('16 時以降は明日を最初から選んでおき、明日の計画として作る', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 9, 2, 19, 30))
      const plan = fakePlan({ plans: [], currentPlan: null, stops: [] })
      renderPanel({ plan, nextStop: null, newPlanTitle: (d?: string) => `${d} の調査` })
      expect(screen.getByTestId('fieldwork-new-tomorrow')).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(screen.getByTestId('fieldwork-create-today'))
      await waitFor(() => expect(plan.createPlan).toHaveBeenCalledWith({ title: '2026-10-03 の調査', plannedOn: '2026-10-03' }))
    })
  })

  it('予定日が明日の計画は小見出しを「明日の計画」にし、題名に日付があれば予定日を重ねて出さない', () => {
    const tomorrowPlan = { ...planToday, id: 'p2', title: '10/3 の調査', planned_on: addDays(today, 1) }
    const tomorrowTitle = `${Number(addDays(today, 1).slice(5, 7))}/${Number(addDays(today, 1).slice(8))} の調査`
    renderPanel({ plan: fakePlan({ plans: [{ ...tomorrowPlan, title: tomorrowTitle }], currentPlan: { ...tomorrowPlan, title: tomorrowTitle } }), nextStop: null })
    expect(screen.getByTestId('fieldwork-plan-day')).toHaveTextContent('明日の計画')
    expect(screen.queryByTestId('fieldwork-plan-date')).toBeNull()
  })

  it('題名に日付が無ければ予定日を出す。「これまでの計画」はパネルの一番下', () => {
    const named = { ...planToday, title: '春の定点' }
    renderPanel({ plan: fakePlan({ plans: [named, planOld], currentPlan: named }) })
    expect(screen.getByTestId('fieldwork-plan-day')).toHaveTextContent('今日の計画')
    expect(screen.getByTestId('fieldwork-plan-date')).toBeInTheDocument()
    const history = screen.getByText(/これまでの計画/)
    const finish = screen.getByTestId('fieldwork-finish')
    expect(finish.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('右上の「畳む」と「×」は、何が起きるか（計画は残る）が分かる名前を持つ', () => {
    renderPanel()
    expect(screen.getByTestId('fieldwork-collapse')).toHaveAccessibleName('畳む（地図を広く見る。計画は残ります）')
    expect(screen.getByTestId('fieldwork-close')).toHaveAccessibleName('閉じる（計画は残ります）')
  })

  it('A1: 確認のボタンは「左＝やめる・右＝実行」（計画を終える）', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('fieldwork-finish'))
    const buttons = within(screen.getByTestId('fieldwork-finish-confirm')).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['やめる', '終える'])
  })

  it('スマホで地図を選んでいる間は細い帯にし、「終わる」で戻る', () => {
    const props = renderPanel({ pickMode: true })
    expect(screen.getByText('地図を押して地点を足す（いま5地点）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '終わる' }))
    expect(props.onPickModeChange).toHaveBeenCalledWith(false)
  })

  it('送信待ちがあれば件数と「今すぐ送る」を出す', () => {
    const props = renderPanel({
      queueItems: [{ type: 'status', clientId: 'c', userId: 'u1', at: '', stopId: 's4', status: 'skipped' }],
    })
    expect(screen.getByTestId('fieldwork-queue')).toHaveTextContent('送信待ち 1件')
    fireEvent.click(screen.getByRole('button', { name: '今すぐ送る' }))
    expect(props.onFlush).toHaveBeenCalled()
  })

  it('送れない送信待ちは、何の記録か・理由・「破棄」を出す（上限の種類を分けて示す）', () => {
    const props = renderPanel({
      queueItems: [
        {
          type: 'absence',
          clientId: 'c-abs',
          userId: 'u1',
          at: '',
          stopId: 's4',
          species: ['american'],
          surveyDurationMinutes: null,
          lat: 39.74,
          lng: 140.1,
          accuracy: null,
          locationSource: 'manual',
          locationPrivate: false,
          observedOn: today,
          lastError: 'postLimit',
        },
      ],
    })
    const failed = screen.getByTestId('fieldwork-queue-failed')
    expect(failed).toHaveTextContent('いなかったの記録（地点 4）')
    expect(failed).toHaveTextContent('投稿の上限（24時間で5件）に達しました')
    fireEvent.click(within(failed).getByRole('button', { name: /^破棄：いなかったの記録（地点\s4）$/ }))
    // 確認を挟む（押し間違いで消さない）
    expect(props.onDiscardQueued).not.toHaveBeenCalled()
    expect(within(failed).getByRole('alert')).toHaveTextContent('この記録を破棄しますか？ 元に戻せません。')
    fireEvent.click(within(failed).getByRole('button', { name: '破棄する' }))
    expect(props.onDiscardQueued).toHaveBeenCalledWith('c-abs')
  })

  it('希少種タブ: 地図への表示は既定で切り、カード全体で切り替え、「希少種を記録する」を出す', () => {
    const props = renderPanel({ tab: 'rare' })
    const toggle = screen.getByRole('switch', { name: '希少種を自分の地図に表示' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveTextContent('ほかの人には見えません。画面写真から場所が漏れないよう、ふだんは隠しています。')
    fireEvent.click(toggle)
    expect(props.onShowRareChange).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: '希少種を記録する' }))
    expect(props.onRecordRare).toHaveBeenCalled()
    expect(screen.getByText('見つけた希少種は、ここに非公開で残せます。見られるのはあなたと運営だけです。')).toBeInTheDocument()
  })

  it('希少種タブ: 入れているときはチップを「表示中（自分だけ）」にする', () => {
    renderPanel({ tab: 'rare', showRare: true })
    const toggle = screen.getByRole('switch', { name: '希少種を自分の地図に表示' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveTextContent('表示中（自分だけ）')
  })
})
