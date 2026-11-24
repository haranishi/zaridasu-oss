import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { profileUpdateSchema } from '@/lib/validation/schemas'
import type { Database } from '@/types/database.types'

interface Profile {
  id: string
  display_name: string | null
  avatar_emoji: string | null
  post_count?: number
  badges?: string[]
  [key: string]: unknown
}

interface UseProfileResult {
  profile: Profile | null
  loading: boolean
  error: string | null
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  refetch: () => Promise<void>
}

export function useProfile(userId: string | undefined): UseProfileResult {
  const { t } = useTranslation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async (signal?: AbortSignal) => {
    if (!userId) { setLoading(false); return }
    if (!navigator.onLine) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_user_profile', { p_user_id: userId })
      if (signal?.aborted) return
      if (rpcError) throw rpcError
      setProfile(data as Profile | null)
    } catch (err: unknown) {
      if (signal?.aborted) return
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    const controller = new AbortController()
    fetchProfile(controller.signal)
    return () => controller.abort()
  }, [fetchProfile])

  const updateProfile = async (updates: Partial<Profile>) => {
    // REQ-213 FR-213-05 / AC-03: 従来は updates（Partial<Profile>）を**無検証で update** していた
    //   （display_name 1〜20 / bio <=100 のクライアント検証が皆無で、超過は DB CHECK 任せ）。
    //   update 前に共有 zod スキーマ（部分更新 .partial()・許可リスト）で検証する。display_name/bio
    //   のみを対象に拾い（その他の列は素通し）、失敗時は i18n キーを t() で当該言語に解決して throw。
    //   表示側（EditProfileModal）が err.message を直接表示するため、ここで文字列化する（FR-213-08）。
    //   最終防御は user_profiles の DB CHECK 制約（schema.sql）。
    const subset: Record<string, unknown> = {}
    if ('display_name' in updates) subset.display_name = updates.display_name
    if ('bio' in updates) subset.bio = updates.bio
    if ('avatar_emoji' in updates) subset.avatar_emoji = updates.avatar_emoji
    if (Object.keys(subset).length > 0) {
      const parsed = profileUpdateSchema.safeParse(subset)
      if (!parsed.success) {
        const key = parsed.error.issues[0]?.message ?? 'validation.generic'
        throw new Error(t(key))
      }
    }
    // supabase-js 2.110 の RejectExcessProperties は index signature を持つ Partial<Profile>
    // （post_count/badges 等の非列や [key: string] を含む）を弾くため、書き込み時に
    // user_profiles の Update 型へ明示キャストする（型のみ・ランタイム不変。実検証は上の zod）。
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(updates as Database['public']['Tables']['user_profiles']['Update'])
      .eq('id', userId!)
    if (updateError) throw updateError
    await fetchProfile()
  }

  return { profile, loading, error, updateProfile, refetch: fetchProfile }
}

interface RankingEntry {
  user_id: string
  display_name: string | null
  avatar_emoji: string | null
  post_count: number
  rank: number
  badge_count?: number
  [key: string]: unknown
}

interface UseRankingOptions {
  period?: string
  limit?: number
  /** REQ-278 FR-278-03: false の間はフェッチしない（タブ表示まで遅延）。既定 true。 */
  enabled?: boolean
}

interface UseRankingResult {
  ranking: RankingEntry[]
  loading: boolean
  // REQ-192 (FR-192-01): 取得失敗を空配列に握りつぶさず error として返し、空（0件）と分離する。
  error: string | null
  // REQ-192 (FR-192-04): エラー UI の再試行ボタンから呼べる公開 API。
  refetch: () => Promise<void>
}

