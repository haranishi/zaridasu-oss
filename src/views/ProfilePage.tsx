'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, User, MapPin, MessageCircle, FileText } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { useProfile, useBadgeDefinitions } from '@/hooks/useProfile'
import { useCountUp } from '@/hooks/useCountUp'
import { detectNewBadgeIds } from '@/lib/achievement'
import { pageBg, cardCls, faint } from '@/lib/themeClasses'
import Footer from '@/components/layout/Footer'
import { LoadingState, Skeleton } from '@/components/ui/Skeleton'
import ErrorAlert from '@/components/ui/ErrorAlert'

// REQ-184 FR-184-06: 投稿日付を i18n.language に連動した BCP-47 ロケールで整形する（旧: 'ja-JP' 固定）。
const DATE_LOCALE_TAG: Record<string, string> = { ja: 'ja-JP', en: 'en-US', zh: 'zh-CN', ko: 'ko-KR' }

/**
 * REQ-226 (FR-226-07 / AC-06): 観察進捗カウンタの数値表示。
 * - 初回可視時に 0→value のカウントアップ（useCountUp）を行う「装飾」。
 * - 値は本体：reduced-motion / IntersectionObserver 非対応でも最終値が DOM に必ず出る（静的フォールバック）。
 * - module スコープで定義し（再マウントで count-up が再発火しないよう）安定参照にする。
 */
function CountUpValue({ value, className }: { value: number; className?: string }) {
  const { value: shown, ref } = useCountUp(value)
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={className}>{shown}</div>
  )
}

interface RecentPost {
  id: string
  species: string
  info_type: string
  municipality: string | null
  created_at: string
  photos: string[] | null
}

interface ProfilePageProps {
  userId?: string
}

