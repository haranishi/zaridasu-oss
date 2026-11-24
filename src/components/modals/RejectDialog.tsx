'use client'

import { useRef, useState } from 'react'
import { speciesLabel, infoTypeLabel } from '@/lib/constants'
import { btnDestructiveCls, btnSecondaryCls } from '@/lib/formStyles'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { AdminPost } from '@/types/post'

const REJECTION_REASONS = [
  '位置情報が不正確',
  '種の判定が疑わしい',
  '写真が不鮮明または不適切',
  '重複投稿',
  '内容が不適切',
  'その他',
]

interface RejectDialogProps {
  post: AdminPost
  onConfirm: (data: { reason: string; message: string | null }) => void
  onCancel: () => void
}

export default function RejectDialog({ post, onConfirm, onCancel }: RejectDialogProps) {
  const [reason, setReason] = useState(REJECTION_REASONS[0]!)
  const [message, setMessage] = useState('')
  // REQ-196: DeleteDialog と同一の dialog セマンティクス・フォーカス管理に統一
  const dialogRef = useRef<HTMLDivElement>(null)

  useEscapeKey(onCancel)
  useBodyScrollLock()
  useFocusTrap(dialogRef)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 id="reject-dialog-title" className="font-bold text-gray-800 mb-1">投稿を却下する</h3>
        <p className="text-xs text-gray-400 mb-4">
          {post.municipality}・{speciesLabel(post.species)}・{infoTypeLabel(post.info_type)}
        </p>
        <fieldset className="mb-3">
          <legend className="block text-xs font-medium text-gray-600 mb-1.5">却下理由 <span className="text-red-500">*</span></legend>
          <div className="space-y-1.5">
            {REJECTION_REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="text-red-500"
                />
                <span className="text-sm text-gray-700">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mb-4">
          <label htmlFor="reject-message" className="block text-xs font-medium text-gray-600 mb-1.5">
            管理者メッセージ <span className="text-gray-400">（任意・最大200文字）</span>
          </label>
          <textarea
            id="reject-message"
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 200))}
            placeholder="投稿者への補足説明があれば入力してください"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base md:text-sm focus:outline-hidden focus:ring-2 focus:ring-red-400 resize-none"
          />
          <p className="text-right text-xs text-gray-400 mt-0.5">{message.length}/200</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} aria-label="キャンセル" className={`${btnSecondaryCls(false)} flex-1 py-2 text-sm`}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ reason, message: message || null })}
            aria-label="却下する"
            className={`${btnDestructiveCls} flex-1 py-2 text-sm font-medium`}
          >
            却下する
          </button>
        </div>
      </div>
    </div>
  )
}
