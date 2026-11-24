'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { writeAuditLog } from '@/lib/auditLog'
import { speciesLabel, infoTypeLabel } from '@/lib/constants'
import { logError } from '@/lib/errorHandler'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface UserRecord {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_admin: boolean
}

interface ActivityPost {
  id: string
  created_at: string
  municipality: string | null
  species: string
  info_type: string
}

interface ActivityComment {
  id: string
  created_at: string
  content: string | null
}

interface UserActivity {
  post_count: number
  comment_count: number
  report_count: number
  recent_posts: ActivityPost[]
  recent_comments: ActivityComment[]
}

interface UserDetailModalProps {
  user: UserRecord
  onClose: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}

function UserDetailModal({ user, onClose, t }: UserDetailModalProps) {
  const [activity, setActivity] = useState<UserActivity | null>(null)
  const [loading, setLoading] = useState(true)
  // REQ-268 FR-268-12: 管理モーダルにも focus trap / Esc / 背景クリック / scroll lock を付与。
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  useEscapeKey(onClose)
  useBodyScrollLock()

  useEffect(() => {
    async function fetchActivity() {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_user_activity', { p_user_id: user.id })
      if (!error) setActivity(data as UserActivity | null)
      setLoading(false)
    }
    fetchActivity()
  }, [user.id])

  function fmtDateTime(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={user.email}>
      <button type="button" aria-label={t('common.close')} tabIndex={-1} className="fixed inset-0 bg-black/50 cursor-default border-0 p-0" onClick={onClose} />
      <div ref={dialogRef} className="relative bg-white rounded-xl shadow-xl p-4 sm:p-6 max-w-lg w-full max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-gray-800 truncate pr-4">{user.email}</p>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 min-h-11 min-w-11 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors text-lg"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : !activity ? (
          <p className="text-sm text-gray-400 text-center py-8">{t('admin.users.modal.noData')}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <p className="text-lg sm:text-xl font-bold text-gray-800">{activity.post_count ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('admin.users.modal.postCount')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <p className="text-lg sm:text-xl font-bold text-gray-800">{activity.comment_count ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('admin.users.modal.commentCount')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                <p className="text-lg sm:text-xl font-bold text-gray-800">{activity.report_count ?? 0}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('admin.users.modal.reportCount')}</p>
              </div>
            </div>

            <div className="mb-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('admin.users.modal.recentPosts')}</h4>
              {!activity.recent_posts || activity.recent_posts.length === 0 ? (
                <p className="text-xs text-gray-400">{t('admin.users.modal.noPosts')}</p>
              ) : (
                <ul className="space-y-2">
                  {activity.recent_posts.slice(0, 5).map((post: ActivityPost) => (
                    <li key={post.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="text-gray-400">{fmtDateTime(post.created_at)}</span>
                      <span>{post.municipality}</span>
                      <span>{speciesLabel(post.species)}</span>
                      <span>{infoTypeLabel(post.info_type)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('admin.users.modal.recentComments')}</h4>
              {!activity.recent_comments || activity.recent_comments.length === 0 ? (
                <p className="text-xs text-gray-400">{t('admin.users.modal.noComments')}</p>
              ) : (
                <ul className="space-y-2">
                  {activity.recent_comments.slice(0, 5).map((comment: ActivityComment) => (
                    <li key={comment.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
                      <span className="text-gray-400 block">{fmtDateTime(comment.created_at)}</span>
                      <span className="block">{comment.content?.slice(0, 50)}{(comment.content?.length ?? 0) > 50 ? '…' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  user: UserRecord
  action: string
  onConfirm: () => void
  onCancel: () => void
  t: (key: string) => string
}

function ConfirmDialog({ user, action, onConfirm, onCancel, t }: ConfirmDialogProps) {
  const isGrant = action === 'grant'
  // REQ-268 FR-268-12: focus trap / Esc / 背景クリック / scroll lock を付与。
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef)
  useEscapeKey(onCancel)
  useBodyScrollLock()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label={t('admin.users.dialog.cancel')} tabIndex={-1} className="fixed inset-0 bg-black/50 cursor-default border-0 p-0" onClick={onCancel} />
      <div ref={dialogRef} className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isGrant ? 'bg-amber-100' : 'bg-red-100'}`}>
            {isGrant ? '🛡️' : '🔓'}
          </div>
          <h3 className="font-bold text-gray-800">
            {isGrant ? t('admin.users.grantDialog.title') : t('admin.users.revokeDialog.title')}
          </h3>
        </div>
        <p className="text-sm text-gray-500 mb-5 pl-1">
          <span className="font-medium text-gray-700">{user.email}</span><br />
          {isGrant ? t('admin.users.grantDialog.message') : t('admin.users.revokeDialog.message')}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t('admin.users.dialog.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors ${
              isGrant ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {isGrant ? t('admin.users.grantDialog.confirm') : t('admin.users.revokeDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const { t } = useTranslation()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ user: UserRecord; action: string } | null>(null)
  const [detail, setDetail] = useState<{ user: UserRecord } | null>(null)
  const [error, setError] = useState('')
  const currentUserId = currentUser?.id ?? null
  const abortRef = useRef<AbortController | null>(null)

  const fetchUsers = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase
        .rpc('get_admin_user_list')
        .abortSignal(controller.signal)

      if (controller.signal.aborted) return
      if (error) {
        logError(error, 'AdminUsersPage:fetchUsers')
        if (controller.signal.aborted) return
        setError(t('admin.users.error.fetchFailed', { message: error.message }))
      } else {
        if (controller.signal.aborted) return
        setUsers(data ?? [])
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [t])

  useEffect(() => { void fetchUsers() }, [fetchUsers])
  useEffect(() => () => abortRef.current?.abort(), [])

  async function handleRoleChange() {
    if (!confirm) return
    setProcessing(confirm.user.id)
    setConfirm(null)
    setError('')

    const { error } = await supabase.rpc('set_user_admin_role', {
      target_user_id: confirm.user.id,
      grant_admin: confirm.action === 'grant',
    })

    if (error) {
      setError(error.message || t('admin.users.error.roleFailed'))
    } else {
      writeAuditLog({
        adminId: currentUserId!,
        action: confirm.action === 'grant' ? 'grant_admin' : 'revoke_admin',
        targetType: 'user',
        targetId: confirm.user.id,
        details: { email: confirm.user.email },
      })
      await fetchUsers()
    }
    setProcessing(null)
  }

  function fmt(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
    })
  }

  const adminCount = users.filter((u: UserRecord) => u.is_admin).length

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{t('admin.users.title')}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t('admin.users.summary', { total: users.length, adminCount })}
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('admin.users.refresh')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <p className="font-medium mb-1">{t('admin.users.error.title')}</p>
          <p>{error}</p>
          {error.includes('SQL') && (
            <p className="mt-2 text-xs text-red-500">
              Supabase SQL Editor で <code className="bg-red-100 px-1 rounded-sm">supabase/migrations/20240101000000_init_setup.sql</code> を実行してください。
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">{t('admin.users.empty')}</div>
        ) : (
          <>
          {/* モバイル: カード表示 */}
          <div className="md:hidden divide-y divide-gray-100">
            {users.map(user => {
              const isSelf = user.id === currentUserId
              const isProcessing = processing === user.id
              return (
                <div key={user.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                      {user.email?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">{user.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {user.is_admin ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {t('admin.users.role.admin')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                            {t('admin.users.role.user')}
                          </span>
                        )}
                        {isSelf && <span className="text-xs text-blue-500">{t('admin.users.self')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 pl-10">
                    <span>{t('admin.users.table.registeredAt')}: {fmt(user.created_at)}</span>
                    <span>{t('admin.users.table.lastLogin')}: {fmt(user.last_sign_in_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-10">
                    <button
                      onClick={() => setDetail({ user })}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 px-3 py-1.5 rounded-lg min-h-[44px] flex items-center"
                    >
                      {t('admin.users.action.detail')}
                    </button>
                    {isSelf ? (
                      <span className="text-xs text-gray-300">{t('admin.users.action.noChange')}</span>
                    ) : isProcessing ? (
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                    ) : user.is_admin ? (
                      <button
                        onClick={() => setConfirm({ user, action: 'revoke' })}
                        className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 px-3 py-1.5 rounded-lg min-h-[44px] flex items-center"
                      >
                        {t('admin.users.action.revoke')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm({ user, action: 'grant' })}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium border border-amber-200 px-3 py-1.5 rounded-lg min-h-[44px] flex items-center"
                      >
                        {t('admin.users.action.grant')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* PC: テーブル表示 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">{t('admin.users.table.email')}</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">{t('admin.users.table.registeredAt')}</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">{t('admin.users.table.lastLogin')}</th>
                  <th className="text-left px-5 py-3 text-xs text-gray-500 font-medium">{t('admin.users.table.role')}</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => {
                  const isSelf = user.id === currentUserId
                  const isProcessing = processing === user.id
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                            {user.email?.[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-gray-800 font-medium truncate">{user.email}</p>
                            {isSelf && (
                              <p className="text-xs text-blue-500">{t('admin.users.self')}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmt(user.created_at)}</td>
                      <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{fmt(user.last_sign_in_at)}</td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {user.is_admin ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                            {t('admin.users.role.admin')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-xs px-2.5 py-1 rounded-full">
                            {t('admin.users.role.user')}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDetail({ user })}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            {t('admin.users.action.detail')}
                          </button>
                          {isSelf ? (
                            <span className="text-xs text-gray-300">{t('admin.users.action.noChange')}</span>
                          ) : isProcessing ? (
                            <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin inline-block" />
                          ) : user.is_admin ? (
                            <button
                              onClick={() => setConfirm({ user, action: 'revoke' })}
                              className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              {t('admin.users.action.revoke')}
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirm({ user, action: 'grant' })}
                              className="text-xs text-amber-600 hover:text-amber-800 font-medium border border-amber-200 hover:border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                            >
                              {t('admin.users.action.grant')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          user={confirm.user}
          action={confirm.action}
          onConfirm={handleRoleChange}
          onCancel={() => setConfirm(null)}
          t={t}
        />
      )}
      {detail && <UserDetailModal user={detail.user} onClose={() => setDetail(null)} t={t} />}
    </div>
  )
}
