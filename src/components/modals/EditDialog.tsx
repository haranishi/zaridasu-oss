'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { X, Plus } from 'lucide-react'
import { SPECIES, INFO_TYPES, MUNICIPALITIES, MAX_PHOTOS, MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, COUNT_MIN, COUNT_MAX } from '@/lib/constants'
import { dialogInputCls, btnPrimaryCls, btnSecondaryCls } from '@/lib/formStyles'
import { todayLocalISODate } from '@/lib/localDate'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

interface EditDialogPost {
    id: string
    species: string
    info_type: string
    municipality?: string | null
    comment?: string | null
    count?: number | null
    observed_at?: string | null
    photos?: string[] | null
}

interface EditDialogProps {
    post: EditDialogPost
    onSave: (data: {
        species: string
        info_type: string
        municipality: string | null
        comment: string | null
        count: number | null
        observed_at: string | null
        deletedPhotoUrls: string[]
        newPhotoFiles: File[]
    }) => void
    onCancel: () => void
    saving: boolean
    dark: boolean
    error: string | null
}

export default function EditDialog({ post, onSave, onCancel, saving, dark, error }: EditDialogProps) {
    const { t } = useTranslation()
    const [species, setSpecies] = useState(post.species)
    const [infoType, setInfoType] = useState(post.info_type)
    const [municipality, setMunicipality] = useState(post.municipality || '')
    const [comment, setComment] = useState(post.comment || '')
    const [count, setCount] = useState(post.count != null ? String(post.count) : '')
    const [observedAt, setObservedAt] = useState(post.observed_at ? post.observed_at.slice(0, 10) : '')
    const [deletedUrls, setDeletedUrls] = useState<Set<string>>(new Set())
    const [newFiles, setNewFiles] = useState<File[]>([])
    const [newPreviews, setNewPreviews] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)

    useFocusTrap(dialogRef)

    const remainingPhotos = (post.photos || []).filter(url => !deletedUrls.has(url))
    const totalPhotos = remainingPhotos.length + newFiles.length

    function markDelete(url: string) {
        setDeletedUrls(prev => new Set([...prev, url]))
    }

    function removeNewFile(index: number) {
        setNewFiles(prev => prev.filter((_, i) => i !== index))
        setNewPreviews(prev => prev.filter((_, i) => i !== index))
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files: File[] = Array.from(e.target.files || [])
        const available = MAX_PHOTOS - totalPhotos
        const toAdd = files.slice(0, available).filter(f => f.size <= MAX_FILE_SIZE && ALLOWED_IMAGE_TYPES.includes(f.type))
        toAdd.forEach(file => {
            const reader = new FileReader()
            reader.onload = ev => setNewPreviews(prev => [...prev, ev.target?.result as string])
            reader.readAsDataURL(file)
        })
        setNewFiles(prev => [...prev, ...toAdd])
        e.target.value = ''
    }

    function handleSave() {
        const parsedCount = count !== '' ? parseInt(count, 10) : null
        onSave({
            species,
            info_type: infoType,
            municipality: municipality || null,
            comment: comment.trim() || null,
            count: parsedCount,
            observed_at: observedAt || null,
            deletedPhotoUrls: [...deletedUrls],
            newPhotoFiles: newFiles,
        })
    }

    const inputCls = dialogInputCls(dark)

    useEscapeKey(onCancel)
    useBodyScrollLock()

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title" aria-describedby="edit-dialog-desc">
            <div ref={dialogRef} className={`rounded-xl shadow-2xl p-6 max-w-sm w-full max-h-[90dvh] overflow-y-auto ${dark ? 'bg-slate-800 border border-slate-700/60' : 'bg-white'}`}>
                <h3 id="edit-dialog-title" className={`font-bold mb-4 ${dark ? 'text-slate-100' : 'text-gray-800'}`}>{t('edit.title')}</h3>
                <p id="edit-dialog-desc" className="sr-only">投稿の種類・情報種別・写真などを編集できます</p>
                <div className="space-y-3">
                    <div>
                        <label htmlFor="edit-dialog-species" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.species')}</label>
                        <select id="edit-dialog-species" value={species} onChange={(e) => setSpecies(e.target.value)} className={inputCls}>
                            {SPECIES.map((s) => <option key={s.value} value={s.value}>{t(`species.${s.value}`)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dialog-info-type" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.infoType')}</label>
                        <select id="edit-dialog-info-type" value={infoType} onChange={(e) => setInfoType(e.target.value)} className={inputCls}>
                            {INFO_TYPES.map((inf) => <option key={inf.value} value={inf.value}>{inf.emoji} {t(`infoType.${inf.value}`)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dialog-municipality" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.municipality')}</label>
                        <select id="edit-dialog-municipality" value={municipality} onChange={(e) => setMunicipality(e.target.value)} className={inputCls}>
                            <option value="">{t('edit.municipalityPlaceholder')}</option>
                            {MUNICIPALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="edit-dialog-count" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.count')}{t('edit.countOptional')}</label>
                        <input
                            id="edit-dialog-count"
                            type="number"
                            min={COUNT_MIN}
                            max={COUNT_MAX}
                            value={count}
                            onChange={(e) => setCount(e.target.value)}
                            placeholder={t('edit.countPlaceholder')}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-dialog-observed-at" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.observedAt')}{t('edit.observedAtOptional')}</label>
                        <input
                            id="edit-dialog-observed-at"
                            type="date"
                            value={observedAt}
                            onChange={(e) => setObservedAt(e.target.value)}
                            max={todayLocalISODate()}
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label htmlFor="edit-dialog-comment" className={`block text-sm mb-1 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.comment')}</label>
                        <textarea
                            id="edit-dialog-comment"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={3}
                            maxLength={500}
                            className={inputCls + ' resize-none'}
                        />
                        <p className={`text-xs text-right mt-0.5 ${dark ? 'text-slate-400' : 'text-gray-500'}`}>{comment.length}/500</p>
                    </div>
                    <div>
                        <span id="edit-dialog-photos-label" className={`block text-sm mb-2 ${dark ? 'text-slate-300' : 'text-gray-600'}`}>{t('edit.photos')}（{t('edit.photosMax', { max: MAX_PHOTOS })}）</span>
                        <div role="group" aria-labelledby="edit-dialog-photos-label" className="flex flex-wrap gap-2">
                            {(post.photos || []).map((url: string, i: number) => !deletedUrls.has(url) && (
                                <div key={i} className="relative w-16 h-16">
                                    <Image src={url} alt={`写真${i + 1}`} fill sizes="64px" className="object-cover rounded-lg" />
                                    <button
                                        type="button"
                                        onClick={() => markDelete(url)}
                                        aria-label={t('postForm.removePhoto', { n: i + 1 })}
                                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-w-[44px] before:min-h-[44px] before:content-['']"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {newPreviews.map((src, i) => (
                                <div key={`new-${i}`} className="relative w-16 h-16">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL のため next/image 非対応 */}
                                    <img src={src} alt={`新規${i + 1}`} width={64} height={64} loading="lazy" decoding="async" className="w-full h-full aspect-square object-cover rounded-lg opacity-80 ring-2 ring-red-400" />
                                    <button
                                        type="button"
                                        onClick={() => removeNewFile(i)}
                                        aria-label={t('postForm.removePhoto', { n: remainingPhotos.length + i + 1 })}
                                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:min-w-[44px] before:min-h-[44px] before:content-['']"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                            {totalPhotos < MAX_PHOTOS && (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label={t('postForm.addPhoto')}
                                    className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center transition-colors ${
                                        dark ? 'border-slate-600 text-slate-500 hover:border-slate-400 hover:text-slate-400' : 'border-gray-300 text-gray-400 hover:border-gray-400'
                                    }`}
                                >
                                    <Plus size={20} />
                                </button>
                            )}
                        </div>
                        <input
                            id="edit-dialog-photos"
                            ref={fileInputRef}
                            type="file"
                            accept={ALLOWED_IMAGE_TYPES.join(',')}
                            multiple
                            aria-labelledby="edit-dialog-photos-label"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        {totalPhotos === 0 && (
                            <p className={`text-xs mt-1 ${dark ? 'text-slate-400' : 'text-gray-400'}`}>{t('edit.noPhotos')}</p>
                        )}
                    </div>
                </div>
                {error && (
                    <p className="text-sm text-red-500 mt-3">{error}</p>
                )}
                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`${btnSecondaryCls(dark)} flex-1 py-2 text-sm`}
                    >
                        {t('edit.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={`${btnPrimaryCls} flex-1 py-2 text-sm font-medium`}
                    >
                        {saving ? t('edit.saving') : t('edit.save')}
                    </button>
                </div>
            </div>
        </div>
    )
}
