'use client'

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { btnDestructiveCls, btnSecondaryCls } from '@/lib/formStyles'

interface DeleteDialogPost {
    id: string
    species: string
    info_type: string
    municipality?: string | null
}

interface DeleteDialogProps {
    post: DeleteDialogPost
    onConfirm: () => void
    onCancel: () => void
    deleting: boolean
    dark: boolean
    error: string | null
}

export default function DeleteDialog({ post, onConfirm, onCancel, deleting, dark, error }: DeleteDialogProps) {
    const { t } = useTranslation()
    const dialogRef = useRef<HTMLDivElement>(null)

    useEscapeKey(onCancel)
    useBodyScrollLock()
    useFocusTrap(dialogRef)

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
            <div ref={dialogRef} className={`rounded-xl shadow-2xl p-6 max-w-sm w-full ${dark ? 'bg-slate-800 border border-slate-700/60' : 'bg-white'}`}>
                <h3 id="delete-dialog-title" className={`font-bold mb-2 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('delete.title')}</h3>
                <p className={`text-sm mb-4 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>
                    {post.municipality && `${post.municipality}・`}{t(`species.${post.species}`)}・{t(`infoType.${post.info_type}`)}<br />
                    {t('delete.irreversible')}
                </p>
                {error && (
                    <p className="text-sm text-red-500 mb-3">{error}</p>
                )}
                <div className="flex gap-2">
                    <button type="button" onClick={onCancel} className={`${btnSecondaryCls(dark)} flex-1 py-2 text-sm`}>
                        {t('delete.cancel')}
                    </button>
                    <button type="button" onClick={onConfirm} disabled={deleting} className={`${btnDestructiveCls} flex-1 py-2 text-sm font-medium`}>
                        {deleting ? t('delete.deleting') : t('delete.confirm')}
                    </button>
                </div>
            </div>
        </div>
    )
}
