'use client'

import { useRef } from 'react'
import { speciesLabel, infoTypeLabel } from '@/lib/constants'
import { btnDestructiveCls, btnSecondaryCls } from '@/lib/formStyles'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { AdminPost } from '@/types/post'

interface DeletePostDialogProps {
  post: AdminPost
  onConfirm: () => void
  onCancel: () => void
  // REQ-164: 削除処理中フラグ。二重送信防止のためボタンを無効化する。
  deleting?: boolean
  t: (key: string) => string
}

export default function DeletePostDialog({ post, onConfirm, onCancel, deleting = false, t }: DeletePostDialogProps) {
  // REQ-196: DeleteDialog と同一の dialog セマンティクス・フォーカス管理に統一
  const dialogRef = useRef<HTMLDivElement>(null)

  useEscapeKey(onCancel)
  useBodyScrollLock()
  useFocusTrap(dialogRef)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-post-dialog-title">
      <div ref={dialogRef} className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 id="delete-post-dialog-title" className="font-bold text-gray-800 mb-2">{t('admin.posts.deleteDialog.title')}</h3>
        <p className="text-sm text-gray-500 mb-4">
          {post.municipality}・{speciesLabel(post.species)}・{infoTypeLabel(post.info_type)}<br />
          {t('admin.posts.deleteDialog.irreversible')}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={deleting} aria-label={t('admin.posts.deleteDialog.cancel')} className={`${btnSecondaryCls(false)} flex-1 py-2 text-sm`}>
            {t('admin.posts.deleteDialog.cancel')}
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting} aria-label={t('admin.posts.deleteDialog.confirm')} className={`${btnDestructiveCls} flex-1 py-2 text-sm font-medium`}>
            {t('admin.posts.deleteDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
