'use client'

import { usePathname } from 'next/navigation'

/**
 * REQ-187 / REQ-176 NFR-176-07: ルート本文ランドマーク <main id="main-content"> の出し分け。
 *
 * 通常ページではこのコンポーネントが children を <main id="main-content"> で包み、
 * 「ページに 1 つだけ」のトップレベル main を提供する（従来の layout.tsx と同じ挙動）。
 *
 * 例外: LP（/lp）は LandingPage 自身が
 *   <header>(banner) / <main id="main-content"> / <footer>(contentinfo)
 * をトップレベル landmark として描画する「フルページ・ビュー」。
 * ここでルート <main> を上から被せると、
 *   - main が入れ子／重複する（HTML 仕様・ARIA 違反）
 *   - <header>/<footer> が main 配下に入り、暗黙の banner/contentinfo ロールが外れる
 *     （ブラウザは header/footer を main 等のセクショニング要素配下では landmark にしない）
 * ため、LP ではルート <main> を付けず children をそのまま通す。
 *
 * usePathname は App Router の Client Component で SSR/SSG いずれの描画時も当該ルートの
 * pathname を返すため、配信 HTML とハイドレーションで出し分けが一致し、二重 main や
 * ハイドレーション不一致は起きない。
 */
function isSelfContainedLandmarkRoute(pathname: string | null): boolean {
  if (!pathname) return false
  // LP はビュー側で header/本文/footer を自前のトップレベル landmark として描画する。
  if (pathname === '/lp' || pathname.startsWith('/lp/')) return true
  // REQ-275 FR-275-04: /dataset も同型のフルページ・ビュー（自前の header/main/Footer）。
  // 除外しないと <main> が二重入れ子になり、内側 header/footer の banner/contentinfo
  // ロールが外れていた（上記 LP の警告と同一問題）。
  if (pathname === '/dataset' || pathname.startsWith('/dataset/')) return true
  return false
}

export function RootMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (isSelfContainedLandmarkRoute(pathname)) {
    return <>{children}</>
  }
  return <main id="main-content">{children}</main>
}
