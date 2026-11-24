'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { escapeIlikePattern } from '@/lib/postgrest'
import { ADMIN_PAGE_SIZE } from '@/lib/constants'
import {
  approvePost,
  countPostsByStatus,
  deletePost as deletePostRow,
  rejectPost,
  selectAdminPosts,
  selectAdminPostsForCsv,
  setPostOfficial,
} from '@/lib/data/posts-admin'
import { useAuth } from '@/context/AuthContext'
import { writeAuditLog } from '@/lib/auditLog'
import { useToastContext } from '@/context/ToastContext'
import { logError } from '@/lib/errorHandler'
import { removePostMedia } from '@/lib/postMedia'
import { normalizeAIResult } from '@/lib/normalizeAIResult'
import type { AdminPost } from '@/types/post'
import type { Species, InfoType } from '@/types'

/**
 * REQ-247 (M1): 管理投稿画面のデータアクセス層。
 *
 * これまで `AdminPostsPage`（812 行）に inline 展開されていた ~13 個の `supabase.*` 呼び出し
 * （一覧取得・審査待ち件数・承認/却下/再判定・一括承認/削除・単体削除＋Storage 整理・公開レベル
 * 設定・審査地図座標・CSV 出力）と、それらが依存する 13 個の `useState` をここへ集約する。
 * ユーザー向けフック（useProfile / usePostList / useStats …）と同じ「データアクセスはフック」
 * 規約に管理画面を揃え、handler をテスト可能にする（AC-03）。挙動は従来と同一（NFR-247-01）。
 *
 * 画面固有の UI 状態（モーダル/ダイアログ開閉・写真ビューア・種既定フォームの入力値・地図モーダル）は
 * View 側に残し、本フックはデータと操作結果のみを持つ。
 */

export interface AdminPostsFilters {
  species: string
  info_type: string
  municipality: string
  keyword: string
  auth: string
}

/** CSV 出力で取得する列（ADMIN_POSTS_CSV_COLUMNS と一致）。lat/lng は display_* エイリアス（粗化）。 */
export interface AdminCsvRow {
  id: string
  created_at: string
  lat: number | null
  lng: number | null
  municipality: string | null
  species: string
  info_type: string
  comment: string | null
  photos: string[] | null
  is_anonymous: boolean
  status: string | null
  rejection_reason: string | null
  weather: string | null
  temperature: number | null
  humidity: number | null
}

export interface CsvExportData {
  data: AdminCsvRow[]
  /** REQ-243: 管理者 CSV 用の正確座標（get_admin_post_locations RPC）。取得できた行のみ。 */
  preciseById: Map<string, { lat: number; lng: number }>
}

/** 一括/単体操作の進行フラグ。手動同期による desync を避けるため 1 オブジェクトへ集約（REQ-247）。 */
interface AdminPostsOp {
  /** 単体削除中（DeletePostDialog のスピナー）。 */
  singleDeleting: boolean
  bulkDeleting: boolean
  bulkApproving: boolean
  /** 一括処理の進捗テキスト（BulkActionBar 表示）。未処理時は null。 */
  progress: string | null
}

export interface UseAdminPostsResult {
  // ── データ ──
  posts: AdminPost[]
  total: number
  pendingCount: number | null
  loading: boolean
  fetchError: boolean
  retry: () => void
  // ── クエリ状態 ──
  statusTab: string
  page: number
  setPage: React.Dispatch<React.SetStateAction<number>>
  filters: AdminPostsFilters
  changeTab: (tab: string) => void
  changeFilter: (key: string, value: string) => void
  // ── 選択 ──
  selectedIds: string[]
  toggleSelect: (id: string) => void
  toggleSelectAll: () => void
  // ── 操作エラー / 進行状態 ──
  opError: string
  clearOpError: () => void
  deleting: boolean
  bulkProcessing: boolean
  bulkProgress: string | null
  // ── 投稿操作（データアクセス） ──
  approve: (post: AdminPost) => Promise<void>
  reject: (post: AdminPost, data: { reason: string; message: string | null }) => Promise<void>
  reanalyze: (post: AdminPost) => Promise<void>
  bulkApprove: () => Promise<void>
  bulkDelete: () => Promise<void>
  deletePost: (target: AdminPost) => Promise<boolean>
  toggleOfficial: (post: AdminPost) => Promise<void>
  setDisclosure: (post: AdminPost, level: string) => Promise<void>
  setSpeciesDefault: (species: string, level: string) => Promise<void>
  /** 審査地図用の正確座標取得（RPC 失敗/非該当時は null → 呼び出し側が粗化座標にフォールバック）。 */
  fetchPreciseLocation: (id: string) => Promise<{ lat: number; lng: number } | null>
  /** CSV 出力用の行 + 正確座標を取得（失敗時は opError を立て null を返す）。 */
  fetchCsvExport: () => Promise<CsvExportData | null>
}

