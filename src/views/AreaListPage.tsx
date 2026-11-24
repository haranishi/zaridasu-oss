'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import Breadcrumb from '@/components/ui/Breadcrumb'
import Footer from '@/components/layout/Footer'
import PageHeader from '@/components/layout/PageHeader'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import { PAGE_CONTAINER } from '@/lib/layout'

interface Municipality {
  name: string
  slug: string
  lat: number
  lng: number
  postCount: number
}

export default function AreaListPageClient({ municipalities }: { municipalities: Municipality[] }) {
  const { dark } = useTheme()

  const heading = dark ? 'text-slate-100' : 'text-gray-800'
  const muted = dark ? 'text-slate-400' : 'text-gray-600'
  const card = `rounded-2xl shadow-xs p-5 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* REQ-320 FR-320-02: ロゴの無い独自ヘッダーを共通の PageHeader へ寄せる（意匠 1 系統）。
          REQ-322 FR-322-01: ヘッダーが「地域別外来生物情報」、パンくずが「地域別」、
          フッターが「地域別情報」と同じ画面が 3 つの名前で呼ばれていた（Round 3 採点 #1）。
          可視面はすべて「地域別」に統一する（`<title>` は SEO 文言なので別途）。 */}
      <PageHeader title="地域別" asH1 />

      <Breadcrumb items={[{ label: '地域別' }]} />

      <div className={`${PAGE_CONTAINER} py-6`}>
        <p className={`text-sm mb-5 ${muted}`}>
          秋田県の各市区町村ごとの外来生物出没情報をご覧いただけます。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {municipalities.map((m) => (
            <Link
              key={m.slug}
              href={`/area/${m.slug}`}
              className={`${card} flex items-center justify-between hover:shadow-md transition-shadow`}
            >
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-red-500 shrink-0" />
                <span className={`text-sm font-medium ${heading}`}>{m.name}</span>
              </div>
              <span className={`text-xs ${m.postCount > 0 ? 'text-red-500 font-bold' : muted}`}>
                {m.postCount}件
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Footer />
      <BottomNavSpacer />
      <PageBottomNav />
    </div>
  )
}
