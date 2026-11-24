import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import LandingPage from '@/views/LandingPage'

// REQ-206 (FR-206-05/07): LP（LandingPage）の単体テスト。
//   - 主要セクションの描画 / a11y
//   - LpFaq の開閉と aria 属性（aria-expanded / aria-controls）
//   - LpStats の null フォールバック（数値カード非表示）
//   - CTA の href（SIGNUP_HREF / MAP_HREF）と pushLpEvent 送出
//   - バンドル健全性: ソースに leaflet/地図依存が紛れ込まないこと（NFR-176-01）

// ── モック ───────────────────────────────────────────────────────────────
// i18n: キーをそのまま返し、文言変更に影響されない検証にする。
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ja' } }),
}))

// next/link → 素の <a>。href / onClick をそのまま透過する。
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
  } & Record<string, unknown>) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}))

// next/image → 素の <img>（jsdom で最適化を伴わない）。alt / priority を検証可能にする。
vi.mock('next/image', () => ({
  default: ({ src, alt, priority, ...rest }: { src: string; alt: string; priority?: boolean } & Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-priority={priority ? 'true' : 'false'} {...rest} />
  ),
}))

// 計測フックを spy 化（送出引数を検証）。
const pushLpEvent = vi.fn()
vi.mock('@/lib/lpAnalytics', () => ({
  pushLpEvent: (...args: unknown[]) => pushLpEvent(...args),
}))

beforeEach(() => {
  pushLpEvent.mockClear()
})

const SIGNUP_HREF = '/?auth=signup&from=lp'
const MAP_HREF = '/map'

// ── 描画 ───────────────────────────────────────────────────────────────
describe('LandingPage 描画', () => {
  it('h1 キャッチコピーと主要セクション見出しが描画される', () => {
    render(<LandingPage stats={{ totalPosts: 120, totalUsers: 40 }} />)
    // h1（キャッチコピー）は1つだけ
    const h1s = screen.getAllByRole('heading', { level: 1 })
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent('lp.hero.title')
    // FAQ / Features / How / Problem の見出しキーが存在する
    expect(screen.getByText('lp.features.title')).toBeInTheDocument()
    expect(screen.getByText('lp.how.title')).toBeInTheDocument()
    expect(screen.getByText('lp.faq.title')).toBeInTheDocument()
  })

  it('ヒーロー画像が next/image + priority + alt 付きで描画される（FR-206-01/02）', () => {
    render(<LandingPage stats={null} />)
    const img = screen.getByAltText('lp.hero.imageAlt')
    expect(img).toHaveAttribute('src', '/lp/hero.webp')
    expect(img).toHaveAttribute('data-priority', 'true')
  })

  it('フッターに /about /terms /privacy リンクがある', () => {
    render(<LandingPage stats={null} />)
    expect(screen.getByRole('link', { name: 'lp.footer.about' })).toHaveAttribute('href', '/about')
    expect(screen.getByRole('link', { name: 'lp.footer.terms' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'lp.footer.privacy' })).toHaveAttribute('href', '/privacy')
  })
})

// ── FAQ アコーディオン ───────────────────────────────────────────────────
describe('LpFaq アコーディオン', () => {
  it('初期は全て閉（aria-expanded=false・回答 hidden）', () => {
    render(<LandingPage stats={null} />)
    const q1 = screen.getByRole('button', { name: /lp\.faq\.q1/ })
    expect(q1).toHaveAttribute('aria-expanded', 'false')
    const answerId = q1.getAttribute('aria-controls')
    expect(answerId).toBe('lp-faq-answer-1')
    const answer = document.getElementById(answerId!)
    expect(answer).toHaveAttribute('hidden')
  })

  it('クリックで開閉し aria-expanded と hidden が連動、開時に lp_faq_open を送出', () => {
    render(<LandingPage stats={null} />)
    const q1 = screen.getByRole('button', { name: /lp\.faq\.q1/ })
    const answer = document.getElementById('lp-faq-answer-1')!

    // 開く
    fireEvent.click(q1)
    expect(q1).toHaveAttribute('aria-expanded', 'true')
    expect(answer).not.toHaveAttribute('hidden')
    expect(pushLpEvent).toHaveBeenCalledWith('lp_faq_open', { question_id: 'q1' })

    // 閉じる（開イベントは増えない）
    pushLpEvent.mockClear()
    fireEvent.click(q1)
    expect(q1).toHaveAttribute('aria-expanded', 'false')
    expect(answer).toHaveAttribute('hidden')
    expect(pushLpEvent).not.toHaveBeenCalled()
  })

  it('別の質問を開くと前の質問は閉じる（単一展開）', () => {
    render(<LandingPage stats={null} />)
    const q1 = screen.getByRole('button', { name: /lp\.faq\.q1/ })
    const q2 = screen.getByRole('button', { name: /lp\.faq\.q2/ })
    fireEvent.click(q1)
    fireEvent.click(q2)
    expect(q1).toHaveAttribute('aria-expanded', 'false')
    expect(q2).toHaveAttribute('aria-expanded', 'true')
  })
})

