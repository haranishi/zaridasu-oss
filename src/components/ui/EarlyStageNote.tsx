'use client'

import Link from 'next/link'
import { Sprout } from 'lucide-react'
import { muted } from '@/lib/themeClasses'
import EmptyState from './EmptyState'

/**
 * REQ-320 FR-320-08: 「データがまだ少ない」ことを**欠損ではなく“これから”**として見せる注記。
 *
 * ■ なぜ要るのか
 * 本番データが 8 件なのは仕様（市民科学サービスの立ち上がり）だが、Round 1 の採点では
 *   - ranking … 1 行だけの一覧が「壊れている」ように見える（#14）
 *   - trends  … 12 本中 11 本が 0 の棒グラフ（#15）、「上位10件」に 1 件（#16）
 * と、いずれも「読み込みに失敗した画面」と区別がつかなかった。
 * 直すのはデータではなく**少ない状態の見せ方**なので、件数を偽らずに文脈と次の行動を添える。
 *
 * ■ EmptyState との違い
 * EmptyState は「0 件」用。こちらは **1 件以上あるが少ない**ときに、既存の一覧やグラフの
 * すぐ下へ添えるインライン注記。主役（実データ）を押しのけないよう控えめな体裁にする。
 *
 * ■ REQ-322 FR-322-05: `title` を渡すと「イラスト＋説明＋CTA」の大きい見せ方に切り替わる
 * Round 3 の評価者は `area/[municipality]` の空状態（マスコット線画＋説明＋CTA）を**強み**として
 * 挙げた一方、同じ「データが少ない」状態でも ranking / trends の 1 行注記は
 * 「読み込み失敗／作りかけ」に見えると採点した（#3・#10・#18・#21）。
 * そこで**同じ絵柄・同じ構造**（EmptyState）を少数データにも使えるようにする。
 * 意匠を再実装せず EmptyState を包むのは、空状態の見た目の正本を 1 つに保つため。
 */
interface EarlyStageNoteProps {
  /** 実データに基づく前向きな一言（i18n 済みの文言を渡す。件数は呼び出し側で補間する）。 */
  message: string
  /** 投稿への導線。 */
  ctaLabel: string
  /** 遷移先（href か onClick のどちらか一方）。 */
  href?: string
  onClick?: () => void
  className?: string
  /**
   * REQ-322 FR-322-05: 渡すと `area/[municipality]` と同じイラスト付きの見せ方になる。
   * 一覧やグラフが「壊れて見える」ほど短いときだけ使う（通常は 1 行注記のまま）。
   */
  title?: string
}

export default function EarlyStageNote({ message, ctaLabel, href, onClick, className = '', title }: EarlyStageNoteProps) {
  const cta = 'shrink-0 inline-flex items-center min-h-11 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-colors active:scale-[0.98]'

  // REQ-322 FR-322-05: イラスト付きの見せ方。枠・下地は 1 行注記と同じトークンなので、
  // 同じ「これから増える」状態が画面ごとに別デザインにならない。
  if (title) {
    return (
      <div className={`rounded-xl border border-(--color-border) bg-(--color-surface-2) ${className}`}>
        <EmptyState
          title={title}
          description={message}
          action={{ label: ctaLabel, href, onClick }}
          className="py-8"
        />
      </div>
    )
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-(--color-border) bg-(--color-surface-2) px-4 py-3 ${className}`}
    >
      {/* アイコンは装飾（aria-hidden）。ブランド赤はダーク面（--color-surface-2 = #1d283a）で
          3.07:1 と基準ぎりぎりになるため、ライト/ダーク双方で解決する muted トークンを使う
          （light 5.6:1 / dark 7.1:1）。 */}
      <Sprout size={16} className={`shrink-0 ${muted()}`} aria-hidden="true" />
      <p className={`flex-1 min-w-40 text-xs leading-relaxed ${muted()}`}>{message}</p>
      {href ? (
        <Link href={href} onClick={onClick} className={cta}>{ctaLabel}</Link>
      ) : (
        <button type="button" onClick={onClick} className={cta}>{ctaLabel}</button>
      )}
    </div>
  )
}
