'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { deletePost } from '@/lib/data/posts-admin'
import { speciesLabel, infoTypeLabel } from '@/lib/constants'
import { useAuth } from '@/context/AuthContext'
import { writeAuditLog } from '@/lib/auditLog'
import { logError } from '@/lib/errorHandler'
import { removePostMedia } from '@/lib/postMedia'
import { maskIp } from '@/lib/maskIp'

interface IpDisplayProps {
  ip: string | null
  sameIpCount: number
  t: (key: string, options?: Record<string, unknown>) => string
}

function IpDisplay({ ip, sameIpCount, t }: IpDisplayProps) {
  const [show, setShow] = useState(false)
  if (!ip) return <span className="text-gray-300 text-xs">{t('admin.reports.ip.none')}</span>
  // REQ-245 FR-245-05: IPv4 の末尾オクテットに加え IPv6 のホスト/インタフェース部もマスクする。
  const masked = maskIp(ip)
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-xs text-gray-500">{show ? ip : masked}</span>
      <button
        onClick={() => setShow(v => !v)}
        className="text-[11px] text-gray-400 hover:text-gray-600 underline"
      >
        {show ? t('admin.reports.ip.hide') : t('admin.reports.ip.show')}
      </button>
      {sameIpCount > 1 && (
        <span className="bg-orange-100 text-orange-700 text-[11px] font-medium px-1.5 py-0.5 rounded-full">
          {t('admin.reports.ip.sameCount', { count: sameIpCount })}
        </span>
      )}
    </span>
  )
}

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  confirmClass: string
  onConfirm: () => void
  onCancel: () => void
  cancelLabel: string
}

function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel, cancelLabel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-4">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={`flex-1 rounded-lg py-2 text-sm font-medium ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

interface ReportPost {
  id: string
  species: string
  info_type: string
  municipality: string | null
  comment: string | null
  photos: string[] | null
  audio_url: string | null
  created_at: string
}

interface ReportRecord {
  id: string
  post_id: string
  reason: string
  comment: string | null
  reporter_ip: string | null
  resolved: boolean
  created_at: string
  posts: ReportPost | null
}