export function useRanking({ period = 'all', limit = 20, enabled = true }: UseRankingOptions = {}): UseRankingResult {
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRanking = useCallback(async (signal?: AbortSignal) => {
    if (!navigator.onLine) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('get_user_ranking', {
      p_limit: limit,
      p_offset: 0,
      p_period: period,
    })
    // NFR-192-01: アンマウント/アボート時は state を一切更新しない（エラーも立てない）。
    if (signal?.aborted) return
    if (rpcError) {
      // REQ-192: 失敗は error へ。ranking は直前の状態を保持（空に化けさせない）。
      setError(rpcError.message)
    } else {
      setRanking((data as RankingEntry[]) ?? [])
    }
    setLoading(false)
  }, [period, limit])

  useEffect(() => {
    if (!enabled) return // REQ-278: タブがアクティブになるまでフェッチしない
    const controller = new AbortController()
    fetchRanking(controller.signal)
    return () => controller.abort()
  }, [fetchRanking, enabled])

  // REQ-192: 再試行用は引数なしで呼べる安定参照（useEffect 監視時の無限ループ回避）。
  const refetch = useCallback(() => fetchRanking(), [fetchRanking])

  return { ranking, loading, error, refetch }
}

// REQ-171: 発見の多様性エントリ（投稿数競争に代わるコレクション指標）
export interface DiversityEntry {
  user_id: string
  display_name: string | null
  avatar_emoji: string | null
  info_type_coverage: number
  species_count: number
  municipality_count: number
  diversity_score: number
}

interface UseDiversityResult {
  diversity: DiversityEntry[]
  loading: boolean
  // REQ-192 (FR-192-01): 取得失敗を空配列に握りつぶさず error として返し、空（0件）と分離する。
  error: string | null
  // REQ-192 (FR-192-04): エラー UI の再試行ボタンから呼べる公開 API。
  refetch: () => Promise<void>
}

export function useDiversity({ limit = 50, enabled = true }: { limit?: number; enabled?: boolean } = {}): UseDiversityResult {
  const [diversity, setDiversity] = useState<DiversityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDiversity = useCallback(async (signal?: AbortSignal) => {
    if (!navigator.onLine) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('get_user_diversity', { p_limit: limit, p_offset: 0 })
    // NFR-192-01: アンマウント/アボート時は state を一切更新しない（エラーも立てない）。
    if (signal?.aborted) return
    if (rpcError) {
      setError(rpcError.message)
    } else {
      setDiversity((data as DiversityEntry[]) ?? [])
    }
    setLoading(false)
  }, [limit])

  useEffect(() => {
    if (!enabled) return // REQ-278: タブがアクティブになるまでフェッチしない
    const controller = new AbortController()
    fetchDiversity(controller.signal)
    return () => controller.abort()
  }, [fetchDiversity, enabled])

  const refetch = useCallback(() => fetchDiversity(), [fetchDiversity])

  return { diversity, loading, error, refetch }
}

// REQ-235: 品質連動ランキングエントリ（検証済み投稿数＝量と、承認率/定点率/GPS良好率＝質をペアで称える）。
// いいね数・総投稿数を主軸にしない（Goodhart 対策）。集計は get_user_quality RPC（生 PII を返さない）。
export interface QualityEntry {
  user_id: string
  display_name: string | null
  avatar_emoji: string | null
  verified_count: number
  total_count: number
  approval_rate: number | null
  structured_count: number
  structured_rate: number | null
  gps_good_count: number
  gps_good_rate: number | null
  avg_confidence: number | null
  quality_score: number
}

interface UseQualityResult {
  quality: QualityEntry[]
  loading: boolean
}

export function useQuality({ limit = 50, enabled = true }: { limit?: number; enabled?: boolean } = {}): UseQualityResult {
  const [quality, setQuality] = useState<QualityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return // REQ-278: タブがアクティブになるまでフェッチしない
    const controller = new AbortController()
    async function fetchQuality() {
      if (!navigator.onLine) { setLoading(false); return }
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_quality', { p_limit: limit, p_offset: 0 })
      if (!controller.signal.aborted) {
        setQuality(error ? [] : (data as QualityEntry[]) ?? [])
        setLoading(false)
      }
    }
    fetchQuality()
    return () => controller.abort()
  }, [limit, enabled])

  return { quality, loading }
}

