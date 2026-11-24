'use client'

import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTranslation } from 'react-i18next'
import { logError } from '@/lib/errorHandler'
import ErrorAlert from '@/components/ui/ErrorAlert'
import LoadingButton from '@/components/ui/LoadingButton'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { btnDestructiveCls, btnSecondaryCls } from '@/lib/formStyles'
import { useTheme } from '@/context/ThemeContext'
import { trackEvent } from '@/lib/analytics'
import { MAX_REPORT_COMMENT_LENGTH } from '@/lib/constants'
import { reportInputSchema } from '@/lib/validation/schemas'

interface ReportModalProps {
  postId: string
  onClose: () => void
}

export default function ReportModal({ postId, onClose }: ReportModalProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const reasons = [
    { value: 'spam', label: t('report.reasons.spam') },
    { value: 'wrong_location', label: t('report.reasons.wrongLocation') },
    { value: 'inappropriate', label: t('report.reasons.inappropriate') },
    { value: 'other', label: t('report.reasons.other') },
  ]
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  // REQ-160: 共有フックに統一。完了表示(done)切替で focusable 要素が変わるため resetKey に done を渡す。
  useFocusTrap(dialogRef, true, done)
  useEscapeKey(onClose)
  useBodyScrollLock()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!reason) {
      setError(t('report.errorNoReason'))
      return
    }
    const trimmedComment = comment.trim() || null
    // REQ-213 FR-213-05 / AC-03: insert 前に共有 zod スキーマで reason の**列挙検証**（許可リスト
    //   spam|wrong_location|inappropriate|other）と comment 長を行う。従来は radio の値のみで
    //   reason のクライアント検証が無く（開発者ツールで任意値に改竄可能）、DB CHECK 任せだった。
    //   ⚠️ クライアント側の「第一の網」。最終防御は reports の DB CHECK 制約 + RLS（schema.sql）。
    const parsed = reportInputSchema.safeParse({ reason, comment: trimmedComment })
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message
      // reason 違反は通常 UI からは起こらない（改竄入力）。汎用の理由選択エラーへフォールバック。
      setError(key ? t(key) : t('report.errorNoReason'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: insertError } = await supabase.from('reports').insert({
        post_id: postId,
        // REQ-213: 上の zod 検証済みの値を使う（reason は reports.reason の enum に狭まっている）。
        reason: parsed.data.reason,
        comment: trimmedComment,
      })
      if (insertError) throw insertError
      // REQ-232 (FR-232-03): 通報送信成功。reason は固定値のみ。自由記述 comment は送らない。
      trackEvent('report_submit', { reason })
      setDone(true)
    } catch (err) {
      logError(err, 'ReportModal:submit')
      setError(t('report.errorSubmit'))
    } finally {
      setLoading(false)
    }
  }

  return (
    // REQ-160: Escape は useEscapeKey（document リスナ）で処理済み。非対話要素である背景の
    // クリック閉じを補助操作として残すため、キーボード相当操作と対話 role は追加しない。
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      className="fixed inset-0 bg-black/50 z-430 flex items-end md:items-center justify-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={dialogRef} className={`rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md max-h-[90dvh] overflow-y-auto pb-safe ${dark ? 'bg-slate-900 border border-slate-700/60 shadow-black/60' : 'bg-white'}`}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-slate-700/60' : 'border-gray-100'}`}>
          <h2 id="report-dialog-title" className={`text-base font-bold ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('report.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('report.close')} className={`rounded-full min-h-11 min-w-11 inline-flex items-center justify-center transition-colors ${dark ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <div className="text-3xl mb-3">✅</div>
            <p className={`font-medium mb-1 ${dark ? 'text-slate-200' : 'text-gray-700'}`}>{t('report.done')}</p>
            <p className={`text-xs mb-4 ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{t('report.doneDesc')}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('report.close')}
              className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${dark ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              {t('report.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <fieldset role="radiogroup" aria-required="true">
              <legend className={`block text-sm font-semibold mb-2 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{t('report.reasonLabel')}</legend>
              <div className="space-y-2">
                {reasons.map((r) => (
                  <label key={r.value} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      required
                      className="accent-red-600"
                    />
                    <span className={`text-sm ${dark ? 'text-slate-300' : 'text-gray-700'}`}>{r.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="report-comment" className={`block text-sm font-semibold mb-1 ${dark ? 'text-slate-300' : 'text-gray-700'}`}>
                {t('report.commentLabel')}<span className={`font-normal ml-1 text-xs ${dark ? 'text-slate-500' : 'text-gray-400'}`}>{t('report.commentOptional')}</span>
              </label>
              <textarea
                id="report-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={MAX_REPORT_COMMENT_LENGTH}
                placeholder={t('report.commentPlaceholder')}
                className={`w-full border-2 rounded-xl px-3 py-2 text-base md:text-sm focus:outline-hidden resize-none transition-colors ${dark ? 'bg-slate-800 border-slate-600/80 text-slate-200 placeholder-slate-600 focus:border-red-500' : 'border-gray-200 text-gray-800 focus:border-red-400'}`}
              />
            </div>

            <ErrorAlert message={error} />

            <div className="flex gap-2 pb-2">
              <button
                type="button"
                onClick={onClose}
                aria-label={t('report.cancel')}
                className={`${btnSecondaryCls(dark)} flex-1 py-2.5 text-sm font-medium`}
              >
                {t('report.cancel')}
              </button>
              <LoadingButton
                type="submit"
                loading={loading}
                className={`${btnDestructiveCls} flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1`}
              >
                {t('report.submit')}
              </LoadingButton>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
