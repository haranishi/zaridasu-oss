'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useProgress, useCollection } from '@/hooks/useProfile'
import { useUnlocks } from '@/hooks/useUnlocks'
import Header from '@/components/layout/Header'
import BottomNav from '@/components/layout/BottomNav'
import { BottomNavSpacer } from '@/components/layout/PageBottomNav'
import Footer from '@/components/layout/Footer'
import UnlockTeaser from '@/components/ui/UnlockTeaser'
import EducationalNote from '@/components/features/collection/EducationalNote'
import Aquarium from '@/components/features/collection/Aquarium'
import CollectionDex from '@/components/features/collection/CollectionDex'
import { pageBg, cardCls, subheading, faint } from '@/lib/themeClasses'
import { LoadingState, Skeleton } from '@/components/ui/Skeleton'

/**
 * REQ-250 (Part A): コレクション（図鑑・水槽）ページ。
 *
 * - ログイン必須（未ログインは / へ）。
 * - Lv5（FEATURE_UNLOCKS.collection）で解放。未満はロック表示（解放予告ティーザー＝壊れたページにしない）。
 *   ゲートは DB 権威の level（useProgress）× useUnlocks。所有状態（user_collection）の書き込みは
 *   トリガーのみ＝サーバー強制（REQ-249 collection: enforcement='server' の UI 側）。
 * - 解放後: 教育メッセージ（FR-250-05・必須/目立つ）→ 水槽 → 図鑑 の順に表示。
 */
export default function CollectionPage() {
  const { user, loading: authLoading } = useAuth()
  const { dark } = useTheme()
  const { t } = useTranslation()
  const router = useRouter()

  const { progress, loading: progressLoading } = useProgress(user?.id)
  const { collection, loading: collectionLoading } = useCollection(user?.id)
  const { isUnlocked, unlockLevelOf } = useUnlocks(progress?.level)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [authLoading, user, router])

  const bg = pageBg(dark)

  if (authLoading || progressLoading) {
    return (
      <LoadingState className={`min-h-screen ${bg}`}>
        <div className="h-14 border-b border-(--color-border)" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          <div className={cardCls(dark)}>
            <Skeleton className="h-4 w-40 mb-3" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className={cardCls(dark)}>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </LoadingState>
    )
  }

  if (!user) return null

  const unlocked = isUnlocked('collection')
  const unlockLevel = unlockLevelOf('collection') ?? 5

  return (
    <div className={`min-h-screen ${bg}`}>
      <Header
        onPostClick={() => router.push('/map?post=1')}
        onLoginClick={mode => router.push(`/?auth=${mode}`)}
        onSurveyClick={() => router.push('/requests?create=1')}
      />

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className={`flex items-center gap-2 text-lg font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
            <Sparkles size={20} className={dark ? 'text-amber-400' : 'text-amber-500'} aria-hidden="true" />
            {t('collection.header')}
          </h1>
          <p className={`text-sm mt-1 ${faint(dark)}`}>{t('collection.subtitle')}</p>
        </div>

        {!unlocked ? (
          // ロック時: 非表示にせず「解放予告」を出す（目標化・壊れたページにしない / FR-250-02）。
          <div className={cardCls(dark)}>
            <h2 className={`flex items-center gap-2 text-sm font-semibold mb-2 ${subheading(dark)}`}>
              <Lock size={15} aria-hidden="true" />
              {t('unlocks.features.collection')}
            </h2>
            <UnlockTeaser unlockLevel={unlockLevel} currentXp={progress?.xp} dark={dark} />
            <p className={`text-xs mt-2 ${faint(dark)}`}>{t('collection.lockedHint')}</p>
          </div>
        ) : (
          <>
            {/* 教育メッセージ（必須・目立つ位置） */}
            <EducationalNote dark={dark} />

            {/* 水槽（動く個体） */}
            <Aquarium collection={collection} level={progress?.level ?? null} dark={dark} />

            {/* 図鑑（種カードが文脈で埋まる） */}
            {collectionLoading ? (
              <div className={cardCls(dark)}>
                <Skeleton className="h-4 w-24 mb-3" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Skeleton className="h-40 rounded-xl" />
                  <Skeleton className="h-40 rounded-xl" />
                </div>
              </div>
            ) : (
              <CollectionDex collection={collection} dark={dark} />
            )}
          </>
        )}
      </div>

      {/* REQ-323 FR-323-01: 旧 `pb-20 md:pb-0` は「md 以上でナビが消える」前提の名残で、
          (a) 768〜1023px ではナビが出たまま逃げ幅だけ消えてフッターが潜り、
          (b) 1024px 以上では 80px の空帯だけが残っていた。
          逃げ幅はフッターの**後ろ**に置き、高さと出し分けは BottomNavSpacer（単一の正）に任せる。 */}
      <Footer />
      <BottomNavSpacer />
      <BottomNav onPostClick={() => router.push('/map?post=1')} onLoginClick={mode => router.push(`/?auth=${mode}`)} />
    </div>
  )
}
