'use client'

import { useEffect, useState } from 'react'
import { BADGES } from '@/lib/constants'
import { cardCls, faint, subheading } from '@/lib/themeClasses'
import { detectNewThresholds } from '@/lib/achievement'

interface BadgeSectionProps {
  // REQ-248 FR-248-06: 承認済み（検証済み）投稿数で駆動する。以前は stats.myTotal（未承認/却下を含む
  // 全投稿数）で駆動しており未検証投稿を数える Goodhart ホールがあった。ここは検証済み数を受け取る。
  verifiedCount?: number
  dark: boolean
}

export default function BadgeSection({ verifiedCount = 0, dark }: BadgeSectionProps) {
  const allEarned = BADGES.every(b => verifiedCount >= b.min)
  const nextBadge = BADGES.find(b => verifiedCount < b.min)
  const remaining = nextBadge ? nextBadge.min - verifiedCount : 0
  const progressPct = nextBadge ? Math.round((verifiedCount / nextBadge.min) * 100) : 100

  // REQ-226 (FR-226-06): 今回新たに到達したしきい値（＝新規解放バッジ）を検知し、解放アニメを 1 回だけ再生する。
  //   ダッシュボードは常に本人のマイページなので scopeKey は固定。判定は localStorage 上の「前回見た値」との
  //   差分（detectNewThresholds）。初回や再訪では空集合になり再生されない（AC-05）。
  //   REQ-248: 駆動値を全投稿数→検証済み数に切り替えたため scopeKey も 'dashboard_verified' に変更し、
  //   旧基準の保存値と混同して誤発火しないようにする。
  //   マウント後の useEffect で判定するため SSR/CSR の hydration 不一致を起こさない。
  //   reduced-motion は globals.css のグローバル @media が animation を潰すため自動で「通常表示」になる。
  const [newlyUnlocked, setNewlyUnlocked] = useState<Set<number>>(() => new Set())
  useEffect(() => {
    setNewlyUnlocked(detectNewThresholds('dashboard_verified', verifiedCount, BADGES.map(b => b.min)))
  }, [verifiedCount])

  return (
    <div className={cardCls(dark)}>
      <h2 className={`text-sm font-semibold mb-3 ${subheading(dark)}`}>獲得バッジ</h2>

      {allEarned ? (
        <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${
          dark ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'
        }`}>
          🏆 全バッジコンプリート！おめでとうございます！
        </div>
      ) : nextBadge && (
        <div className={`mb-4 px-4 py-3 rounded-xl border ${
          dark ? 'bg-slate-800/60 border-slate-700' : 'bg-gray-50 border-gray-100'
        }`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-xs font-semibold ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
              次のバッジまであと <span className="text-red-500">{remaining}件</span>
            </span>
            <span className={`text-xs ${faint(dark)}`}>
              {nextBadge.emoji} {nextBadge.label}（{nextBadge.min}件）
            </span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-gray-200'}`}>
            <div
              className="h-full rounded-full bg-linear-to-r from-red-500 to-rose-400 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className={`text-xs mt-1 ${faint(dark)}`}>{verifiedCount} / {nextBadge.min} 件</p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {BADGES.map((b) => {
          const earned = verifiedCount >= b.min
          // FR-226-06: 今回新規解放したバッジは pop アニメ＋淡い発光（box-shadow の軽量質感）を付与。
          const justUnlocked = newlyUnlocked.has(b.min)
          return (
            <div
              key={b.label}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all min-w-[80px] ${
                justUnlocked ? 'animate-badge-unlock shadow-lg shadow-yellow-500/30' : ''
              } ${
                earned
                  ? dark ? 'border-yellow-500/40 bg-yellow-500/10' : 'border-yellow-200 bg-yellow-50'
                  : dark ? 'border-slate-700 bg-slate-800/30 opacity-40' : 'border-gray-100 bg-gray-50 opacity-40'
              }`}
              title={`承認済み${b.min}件で獲得`}
            >
              <span className="text-2xl">{b.emoji}</span>
              <span className={`text-xs font-semibold text-center ${earned ? (dark ? 'text-yellow-400' : 'text-yellow-700') : faint(dark)}`}>
                {b.label}
              </span>
              <span className={`text-xs ${faint(dark)}`}>{b.desc}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
