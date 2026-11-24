'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MapPin, Eye, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { getDateLocale } from '@/lib/dateLocales'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import Breadcrumb from '@/components/ui/Breadcrumb'
import Footer from '@/components/layout/Footer'
import PageHeader from '@/components/layout/PageHeader'
import PageBottomNav, { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import EmptyState from '@/components/ui/EmptyState'
import type { MunicipalityInfo } from '@/lib/constants'
import { PAGE_CONTAINER } from '@/lib/layout'

interface Post {
  id: string
  species: string
  info_type: string
  municipality: string | null
  // REQ-243: 呼び出し側は公開用の粗化列 display_lat/lng を lat/lng へエイリアスして渡す。
  // hidden 記録は NULL になり得るため nullable（本コンポーネントは lat/lng を描画に使わない）。
  lat: number | null
  lng: number | null
  photos: string[] | null
  comment: string | null
  created_at: string
}

interface AreaPageClientProps {
  municipality: MunicipalityInfo
  posts: Post[]
  speciesCounts: Record<string, number>
  infoTypeCounts: Record<string, number>
  nearbyMunicipalities: (MunicipalityInfo & { distance: number })[]
  speciesOptions: { value: string; label: string; color: string }[]
  infoTypeOptions: { value: string; label: string; emoji: string }[]
}

export default function AreaPageClient({
  municipality,
  posts,
  speciesCounts,
  infoTypeCounts,
  nearbyMunicipalities,
  speciesOptions,
  infoTypeOptions,
}: AreaPageClientProps) {
  const { dark } = useTheme()
  const { t, i18n } = useTranslation()
  const [filterSpecies, setFilterSpecies] = useState<string | null>(null)

  const filteredPosts = filterSpecies
    ? posts.filter((p) => p.species === filterSpecies)
    : posts

  const card = `rounded-2xl shadow-xs p-5 ${dark ? 'bg-slate-900 border border-slate-800/60' : 'bg-white'}`
  const heading = dark ? 'text-slate-100' : 'text-gray-800'
  const muted = dark ? 'text-slate-400' : 'text-gray-600'

  function speciesLabel(v: string) {
    return speciesOptions.find((s) => s.value === v)?.label ?? v
  }
  function speciesColor(v: string) {
    return speciesOptions.find((s) => s.value === v)?.color ?? '#6B7280'
  }
  function infoTypeLabel(v: string) {
    return infoTypeOptions.find((t) => t.value === v)?.label ?? v
  }
  function infoTypeEmoji(v: string) {
    return infoTypeOptions.find((t) => t.value === v)?.emoji ?? ''
  }

  return (
    <div className={`min-h-screen ${dark ? 'bg-slate-950' : 'bg-gray-50'}`}>
      {/* REQ-320 FR-320-02: 「白 + 戻る矢印 + ピン」だけの 4 種目のヘッダーを廃止し、
          共通の PageHeader（ロゴ + ページ名）へ寄せる。h1 はここが唯一なので asH1 で残す。 */}
      <PageHeader title={municipality.name} asH1 />

      <Breadcrumb items={[
        { label: '地域別', href: '/area' },
        { label: municipality.name },
      ]} />

      <div className={`${PAGE_CONTAINER} py-6 space-y-5`}>
        {/* 概要 */}
        <div className={card}>
          <h2 className={`text-lg font-bold mb-2 ${heading}`}>
            {municipality.name}の外来生物情報
          </h2>
          <p className={`text-sm ${muted}`}>
            秋田県{municipality.name}における外来生物の目撃・捕獲情報です。全{posts.length}件の報告があります。
          </p>
        </div>

        {/* 種別統計 */}
        {Object.keys(speciesCounts).length > 0 && (
          <div className={card}>
            <h3 className={`font-bold mb-3 text-sm ${heading}`}>種別ごとの報告数</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterSpecies(null)}
                // REQ-320 FR-320-04: 選択中の赤を bg-red-500(#EF4444・白文字 3.76:1＝AA 不足) から
                // ブランド赤 bg-brand-600(#DC2626・4.83:1) へ。同じ「押せる赤」を 1 色にする。
                className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-xs font-medium transition-colors ${
                  !filterSpecies
                    ? 'bg-brand-600 text-white'
                    : dark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                すべて ({posts.length})
              </button>
              {speciesOptions.map((s) => {
                const count = speciesCounts[s.value] || 0
                if (count === 0) return null
                return (
                  <button
                    key={s.value}
                    onClick={() => setFilterSpecies(filterSpecies === s.value ? null : s.value)}
                    className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-xs font-medium transition-colors ${
                      filterSpecies === s.value
                        ? 'text-white'
                        : dark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    style={filterSpecies === s.value ? { backgroundColor: s.color } : undefined}
                  >
                    {s.label} ({count})
                  </button>
                )
              })}
            </div>
            {/* REQ-227: 種ハブ(ピラー)への内部リンク（クラスター→ピラーへオーソリティを集約） */}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {speciesOptions.map((s) => (
                <Link
                  key={`sp-link-${s.value}`}
                  href={`/species/${s.value}`}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  {s.label}について詳しく →
                </Link>
              ))}
            </div>
            {/* REQ-228 FR-228-08 / AC-06: 親(地域)→子(種×地域 /area/[slug]/[species])への内部リンク。
                報告のある種だけリンクし（件数 0 は隔離=noindex のため導線を張らない）、地域クラスタの面を作る。 */}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {speciesOptions.map((s) => {
                if ((speciesCounts[s.value] || 0) === 0) return null
                return (
                  <Link
                    key={`sp-area-link-${s.value}`}
                    href={`/area/${municipality.slug}/${s.value}`}
                    className="text-red-600 hover:underline dark:text-red-400"
                  >
                    {municipality.name}の{s.label}情報 →
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* 情報種別統計 */}
        {Object.keys(infoTypeCounts).length > 0 && (
          <div className={card}>
            <h3 className={`font-bold mb-3 text-sm ${heading}`}>情報種別</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {infoTypeOptions.map((t) => {
                const count = infoTypeCounts[t.value] || 0
                if (count === 0) return null
                return (
                  <div key={t.value} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
                    dark ? 'bg-slate-800/60' : 'bg-gray-50'
                  }`}>
                    <span>{t.emoji}</span>
                    <span className={muted}>{t.label}</span>
                    <span className={`ml-auto font-bold ${heading}`}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 投稿一覧 */}
        <div>
          <h3 className={`font-bold mb-3 text-sm ${heading}`}>
            報告一覧 ({filteredPosts.length}件)
          </h3>
          {filteredPosts.length === 0 ? (
            // REQ-222 (FR-222-03): 否定形「この地域の報告はまだありません」→ 肯定形 + 投稿 CTA に統一。
            <div className={card}>
              <EmptyState
                className="py-10"
                title={t('area.postsEmptyTitle', { municipality: municipality.name })}
                description={t('empty.contributionDesc')}
                action={{ label: t('empty.postCta'), href: '/' }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className={`block ${card} hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start gap-3">
                    {/* 種別インジケーター */}
                    <div
                      className="w-2 h-2 rounded-full mt-2 shrink-0"
                      style={{ backgroundColor: speciesColor(post.species) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${heading}`}>
                          {speciesLabel(post.species)}
                        </span>
                        <span className={`text-xs ${muted}`}>
                          {infoTypeEmoji(post.info_type)} {infoTypeLabel(post.info_type)}
                        </span>
                      </div>
                      {post.comment && (
                        <p className={`text-xs ${muted} line-clamp-2`}>
                          {post.comment}
                        </p>
                      )}
                      <div className={`flex items-center gap-3 mt-1.5 text-xs ${dark ? 'text-slate-400' : 'text-gray-400'}`}>
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {format(new Date(post.created_at), 'yyyy/MM/dd', { locale: getDateLocale(i18n.language) })}
                        </span>
                        {post.photos && post.photos.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye size={11} />
                            写真{post.photos.length}枚
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 近隣地域 */}
        {nearbyMunicipalities.length > 0 && (
          <div className={card}>
            <h3 className={`font-bold mb-3 text-sm ${heading}`}>近隣の地域</h3>
            <div className="flex flex-wrap gap-2">
              {nearbyMunicipalities.map((m) => (
                <Link
                  key={m.slug}
                  href={`/area/${m.slug}`}
                  className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-xs font-medium transition-colors ${
                    dark ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <MapPin size={11} className="inline mr-1" />
                  {m.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
      <BottomNavSpacer />
      <PageBottomNav />
    </div>
  )
}
