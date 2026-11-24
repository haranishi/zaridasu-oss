'use client'

import { useProgress, useCollection } from '@/hooks/useProfile'
import ProgressCard from './ProgressCard'
import NextStepCard from './NextStepCard'
import WeeklyQuests from './WeeklyQuests'
import UnlockCelebration from './UnlockCelebration'

interface ProgressJourneyProps {
  userId: string
  dark: boolean
}

/**
 * REQ-251: 進捗の可視化・クエスト・解放演出をまとめる結合コンテナ（フィードバック層）。
 *
 * get_user_progress / get_user_collection を**それぞれ一度だけ**取得し、子（ProgressCard / NextStepCard /
 * WeeklyQuests / UnlockCelebration）へ配って二重フェッチを避ける（NFR-251-03）。
 * 上から：解放演出（新規があるときのみ表示）→ 現在レベル/XP → 次にできること → 調査ミッション、の一貫した並び。
 */
export default function ProgressJourney({ userId, dark }: ProgressJourneyProps) {
  const { progress, loading } = useProgress(userId)
  const { collection } = useCollection(userId)

  return (
    <div className="space-y-5">
      {/* 解放演出（レベルアップ / 機能解放 / 新図鑑カード・一度きり）。新規が無ければ null。 */}
      <UnlockCelebration level={progress?.level ?? null} collection={collection} userId={userId} dark={dark} />

      {/* 現在レベル / 次レベルまでの XP（既存 ProgressCard に取得済みデータを注入） */}
      <ProgressCard userId={userId} dark={dark} progress={progress} loading={loading} />

      {/* 次に解放される機能 + 図鑑の収集率 */}
      <NextStepCard progress={progress} collection={collection} dark={dark} />

      {/* 質・多様性へ誘う調査ミッション（任意・無罰） */}
      <WeeklyQuests collection={collection} dark={dark} />
    </div>
  )
}
