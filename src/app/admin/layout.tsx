import type { Metadata } from 'next'
import AdminLayoutClient from './AdminLayoutClient'

/**
 * REQ-312 FR-312-06: ここの `robots` が **`/admin` 配下すべて**の noindex を担う。
 *
 * Next.js の metadata は `robots` をトップレベルのキー単位で継承するため、
 * `admin/(protected)/layout.tsx`（metadata を持たない認可ゲート）や配下の各ページが
 * `robots` を定義しなくても、この宣言が root layout の `robots: { index: true }` を
 * 上書きしたまま届く。**個別ページに書き足す必要はない**
 * （`admin/login/page.tsx` の同値宣言は親が効く前からの名残りで、冗長だが無害）。
 *
 * `robots.ts` の `disallow: ['/admin/']` は**クロール制御であって noindex の保証ではない**
 * （外部からの直リンクがあればインデックスされ得る）。この2つで二重防御になっているので、
 * ここを消すと静かに片側だけになる。それを検知するため
 * `src/app/admin/__tests__/admin-noindex.test.ts` が本宣言を固定している。
 */
export const metadata: Metadata = {
  title: '管理画面',
  robots: { index: false, follow: false },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>
}
