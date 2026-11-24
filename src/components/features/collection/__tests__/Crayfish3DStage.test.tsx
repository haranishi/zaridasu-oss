import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: 'ja', exists: () => false },
  }),
  // ErrorBoundary → @/lib/i18n が初期化時に使うプラグイン。スタブを渡して init クラッシュを防ぐ。
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

// next/dynamic をスタブ化: 実チャンク（three/react-three-fiber）を一切読み込まず、
// 渡された props を data 属性に写す軽量ダミーを同期表示する。
// → 「クリックで初めてビューアが載る」ゲーティングを three 非依存で検証できる
//   （実際のチャンク分割は build / size-limit 側で担保）。
vi.mock('next/dynamic', () => ({
  default: () =>
    function ViewerStub(props: { color?: string; reducedMotion?: boolean; label?: string }) {
      return (
        <div
          data-testid="viewer-3d"
          data-color={props.color}
          data-reduced={String(props.reducedMotion)}
          data-label={props.label}
        />
      )
    },
}))

// WebGL 判定はテストごとに切り替える。
const webglMock = vi.hoisted(() => ({ value: true }))
vi.mock('@/lib/webgl', () => ({ isWebGLAvailable: () => webglMock.value }))

import Crayfish3DStage from '../Crayfish3DStage'

beforeEach(() => {
  webglMock.value = true
  vi.restoreAllMocks()
})

describe('Crayfish3DStage（REQ-250 フェーズ2: 3D の厳格分離・2D フォールバック・a11y）', () => {
  it('既定は 2D（CrayfishIllustration）を表示し、3D ビューアはまだマウントされない', () => {
    render(<Crayfish3DStage color="#0072B2" dark={false} />)
    // 2D 基準線: role=img + 代替テキストの Fallback2D が出ている。
    expect(screen.getByRole('img', { name: 'collection.viewer3d.alt' })).toBeInTheDocument()
    // 3D ビューアは未マウント（＝ページ表示時点で three を読み込まない）。
    expect(screen.queryByTestId('viewer-3d')).not.toBeInTheDocument()
    // 「3Dで見る」ボタンが存在（WebGL 対応時）。
    expect(screen.getByRole('button', { name: /collection\.viewer3d\.view3d/ })).toBeInTheDocument()
  })

  it('「3Dで見る」クリックで初めて 3D ビューアが載り、ボタンが「2Dに戻る」に変わる', () => {
    render(<Crayfish3DStage color="#0072B2" dark={false} />)
    fireEvent.click(screen.getByRole('button', { name: /collection\.viewer3d\.view3d/ }))

    const viewer = screen.getByTestId('viewer-3d')
    expect(viewer).toBeInTheDocument()
    // 基調色（SpeciesOption.color）がビューアへ渡る。
    expect(viewer.getAttribute('data-color')).toBe('#0072B2')
    // トグルで 2D に戻せる。
    expect(screen.getByRole('button', { name: /collection\.viewer3d\.back2d/ })).toBeInTheDocument()
    // 3D 表示中は 2D フォールバックの role=img は退避している。
    expect(screen.queryByRole('img', { name: 'collection.viewer3d.alt' })).not.toBeInTheDocument()
  })

  it('WebGL 非対応では「3Dで見る」ボタンを出さず、2D のまま（2Dのみ案内を表示）', () => {
    webglMock.value = false
    render(<Crayfish3DStage color="#0072B2" dark={false} />)
    expect(screen.queryByRole('button', { name: /collection\.viewer3d\.view3d/ })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'collection.viewer3d.alt' })).toBeInTheDocument()
    expect(screen.getByText('collection.viewer3d.hint2dOnly')).toBeInTheDocument()
  })

  it('reduced-motion のとき、開いた 3D ビューアへ reducedMotion=true が渡る（自動スピンしない）', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)

    render(<Crayfish3DStage color="#0072B2" dark={false} />)
    // reduced-motion でも既定は 2D 基準線（開くまで動かない）。
    expect(screen.getByRole('img', { name: 'collection.viewer3d.alt' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collection\.viewer3d\.view3d/ }))
    expect(screen.getByTestId('viewer-3d').getAttribute('data-reduced')).toBe('true')
  })
})
