import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CollectionPage from '../CollectionPage'

// react-i18next: キー＋補間引数をそのまま返す軽量モック（CSVExportSection.gate.test と同方針）。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja', exists: () => false },
  }),
  // REQ-250 Part B: 解放後の水槽（Aquarium）が Crayfish3DStage→ErrorBoundary 経由で @/lib/i18n を
  // 読み込むため、初期化プラグインのスタブを渡して init のクラッシュ（unhandled rejection）を防ぐ。
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }))
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ dark: false }) }))

// useProgress / useCollection を差し替えてレベル・観察内容を制御（実 useUnlocks はそのまま動かす）。
const { progressMock, collectionMock } = vi.hoisted(() => ({ progressMock: vi.fn(), collectionMock: vi.fn() }))
vi.mock('@/hooks/useProfile', () => ({
  useProgress: () => progressMock(),
  useCollection: () => collectionMock(),
}))

// レイアウトと next/image は軽量スタブ（本テストの関心はゲートと図鑑/水槽/教育文言の表示）。
vi.mock('@/components/layout/Header', () => ({ default: () => <header data-testid="header" /> }))
vi.mock('@/components/layout/BottomNav', () => ({ default: () => <nav data-testid="bottomnav" /> }))
vi.mock('@/components/layout/Footer', () => ({ default: () => <footer data-testid="footer" /> }))
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />
  },
}))

describe('CollectionPage ゲート（REQ-250 collection = Lv5・server 強制の UI 側）', () => {
  beforeEach(() => {
    collectionMock.mockReturnValue({ collection: [], loading: false, error: null })
  })

  it('Lv4 はロック：解放予告を出し、水槽/図鑑は出さない', () => {
    progressMock.mockReturnValue({ progress: { level: 4, xp: 300 }, loading: false, error: null })
    render(<CollectionPage />)
    // ロック見出し＝機能名ラベル（unlocks.features.collection）
    expect(screen.getByText('unlocks.features.collection')).toBeInTheDocument()
    // a11y: ロック状態がテキストで判別可能（「レベル5で解放」）
    expect(screen.getByText(/unlocks\.lockedAtLevel/)).toBeInTheDocument()
    // 水槽・図鑑・教育カードは出ない
    expect(screen.queryByText('collection.aquarium.title')).not.toBeInTheDocument()
    expect(screen.queryByText('collection.dex.title')).not.toBeInTheDocument()
    expect(screen.queryByText('collection.edu.title')).not.toBeInTheDocument()
  })

  it('Lv5 で解放：教育メッセージ・水槽・図鑑が表示される', () => {
    progressMock.mockReturnValue({ progress: { level: 5, xp: 500 }, loading: false, error: null })
    collectionMock.mockReturnValue({
      collection: [
        { species: 'american', first_observed_at: '2026-06-01T00:00:00Z', info_types_seen: ['sighting'], municipalities_seen: ['秋田市'], verified_count: 1 },
      ],
      loading: false,
      error: null,
    })
    render(<CollectionPage />)
    // FR-250-05: 教育メッセージ（特定外来生物・飼育/放出禁止）が必ず併記される
    expect(screen.getByText('collection.edu.title')).toBeInTheDocument()
    expect(screen.getByText('collection.edu.body')).toBeInTheDocument()
    expect(screen.getByText('collection.edu.learnMore')).toBeInTheDocument()
    // 水槽・図鑑が表示される
    expect(screen.getByText('collection.aquarium.title')).toBeInTheDocument()
    expect(screen.getByText('collection.dex.title')).toBeInTheDocument()
    // ロック予告は出ない
    expect(screen.queryByText(/unlocks\.lockedAtLevel/)).not.toBeInTheDocument()
  })

  it('Lv5：図鑑は観察済み種（american）と未観察種（bullfrog）を区別して表示する', () => {
    progressMock.mockReturnValue({ progress: { level: 5, xp: 500 }, loading: false, error: null })
    collectionMock.mockReturnValue({
      collection: [
        { species: 'american', first_observed_at: '2026-06-01T00:00:00Z', info_types_seen: ['sighting', 'capture'], municipalities_seen: ['秋田市'], verified_count: 2 },
      ],
      loading: false,
      error: null,
    })
    render(<CollectionPage />)
    // 色だけでなくテキストで解放/未解放が判別可能（NFR-250-02）
    expect(screen.getByText('collection.dex.observed')).toBeInTheDocument()     // american
    expect(screen.getByText('collection.dex.notObserved')).toBeInTheDocument()  // bullfrog
  })
})
