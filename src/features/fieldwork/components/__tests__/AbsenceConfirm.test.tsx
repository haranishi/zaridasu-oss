import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { todayLocalISODate } from '@/lib/localDate'

vi.mock('next/image', () => ({ default: () => null }))

import AbsenceConfirm from '../AbsenceConfirm'
import type { StopView } from '../../hooks/useFieldworkPlan'
import type { RecordPosition } from '../../lib/positionRule'
import { renderJa } from './withI18n'

// REQ-330 §3「いなかった」の確認（本物の i18next）。既定はアメリカザリガニだけ・分数は任意（1〜480）・
// 位置が公開か非公開かを確定前に出す。

const position: RecordPosition = { source: 'map', lat: 39.72, lng: 140.1, accuracy: null, reason: 'noFix', distanceM: null }

function stop(rare: boolean): StopView {
  return {
    id: 's1',
    plan_id: 'p1',
    sort_order: 0,
    name: '南の水路',
    note: null,
    lat: 39.72,
    lng: 140.1,
    source: 'pin',
    source_id: null,
    status: 'pending',
    visited_at: null,
    created_at: '',
    number: 1,
    shownStatus: 'pending',
    unsent: false,
    rare,
    counts: { sighting: 0, absence: 0, rare: rare ? 1 : 0 },
  }
}

function renderConfirm(rare = false, onConfirm = vi.fn().mockResolvedValue('saved'), showRare = false) {
  const onClose = vi.fn()
  renderJa(
    <AbsenceConfirm stop={stop(rare)} showRare={showRare} position={position} onConfirm={onConfirm} onClose={onClose} errorText={() => 'ERR'} />
  )
  return { onConfirm, onClose }
}

function render0(rare: boolean, showRare: boolean) {
  return renderJa(
    <AbsenceConfirm
      stop={stop(rare)}
      showRare={showRare}
      position={position}
      onConfirm={vi.fn().mockResolvedValue('saved')}
      onClose={vi.fn()}
      errorText={() => 'ERR'}
    />
  )
}

beforeEach(() => vi.clearAllMocks())

describe('AbsenceConfirm (REQ-330)', () => {
  it('既定はアメリカザリガニだけ。ウシガエルを足すと件数が増え、一覧の順で送る', async () => {
    const { onConfirm, onClose } = renderConfirm()
    expect(screen.getByTestId('fieldwork-absence-species-american')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('fieldwork-absence-species-bullfrog')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('fieldwork-absence-submit')).toHaveTextContent('「いなかった」を記録（1件）')
    fireEvent.click(screen.getByTestId('fieldwork-absence-species-bullfrog'))
    expect(screen.getByTestId('fieldwork-absence-submit')).toHaveTextContent('「いなかった」を記録（2件）')
    fireEvent.change(screen.getByLabelText('調査にかけた時間（分・任意）'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('fieldwork-absence-submit'))
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ species: ['american', 'bullfrog'], surveyDurationMinutes: 30, observedOn: todayLocalISODate() })
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('分数は 1〜480。範囲外なら送らない', async () => {
    const { onConfirm } = renderConfirm()
    fireEvent.change(screen.getByLabelText('調査にかけた時間（分・任意）'), { target: { value: '600' } })
    fireEvent.click(screen.getByTestId('fieldwork-absence-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('1〜480分で入れてください')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('位置の規則と公開の範囲・運営の確認のあとで公開されることを出す（ふつうの地点）', () => {
    renderConfirm(false)
    expect(screen.getByTestId('fieldwork-position')).toHaveTextContent('記録の位置：この地点の座標（現在地を取得できなかったため）')
    expect(screen.getByText('地図には位置を約100m四方に丸めて出します')).toBeInTheDocument()
    // DB（protect_post_insert_columns）が管理者以外の投稿を pending にするので、「審査なし」とは書かない（点検 B9）
    expect(screen.getByTestId('fieldwork-absence-review')).toHaveTextContent('不在の記録は、運営が確認してから公開されます')
    expect(screen.queryByText(/審査なし/)).toBeNull()
  })

  it('A7: 希少種のある地点では、理由を書かずに「位置を公開しません」とだけ出す（表示が切れている間は錠前も出さない）', () => {
    const { container } = render0(true, false)
    expect(screen.getByTestId('fieldwork-absence-private')).toHaveTextContent('この地点の記録は、位置を公開しません')
    expect(container.textContent).not.toMatch(/希少種/)
    expect(screen.queryByTestId('fieldwork-rare-lock')).toBeNull()
  })

  it('希少種の表示を入れているときは、番号の丸に錠前を出す', () => {
    render0(true, true)
    expect(screen.getByTestId('fieldwork-rare-lock')).toBeInTheDocument()
  })

  it('失敗は閉じずに画面に出す', async () => {
    const { onClose } = renderConfirm(false, vi.fn().mockRejectedValue(new Error('x')))
    fireEvent.click(screen.getByTestId('fieldwork-absence-submit'))
    expect(await screen.findByRole('alert')).toHaveTextContent('ERR')
    expect(onClose).not.toHaveBeenCalled()
  })
})
