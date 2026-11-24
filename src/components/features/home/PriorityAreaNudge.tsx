'use client'
// REQ-173: 空間バイアス補正ナッジ。過少観測エリアを「優先調査エリア」として提示する。
// 内発的動機整合フレーミング（競争ではなく「ここの情報が足りていません＝あなたの観察が役立つ」）。
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/context/ThemeContext'
import { cardCls } from '@/lib/themeClasses'
import { getMunicipalitySlug } from '@/lib/constants'
import { usePriorityAreas } from '@/hooks/usePriorityAreas'

export default function PriorityAreaNudge() {
  const { dark } = useTheme()
  const { t } = useTranslation()
  const { areas, loading } = usePriorityAreas({ days: 90, limit: 5 })
  const card = cardCls(dark)
  const muted = dark ? 'text-slate-400' : 'text-gray-600'

  if (loading || areas.length === 0) return null

  return (
    <section className={`${card} p-4!`} aria-label={t('priorityArea.label')}>
      <div className="flex items-center gap-2 mb-1">
        {/* REQ-322 FR-322-03: amber-500(#f59e0b) をやめブランド赤へ。下の理由も参照。 */}
        <MapPin className="text-brand-600 dark:text-red-400" size={18} />
        <h2 className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{t('priorityArea.title')}</h2>
      </div>
      <p className={`text-xs mb-3 ${muted}`}>
        {t('priorityArea.description')}
      </p>
      <ul className="flex flex-wrap gap-2">
        {areas.map((a) => {
          const slug = getMunicipalitySlug(a.municipality)
          const inner = (
            <span className="inline-flex items-center gap-1">
              {a.municipality}
              <span className={`text-[11px] ${muted}`}>{t('priorityArea.countSuffix', { count: a.recentCount })}</span>
            </span>
          )
          return (
            <li key={a.municipality}>
              {slug ? (
                // REQ-318 FR-318-04 でコントラストを amber-800/amber-600 まで上げたが、
                // REQ-322 FR-322-03: **色そのものが余分**だった。ranking 画面の有彩色を実測すると
                // amber-500 / amber-600 / amber-800 の 3 値がこのチップだけのために出ており、
                // しかも枠線の amber-600(#d97706) は種別色の橙 #D55E00 とほぼ見分けがつかない
                // （＝近似色に別の意味を割り当てている・FR-322-03 が禁じている状態）。
                // このチップの意味は「押せる／ここへ行ける」なので、サイト全体の
                // 「行動＝ブランド赤」の規則に合流させる。すぐ下の非リンクチップ（灰）とは
                // 色ではなく**リンクかどうか**で区別が付くうえ、赤／灰の差も残る。
                // コントラスト: 枠線 #dc2626 on 白 4.83:1（UI 部品 3:1）／ラベル #b91c1c on 白 6.47:1。
                // REQ-323 FR-323-07: 390px 実測 106×32px でタップ域 44px 未満だった。
                // 高さだけを 44px にする（幅は市町村名で既に 44px を超えている）。
                <Link
                  href={`/area/${slug}`}
                  className={`inline-flex items-center justify-center min-h-11 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    dark ? 'border-red-500/40 text-red-400 hover:bg-red-500/10'
                      : 'border-brand-600 text-brand-700 hover:bg-brand-50'
                  }`}
                >
                  {inner}
                </Link>
              ) : (
                // 非リンク側は押せないのでタップ域の対象外だが、隣の押せるチップと
                // 高さが揃っていないと「同じ物が 2 種類」に見えるので寸法だけ合わせる。
                <span className={`inline-flex items-center justify-center min-h-11 text-xs px-3 py-1.5 rounded-full border ${
                  dark ? 'border-slate-600 text-slate-300' : 'border-gray-200 text-gray-600'
                }`}>{inner}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
