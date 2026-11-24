'use client'

// REQ-330: 調査パネルの「希少種の記録」タブ。自分の記録の一覧と「＋ 希少種を記録する」（計画なしで記録できる）。
// 地図への表示は「希少種を自分の地図に表示」を入れたときだけ（既定は出さない）。地図の画面写真を人に見せたり
// SNS に載せたりしたときに、生息地が漏れないようにするため。トグルはカード全体を押せる範囲にする。
// 記録の削除は「⋯」のメニューから確認を挟んで行い、一覧には赤を出さない（記録を消す操作を目立たせない）。
// 写真は押したときだけ署名 URL（1 時間）を取りにいく。公開 URL は作らない。

import { useState } from 'react'
import { Camera, Loader2, Lock, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/ThemeContext'
import { useToastContext } from '@/context/ToastContext'
import { supabase } from '@/lib/supabase/client'

import { isKnownRareSpecies } from '../constants'
import type { RareSightingsApi } from '../hooks/useRareSightings'
import { errorMessage } from '../lib/errors'
import { PrivateNote, rareSpeciesName, smallBtn, tone } from './parts'

interface RareTabProps {
  rare: RareSightingsApi
  showRare: boolean
  onShowRareChange: (on: boolean) => void
  onRecordRare: () => void
}

/** 「2026/10/02 10:20」（運営の画面と同じ書き方。秒は出さない）。 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function RareTab({ rare, showRare, onShowRareChange, onRecordRare }: RareTabProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const toast = useToastContext()
  const c = tone(dark)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({})
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const { photosLeft, photoCount } = await rare.remove(id)
      if (photosLeft === 0) toast.success(t('fieldwork.rareTab.deleted'))
      else if (photosLeft < photoCount) toast.error(t('fieldwork.rareTab.photosPartlyLeft', { count: photosLeft }))
      else toast.error(t('fieldwork.rareTab.photosLeft'))
      setConfirmId(null)
      setMenuId(null)
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setBusyId(null)
    }
  }

  const showPhotos = async (id: string, paths: string[]) => {
    setPhotoBusy(id)
    try {
      const { createRarePhotoUrls } = await import('../data/rarePhotos')
      const urls = await createRarePhotoUrls(supabase, paths)
      setPhotoUrls((prev) => ({ ...prev, [id]: urls.map((u) => u.url) }))
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setPhotoBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <PrivateNote dark={dark} text={t('fieldwork.rareTab.lead')} className="text-sm" />

      {/* カード全体が押せるトグル（44px 以上） */}
      <button
        type="button"
        role="switch"
        aria-checked={showRare}
        aria-labelledby="fieldwork-show-rare-label"
        aria-describedby="fieldwork-show-rare-hint"
        data-testid="fieldwork-show-rare"
        onClick={() => onShowRareChange(!showRare)}
        className={`flex min-h-16 w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-colors ${
          showRare
            ? dark ? 'border-violet-400 bg-violet-500/15' : 'border-violet-700 bg-violet-50'
            : `${c.border} ${dark ? 'hover:bg-slate-800' : 'hover:bg-gray-50'}`
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            showRare ? 'bg-violet-700' : dark ? 'bg-slate-600' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-transform ${showRare ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span id="fieldwork-show-rare-label" className="block text-[15px] font-bold">
            {t('fieldwork.rareTab.show')}
          </span>
          {/* 札は ON でも OFF でも 2 行目に置く（切り替えてもカードの高さが変わらないように） */}
          <span
            data-testid="fieldwork-show-rare-state"
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[13px] font-bold ${
              showRare
                ? dark ? 'bg-violet-500/30 text-violet-100' : 'bg-violet-700 text-white'
                : dark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {showRare ? t('fieldwork.rareTab.on') : t('fieldwork.rareTab.off')}
          </span>
          <span id="fieldwork-show-rare-hint" className={`mt-0.5 block text-sm leading-snug ${c.muted}`}>
            {t('fieldwork.rareTab.showHint')}
          </span>
        </span>
      </button>

      {/* パネルの塗りつぶしの主ボタンは「次の地点」だけ。ここは枠のボタンにする */}
      <button
        type="button"
        data-testid="fieldwork-record-rare-free"
        onClick={onRecordRare}
        className={`${smallBtn} min-h-12 w-full border-2 text-base ${
          dark ? 'border-violet-400 text-violet-100 hover:bg-violet-500/15' : 'border-violet-700 bg-white text-violet-800 hover:bg-violet-50'
        }`}
      >
        <Plus size={18} aria-hidden="true" />
        {t('fieldwork.rareTab.record')}
      </button>

      <section aria-labelledby="fieldwork-rare-list-heading" className={`space-y-2 border-t pt-4 ${c.border}`}>
        <h3 id="fieldwork-rare-list-heading" className="text-[15px] font-bold">
          {t('fieldwork.rareTab.heading', { count: rare.list.length })}
        </h3>
        {rare.loadState === 'loading' && <p className={`text-sm ${c.muted}`}>{t('fieldwork.panel.loading')}</p>}
        {rare.loadState === 'error' && (
          <div role="alert" className="flex items-center gap-2 text-sm">
            <span className="flex-1">{t('fieldwork.rareTab.loadFailed')}</span>
            <button type="button" onClick={() => void rare.load()} className={`${smallBtn} ${c.btn}`}>
              {t('fieldwork.common.retry')}
            </button>
          </div>
        )}
        {rare.loadState === 'ready' && rare.list.length === 0 && <p className={`text-sm ${c.muted}`}>{t('fieldwork.rareTab.empty')}</p>}
        <ul className="space-y-2" data-testid="fieldwork-rare-list">
          {rare.list.map((r) => {
            const urls = photoUrls[r.id]
            const name = rareSpeciesName(r, t, isKnownRareSpecies)
            return (
              <li key={r.id} className={`rounded-xl border p-3 ${c.border}`} data-testid="fieldwork-rare-card">
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-700 text-white">
                    <Lock size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold wrap-break-word">{name}</p>
                    <p className={`text-sm ${c.muted}`}>
                      {formatDateTime(r.observed_at)}
                      {r.count != null && ` · ${t('fieldwork.rareTab.count', { count: r.count })}`}
                      {r.stop_id && ` · ${t('fieldwork.rareTab.atStop')}`}
                    </p>
                    {r.note && <p className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">{r.note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuId((v) => (v === r.id ? null : r.id))
                      setConfirmId(null)
                    }}
                    aria-expanded={menuId === r.id}
                    aria-label={t('fieldwork.rareTab.menu', { name })}
                    className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl ${dark ? 'text-slate-200 hover:bg-slate-800' : 'text-gray-700 hover:bg-gray-100'}`}
                  >
                    <MoreHorizontal size={18} aria-hidden="true" />
                  </button>
                </div>
                {urls && urls.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {urls.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- 1 時間の署名 URL。画像最適化の経路に通すと期限付きの URL が別の場所に残る
                      <img key={u} src={u} alt={t('fieldwork.rare.photoAlt', { n: i + 1 })} className="h-16 w-16 rounded-lg object-cover" />
                    ))}
                  </div>
                )}
                {r.photo_paths.length > 0 && !urls && (
                  <button
                    type="button"
                    onClick={() => void showPhotos(r.id, r.photo_paths)}
                    disabled={photoBusy === r.id}
                    className={`${smallBtn} mt-2 ${c.btn}`}
                  >
                    {photoBusy === r.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <Camera size={15} aria-hidden="true" />}
                    {t('fieldwork.rareTab.photos', { count: r.photo_paths.length })}
                  </button>
                )}
                {menuId === r.id && (
                  <div className={`mt-2 space-y-2 rounded-xl border p-2.5 ${c.border}`} data-testid="fieldwork-rare-menu">
                    {confirmId === r.id ? (
                      <div className="space-y-2" role="alert">
                        <p className="text-sm">{t('fieldwork.rareTab.deleteConfirm')}</p>
                        {/* 並びは「左＝やめる・右＝実行」（いなかったの確認・ほかの確認とそろえる） */}
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setConfirmId(null)} className={`${smallBtn} ${c.btn}`}>
                            {t('fieldwork.common.cancel')}
                          </button>
                          <button
                            type="button"
                            data-testid="fieldwork-rare-delete-yes"
                            onClick={() => void remove(r.id)}
                            disabled={busyId === r.id}
                            className={`${smallBtn} flex-1 border-2 border-gray-900 ${c.btn}`}
                          >
                            {busyId === r.id ? <Loader2 size={15} aria-hidden="true" className="animate-spin" /> : <Trash2 size={15} aria-hidden="true" />}
                            {t('fieldwork.rareTab.deleteYes')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-testid="fieldwork-rare-delete"
                        onClick={() => setConfirmId(r.id)}
                        className={`${smallBtn} w-full justify-start ${c.btn}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        {t('fieldwork.rareTab.delete')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
