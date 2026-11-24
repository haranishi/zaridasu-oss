import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import StopSheet from '../StopSheet'
import type { StopView } from '../../hooks/useFieldworkPlan'
import { renderJa } from './withI18n'

// REQ-330 §3 地点シート（本物の i18next で描画）。AC-13 の安全の一言・位置の規則の表示・4 ボタン・元に戻す。

function stop(extra: Partial<StopView> = {}): StopView {
  return {
    id: 's3',
    plan_id: 'p1',
    sort_order: 2,
    name: '北の池',
    note: '駐車場は南側',
    lat: 39.72,
    lng: 140.1,
    source: 'pin',
    source_id: null,
    status: 'pending',
    visited_at: null,
    created_at: '',
    number: 3,
    shownStatus: 'pending',
    unsent: false,
    rare: false,
    counts: { sighting: 1, absence: 2, rare: 0 },
    ...extra,
  }
}

type GeoOk = (p: GeolocationPosition) => void
let pendingGeo: GeoOk | null = null
function geo(mode: 'near' | 'far' | 'pending') {
  const getCurrentPosition = vi.fn((ok: GeoOk) => {
    if (mode === 'pending') {
      pendingGeo = ok
      return
    }
    const lat = mode === 'near' ? 39.7205 : 39.75
    ok({ coords: { latitude: lat, longitude: 140.1, accuracy: 12 } } as GeolocationPosition)
  })
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true })
}

function renderSheet(props: Partial<Parameters<typeof StopSheet>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onFound: vi.fn(),
    onAbsent: vi.fn(),
    onRare: vi.fn(),
    onSetStatus: vi.fn().mockResolvedValue('saved'),
    errorText: (err: unknown) => String(err),
  }
  renderJa(<StopSheet stop={stop()} showRare={false} online {...handlers} {...props} />)
  return { ...handlers, ...props }
}

beforeEach(() => {
  vi.clearAllMocks()
  pendingGeo = null
})

/** 1 つのテストの中で描き直すとき（前の描画を片付ける） */
function cleanupAll() {
  cleanup()
}

