'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { aquariumCapacity, unlockedDecorations, getSpecies } from '@/lib/constants'
import type { CollectionEntry } from '@/hooks/useProfile'
import CrayfishIllustration from '@/components/ui/CrayfishIllustration'
import Crayfish3DStage from '@/components/features/collection/Crayfish3DStage'
import { cardCls, subheading, faint, muted } from '@/lib/themeClasses'

// 3D ビューアの基調色。ザリダスの主役＝アメリカザリガニの SpeciesOption.color を使う
// （「種ごとに色分け」/ REQ-224 の色覚安全パレット）。定数は起動時定数のためモジュール読込時に解決。
const CRAYFISH_COLOR = getSpecies('american')?.color ?? '#0072B2'

interface AquariumProps {
  collection: CollectionEntry[]
  /** DB 権威の貢献レベル（REQ-248）。容量・デコレーションはここから算出する。 */
  level: number | null
  dark: boolean
}

interface Specimen {
  key: string
  species: string
  topPct: number
  leftPct: number
  scale: number
  swimDuration: string
  swimDelay: string
  bobDuration: string
}

/**
 * REQ-250 FR-250-03 / FR-250-04（フェーズ1）: 個人の水槽（ビオトープ）。
 *
 * 自分が承認観察した種を、CSS キーフレームで動く「個体」として泳がせる（追加依存ゼロ・SVG+CSS のみ）。
 * 容量・デコレーションは DB 権威の level から算出（aquariumCapacity / unlockedDecorations）＝所有＝アカウント紐付け。
 * アニメは transform / opacity のみ（CLS 安全）。reduced-motion は globals.css の @media が停止させる（無償準拠）。
 */
export default function Aquarium({ collection, level, dark }: AquariumProps) {
  const { t } = useTranslation()

  // 観察済みの種（コレクションに行がある種のみ）。
  const observed = useMemo(() => collection.map((c) => c.species), [collection])

  // 容量は level から算出。ただし観察済み種は必ず 1 匹は登場させる（level 不明のフェイルオープン時も空にしない）。
  const capacity = Math.max(aquariumCapacity(level), observed.length)
  const decorations = unlockedDecorations(level)

  // 容量ぶんのスロットを観察済み種で循環して埋める。位置/速度は index 由来の決定的値（SSR 安定・乱数なし）。
  const specimens = useMemo<Specimen[]>(() => {
    if (observed.length === 0) return []
    const slots = Math.max(1, capacity)
    return Array.from({ length: slots }, (_, i): Specimen => {
      // observed.length > 0 は上の early return で保証済み（インデックスは常に有効）。
      const species = observed[i % observed.length]!
      return {
        key: `${species}-${i}`,
        species,
        topPct: 14 + ((i * 27) % 62),
        leftPct: 6 + (i % 3) * 9,
        scale: i % 2 === 0 ? 1 : 0.82,
        swimDuration: `${11 + (i % 4) * 2}s`,
        swimDelay: `${(i % 5) * 0.7}s`,
        bobDuration: `${4 + (i % 3)}s`,
      }
    })
  }, [observed, capacity])

  const tankBg = dark
    ? 'bg-linear-to-b from-teal-950 via-cyan-950 to-slate-950'
    : 'bg-linear-to-b from-cyan-100 via-sky-200 to-blue-200'

  const summary =
    observed.length > 0
      ? t('collection.aquarium.summary', { count: specimens.length })
      : t('collection.aquarium.empty')

  return (
    <section aria-label={t('collection.aquarium.title')} className={cardCls(dark)}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-sm font-semibold ${subheading(dark)}`}>{t('collection.aquarium.title')}</h2>
        <span className={`text-xs tabular-nums ${faint(dark)}`}>
          {t('collection.aquarium.capacity', { count: capacity })}
        </span>
      </div>

      {/* 水槽本体。高さを予約して CLS を防ぐ（アニメは transform のみ）。 */}
      <div
        role="img"
        aria-label={summary}
        className={`relative w-full h-64 sm:h-72 rounded-2xl overflow-hidden border ${
          dark ? 'border-slate-700/60' : 'border-sky-300/60'
        } ${tankBg}`}
      >
        {/* 水面のゆらぎ（装飾） */}
        <div
          aria-hidden="true"
          className={`aquarium-shimmer pointer-events-none absolute inset-x-0 top-0 h-10 ${
            dark ? 'bg-linear-to-b from-cyan-300/10 to-transparent' : 'bg-linear-to-b from-white/50 to-transparent'
          }`}
        />

        {observed.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-4xl" aria-hidden="true">🫧</span>
            <p className={`text-sm ${muted(dark)}`}>{t('collection.aquarium.empty')}</p>
          </div>
        ) : (
          specimens.map((s) => {
            const opt = getSpecies(s.species)
            return (
              <div
                key={s.key}
                aria-hidden="true"
                className="absolute"
                style={{ top: `${s.topPct}%`, left: `${s.leftPct}%`, transform: `scale(${s.scale})` }}
              >
                <div
                  className="aquarium-swimmer"
                  style={{ ['--swim-duration' as string]: s.swimDuration, ['--swim-delay' as string]: s.swimDelay }}
                >
                  <div className="aquarium-bobber" style={{ ['--bob-duration' as string]: s.bobDuration }}>
                    {s.species === 'american' ? (
                      <CrayfishIllustration className="w-20 h-auto drop-shadow-sm" clawClassName="aquarium-claw" />
                    ) : (
                      <span className="text-4xl drop-shadow-sm">{opt?.emoji ?? '🐸'}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}

        {/* 気泡（装飾・生き物がいるときのみ） */}
        {observed.length > 0 && (
          <>
            <span
              aria-hidden="true"
              className="aquarium-bubble absolute bottom-6 left-[20%] w-2 h-2 rounded-full bg-white/60"
              style={{ ['--bubble-duration' as string]: '7s' }}
            />
            <span
              aria-hidden="true"
              className="aquarium-bubble absolute bottom-8 left-[68%] w-1.5 h-1.5 rounded-full bg-white/50"
              style={{ ['--bubble-duration' as string]: '5.5s', ['--bubble-delay' as string]: '1.5s' }}
            />
          </>
        )}

        {/* デコレーション（水槽の底に並べる。レベルで段階解放） */}
        <div aria-hidden="true" className="absolute bottom-1 inset-x-0 flex items-end justify-center gap-3 text-2xl px-3 pb-1 select-none">
          {decorations.map((d) => (
            <span key={d.key} title={t(d.labelKey)}>{d.emoji}</span>
          ))}
        </div>
      </div>

      {/* 実 3D ビューア（FR-250-04 フェーズ2）。既定は 2D、「3Dで見る」で three チャンクを遅延読み込み。
          three/react-three-fiber はこの Crayfish3DStage 経由の dynamic import に閉じ込め、初期ロードに載せない。 */}
      <Crayfish3DStage color={CRAYFISH_COLOR} dark={dark} />

      {/* デコレーション一覧（テキストで解放状況を明示＝色/絵文字だけに依存しない） */}
      <div className="mt-3">
        <h3 className={`text-xs font-semibold mb-1.5 ${muted(dark)}`}>{t('collection.aquarium.decorationsTitle')}</h3>
        {decorations.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {decorations.map((d) => (
              <li
                key={d.key}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
                  dark ? 'bg-slate-800 text-slate-300' : 'bg-gray-100 text-gray-700'
                }`}
              >
                <span aria-hidden="true">{d.emoji}</span>
                {t(d.labelKey)}
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-xs ${faint(dark)}`}>{t('collection.aquarium.noDecorations')}</p>
        )}
      </div>
    </section>
  )
}
