'use client'

// REQ-330: ログアウトの前の確認。端末に送っていない記録（調査の送信待ち・圏外で保存した投稿の下書き）が
// 残っているときだけ出す。ログアウトすると、その人の記録はこの端末から送れなくなる（別の人の名義では送らないため）。
// 選べるのは「送ってからログアウト」「破棄してログアウト」「やめる」。送り切れない・ログアウトできない
// （圏外でセッションが残った）ときはログアウトせず、理由を出す。並びはほかの確認と同じ「左＝やめる・右＝実行」。
// AuthContext が必要になったときだけ読み込む。

import { useState } from 'react'
import { CloudUpload, Loader2, LogOut, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { SignOutOutcome } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { btnPrimaryCls } from '@/lib/formStyles'

import { SheetFrame, smallBtn, tone } from './parts'

interface SignOutUnsentDialogProps {
  /** 調査の送信待ちの件数 */
  queued: number
  /** 圏外で保存した投稿の下書きの件数 */
  drafts: number
  /** 送ってからログアウトする。ok 以外はログアウトしていない。 */
  onSend: () => Promise<SignOutOutcome>
  /** 破棄してからログアウトする（破棄はログアウトできてから）。ok 以外はログアウトしていない。 */
  onDiscard: () => Promise<SignOutOutcome>
  onCancel: () => void
}

const MESSAGE: Record<Exclude<SignOutOutcome, 'ok'>, string> = {
  offline: 'fieldwork.signOut.sendFailed',
  failed: 'fieldwork.signOut.sendBlocked',
  signOutFailed: 'auth.signOutFailed',
}

export default function SignOutUnsentDialog({ queued, drafts, onSend, onDiscard, onCancel }: SignOutUnsentDialogProps) {
  const { t } = useTranslation()
  const { dark } = useTheme()
  const c = tone(dark)
  const [busy, setBusy] = useState<'send' | 'discard' | null>(null)
  const [problem, setProblem] = useState<Exclude<SignOutOutcome, 'ok'> | null>(null)

  const act = async (kind: 'send' | 'discard') => {
    setBusy(kind)
    setProblem(null)
    const outcome = await (kind === 'send' ? onSend() : onDiscard()).catch((): SignOutOutcome => 'offline')
    if (outcome !== 'ok') {
      setBusy(null)
      setProblem(outcome)
    }
  }

  return (
    <SheetFrame
      titleId="fieldwork-signout-title"
      title={t('fieldwork.signOut.title')}
      icon={<LogOut size={20} aria-hidden="true" className="shrink-0" />}
      onClose={() => {
        if (!busy) onCancel()
      }}
      testId="fieldwork-signout-dialog"
    >
      <div className="space-y-1.5 text-[15px] leading-relaxed">
        <p>{t('fieldwork.signOut.lead')}</p>
        <ul className="list-disc pl-6" data-testid="fieldwork-signout-counts">
          {queued > 0 && <li>{t('fieldwork.signOut.queued', { count: queued })}</li>}
          {drafts > 0 && <li>{t('fieldwork.signOut.drafts', { count: drafts })}</li>}
        </ul>
        <p className={`text-sm ${c.muted}`}>{t('fieldwork.signOut.body')}</p>
      </div>
      {problem && (
        <p role="alert" data-testid="fieldwork-signout-problem" className={`text-sm font-semibold ${dark ? 'text-red-300' : 'text-red-700'}`}>
          {t(MESSAGE[problem])}
        </p>
      )}
      <div className="grid gap-2.5">
        <button
          type="button"
          data-testid="fieldwork-signout-send"
          onClick={() => void act('send')}
          disabled={busy !== null}
          className={`flex min-h-12 w-full items-center justify-center gap-2 px-3 py-3 text-base font-bold ${btnPrimaryCls}`}
        >
          {busy === 'send' ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <CloudUpload size={18} aria-hidden="true" />}
          {busy === 'send' ? t('fieldwork.signOut.sending') : t('fieldwork.signOut.send')}
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            data-testid="fieldwork-signout-cancel"
            onClick={onCancel}
            disabled={busy !== null}
            className={`${smallBtn} min-h-12 text-base ${c.btn}`}
          >
            {t('fieldwork.signOut.cancel')}
          </button>
          <button
            type="button"
            data-testid="fieldwork-signout-discard"
            onClick={() => void act('discard')}
            disabled={busy !== null}
            className={`${smallBtn} min-h-12 flex-1 text-base ${c.btn}`}
          >
            {busy === 'discard' ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Trash2 size={17} aria-hidden="true" />}
            {t('fieldwork.signOut.discard')}
          </button>
        </div>
      </div>
    </SheetFrame>
  )
}