export default function AdminReportsPage() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [tab, setTab] = useState('pending')
  const [reports, setReports] = useState<ReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<{ type: string; report: ReportRecord } | null>(null)
  const [opError, setOpError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const fetchReports = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`*, posts(id, species, info_type, municipality, comment, photos, audio_url, created_at)`)
        .eq('resolved', tab === 'resolved')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal)

      if (controller.signal.aborted) return
      if (!error) {
        if (controller.signal.aborted) return
        setReports((data ?? []) as ReportRecord[])
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [tab])

  const ipCountMap = reports.reduce<Record<string, number>>((acc, r) => {
    if (r.reporter_ip) acc[r.reporter_ip] = (acc[r.reporter_ip] || 0) + 1
    return acc
  }, {})

  useEffect(() => { void fetchReports() }, [fetchReports])
  useEffect(() => () => abortRef.current?.abort(), [])

  // REQ-156: user が null の間は操作 UI を描画せず、以降は user.id を非 null assertion なしで参照する。
  if (!user) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center text-gray-400 text-sm">
        {t('admin.reports.loading')}
      </div>
    )
  }
  const uid = user.id

  async function handleDeletePost() {
    const { report } = action!
    setOpError('')
    try {
      // 写真・AI 用の縮小版・音声の実体を消す（これまでは写真の本体だけだった）
      if (report.posts) await removePostMedia(report.posts)
      await deletePost(supabase, report.post_id)
      writeAuditLog({
        adminId: uid,
        action: 'delete_post',
        targetType: 'post',
        targetId: report.post_id,
        details: { reason: report.reason, reporter_comment: report.comment },
      })
      setAction(null)
      fetchReports()
    } catch (err) {
      logError(err, 'AdminReportsPage:deletePost')
      setOpError(t('admin.reports.error.deleteFailed'))
      setAction(null)
    }
  }

  async function handleDismiss() {
    const { report } = action!
    setOpError('')
    const { error } = await supabase.from('reports').update({ resolved: true }).eq('id', report.id)
    if (error) {
      setOpError(t('admin.reports.error.dismissFailed'))
    } else {
      writeAuditLog({
        adminId: uid,
        action: 'resolve_report',
        targetType: 'report',
        targetId: report.id,
        details: { reason: report.reason, post_id: report.post_id },
      })
    }
    setAction(null)
    fetchReports()
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {opError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{opError}</span>
          <button onClick={() => setOpError('')} className="text-red-400 hover:text-red-600 ml-2">✕</button>
        </div>
      )}
      <h1 className="text-xl font-bold text-gray-800">{t('admin.reports.title')}</h1>

      {/* タブ */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {['pending', 'resolved'].map(tabKey => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === tabKey ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tabKey === 'pending' ? t('admin.reports.tab.pending') : t('admin.reports.tab.resolved')}
          </button>
        ))}
      </div>

      {/* 通報一覧 */}
      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">{t('admin.reports.loading')}</div>
      ) : reports.length === 0 ? (
        <div className="text-gray-400 text-sm py-12 text-center bg-white rounded-xl border border-gray-200">
          {tab === 'pending' ? t('admin.reports.emptyPending') : t('admin.reports.emptyResolved')}
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                      {t(`admin.reports.reason.${report.reason}`, { defaultValue: report.reason })}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(report.created_at).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <IpDisplay
                      ip={report.reporter_ip}
                      sameIpCount={report.reporter_ip ? ipCountMap[report.reporter_ip] || 0 : 0}
                      t={t}
                    />
                  </div>
                  {report.comment && (
                    <p className="text-sm text-gray-600 mb-3">{t('admin.reports.reporterComment')}{report.comment}</p>
                  )}

                  {report.posts ? (
                    <div className="bg-gray-50 rounded-lg p-3 flex gap-3">
                      {report.posts.photos?.[0] && (
                        <div className="relative w-16 h-16 shrink-0">
                          <Image
                            src={report.posts.photos[0]}
                            alt={`通報対象投稿の写真（${speciesLabel(report.posts.species)}）`}
                            fill
                            sizes="64px"
                            className="object-cover rounded-lg"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-1.5 mb-1">
                          <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-sm">
                            {speciesLabel(report.posts.species)}
                          </span>
                          <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded-sm">
                            {infoTypeLabel(report.posts.info_type)}
                          </span>
                          {report.posts.municipality && (
                            <span className="text-xs text-gray-500">{report.posts.municipality}</span>
                          )}
                        </div>
                        {report.posts.comment && (
                          <p className="text-xs text-gray-500 truncate">{report.posts.comment}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t('admin.reports.postDate')}{new Date(report.posts.created_at).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-400">{t('admin.reports.postDeleted')}</div>
                  )}
                </div>

                {tab === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0">
                    {report.posts && (
                      <button
                        onClick={() => setAction({ type: 'delete_post', report })}
                        className="bg-red-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-700 whitespace-nowrap"
                      >
                        {t('admin.reports.action.deletePost')}
                      </button>
                    )}
                    <button
                      onClick={() => setAction({ type: 'dismiss', report })}
                      className="border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gray-50 whitespace-nowrap"
                    >
                      {t('admin.reports.action.dismiss')}
                    </button>
                  </div>
                )}
                {tab === 'resolved' && (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full shrink-0">{t('admin.reports.status.resolved')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {action?.type === 'delete_post' && (
        <ConfirmDialog
          title={t('admin.reports.deleteDialog.title')}
          message={t('admin.reports.deleteDialog.message')}
          confirmLabel={t('admin.reports.deleteDialog.confirm')}
          confirmClass="bg-red-600 text-white hover:bg-red-700"
          cancelLabel={t('admin.reports.deleteDialog.cancel')}
          onConfirm={handleDeletePost}
          onCancel={() => setAction(null)}
        />
      )}
      {action?.type === 'dismiss' && (
        <ConfirmDialog
          title={t('admin.reports.dismissDialog.title')}
          message={t('admin.reports.dismissDialog.message')}
          confirmLabel={t('admin.reports.dismissDialog.confirm')}
          confirmClass="bg-gray-800 text-white hover:bg-gray-700"
          cancelLabel={t('admin.reports.dismissDialog.cancel')}
          onConfirm={handleDismiss}
          onCancel={() => setAction(null)}
        />
      )}
    </div>
  )
}