describe('StopSheet (REQ-330)', () => {
  it('名前・メモ・結果の数・安全の一言（⚠ と 3 行）・経路（3 社）・4 つのボタンを出す', async () => {
    geo('near')
    renderSheet()
    expect(screen.getByRole('dialog', { name: /北の池/ })).toBeInTheDocument()
    expect(screen.getByText('駐車場は南側')).toBeInTheDocument()
    expect(screen.getByTestId('fieldwork-stop-results')).toHaveTextContent('この地点の記録：いた 1・いなかった 2')
    const safety = screen.getByTestId('fieldwork-safety')
    expect(safety).toHaveTextContent('安全のために')
    expect(within(safety).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '水に入らない',
      '子どもだけで行かない',
      '立入禁止の場所・私有地に入らない',
    ])
    expect(screen.getByTestId('route-links').querySelectorAll('a')).toHaveLength(3)
    // 「飛ばす」の 2 行目は「理由は任意」
    expect(screen.getByRole('button', { name: '飛ばす' })).toHaveTextContent('理由は任意')
    for (const name of ['いた（投稿する）', 'いなかった', '希少種を記録', '飛ばす']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    // 補間が効いている（{{m}} がそのまま出ていない）。「誤差 約12m」は折り返さない固まり
    await waitFor(() => expect(screen.getByTestId('fieldwork-position')).toHaveTextContent('記録の位置：現在地（誤差 約12m）'))
    expect(screen.getByText('誤差 約12m')).toHaveClass('whitespace-nowrap')
    // 現地で読むもの: 安全の一言は 15px、経路の見出しは 14px、「現在地を取り直す」は高さ 44px の枠つきボタン
    expect(safety).toHaveClass('text-[15px]')
    expect(screen.getByTestId('route-links').querySelector('p')).toHaveClass('text-sm')
    expect(screen.getByTestId('fieldwork-position-retry')).toHaveClass('h-11', 'w-full')
  })

  it('A6: 位置が更新されても「記録の位置」の箱の行数は変わらない（2 行目の高さを取っておく）', async () => {
    geo('pending')
    renderSheet()
    // 取得中も 2 行目（理由の行）と「現在地を取り直す」を出しておく
    expect(screen.getByTestId('fieldwork-position-reason')).toBeInTheDocument()
    expect(screen.getByTestId('fieldwork-position-retry')).toBeDisabled()
    pendingGeo!({ coords: { latitude: 39.7201, longitude: 140.1, accuracy: 9 } } as GeolocationPosition)
    await waitFor(() => expect(screen.getByTestId('fieldwork-position-retry')).toBeEnabled())
    expect(screen.getByTestId('fieldwork-position-reason')).toBeInTheDocument()
  })

  it('地点から 300m より遠ければ地点の座標を使い、その理由を確定前に出す', async () => {
    geo('far')
    const { onAbsent } = renderSheet()
    // 1 行目に何を使うか、2 行目に理由。距離は 1000 m 以上なら km で小数 1 桁（「約3.3km」）を折り返さない固まりで
    await waitFor(() => expect(screen.getByTestId('fieldwork-position')).toHaveTextContent('記録の位置：この地点の座標'))
    expect(screen.getByTestId('fieldwork-position-reason')).toHaveTextContent('（いまいる場所から約3.3km離れているため）')
    expect(screen.getByText('約3.3km')).toHaveClass('whitespace-nowrap')
    fireEvent.click(screen.getByRole('button', { name: 'いなかった' }))
    expect(onAbsent).toHaveBeenCalledWith(expect.objectContaining({ source: 'map', reason: 'far', lat: 39.72, lng: 140.1, accuracy: null }))
  })

  it('位置が決まる前に押されたら、決まった時点で続きを行う', async () => {
    geo('pending')
    const { onFound } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: 'いた（投稿する）' }))
    expect(onFound).not.toHaveBeenCalled()
    pendingGeo!({ coords: { latitude: 39.7201, longitude: 140.1, accuracy: 9 } } as GeolocationPosition)
    await waitFor(() => expect(onFound).toHaveBeenCalledWith(expect.objectContaining({ source: 'gps', accuracy: 9 })))
  })

  it('A7: 表示を切っている間は、希少種のある地点のシートに「特別な地点」と分かるものを何も出さない（非公開の固定も含む）', () => {
    geo('near')
    renderSheet({ stop: stop({ rare: true, counts: { sighting: 1, absence: 2, rare: 1 } }) })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText('希少種あり')).toBeNull()
    expect(within(dialog).queryByTestId('fieldwork-rare-chip')).toBeNull()
    expect(within(dialog).queryByTestId('fieldwork-rare-lock')).toBeNull()
    expect(within(dialog).queryByTestId('fieldwork-stop-private')).toBeNull()
    expect(screen.getByTestId('fieldwork-stop-results')).toHaveTextContent('この地点の記録：いた 1・いなかった 2')
    expect(screen.getByTestId('fieldwork-stop-results')).not.toHaveTextContent('希少種')
    // 非公開の固定を示す言葉も出さない（「いた」のフォームと「いなかった」の確認の中でだけ出す）
    expect(dialog.textContent).not.toMatch(/公開しません|非公開|希少種あり|希少種\s*\d/)
    // 希少種の地点でない地点のシートと、見た目の要素がそろっている
    const rareSheetTestIds = Array.from(dialog.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'))
    cleanupAll()
    geo('near')
    renderSheet({ stop: stop({ rare: false, counts: { sighting: 1, absence: 2, rare: 0 } }) })
    const plainTestIds = Array.from(screen.getByRole('dialog').querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid'))
    expect(rareSheetTestIds).toEqual(plainTestIds)
  })

  it('A1: 表示を入れているときだけ、「希少種あり」・番号の錠前・「希少種 N」を出す', () => {
    geo('near')
    renderSheet({ stop: stop({ rare: true, counts: { sighting: 1, absence: 2, rare: 1 } }), showRare: true })
    expect(screen.getByTestId('fieldwork-rare-chip')).toHaveTextContent('希少種あり')
    expect(screen.getByTestId('fieldwork-rare-lock')).toBeInTheDocument()
    expect(screen.getByTestId('fieldwork-stop-results')).toHaveTextContent('この地点の記録：いた 1・いなかった 2・希少種 1')
  })

  it('飛ばす: 理由はメモの後ろに足して送る', async () => {
    geo('near')
    const { onSetStatus, onClose } = renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '飛ばす' }))
    fireEvent.change(screen.getByLabelText('飛ばす理由（任意・メモに残ります）'), { target: { value: '増水で近づけない' } })
    fireEvent.click(screen.getByTestId('fieldwork-skip-confirm'))
    await waitFor(() => expect(onSetStatus).toHaveBeenCalledWith('skipped', '駐車場は南側\n増水で近づけない'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('A1: 「飛ばす」の確認も「左＝やめる・右＝実行」', () => {
    geo('near')
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '飛ばす' }))
    const confirm = screen.getByTestId('fieldwork-skip-confirm')
    const row = confirm.parentElement!
    expect(Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['やめる', '飛ばす'])
  })

  it('済みの地点は「元に戻す」で未調査に戻せる。失敗は画面に出す', async () => {
    geo('near')
    const onSetStatus = vi.fn().mockRejectedValue('権限がないか、対象がもうありません')
    renderSheet({ stop: stop({ status: 'done', shownStatus: 'done' }), onSetStatus })
    fireEvent.click(screen.getByRole('button', { name: '元に戻す（未調査にする）' }))
    expect(onSetStatus).toHaveBeenCalledWith('pending', undefined)
    expect(await screen.findByRole('alert')).toHaveTextContent('権限がないか、対象がもうありません')
  })

  it('圏外では、送信待ちになることと投稿がつながらないことを出す', () => {
    geo('near')
    renderSheet({ online: false })
    expect(screen.getByText(/圏外です。いなかった・飛ばす・写真なしの希少種は端末に保存し/)).toBeInTheDocument()
  })
})
