import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import type { RelatedPost } from '@/types/post'
import type { Database } from '@/types/database.types'

interface SurveyRequestFilters {
  status?: string
  species?: string
  municipality?: string
  // REQ-085: 自分が立てた依頼のみフィルタ
  owner?: 'me'
  // REQ-085: 'urgentFirst' の場合 urgency desc + created_at desc
  sort?: 'newest' | 'urgentFirst'
}

interface SurveyRequest {
  id: string
  user_id: string
  lat: number
  lng: number
  municipality: string | null
  species: string
  reason: string | null
  urgency: string
  status: string
  created_at: string
  closed_at: string | null
  user_profiles?: { display_name: string | null; avatar_emoji: string | null } | null
  [key: string]: unknown
}

interface CreateRequestParams {
  lat: number
  lng: number
  municipality: string
  species: string
  reason: string
  urgency?: string
}

interface UseSurveyRequestsResult {
  requests: SurveyRequest[]
  loading: boolean
  error: string | null
  fetchRequests: () => Promise<void>
  createRequest: (params: CreateRequestParams) => Promise<SurveyRequest>
  updateStatus: (id: string, status: string) => Promise<void>
}

/**
 * 調査依頼の一覧取得・作成・ステータス更新を行うフック
 */
export function useSurveyRequests(filters: SurveyRequestFilters = {}): UseSurveyRequestsResult {
  const { user } = useAuth()
  const [requests, setRequests] = useState<SurveyRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // REQ-190: fetchRequests が実際に user を使うのは owner==='me' のときの user.id だけ。
  // user オブジェクト全体を依存にすると、トークンリフレッシュ等で user 参照が変わる度に再生成され、
  // owner 未指定のホームでも survey_requests が過剰フェッチ・初回二重フェッチされる。
  // 実際に使う値(ownerId)のみを依存にして不要な再フェッチを止める。
  const ownerId = filters.owner === 'me' ? (user?.id ?? null) : null

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // REQ-103: 一覧/詳細で参照する列のみを取得（egress 削減 + 将来の PII 列漏洩予防）
      // REQ-243: 生 lat/lng は列 GRANT で剥奪済み。公開用の粗化列 display_lat/lng を lat/lng へエイリアスする
      // （地図マーカーは粗化座標で表示。owner='me' フィルタは user_id で引き続き機能する）。
      let query = supabase
        .from('survey_requests')
        .select('id, user_id, lat:display_lat, lng:display_lng, municipality, species, reason, urgency, status, created_at, closed_at, response_count')

      // REQ-085: ソート（urgentFirst は urgency desc + created_at desc）
      if (filters.sort === 'urgentFirst') {
        query = query.order('urgency', { ascending: false }).order('created_at', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      if (filters.status && filters.status !== 'all') {
        // status フィルタ UI の値（'all' を除外済み）を survey_requests.status の enum へ狭める。
        query = query.eq('status', filters.status as 'open' | 'responded' | 'closed')
      } else if (!filters.status) {
        // 既定: closed を除外
        query = query.in('status', ['open', 'responded'])
      }
      // species フィルタ UI の値。survey_requests.species は 'unknown' を含む点が posts と異なる。
      if (filters.species) query = query.eq('species', filters.species as 'american' | 'bullfrog' | 'unknown')
      if (filters.municipality) query = query.eq('municipality', filters.municipality)
      // REQ-085/REQ-190: owner='me' は自分の user_id でフィルタ（RLS が真の防衛線）。
      // 依存に含めた ownerId を使う（user 全体を参照しない）。
      if (ownerId) {
        query = query.eq('user_id', ownerId)
      }

      const { data, error: fetchError } = await query.limit(200)
      if (fetchError) throw fetchError
      setRequests((data as SurveyRequest[]) || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.species, filters.municipality, filters.sort, ownerId])

  const createRequest = useCallback(async ({ lat, lng, municipality, species, reason, urgency }: CreateRequestParams): Promise<SurveyRequest> => {
    // REQ-183 FR-183-04: 文言ではなく安定した i18n キーを Error.message に載せて throw し、
    // 表示側 (SurveyRequestForm) で t() する。キーが解決できない外部エラーはそのまま表示する。
    if (!user) throw new Error('survey.errors.loginRequired')
    // REQ-213 FR-213-05 / AC-02: insert 前に共有 zod スキーマで検証する。
    //   - reason の上限を DB CHECK（char_length BETWEEN 1 AND 300）に一致させ、
    //     旧インライン検証の 500 → 300 の検証ドリフトを解消（301〜500 字を DB 到達前に弾く）。
    //   - urgency の列挙（normal|urgent）・座標もスキーマで検証する。
    // バンドル最適化（NFR-213-01）: このフックは home `/` の同期モジュールグラフ（HomeInteractive）
    //   に乗るため、zod を含む schemas を**動的 import**して送信時のみ読み込み、`/` の
    //   perf-budget（10KB）に zod を混入させない。
    // ⚠️ これはクライアント側の「第一の網」。最終防御は DB CHECK / RLS（auth.uid()=user_id）。
    const resolvedUrgency = urgency || 'normal'
    const { surveyRequestInputSchema } = await import('@/lib/validation/schemas')
    const parsed = surveyRequestInputSchema.safeParse({
      species,
      reason,
      urgency: resolvedUrgency,
      lat,
      lng,
    })
    if (!parsed.success) {
      // 表示側 (SurveyRequestForm) は `survey.errors.*` キーのみ t() 解決するため、
      // スキーマ違反を既存の survey.errors.* キーへマップして throw する
      //（座標→outOfBounds、それ以外〔reason 長超過等〕→reasonTooLong）。
      const firstPath = parsed.error.issues[0]?.path[0]
      throw new Error(
        firstPath === 'lat' || firstPath === 'lng'
          ? 'survey.errors.outOfBounds'
          : 'survey.errors.reasonTooLong',
      )
    }
    const { data, error: insertError } = await supabase
      .from('survey_requests')
      .insert({
        user_id: user.id,
        lat,
        lng,
        municipality,
        // REQ-213: 上の zod 検証済みの値を使う（species/urgency は enum に狭まっている）。
        species: parsed.data.species,
        reason,
        urgency: parsed.data.urgency,
      })
      // REQ-243: 生 lat/lng は列 GRANT で剥奪済みのため無指定 .select()（=全列）だと 42501 になる。
      // 返却は粗化列(display_*)を lat/lng へエイリアスして受ける（作成直後の一覧反映に十分）。
      .select('id, user_id, lat:display_lat, lng:display_lng, municipality, species, reason, urgency, status, created_at, closed_at, response_count')
      .single()
    if (insertError) throw insertError
    return data as unknown as SurveyRequest
  }, [user])

  const updateStatus = useCallback(async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status }
    if (status === 'closed') updates.closed_at = new Date().toISOString()
    // supabase-js 2.110 の RejectExcessProperties は index signature を持つ Record を弾くため、
    // 書き込み時に survey_requests の Update 型へ明示キャストする（型のみ・ランタイム不変）。
    const { error: updateError } = await supabase
      .from('survey_requests')
      .update(updates as Database['public']['Tables']['survey_requests']['Update'])
      .eq('id', id)
    if (updateError) throw updateError
  }, [])

  return { requests, loading, error, fetchRequests, createRequest, updateStatus }
}