export default function ProfilePage({ userId: paramUserId }: ProfilePageProps) {
  const { user } = useAuth()
  const { dark } = useTheme()
  const router = useRouter()
  const { t, i18n } = useTranslation()

  const targetUserId = paramUserId
  // REQ-192 (FR-192-01/03): フックが返す error / refetch を活用し、取得失敗を
  // 「プロフィールが見つかりません」（空状態）と分離する（従来はエラーを捨てていた）。
  const { profile, loading, error: fetchError, refetch } = useProfile(targetUserId)
  const allBadges = useBadgeDefinitions()

  // 自分のプロフィール → マイページにリダイレクト
  const isOwnProfile = !paramUserId || (user && paramUserId === user.id)
  useEffect(() => {
    if (isOwnProfile && user) {
      router.replace('/dashboard')
    }
  }, [isOwnProfile, user, router])

  // REQ-226 (FR-226-06): 新規獲得バッジ（前回表示時に未知だった ID）を検知し、解放アニメを 1 回だけ再生する。
  //   既知バッジ ID 集合を localStorage に保持し（scopeKey = 対象ユーザー id でプロフィールごとに分離）、
  //   未知 ID が増えたら新規とみなす（detectNewBadgeIds）。サーバスキーマ/トリガーは変更しない（表示側のみ）。
  //   マウント後の useEffect で判定するため hydration 不一致を起こさない。再訪時は既知集合に含まれ再生されない。
  //   フックは早期 return より前で宣言する（Rules of Hooks）。profile 未取得時は空集合のまま。
  const [newlyUnlockedBadges, setNewlyUnlockedBadges] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (!profile || !targetUserId) return
    const ids = ((profile.badges as Array<string | { id: string }> | undefined) ?? []).map(
      (b) => (typeof b === 'string' ? b : b.id),
    )
    setNewlyUnlockedBadges(detectNewBadgeIds(targetUserId, ids))
  }, [profile, targetUserId])

  if (isOwnProfile && user) {
    return null
  }

  const card = cardCls(dark)
  const bg = pageBg(dark)
  const muted = dark ? 'text-slate-400' : 'text-gray-600'
  const heading = dark ? 'text-slate-200' : 'text-gray-700'

  // REQ-184: 種別/情報種別の表示は既存 species.*/infoType.* を再利用。emoji のみ表示側で付与する。
  const SPECIES_EMOJI: Record<string, string> = { american: '🦞', bullfrog: '🐸' }
  const speciesLabel = (key: string) => {
    const emoji = SPECIES_EMOJI[key]
    return i18n.exists(`species.${key}`) ? `${emoji ? `${emoji} ` : ''}${t(`species.${key}`)}` : key
  }
  const infoTypeLabel = (key: string) => (i18n.exists(`infoType.${key}`) ? t(`infoType.${key}`) : key)

  if (loading) {
    return (
      <LoadingState className={`min-h-screen ${bg}`}>
        <div className="h-14 border-b border-(--color-border)" />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
          {/* プロフィールヘッダー相当 */}
          <div className={card}>
            <div className="flex items-start gap-4">
              <Skeleton className="w-12 h-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          </div>
          <div className={card}>
            <Skeleton className="h-4 w-24 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </LoadingState>
    )
  }

  // REQ-192 (FR-192-03/04): 取得失敗（エラー）は空状態（notFound）と分離し、再試行ボタンを提示する。
  // ErrorAlert は role="alert" を内蔵（REQ-195）。空状態文言（profilePage.notFound）は流用しない。
  if (fetchError) {
    return (
      <div className={`min-h-screen ${bg}`}>
        <header className={`sticky top-0 z-10 border-b ${dark ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80 text-white' : 'bg-red-600 text-white shadow-md'}`}>
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/" aria-label={t('common.back')} className={`p-1 -ml-1 rounded-lg transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-red-700'}`}>
              <ArrowLeft size={22} />
            </Link>
            <User size={18} />
            <h1 className="font-bold text-base">{t('profilePage.header')}</h1>
          </div>
        </header>
        <div className="max-w-sm mx-auto px-4 py-20 space-y-3 text-center">
          <ErrorAlert message={t('common.loadError')} />
          <button
            type="button"
            onClick={() => { refetch() }}
            className="text-sm font-bold px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className={`min-h-screen ${bg}`}>
        <header className={`sticky top-0 z-10 border-b ${dark ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80 text-white' : 'bg-red-600 text-white shadow-md'}`}>
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/" aria-label={t('common.back')} className={`p-1 -ml-1 rounded-lg transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-red-700'}`}>
              <ArrowLeft size={22} />
            </Link>
            <User size={18} />
            <h1 className="font-bold text-base">{t('profilePage.header')}</h1>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <p className={muted}>{t('profilePage.notFound')}</p>
        </div>
      </div>
    )
  }

  const earnedIds = new Set((profile.badges ?? []).map((b: string | { id: string }) => typeof b === 'string' ? b : b.id))

  return (
    <div className={`min-h-screen ${bg}`}>
      <header className={`sticky top-0 z-10 border-b ${dark ? 'bg-slate-950/95 backdrop-blur-md border-slate-800/80 text-white' : 'bg-red-600 text-white shadow-md'}`}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className={`p-1 -ml-1 rounded-lg transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-red-700'}`}>
            <ArrowLeft size={22} />
          </Link>
          <User size={18} />
          <h1 className="font-bold text-base">{t('profilePage.header')}</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* プロフィールヘッダー */}
        <div className={card}>
          <div className="flex items-start gap-4">
            <span className="text-4xl">{profile.avatar_emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className={`text-lg font-bold truncate ${dark ? 'text-slate-100' : 'text-gray-900'}`}>
                  {profile.display_name as React.ReactNode}
                </h2>
              </div>
              {profile.bio ? <p className={`text-sm mt-1 ${muted}`}>{String(profile.bio)}</p> : null}
            </div>
          </div>

          {/* 統計 */}
          {/* REQ-226 (FR-226-07): 観察の積み上げ（投稿件数・コメント件数）に 0→N のカウントアップ演出を付与する。
              集計元は既存の get_user_profile（post_count / comment_count）を再利用し、新規 RPC は追加しない。
              numeric な値のみ CountUpValue（最終値が必ず DOM に出る静的フォールバック付き）で表示し、
              activeArea は count を含む i18n 文字列のため従来どおり静的表示にする。 */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: t('profilePage.stats.posts'), value: Number(profile.post_count) || 0, numeric: true, icon: <FileText size={14} /> },
              { label: t('profilePage.stats.comments'), value: Number(profile.comment_count) || 0, numeric: true, icon: <MessageCircle size={14} /> },
              { label: t('profilePage.stats.activeArea'), value: t('profilePage.stats.municipalityCount', { count: Number(profile.municipality_count) }), numeric: false, icon: <MapPin size={14} /> },
            ].map(s => (
              <div key={s.label} className={`text-center p-3 rounded-xl ${dark ? 'bg-slate-800/60' : 'bg-gray-50'}`}>
                <div className={`flex items-center justify-center gap-1 text-xs mb-1 ${faint(dark)}`}>
                  {s.icon} {s.label}
                </div>
                {s.numeric ? (
                  <CountUpValue value={s.value as number} className={`text-xl font-bold tabular-nums ${dark ? 'text-slate-100' : 'text-gray-900'}`} />
                ) : (
                  <div className={`text-xl font-bold ${dark ? 'text-slate-100' : 'text-gray-900'}`}>{s.value as React.ReactNode}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* バッジ */}
        <div className={card}>
          <h3 className={`text-sm font-semibold mb-3 ${heading}`}>{t('profilePage.badges')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allBadges.map(badge => {
              const earned = earnedIds.has(badge.id)
              // FR-226-06: 新規解放バッジは pop アニメ＋淡い発光（軽量質感）を 1 回再生する。
              const justUnlocked = newlyUnlockedBadges.has(badge.id)
              return (
                <div
                  key={badge.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl transition-colors ${
                    justUnlocked ? 'animate-badge-unlock shadow-lg shadow-yellow-500/30' : ''
                  } ${
                    earned
                      ? dark ? 'bg-slate-800/80' : 'bg-gray-50'
                      : dark ? 'bg-slate-800/30 opacity-40' : 'bg-gray-50/50 opacity-40'
                  }`}
                >
                  <span className="text-2xl shrink-0">{badge.icon as React.ReactNode}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${earned ? (dark ? 'text-slate-200' : 'text-gray-800') : (dark ? 'text-slate-400' : 'text-gray-400')}`}>
                      {badge.name as React.ReactNode}
                    </p>
                    <p className={`text-xs truncate ${faint(dark)}`}>{badge.description as React.ReactNode}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 最近の投稿 */}
        {(profile.recent_posts as RecentPost[] | undefined)?.length ? (
          <div className={card}>
            <h3 className={`text-sm font-semibold mb-3 ${heading}`}>{t('profilePage.recentPosts')}</h3>
            <div className="space-y-2">
              {(profile.recent_posts as RecentPost[]).map(post => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`}
                >
                  {post.photos?.[0] && (
                    <Image src={post.photos[0]} alt={t('profilePage.postPhotoAlt', { species: speciesLabel(post.species) })} width={40} height={40} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{speciesLabel(post.species)}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${dark ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-600'}`}>
                        {infoTypeLabel(post.info_type)}
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 ${faint(dark)}`}>
                      {post.municipality && `${post.municipality} · `}
                      {new Date(post.created_at).toLocaleDateString(DATE_LOCALE_TAG[i18n.language] ?? 'ja-JP')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* ランキングへのリンク */}
        <div className="text-center">
          <Link
            href="/ranking"
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors ${
              // REQ-325 FR-325-01: hover で下地が red-50 になると red-600 は 4.41:1 で AA 未満。
              dark ? 'text-red-400 hover:bg-slate-800' : 'text-brand-700 hover:bg-red-50'
            }`}
          >
            🏆 {t('profilePage.viewRanking')}
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  )
}
