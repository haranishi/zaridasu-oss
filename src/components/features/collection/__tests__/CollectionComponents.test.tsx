import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SPECIES, aquariumCapacity, unlockedDecorations, COLLECTION_UNLOCK_LEVEL } from '@/lib/constants'
import SpeciesDexCard from '../SpeciesDexCard'
import Aquarium from '../Aquarium'
import type { CollectionEntry } from '@/hooks/useProfile'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja', exists: () => false },
  }),
  // REQ-250 Part B: Aquarium が Crayfish3DStage→ErrorBoundary 経由で @/lib/i18n を読み込むため、
  // 初期化プラグインのスタブを渡して init のクラッシュ（unhandled rejection）を防ぐ。
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as Record<string, string>)} />,
}))

const american = SPECIES.find((s) => s.value === 'american')!
const bullfrog = SPECIES.find((s) => s.value === 'bullfrog')!

function entry(over: Partial<CollectionEntry> = {}): CollectionEntry {
  return {
    species: 'american',
    first_observed_at: '2026-06-01T00:00:00Z',
    info_types_seen: ['sighting'],
    municipalities_seen: ['秋田市'],
    verified_count: 1,
    ...over,
  }
}

describe('REQ-250 水槽容量・デコレーション（DB 権威の level から算出）', () => {
  it('aquariumCapacity は解放前 0・Lv5=2・2 レベルごと +1・上限 6', () => {
    expect(aquariumCapacity(COLLECTION_UNLOCK_LEVEL - 1)).toBe(0) // Lv4 = 0（未解放）
    expect(aquariumCapacity(5)).toBe(2)
    expect(aquariumCapacity(7)).toBe(3)
    expect(aquariumCapacity(9)).toBe(4)
    expect(aquariumCapacity(100)).toBe(6) // 上限
    expect(aquariumCapacity(null)).toBe(0)
    expect(aquariumCapacity(undefined)).toBe(0)
  })

  it('unlockedDecorations はレベルで段階解放', () => {
    expect(unlockedDecorations(4).map((d) => d.key)).toEqual([])
    expect(unlockedDecorations(5).map((d) => d.key)).toEqual(['sand'])
    expect(unlockedDecorations(6).map((d) => d.key)).toContain('plant')
    expect(unlockedDecorations(10).length).toBe(4)
  })
})

describe('SpeciesDexCard（図鑑カードが文脈で埋まる）', () => {
  it('未観察はテキストで「未観察」を示す（色だけに依存しない）', () => {
    render(<SpeciesDexCard species={bullfrog} entry={undefined} dark={false} />)
    expect(screen.getByText('collection.dex.notObserved')).toBeInTheDocument()
    expect(screen.queryByText('collection.dex.complete')).not.toBeInTheDocument()
  })

  it('観察済み（info_type 未コンプ）は「観察済み」を示すがコンプリートは出ない', () => {
    render(<SpeciesDexCard species={american} entry={entry({ info_types_seen: ['sighting', 'capture'] })} dark={false} />)
    expect(screen.getByText('collection.dex.observed')).toBeInTheDocument()
    expect(screen.queryByText('collection.dex.complete')).not.toBeInTheDocument()
  })

  it('info_type を全種（5）観察するとコンプリート表示になる', () => {
    render(
      <SpeciesDexCard
        species={american}
        entry={entry({ info_types_seen: ['sighting', 'capture', 'trace', 'damage', 'absence'] })}
        dark={false}
      />,
    )
    expect(screen.getByText('collection.dex.complete')).toBeInTheDocument()
  })
})

describe('Aquarium（水槽）', () => {
  it('観察が無いときは空状態メッセージを出す', () => {
    render(<Aquarium collection={[]} level={5} dark={false} />)
    expect(screen.getByText('collection.aquarium.empty')).toBeInTheDocument()
  })

  it('american を観察していると水槽にザリガニ SVG が泳ぐ（CrayfishIllustration 再利用）', () => {
    const { container } = render(
      <Aquarium collection={[entry({ species: 'american' })]} level={5} dark={false} />,
    )
    // CSS アニメの swimmer ラッパが存在（transform のみ・reduced-motion 安全）
    expect(container.querySelector('.aquarium-swimmer')).toBeTruthy()
    // ザリガニ SVG が描画される
    expect(container.querySelector('svg')).toBeTruthy()
    // 容量ラベル（Lv5=2）が表示される
    expect(screen.getByText(/collection\.aquarium\.capacity/)).toBeInTheDocument()
  })
})
