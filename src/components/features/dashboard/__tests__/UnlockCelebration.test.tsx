import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UnlockCelebration from '../UnlockCelebration'
import type { CollectionEntry } from '@/hooks/useProfile'

// t はキー（+opts）をそのまま返すエコー実装（他のコンポーネントテストと同方針）。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja', exists: () => true },
  }),
}))

function entry(species: CollectionEntry['species']): CollectionEntry {
  return { species, first_observed_at: null, info_types_seen: ['sighting'], municipalities_seen: [], verified_count: 1 }
}

describe('REQ-251 UnlockCelebration（一度きりの解放演出）', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('初回表示（localStorage 記録なし）は演出しない（既存/初回ユーザーで過去分が一斉発火しない）', () => {
    render(<UnlockCelebration level={3} collection={[entry('american')]} userId="u1" dark={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('レベルが上がると一度だけ祝い、その回で解放された機能も併記する', () => {
    const { rerender } = render(
      <UnlockCelebration level={3} collection={[]} userId="u1" dark={false} />,
    )
    // ベースライン確立後にレベル 3→4 へ（Lv4 で csv_export が解放される）。
    rerender(<UnlockCelebration level={4} collection={[]} userId="u1" dark={false} />)

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('celebrate.levelUp')
    expect(status.textContent).toContain('"level":4')
    // Lv4 解放の機能ラベル（unlocks.features.csv_export）が併記される。
    expect(status.textContent).toContain('unlocks.features.csv_export')
  })

  it('新しい図鑑カード（種）を獲得すると祝う', () => {
    const { rerender } = render(
      <UnlockCelebration level={3} collection={[]} userId="u1" dark={false} />,
    )
    rerender(<UnlockCelebration level={3} collection={[entry('american')]} userId="u1" dark={false} />)

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('celebrate.newCard')
    expect(status.textContent).toContain('species.american')
  })

  it('閉じるボタンで非表示になる', () => {
    const { rerender } = render(
      <UnlockCelebration level={3} collection={[]} userId="u1" dark={false} />,
    )
    rerender(<UnlockCelebration level={5} collection={[]} userId="u1" dark={false} />)
    expect(screen.getByRole('status')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'celebrate.dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('level が null（匿名/未取得）のときは何も出さない', () => {
    render(<UnlockCelebration level={null} collection={[entry('american')]} userId="u1" dark={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
