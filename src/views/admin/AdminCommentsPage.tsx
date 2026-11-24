'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { escapeIlikePattern } from '@/lib/postgrest'
import { speciesLabel, infoTypeLabel, ADMIN_PAGE_SIZE } from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import { writeAuditLog } from '@/lib/auditLog'

interface CommentPost {
  id: string
  municipality: string | null
  species: string
  info_type: string
}

interface CommentRecord {
  id: string
  content: string | null
  created_at: string
  is_admin: boolean
  user_id: string | null
  post_id: string
  posts: CommentPost | null
}

interface DeleteDialogProps {
  comment: CommentRecord
  onConfirm: () => void
  onCancel: () => void
  t: (key: string) => string
}

function DeleteDialog({ comment, onConfirm, onCancel, t }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-gray-800 mb-2">{t('admin.comments.deleteDialog.title')}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {comment.content && (
            <span className="block truncate">「{comment.content}」</span>
          )}
          {t('admin.comments.deleteDialog.irreversible')}
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
            {t('admin.comments.deleteDialog.cancel')}
          </button>
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700">
            {t('admin.comments.deleteDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminCommentsPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [comments, setComments] = useState<CommentRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ keyword: '', adminOnly: false })
  const [deleteTarget, setDeleteTarget] = useState<CommentRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [opError, setOpError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const fetchComments = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      let query = supabase
        .from('comments')
        .select('*, posts(id, municipality, species, info_type)', { count: 'exact' })

      if (filters.keyword) query = query.ilike('content', `%${escapeIlikePattern(filters.keyword)}%`)
      if (filters.adminOnly) query = query.eq('is_admin', true)

      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE - 1)
        .abortSignal(controller.signal)

      if (controller.signal.aborted) return
      if (!error) {
        if (controller.signal.aborted) return
        setComments((data ?? []) as CommentRecord[])
        setTotal(count ?? 0)
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { void fetchComments() }, [fetchComments])
  useEffect(() => () => abortRef.current?.abort(), [])

  // REQ-156: user が null の間は操作 UI を描画せず、以降は user.id を非 null assertion なしで参照する。
  if (!user) {
    return (
      <div className="max-w-6xl mx-auto py-12 text-center text-gray-400 text-sm">
        {t('admin.comments.loading')}
      </div>
    )
  }
  const uid = user.id

  function handleFilterChange(key: string, value: string | boolean) {
    setPage(0)
    setFilters(f => ({ ...f, [key]: value }))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setOpError('')
    try {
      const { error } = await supabase.from('comments').delete().eq('id', deleteTarget.id)
      if (error) throw error
      writeAuditLog({
        adminId: uid,
        action: 'delete_comment',
        targetType: 'comment',
        targetId: deleteTarget.id,
        details: {
          content: deleteTarget.content,
          post_id: deleteTarget.posts?.id,
          municipality: deleteTarget.posts?.municipality,
        },
      })
      setDeleteTarget(null)
      fetchComments()
    } catch {
      setOpError(t('admin.comments.error.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.ceil(total / ADMIN_PAGE_SIZE)

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {opError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{opError}</span>
          <button onClick={() => setOpError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">{t('admin.comments.title')}</h1>
      </div>

      {/* フィルター */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder={t('admin.comments.filter.keyword')}
            value={filters.keyword}
            onChange={e => handleFilterChange('keyword', e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-400 w-full sm:w-64"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.adminOnly}
              onChange={e => handleFilterChange('adminOnly', e.target.checked)}
              className="rounded-sm text-amber-600 focus:ring-amber-500"
            />
            {t('admin.comments.filter.officialOnly')}
          </label>
        </div>
      </div>

      {/* テーブル */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm text-gray-500">
          {loading
            ? t('admin.comments.loading')
            : t('admin.comments.table.range', { total, from: total === 0 ? 0 : page * ADMIN_PAGE_SIZE + 1, to: Math.min((page + 1) * ADMIN_PAGE_SIZE, total) })}
        </div>

        {/* モバイル: カード表示 */}
        <div className="md:hidden divide-y divide-gray-100">
          {comments.map(comment => (
            <div key={comment.id} className="px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  {new Date(comment.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex items-center gap-2">
                  {comment.is_admin
                    ? <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{t('admin.comments.badge.official')}</span>
                    : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t('admin.comments.badge.general')}</span>
                  }
                  <button
                    onClick={() => setDeleteTarget(comment)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium min-h-[44px] flex items-center"
                  >
                    {t('admin.comments.action.delete')}
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-700 line-clamp-2">{comment.content || '—'}</p>
              {comment.posts && (
                <Link
                  href={`/post/${comment.posts.id}`}
                  className="text-blue-600 hover:underline text-xs block"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {comment.posts.municipality || '—'}・{speciesLabel(comment.posts.species)}・{infoTypeLabel(comment.posts.info_type)}
                </Link>
              )}
            </div>
          ))}
          {!loading && comments.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400">{t('admin.comments.empty')}</div>
          )}
        </div>

        {/* PC: テーブル表示 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.comments.table.date')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.comments.table.type')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.comments.table.content')}</th>
                <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{t('admin.comments.table.post')}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comments.map(comment => (
                <tr key={comment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {new Date(comment.created_at).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {comment.is_admin
                      ? <span className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{t('admin.comments.badge.official')}</span>
                      : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{t('admin.comments.badge.general')}</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{comment.content || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {comment.posts ? (
                      <Link
                        href={`/post/${comment.posts.id}`}
                        className="text-blue-600 hover:underline text-xs"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {comment.posts.municipality || '—'}・{speciesLabel(comment.posts.species)}・{infoTypeLabel(comment.posts.info_type)}
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteTarget(comment)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium"
                    >
                      {t('admin.comments.action.delete')}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && comments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">{t('admin.comments.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800"
            >
              {t('admin.comments.prev')}
            </button>
            <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="text-sm text-gray-600 disabled:text-gray-300 hover:text-gray-800"
            >
              {t('admin.comments.next')}
            </button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <DeleteDialog
          comment={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => { if (!deleting) setDeleteTarget(null) }}
          t={t}
        />
      )}
    </div>
  )
}
