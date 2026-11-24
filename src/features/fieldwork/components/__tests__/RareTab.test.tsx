import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ supabase: {} }))

import RareTab from '../RareTab'
import type { RareSightingsApi } from '../../hooks/useRareSightings'
import { renderJa } from './withI18n'

// REQ-330 希少種タブ（本物の i18next）。削除は「⋯」から確認を挟み、並びは「左＝やめる・右＝実行」（採点 2 周目 A1）。
// 「表示中（自分だけ）」の札はトグルの ON/OFF で行が変わらない（A6）。日付は「2026/10/02 10:20」（B）。

function rareApi(over: Partial<RareSightingsApi> = {}): RareSightingsApi {
  return {
    list: [
      {
        id: 'r1',
        client_id: 'c1',
        stop_id: 's1',
        species_key: 'medaka',
        species_label: null,
        count: 12,
        note: null,
        lat: 39.7,
        lng: 140.1,
        accuracy: 8,
        location_source: 'gps',
        observed_at: new Date(2026, 9, 2, 10, 20).toISOString(),
        photo_paths: [],
        created_at: '',
      },
    ],
    loadState: 'ready',
    load: vi.fn(),
    refresh: vi.fn(),
    create: vi.fn(),
    remove: vi.fn().mockResolvedValue({ photosLeft: 0, photoCount: 0 }),
    ...over,
  } as unknown as RareSightingsApi
}

function renderTab(showRare: boolean) {
  const props = { rare: rareApi(), showRare, onShowRareChange: vi.fn(), onRecordRare: vi.fn() }
  renderJa(<RareTab {...props} />)
  return props
}

describe('RareTab (REQ-330)', () => {
  it('記録カード: 日付は「2026/10/02 10:20」、計画の地点で記録したものは「計画で記録」', () => {
    renderTab(false)
    const card = screen.getByTestId('fieldwork-rare-card')
    expect(card).toHaveTextContent('2026/10/02 10:20')
    expect(card).toHaveTextContent('12個体')
    expect(card).toHaveTextContent('計画で記録')
  })

  it('A1: 削除は「⋯」→「削除」→ 確認。確認のボタンは「左＝やめる・右＝削除する」で、一覧に赤を出さない', () => {
    const props = renderTab(false)
    const card = screen.getByTestId('fieldwork-rare-card')
    fireEvent.click(within(card).getByRole('button', { name: /のメニュー$/ }))
    fireEvent.click(within(card).getByTestId('fieldwork-rare-delete'))
    const confirm = within(card).getByRole('alert')
    const buttons = within(confirm).getAllByRole('button')
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['やめる', '削除する'])
    expect(card.innerHTML).not.toMatch(/\b(?:bg|text|border)-red-/)
    fireEvent.click(buttons[0]!)
    expect(props.rare.remove).not.toHaveBeenCalled()
  })

  it('A6: 札「非表示」「表示中（自分だけ）」は ON でも OFF でも見出しの次の行に置く（カードの高さが変わらない）', () => {
    renderTab(false)
    const off = screen.getByTestId('fieldwork-show-rare-state')
    expect(off).toHaveTextContent('非表示')
    expect(off.previousElementSibling).toHaveTextContent('希少種を自分の地図に表示')
    expect(off).toHaveClass('mt-1')
  })

  it('A6: ON のときも同じ位置に「表示中（自分だけ）」', () => {
    renderTab(true)
    const on = screen.getByTestId('fieldwork-show-rare-state')
    expect(on).toHaveTextContent('表示中（自分だけ）')
    expect(on.previousElementSibling).toHaveTextContent('希少種を自分の地図に表示')
  })
})
