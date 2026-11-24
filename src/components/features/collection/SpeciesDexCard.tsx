'use client'

import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, CircleDashed } from 'lucide-react'
import type { SpeciesOption } from '@/lib/constants'
import { DEX_INFO_TYPE_TOTAL, DEX_MUNICIPALITY_TOTAL } from '@/lib/constants'
import type { CollectionEntry } from '@/hooks/useProfile'
import { cardCls, faint, muted } from '@/lib/themeClasses'

// REQ-184 と同じ BCP-47 ロケール整形（初観察日をユーザー言語で表示）。
const DATE_LOCALE_TAG: Record<string, string> = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', ko: 'ko-KR' }

interface SpeciesDexCardProps {
  species: SpeciesOption
  /** 未観察なら undefined（図鑑カードはグレーで表示）。 */
  entry: CollectionEntry | undefined
  dark: boolean
}

/** 小さな進捗バー（transform ではなく width だが静的値のためアニメ無し＝CLS 非影響）。 */
function Meter({ seen, total, dark }: { seen: number; total: number; dark: boolean }) {
  const pct = total > 0 ? Math.round((Math.min(seen, total) / total) * 100) : 0
  return (
    <div
      className={`h-1.5 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}
      role="progressbar"
      aria-valuenow={seen}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div
        className="h-full rounded-full bg-linear-to-r from-teal-400 to-cyan-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/**
 * REQ-250 FR-250-01: 種の「図鑑カード」。観察の有無 / info_type 網羅 / 市区町村網羅 / 初観察日 /
 * 検証済み数を、承認済み観察に応じて「埋まっていく」形で表示する。ProfilePage のバッジ図鑑
 * （解放/未解放をグレーで並べるショーケース）の様式を踏襲。解放/未解放は色だけでなくテキストで判別可能。
 */
export default function SpeciesDexCard({ species, entry, dark }: SpeciesDexCardProps) {
  const { t, i18n } = useTranslation()
  const observed = !!entry
  const infoSeen = entry?.info_types_seen.length ?? 0
  const muniSeen = entry?.municipalities_seen.length ?? 0
  const verified = entry?.verified_count ?? 0
  // 「コンプリート」は達成可能な軸（info_type 5 種すべて）で判定する（市区町村 25 は探索の伸びしろ）。
  const complete = observed && infoSeen >= DEX_INFO_TYPE_TOTAL

  const speciesName = i18n.exists(`species.${species.value}`) ? t(`species.${species.value}`) : species.label
  const firstDate = entry?.first_observed_at
    ? new Date(entry.first_observed_at).toLocaleDateString(DATE_LOCALE_TAG[i18n.language] ?? 'ja-JP')
    : null

  return (
    <div
      className={`${cardCls(dark)} relative transition-colors ${observed ? '' : 'opacity-45'}`}
      aria-label={`${speciesName}: ${observed ? t('collection.dex.observed') : t('collection.dex.notObserved')}`}
    >
      {complete && (
        <span className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full bg-linear-to-r from-amber-400 to-yellow-500 text-white shadow-sm">
          {t('collection.dex.complete')}
        </span>
      )}

      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center ${dark ? 'bg-slate-800' : 'bg-gray-50'} ${observed ? '' : 'grayscale'}`}>
          <Image src={species.image} alt="" width={56} height={56} className="w-full h-full object-cover" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true">{species.emoji}</span>
            <h3 className={`text-sm font-bold truncate ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{speciesName}</h3>
          </div>
          <p className={`text-[11px] italic truncate ${faint(dark)}`}>{species.scientificName}</p>
          {/* 解放/未解放は色だけに依存させずテキスト＋アイコンで明示（NFR-250-02 / REQ-224）。 */}
          <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
            observed ? (dark ? 'text-teal-300' : 'text-teal-700') : faint(dark)
          }`}>
            {observed
              ? <CheckCircle2 size={13} aria-hidden="true" />
              : <CircleDashed size={13} aria-hidden="true" />}
            {observed ? t('collection.dex.observed') : t('collection.dex.notObserved')}
          </p>
        </div>
      </div>

      <dl className="mt-3 space-y-2.5">
        <div>
          <div className={`flex items-center justify-between text-xs mb-1 ${muted(dark)}`}>
            <dt>{t('collection.dex.infoTypes')}</dt>
            <dd className="tabular-nums">{infoSeen} / {DEX_INFO_TYPE_TOTAL}</dd>
          </div>
          <Meter seen={infoSeen} total={DEX_INFO_TYPE_TOTAL} dark={dark} />
        </div>
        <div>
          <div className={`flex items-center justify-between text-xs mb-1 ${muted(dark)}`}>
            <dt>{t('collection.dex.municipalities')}</dt>
            <dd className="tabular-nums">{muniSeen} / {DEX_MUNICIPALITY_TOTAL}</dd>
          </div>
          <Meter seen={muniSeen} total={DEX_MUNICIPALITY_TOTAL} dark={dark} />
        </div>
      </dl>

      <div className={`mt-3 flex items-center justify-between text-xs ${faint(dark)}`}>
        <span>{t('collection.dex.verifiedCount', { count: verified })}</span>
        {firstDate ? <span>{t('collection.dex.firstObserved', { date: firstDate })}</span> : null}
      </div>
    </div>
  )
}
