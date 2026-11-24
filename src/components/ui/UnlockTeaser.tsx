'use client'

import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { xpForLevel } from '@/lib/constants'
import { faint } from '@/lib/themeClasses'

interface UnlockTeaserProps {
  /** 解放に必要なレベル（unlockLevelOf の戻り）。 */
  unlockLevel: number
  /** 機能名の i18n ラベルキー（任意。あれば見出しに併記）。 */
  featureLabelKey?: string
  /** 現在の累計 XP（任意）。渡すと「あと N XP」を表示する。 */
  currentXp?: number | null
  dark: boolean
  className?: string
}

/**
 * REQ-249 FR-249-03: ロック機能の「解放予告」ティーザー。ロックを壁ではなく目標として見せる。
 *
 * NFR-249-04（a11y）: ロック状態は色/アイコンだけに依存させず、必ずテキストで明示する
 *   （「レベル N で解放されます」）。Lock アイコンは装飾（aria-hidden）。
 */
export default function UnlockTeaser({
  unlockLevel,
  featureLabelKey,
  currentXp,
  dark,
  className,
}: UnlockTeaserProps) {
  const { t } = useTranslation()
  const remaining =
    typeof currentXp === 'number' ? Math.max(0, xpForLevel(unlockLevel) - currentXp) : null

  return (
    <p className={`flex items-start gap-1.5 text-xs ${faint(dark)} ${className ?? ''}`}>
      <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        {featureLabelKey ? <span className="font-medium">{t(featureLabelKey)}</span> : null}
        {featureLabelKey ? ' — ' : null}
        {t('unlocks.lockedAtLevel', { level: unlockLevel })}
        {remaining != null && remaining > 0 ? ` (${t('unlocks.remainingXp', { xp: remaining })})` : ''}
      </span>
    </p>
  )
}