export function useAdminPosts(): UseAdminPostsResult {
  const { user } = useAuth()
  const { t } = useTranslation()
  const toast = useToastContext()

  const [posts, setPosts] = useState<AdminPost[]>([])
  const [total, setTotal] = useState(0)
  const [pendingCount, setPendingCount] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [statusTab, setStatusTab] = useState('pending')
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState<AdminPostsFilters>({ species: '', info_type: '', municipality: '', keyword: '', auth: '' })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [opError, setOpError] = useState('')
  // REQ-247: 個別の bulkDeleting / bulkApproving / bulkProgress / deleting を 1 オブジェクトへ集約。
  const [op, setOp] = useState<AdminPostsOp>({ singleDeleting: false, bulkDeleting: false, bulkApproving: false, progress: null })
  const abortRef = useRef<AbortController | null>(null)
  const bulkLockRef = useRef(false)

  const fetchPendingCount = useCallback(async () => {
    const { count, error } = await countPostsByStatus(supabase, 'pending')
    if (error) {
      logError(error, 'useAdminPosts:fetchPendingCount')
      setPendingCount(null)
      return
    }
    setPendingCount(count ?? 0)
  }, [])

  const fetchPosts = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setFetchError(false)
    try {
      // REQ-142: select('*') を排し、画面で実際に使う列のみ取得（egress / メモリ削減）
      let query = selectAdminPosts(supabase)

      // statusTab / filters.* は管理フィルタ UI（STATUS_TABS / SPECIES / INFO_TYPES 由来）の値。空ガード後に列の enum へ狭める。
      if (statusTab !== 'all') query = query.eq('status', statusTab as 'pending' | 'approved' | 'rejected')
      if (filters.species) query = query.eq('species', filters.species as Species)
      if (filters.info_type) query = query.eq('info_type', filters.info_type as InfoType)
      if (filters.municipality) query = query.eq('municipality', filters.municipality)
      if (filters.keyword) query = query.ilike('comment', `%${escapeIlikePattern(filters.keyword)}%`)
      if (filters.auth === 'verified') query = query.eq('is_anonymous', false)
      if (filters.auth === 'anonymous') query = query.eq('is_anonymous', true)

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1)
        .abortSignal(controller.signal)

      if (controller.signal.aborted) return
      if (error) throw error
      // REQ-142 / REQ-246: ADMIN_POSTS_LIST_COLUMNS は実行時 string 定数（型レベルの select パース対象で
      // ない）ため supabase-js は行形状を推論できず、かつ AdminPost は posts 行の上位集合（auto_approved 等の
      // 管理専用列を含む）。両者は構造的に重ならないため unknown 経由のキャストが構造上必要。
      // 参照側は ADMIN_POSTS_LIST_COLUMNS の範囲でのみ使用する。
      if (controller.signal.aborted) return
      setPosts(((data ?? []) as unknown as AdminPost[]).map(post => ({
        ...post,
        ai_result: normalizeAIResult(post.ai_result),
      })))
      setTotal(count ?? 0)
    } catch (error) {
      if (controller.signal.aborted) return
      logError(error, 'useAdminPosts:fetchPosts')
      setFetchError(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [page, filters, statusTab])

  const retry = useCallback(() => {
    void fetchPosts()
    void fetchPendingCount()
  }, [fetchPosts, fetchPendingCount])

  useEffect(() => {
    void fetchPosts()
    void fetchPendingCount()
  }, [fetchPosts, fetchPendingCount])
  useEffect(() => () => abortRef.current?.abort(), [])

  // ── クエリ状態操作（ページリセット + 選択解除は従来と同一） ──
  const changeFilter = (key: string, value: string) => {
    setPage(0)
    setSelectedIds([])
    setFilters(f => ({ ...f, [key]: value }))
  }
  const changeTab = (tab: string) => {
    setStatusTab(tab)
    setPage(0)
    setSelectedIds([])
  }
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const toggleSelectAll = () => {
    if (selectedIds.length === posts.length) setSelectedIds([])
    else setSelectedIds(posts.map(p => p.id))
  }
  const clearOpError = () => setOpError('')

  // ── 投稿操作 ──
  async function approve(post: AdminPost) {
    if (!user) return
    setOpError('')
    try {
      await approvePost(supabase, post.id, user.id)
    } catch (error) {
      logError(error, 'useAdminPosts:approve')
      setOpError('承認に失敗しました')
      return
    }
    writeAuditLog({
      adminId: user.id,
      action: 'approve_post',
      targetType: 'post',
      targetId: post.id,
      details: { municipality: post.municipality, species: post.species, info_type: post.info_type },
    })
    toast.success('承認しました')
    fetchPosts()
    fetchPendingCount()
  }

  async function reject(post: AdminPost, { reason, message }: { reason: string; message: string | null }) {
    if (!user) return
    setOpError('')
    try {
      await rejectPost(supabase, post.id, user.id, { reason, message })
    } catch (error) {
      logError(error, 'useAdminPosts:reject')
      setOpError('却下に失敗しました')
      return
    }
    writeAuditLog({
      adminId: user.id,
      action: 'reject_post',
      targetType: 'post',
      targetId: post.id,
      details: { municipality: post.municipality, species: post.species, rejection_reason: reason },
    })
    toast.success('却下しました')
    fetchPosts()
    fetchPendingCount()
  }

  async function reanalyze(post: AdminPost) {
    const calls: Array<Promise<{ data: unknown; error: { message?: string } | null }>> = []
    if (post.photos?.length) {
      calls.push(supabase.functions.invoke('analyze-image', { body: { record: post, reanalysis: true } }))
    }
    if (post.audio_url) {
      calls.push(supabase.functions.invoke('analyze-audio', { body: { record: post, reanalysis: true } }))
    }
    if (calls.length === 0) return

    try {
      const results = await Promise.all(calls)
      const failed = results.find(result => result.error)
      if (failed?.error) {
        toast.error(failed.error.message ?? '再判定に失敗しました')
        return
      }
      toast.success('再判定を開始しました')
      fetchPosts()
      fetchPendingCount()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '再判定に失敗しました')
    }
  }

  async function runBulkOperation({
    targets,
    progressKey,
    action,
    adminId,
    process,
  }: {
    targets: AdminPost[]
    progressKey: 'admin.posts.bulkProgress' | 'admin.posts.bulkProgressApprove'
    action: 'delete_post' | 'approve_post'
    adminId: string
    process: (post: AdminPost) => Promise<void>
  }): Promise<{ succeededIds: string[]; failedIds: string[] }> {
    const succeededIds: string[] = []
    const failedIds: string[] = []

    for (const [index, post] of targets.entries()) {
      setOp(s => ({
        ...s,
        progress: t(progressKey, { done: index + 1, total: targets.length }),
      }))
      try {
        await process(post)
        await writeAuditLog({
          adminId,
          action,
          targetType: 'post',
          targetId: post.id,
          details: { municipality: post.municipality, species: post.species, info_type: post.info_type, bulk: true },
        })
        succeededIds.push(post.id)
      } catch (error) {
        logError(error, `useAdminPosts:${action}:${post.id}`)
        failedIds.push(post.id)
      }
    }

    return { succeededIds, failedIds }
  }

  function showBulkResult(succeeded: number, failed: number) {
    const message = failed === 0
      ? t('admin.posts.bulkResult.success', { succeeded })
      : t('admin.posts.bulkResult.withFailures', { succeeded, failed })
    if (failed === 0) toast.success(message)
    else toast.error(message)
  }

  async function bulkDelete() {
    if (!user || bulkLockRef.current) return
    bulkLockRef.current = true
    setOp(s => ({ ...s, bulkDeleting: true }))
    setOpError('')
    const targets = posts.filter(p => selectedIds.includes(p.id))
    try {
      const { succeededIds, failedIds } = await runBulkOperation({
        targets,
        progressKey: 'admin.posts.bulkProgress',
        action: 'delete_post',
        adminId: user.id,
        process: async (post) => {
          await deletePostRow(supabase, post.id)

          try {
            await removePostMedia(post)
          } catch (storageError) {
            logError(storageError, `useAdminPosts:bulkDelete:orphanStorageFiles:${post.id}`)
          }
        },
      })
      showBulkResult(succeededIds.length, failedIds.length)
      setSelectedIds(failedIds)
    } finally {
      bulkLockRef.current = false
      setOp(s => ({ ...s, bulkDeleting: false, progress: null }))
      void fetchPosts()
      void fetchPendingCount()
    }
  }

  async function bulkApprove() {
    if (!user || bulkLockRef.current) return
    bulkLockRef.current = true
    setOp(s => ({ ...s, bulkApproving: true }))
    setOpError('')
    const targets = posts.filter(p => selectedIds.includes(p.id))
    try {
      const { succeededIds, failedIds } = await runBulkOperation({
        targets,
        progressKey: 'admin.posts.bulkProgressApprove',
        action: 'approve_post',
        adminId: user.id,
        process: async (post) => {
          await approvePost(supabase, post.id, user.id)
        },
      })
      showBulkResult(succeededIds.length, failedIds.length)
      setSelectedIds(failedIds)
    } finally {
      bulkLockRef.current = false
      setOp(s => ({ ...s, bulkApproving: false, progress: null }))
      void fetchPosts()
      void fetchPendingCount()
    }
  }

  async function deletePost(target: AdminPost): Promise<boolean> {
    if (!user) return false
    setOp(s => ({ ...s, singleDeleting: true }))
    setOpError('')
    try {
      // Storage 側の失敗で本体 DELETE を止めないように個別 try/catch。
      // 写真・AI 用の縮小版・音声の実体を消す（行だけ消すと公開 URL が生き残る）。
      try {
        await removePostMedia(target)
      } catch (storageError) {
        // 実体の削除失敗は記録するが処理は継続（孤立ファイルは Storage 側で別途掃除）
        console.warn('[admin.delete] storage.remove failed', storageError) // eslint-disable-line no-console
      }

      // .select() を付与して削除行を確実に取得する。RLS 拒否や行が既に消えている場合は data が []
      // になるため「成功扱いで 0 行削除」のサイレント失敗を検出できる。
      await deletePostRow(supabase, target.id)

      writeAuditLog({
        adminId: user.id,
        action: 'delete_post',
        targetType: 'post',
        targetId: target.id,
        details: {
          municipality: target.municipality,
          species: target.species,
          info_type: target.info_type,
        },
      })
      toast.success(t('admin.posts.action.delete'))
      fetchPosts()
      fetchPendingCount()
      return true
    } catch (e) {
      // 原因特定を容易にするため詳細をコンソールへ
      console.error('[admin.delete] failed', e) // eslint-disable-line no-console
      setOpError(t('admin.posts.error.deleteFailed'))
      return false
    } finally {
      setOp(s => ({ ...s, singleDeleting: false }))
    }
  }

  async function toggleOfficial(post: AdminPost) {
    if (!user) return
    setOpError('')
    const newValue = !post.is_official
    try {
      await setPostOfficial(supabase, post.id, newValue)
    } catch (error) {
      logError(error, 'useAdminPosts:toggleOfficial')
      setOpError(t('admin.posts.error.officialFailed'))
      return
    }
    writeAuditLog({
      adminId: user.id,
      action: 'toggle_official',
      targetType: 'post',
      targetId: post.id,
      details: { is_official: newValue, municipality: post.municipality, species: post.species },
    })
    fetchPosts()
  }

  // REQ-243 FR-243-01b: 記録単位の公開レベル（precise/coarsened/hidden）を管理者が設定する。
  async function setDisclosure(post: AdminPost, level: string) {
    setOpError('')
    const { error } = await supabase.rpc('set_post_location_disclosure', { p_post_id: post.id, p_level: level })
    if (error) { setOpError(t('admin.posts.error.disclosureFailed')); return }
    toast.success(t('admin.posts.disclosure.updated'))
    fetchPosts()
  }

  // REQ-243 FR-243-01b: 種ごとの既定公開レベルを管理者が設定する（新規投稿の初期値に反映）。
  async function setSpeciesDefault(species: string, level: string) {
    setOpError('')
    const { error } = await supabase.rpc('set_species_location_default', {
      p_species: species,
      p_level: level,
    })
    if (error) { setOpError(t('admin.posts.error.disclosureFailed')); return }
    toast.success(t('admin.posts.disclosure.speciesUpdated'))
  }

  // REQ-243: 審査地図は正確座標で確認する。get_admin_post_locations RPC で取得（失敗時は null）。
  async function fetchPreciseLocation(id: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const { data } = await supabase.rpc('get_admin_post_locations', { p_ids: [id] })
      const row = Array.isArray(data) ? data[0] : null
      if (row && row.lat != null && row.lng != null) return { lat: Number(row.lat), lng: Number(row.lng) }
    } catch { /* 粗化座標のままフォールバック */ }
    return null
  }

  async function fetchCsvExport(): Promise<CsvExportData | null> {
    // REQ-103 / REQ-142: CSV 出力で使う列のみを取得（PII 列漏洩防止 + egress 削減）
    let query = selectAdminPostsForCsv(supabase)
    if (statusTab !== 'all') query = query.eq('status', statusTab as 'pending' | 'approved' | 'rejected')
    if (filters.species) query = query.eq('species', filters.species as Species)
    if (filters.info_type) query = query.eq('info_type', filters.info_type as InfoType)
    if (filters.municipality) query = query.eq('municipality', filters.municipality)
    if (filters.keyword) query = query.ilike('comment', `%${escapeIlikePattern(filters.keyword)}%`)

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error || !data) { setOpError(t('admin.posts.error.fetchFailed')); return null }

    // ADMIN_POSTS_CSV_COLUMNS も実行時 string 定数のため列形状は推論されない（fetchPosts と同じ理由）。
    const rows = data as unknown as AdminCsvRow[]

    // REQ-243: 管理者 CSV は正確座標で出力する。get_admin_post_locations RPC で一括取得しマージ
    // （RPC 失敗時は粗化のままフォールバック）。
    const preciseById = new Map<string, { lat: number; lng: number }>()
    const csvIds = rows.map((d) => d.id)
    if (csvIds.length > 0) {
      const { data: locs } = await supabase.rpc('get_admin_post_locations', { p_ids: csvIds })
      for (const l of (locs ?? []) as { id: string; lat: number | null; lng: number | null }[]) {
        if (l.lat != null && l.lng != null) preciseById.set(l.id, { lat: Number(l.lat), lng: Number(l.lng) })
      }
    }

    return { data: rows, preciseById }
  }

  return {
    posts,
    total,
    pendingCount,
    loading,
    fetchError,
    retry,
    statusTab,
    page,
    setPage,
    filters,
    changeTab,
    changeFilter,
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    opError,
    clearOpError,
    deleting: op.singleDeleting,
    bulkProcessing: op.bulkDeleting || op.bulkApproving,
    bulkProgress: op.progress,
    approve,
    reject,
    reanalyze,
    bulkApprove,
    bulkDelete,
    deletePost,
    toggleOfficial,
    setDisclosure,
    setSpeciesDefault,
    fetchPreciseLocation,
    fetchCsvExport,
  }
}
