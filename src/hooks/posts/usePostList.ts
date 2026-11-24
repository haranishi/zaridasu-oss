import { useState, useCallback, useEffect, useRef } from 'react'
import { subDays } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { PUBLIC_COORD_COLUMN, selectPublicPostsForMap } from '@/lib/data/posts'
import { PAGE_SIZE, SPECIES, INFO_TYPES, QUERY_LIMITS } from '@/lib/constants'
import { logError } from '@/lib/errorHandler'
import { useToastContext } from '@/context/ToastContext'
import { escapeIlikePattern, escapePostgrestValue } from '@/lib/postgrest'
import type { Post, PostFilter } from '@/types'
import type L from 'leaflet'

// REQ-282 D-4: buildQuery の select で実際に取得する列の契約（Post 全列ではない）。
// lat/lng はエイリアス（display_lat/display_lng → lat/lng）で受ける。status や
// reporter_ip 等は取得しないため、Post として読む消費側が非取得列に触ると
// 実行時 undefined になる——その境界をこの Pick で明示する。select 文字列を
// 変更したら本型も同時に更新すること。
type PostListRow = Pick<
  Post,
  | 'id' | 'created_at' | 'lat' | 'lng' | 'species' | 'info_type' | 'municipality'
  | 'comment' | 'photos' | 'count' | 'survey_duration_minutes' | 'locality' | 'water_body'
>

interface UsePostListResult {
  posts: Post[]
  loading: boolean
  hasMore: boolean
  loadingMore: boolean
  /** REQ-273: 初期取得の失敗。呼び出し側（HomePage）が永続バナー＋再試行を表示する。 */
  error: boolean
  fetchPosts: () => Promise<void>
  fetchMore: () => Promise<void>
}

interface UsePostListOptions {
  mapBounds?: L.LatLngBounds | null
  boundsFilterEnabled?: boolean
}