// REQ-248: 貢献レベル / 経験値（XP）進捗。get_user_progress RPC（集計のみ・is_public 準拠・
// DB 権威）が返す。xp/level は改竄不能で、xp_into_level / xp_for_next_level でプログレスバーを描く。
// approved_count＝検証済み（承認）投稿数で、ダッシュボードの進捗表示を検証済みベースにする（FR-248-06）。
export interface Progress {
  xp: number
  level: number
  xp_into_level: number
  xp_for_next_level: number
  approved_count: number
}

interface UseProgressResult {
  progress: Progress | null
  loading: boolean
  error: string | null
}

export function useProgress(userId: string | undefined): UseProgressResult {
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    async function fetchProgress() {
      if (!navigator.onLine) { setLoading(false); return }
      setLoading(true)
      setError(null)
      const { data, error: rpcError } = await supabase.rpc('get_user_progress', { p_user_id: userId! })
      // アンマウント/アボート時は state を一切更新しない（useProfile / useRanking と同方針）。
      if (controller.signal.aborted) return
      if (rpcError) {
        setError(rpcError.message)
      } else {
        // RETURNS TABLE（単一行）。非公開プロフィールを他人が見た場合は 0 行 → null。
        setProgress((data as Progress[] | null)?.[0] ?? null)
      }
      setLoading(false)
    }
    fetchProgress()
    return () => controller.abort()
  }, [userId])

  return { progress, loading, error }
}

// REQ-250: コレクション（図鑑/水槽）状態。get_user_collection RPC（集計のみ・is_public 準拠・DB 権威）が返す。
// 承認済み投稿から導出され改竄不能。種ごとに 1 行で、info_types_seen / municipalities_seen / verified_count /
// first_observed_at を持つ。図鑑カードの「埋まり具合」と水槽の個体はこれを唯一の正として描く（FR-250-01/02）。
export interface CollectionEntry {
  species: 'american' | 'bullfrog'
  first_observed_at: string | null
  info_types_seen: string[]
  municipalities_seen: string[]
  verified_count: number
}

interface UseCollectionResult {
  collection: CollectionEntry[]
  loading: boolean
  error: string | null
}

export function useCollection(userId: string | undefined): UseCollectionResult {
  const [collection, setCollection] = useState<CollectionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    const controller = new AbortController()
    async function fetchCollection() {
      if (!navigator.onLine) { setLoading(false); return }
      setLoading(true)
      setError(null)
      const { data, error: rpcError } = await supabase.rpc('get_user_collection', { p_user_id: userId! })
      // アンマウント/アボート時は state を一切更新しない（useProgress と同方針）。
      if (controller.signal.aborted) return
      if (rpcError) {
        setError(rpcError.message)
      } else {
        setCollection((data as CollectionEntry[] | null) ?? [])
      }
      setLoading(false)
    }
    fetchCollection()
    return () => controller.abort()
  }, [userId])

  return { collection, loading, error }
}

// REQ-155: 実取得列（icon）と型のフィールド名を一致させ、index signature を外して
// 列の増減を型で検知できるようにする。emoji ではなく icon が正。
interface BadgeDefinition {
  id: string
  name: string
  description: string
  icon: string
  sort_order: number
}

export function useBadgeDefinitions(): BadgeDefinition[] {
  const [badges, setBadges] = useState<BadgeDefinition[]>([])

  useEffect(() => {
    if (!navigator.onLine) return
    // REQ-164: useProfile / useRanking と同様に AbortController でアンマウント後の
    // setBadges をガードし、Supabase クエリ自体にも signal を渡してリクエストをキャンセルする。
    const controller = new AbortController()
    // REQ-103: バッジ表示で利用する列のみを取得（egress 削減 + 将来の列追加時の漏洩予防）
    supabase
      .from('badge_definitions')
      .select('id, name, description, icon, sort_order')
      .order('sort_order')
      .abortSignal(controller.signal)
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (data) setBadges(data as BadgeDefinition[])
      })
    return () => controller.abort()
  }, [])

  return badges
}