// ── 実績数値（LpStats）の null フォールバック ──────────────────────────────
describe('LpStats null フォールバック（FR-206-05）', () => {
  it('stats=null のとき数値カード（報告数・参加人数ラベル）を描画しない', () => {
    render(<LandingPage stats={null} />)
    expect(screen.queryByText('lp.stats.postsLabel')).not.toBeInTheDocument()
    expect(screen.queryByText('lp.stats.usersLabel')).not.toBeInTheDocument()
    // エリア（定数）カードはセクション内に残る
    expect(screen.getByText('lp.stats.areaLabel')).toBeInTheDocument()
  })

  it('stats があるとき数値カードのラベルを描画する', () => {
    render(<LandingPage stats={{ totalPosts: 120, totalUsers: 40 }} />)
    expect(screen.getByText('lp.stats.postsLabel')).toBeInTheDocument()
    expect(screen.getByText('lp.stats.usersLabel')).toBeInTheDocument()
  })
})

// ── CTA（href + 計測） ───────────────────────────────────────────────────
describe('CTA リンクと計測', () => {
  it('ヒーロー主CTAは SIGNUP_HREF を指し、クリックで lp_cta_signup(position=hero)', () => {
    render(<LandingPage stats={null} />)
    // ヒーロー領域の主CTA（最初の ctaPrimary）。getAllByRole は 0 件で throw するため [0] は必ず存在。
    const primary = screen.getAllByRole('link', { name: /lp\.hero\.ctaPrimary/ })[0]!
    expect(primary).toHaveAttribute('href', SIGNUP_HREF)
    fireEvent.click(primary)
    expect(pushLpEvent).toHaveBeenCalledWith('lp_cta_signup', { position: 'hero' })
  })

  it('副CTAは MAP_HREF を指し、クリックで lp_cta_map', () => {
    render(<LandingPage stats={null} />)
    const secondary = screen.getAllByRole('link', { name: 'lp.hero.ctaSecondary' })[0]!
    expect(secondary).toHaveAttribute('href', MAP_HREF)
    fireEvent.click(secondary)
    expect(pushLpEvent).toHaveBeenCalledWith('lp_cta_map', { position: 'hero' })
  })

  it('ヘッダーCTAは SIGNUP_HREF を指し、クリックで lp_cta_signup(position=header)', () => {
    render(<LandingPage stats={null} />)
    const headerCta = screen.getByRole('link', { name: 'lp.header.cta' })
    expect(headerCta).toHaveAttribute('href', SIGNUP_HREF)
    fireEvent.click(headerCta)
    expect(pushLpEvent).toHaveBeenCalledWith('lp_cta_signup', { position: 'header' })
  })

  it('ヘッダーのログインリンクは LOGIN_HREF を指す', () => {
    render(<LandingPage stats={null} />)
    expect(screen.getByRole('link', { name: 'lp.header.login' })).toHaveAttribute(
      'href',
      '/?auth=login&from=lp',
    )
  })
})

// ── アクセシビリティ ─────────────────────────────────────────────────────
describe('a11y', () => {
  it('重大な a11y 違反がない（vitest-axe）', async () => {
    // reduced-motion を true にして CountUp の rAF を無効化し、
    // act 警告と非決定的なアニメ更新を避ける（検証内容は不変）。
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      const { container } = render(<LandingPage stats={{ totalPosts: 120, totalUsers: 40 }} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    } finally {
      window.matchMedia = original
    }
  })
})

// ── バンドル健全性（NFR-176-01 / FR-206-07）────────────────────────────────
describe('バンドル健全性（leaflet 非依存）', () => {
  it('LandingPage のソースが leaflet / 地図ラッパーを import しない', () => {
    // Vitest はリポジトリルートを cwd に実行される。
    const src = readFileSync(
      path.resolve(process.cwd(), 'src/views/LandingPage.tsx'),
      'utf-8',
    )
    expect(src).not.toMatch(/from\s+['"]leaflet['"]/)
    expect(src).not.toMatch(/react-leaflet/)
    expect(src).not.toMatch(/MapView/)
    expect(src).not.toMatch(/MapViewWrapper/)
  })
})