interface UseSurveyRequestResult {
  request: SurveyRequest | null
  relatedPosts: RelatedPost[]
  loading: boolean
  // REQ-192 (FR-192-01): 取得失敗（エラー）を「見つからない（空）」と分離して呼び出し側へ返す。
  // 握りつぶし（console.error + setRequest(null)）を廃止し、エラーメッセージを state で保持する。
  error: string | null
  fetchRequest: () => Promise<void>
}

/**
 * 単一の調査依頼を取得するフック
 */
export function useSurveyRequest(id: string | undefined): UseSurveyRequestResult {
  const [request, setRequest] = useState<SurveyRequest | null>(null)
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([])
  const [loading, setLoading] = useState(true)
  // REQ-192: 取得失敗時のみ非 null。成功（空応答含む）・アボート時は null のまま。
  const [error, setError] = useState<string | null>(null)

  const fetchRequest = useCallback(async (signal?: AbortSignal) => {
    // id 未定義時は loading を解除して終了（以前は loading=true のまま固まっていた）
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    // REQ-192: 再試行時に前回のエラーをクリア（成功で消える / 失敗で再設定される）。
    setError(null)
    try {
      // REQ-157: survey_requests → user_profiles → posts の 3 本逐次取得を、集約 RPC で 1 往復に統合する。
      // RPC は SECURITY INVOKER で RLS を尊重し、本体 + 投稿者プロフィール + 関連投稿（承認済み最大10件）を返す。
      // signal が未定義の場合は .abortSignal を呼ばない（undefined を渡すと内部で例外になり得る）
      let q = supabase.rpc('get_survey_request_detail', { p_id: id })
      if (signal) q = q.abortSignal(signal)
      const { data, error: rpcError } = await q
      if (signal?.aborted) return
      if (rpcError) throw rpcError

      const detail = data as { request: SurveyRequest; related_posts: RelatedPost[] } | null
      // REQ-192: 取得は成功したが該当なし → 空状態（error は立てない）。
      if (!detail || !detail.request) {
        setRequest(null)
        setRelatedPosts([])
        return
      }
      setRequest(detail.request)
      setRelatedPosts(detail.related_posts ?? [])
    } catch (err) {
      // NFR-192-01: ユーザー起因でないキャンセル（アンマウント/アボート）はエラー扱いしない。
      if (signal?.aborted) return
      // REQ-192 (FR-192-01): 握りつぶさず error state へ載せ、画面側でエラー UI + 再試行に使う。
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const controller = new AbortController()
    fetchRequest(controller.signal)
    return () => controller.abort()
  }, [fetchRequest])

  // REQ-090 修正: 戻り値の fetchRequest を useCallback で安定化しないと、
  // 呼び出し側が `useEffect(() => { fetchRequest() }, [fetchRequest])` で監視した時に
  // 毎レンダーで参照が変わり無限ループになる
  const refetch = useCallback(() => fetchRequest(), [fetchRequest])

  return { request, relatedPosts, loading, error, fetchRequest: refetch }
}