/** 投稿一覧のデータフェッチ・無限スクロールを管理するカスタムフック */
export function usePostList(filters: PostFilter, options: UsePostListOptions = {}): UsePostListResult {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const toast = useToastContext()
  const { t } = useTranslation()

  // REQ-274 FR-274-01: in-flight クエリの中断。フィルタ/地図境界の高速切替時に
  // 「遅く解決した古いクエリが新しい結果を上書きする」(last-resolved-wins) のを防ぐ。
  // fetchPosts/fetchMore とも呼び出しごとに新しい controller を張り、前回を abort する。
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const buildQuery = useCallback(() => {
    const ascending = filters.sort === 'oldest'

    // 列の構成（REQ-231 の地理列、REQ-243 の粗化座標）と公開条件は lib/data/posts.ts が持つ。
    let query = selectPublicPostsForMap(supabase).order('created_at', { ascending })

    if (filters.period !== '0') {
      const since = subDays(new Date(), parseInt(filters.period)).toISOString()
      query = query.gte('created_at', since)
    }
    if (filters.municipality) query = query.eq('municipality', filters.municipality)
    if (filters.species) query = query.eq('species', filters.species)
    if (filters.infoType) query = query.eq('info_type', filters.infoType)
    if (filters.search) {
      // REQ-138 Phase 1: 任意カラムフィルタ差し込みを防ぐためエスケープを噛ます。
      // TODO(REQ-138): 中期的には textSearch('comment', input, { type: 'websearch' })
      // へ移行し、.or() の文字列連結を撤廃する。tsvector 列 + GIN index が必要。
      const kw = filters.search.toLowerCase()
      const matchedSpecies = SPECIES.filter((s: { label: string; value: string }) =>
        s.label.includes(kw)
      ).map((s: { label: string; value: string }) => s.value)
      const matchedInfoTypes = INFO_TYPES.filter((t: { label: string; value: string }) =>
        t.label.includes(kw)
      ).map((t: { label: string; value: string }) => t.value)

      const safePattern = escapeIlikePattern(filters.search)
      const orParts = [
        `comment.ilike.%${safePattern}%`,
        `municipality.ilike.%${safePattern}%`,
        ...(matchedSpecies.length
          ? [`species.in.(${matchedSpecies.map(escapePostgrestValue).join(',')})`]
          : []),
        ...(matchedInfoTypes.length
          ? [`info_type.in.(${matchedInfoTypes.map(escapePostgrestValue).join(',')})`]
          : []),
      ]
      query = query.or(orParts.join(','))
    }

    if (options.boundsFilterEnabled && options.mapBounds) {
      // REQ-243: 生 lat/lng は列 GRANT 剥奪で WHERE にも使えないため、粗化列で範囲フィルタする
      // （hidden 行は display_* が NULL のため範囲比較で除外される＝地図に出ない）。列名は
      // lib/data/posts.ts の PUBLIC_COORD_COLUMN が持つ。
      query = query
        .gte(PUBLIC_COORD_COLUMN.lat, options.mapBounds.getSouth())
        .lte(PUBLIC_COORD_COLUMN.lat, options.mapBounds.getNorth())
        .gte(PUBLIC_COORD_COLUMN.lng, options.mapBounds.getWest())
        .lte(PUBLIC_COORD_COLUMN.lng, options.mapBounds.getEast())
    }

    return query
  }, [filters, options.boundsFilterEnabled, options.mapBounds])

  const fetchPosts = useCallback(async () => {
    if (!navigator.onLine) { setLoading(false); return }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setHasMore(true)
    setError(false)
    // 進行中の fetchMore を中断した場合、その finally は（aborted のため）フラグを
    // 触らない。ここで確実に解除しないと loadingMore が立ちっぱなしになり
    // 以後の追加読込がガードで永久にスキップされる。
    setLoadingMore(false)
    try {
      const boundsMode = Boolean(options.boundsFilterEnabled && options.mapBounds)
      const end = boundsMode ? QUERY_LIMITS.posts - 1 : PAGE_SIZE - 1
      const { data, error } = await buildQuery().range(0, end).abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (error) throw error
      // REQ-243/282: alias 選択(lat:display_lat)のため推論型が使えず unknown 経由が必要だが、
      // まず PostListRow（select の契約）へ狭めてから既存消費側の Post[] へ広げる。
      const rows = (data ?? []) as unknown as PostListRow[]
      setPosts(rows as Post[])
      setHasMore(!boundsMode && (data?.length ?? 0) >= PAGE_SIZE)
    } catch (err) {
      // 中断（新しい要求への切替/アンマウント）はエラー扱いしない。
      if (controller.signal.aborted) return
      logError(err as Error, 'usePostList:fetchPosts')
      // REQ-273 FR-273-02: 消えるトーストではなく error state を立て、HomePage が
      // 永続バナー＋再試行を出す（「0件」と「取得失敗」をユーザーが区別できるように）。
      if (navigator.onLine) setError(true)
    } finally {
      // 中断時は後続の要求が loading を管理するため触らない。
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [buildQuery, options.boundsFilterEnabled, options.mapBounds])

  const fetchMore = useCallback(async () => {
    if (options.boundsFilterEnabled) return
    if (loadingMore || !hasMore || !navigator.onLine) return
    // DOM要素数の上限チェック（QUERY_LIMIT_POSTSで制限）
    if (posts.length >= QUERY_LIMITS.posts) {
      setHasMore(false)
      return
    }
    setLoadingMore(true)
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    try {
      const { data, error } = await buildQuery()
        .range(posts.length, posts.length + PAGE_SIZE - 1)
        .abortSignal(controller.signal)
      if (controller.signal.aborted) return
      if (error) throw error
      const moreRows = (data ?? []) as unknown as PostListRow[]
      setPosts((prev) => [...prev, ...(moreRows as Post[])])
      setHasMore((data?.length ?? 0) >= PAGE_SIZE)
    } catch (err) {
      if (controller.signal.aborted) return
      logError(err as Error, 'usePostList:fetchMore')
      if (navigator.onLine) {
        // REQ-277 FR-277-01: ハードコード日本語を i18n キーへ（既存一覧は保てているため
        // 追加読込の失敗はトースト継続で十分）。
        toast.error(t('postList.loadMoreError'))
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }, [buildQuery, posts.length, loadingMore, hasMore, toast, t, options.boundsFilterEnabled])

  return { posts, loading, hasMore, loadingMore, error, fetchPosts, fetchMore }
}
