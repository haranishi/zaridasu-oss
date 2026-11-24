'use client'

import { useTranslation } from 'react-i18next'
import { useProgress, type Progress } from '@/hooks/useProfile'
import { cardCls, faint, muted, subheading } from '@/lib/themeClasses'

interface ProgressCardProps {
  userId: string | undefined
  dark: boolean
  // REQ-251: 親（ProgressJourney）が get_user_progress を一度だけ取得して注入し、二重フェッチを避ける
  //   （NFR-251-03: /dashboard の性能バジェットを悪化させない）。未指定なら従来どおり内部で取得する。
  progress?: Progress | null
  loading?: boolean
}

/**
 * REQ-248: 貢献レベル / 経験値（XP）カード。
 *
 * DB 権威の get_user_progress（改竄不能・品質連動）が返す xp/level と、現レベル内の獲得 XP
 * （xp_into_level）/ 次レベルまでの必要総量（xp_for_next_level）でプログレスバーを描く。
 * 進捗の分母は「検証済み（承認）投稿」ベース（approved_count を明示）で、未検証の量を称えない
 * （Goodhart 対策 / FR-248-06）。文言はブランドの穏やかな声（です・ます・「！」不使用）。
 */
export default function ProgressCard({ userId, dark, progress: injectedProgress, loading: injectedLoading }: ProgressCardProps) {
  const { t } = useTranslation()
  // 注入があればそれを使い、無ければ内部で取得（後方互換）。注入時は userId を渡さず内部 fetch を止める。
  const injected = injectedProgress !== undefined
  const fetched = useProgress(injected ? undefined : userId)
  const progress = injected ? injectedProgress : fetched.progress
  const loading = injectedLoading !== undefined ? injectedLoading : fetched.loading

  // 取得前はスケルトン、取得できない（匿名/非公開/エラー）ときは何も出さない（軽量・非干渉）。
  if (loading) {
    return (
      <div className={cardCls(dark)}>
        <div className="h-4 w-24 rounded-sm bg-(--color-divider) animate-pulse" />
        <div className="h-2 w-full rounded-full bg-(--color-divider) animate-pulse mt-4" />
      </div>
    )
  }
  if (!progress) return null

  const { xp, level, xp_into_level, xp_for_next_level, approved_count } = progress
  const span = xp_for_next_level > 0 ? xp_for_next_level : 1
  const into = Math.max(0, Math.min(xp_into_level, span))
  const pct = Math.round((into / span) * 100)
  const remaining = Math.max(0, span - into)

  return (
    <div className={cardCls(dark)}>
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-sm font-semibold ${subheading(dark)}`}>{t('progress.title')}</h2>
        <span className={`text-xs ${faint(dark)}`}>{t('progress.xp', { xp })}</span>
      </div>

      <div className="flex items-center gap-4">
        {/* レベルバッジ */}
        <div
          className={`shrink-0 w-14 h-14 rounded-2xl flex flex-col items-center justify-center border ${
            dark ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-yellow-200 bg-yellow-50'
          }`}
        >
          <span className={`text-[10px] leading-none ${faint(dark)}`}>{t('progress.levelLabel')}</span>
          <span className={`text-xl font-bold leading-tight ${dark ? 'text-yellow-300' : 'text-yellow-700'}`}>
            {level}
          </span>
        </div>

        {/* XP プログレスバー */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-semibold ${muted(dark)}`}>{t('progress.level', { level })}</span>
            <span className={`text-xs ${faint(dark)}`}>{into} / {span} XP</span>
          </div>
          <div
            className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}
            role="progressbar"
            aria-label={t('progress.barLabel')}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-linear-to-r from-yellow-400 to-amber-500 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={`text-xs mt-1 ${faint(dark)}`}>{t('progress.toNext', { remaining })}</p>
        </div>
      </div>

      <p className={`text-xs mt-3 ${muted(dark)}`}>{t('progress.verified', { count: approved_count })}</p>
    </div>
  )
}
