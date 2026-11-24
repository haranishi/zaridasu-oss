'use client'

import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

// REQ-224 FR-224-05: Toast は「アイコン＋色＋テキスト」の3点セットの基準例。
// 面は常時ダーク（slate-900）のため、状態色はダーク面で 4.5:1+ を満たす明色側
// （emerald/red/sky-400）を用いる。info は状態トークン（sky 系）に合わせ blue→sky に統一。
const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} className="shrink-0 text-emerald-400" />,
  error:   <AlertCircle  size={16} className="shrink-0 text-red-400" />,
  info:    <Info         size={16} className="shrink-0 text-sky-400" />,
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-slate-900 border-emerald-500/40 text-slate-100',
  error:   'bg-slate-900 border-red-500/40   text-slate-100',
  info:    'bg-slate-900 border-sky-500/40   text-slate-100',
}

interface ToastItemProps {
  toast: Toast
  onRemove: (id: number) => void
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const { t } = useTranslation()
  return (
    // REQ-195 (NFR-195-02 / AC-06): 親リージョンは常時マウント＋pointer-events-none のため、
    // 各トースト本体に pointer-events-auto を戻して閉じるボタン等の操作を可能にする。
    <div
      // REQ-330: 横幅の上限は「画面の幅−32px」（PC は 480px）。短い文が途中で折れ、数と単位が別の行に分かれないように
      className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-sm min-w-[220px] max-w-[calc(100vw-2rem)] sm:max-w-[480px] animate-[fadeSlideIn_0.25s_ease-out] ${STYLES[toast.type]}`}
    >
      {ICONS[toast.type]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label={t('common.close')}
      >
        <X size={14} />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: number) => void
}

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const { t } = useTranslation()

  // REQ-195 (FR-195-05): 種別で振り分ける。error は緊急度が高いため assertive/alert、
  // success・info は polite/status の別リージョンへ。表示順は元の発生順を保つ。
  const errorToasts = toasts.filter(toast => toast.type === 'error')
  const statusToasts = toasts.filter(toast => toast.type !== 'error')

  // REQ-195 (FR-195-04 / AC-04): toasts が空でもライブリージョンのコンテナを常時マウントし、
  // 中身（トースト群）だけを出し入れする。これにより初回トーストもリージョン内容変化として
  // 読み上げられる（return null は廃止）。
  // REQ-195 (NFR-195-02 / AC-06): 空時もDOMに存在するため、外側ラッパは pointer-events-none で
  // 背後要素のクリックを妨げない（各トースト本体は ToastItem 側で pointer-events-auto に戻す）。
  return (
    // REQ-330: 中央寄せの固定配置は、幅を指定しないと画面の半分までしか広がらない（left:50% のため）。
    // 中身の幅（w-max）にして、上限は各トーストの max-w で決める
    <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-9999 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-2 items-center">
      {/* エラー通知（assertive）: 他の読み上げに割り込む */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-label={t('toast.notifications')}
        className="flex flex-col gap-2 items-center"
      >
        {errorToasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </div>
      {/* 成功・情報通知（polite）: 進行中の読み上げを待ってから通知 */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={t('toast.notifications')}
        className="flex flex-col gap-2 items-center"
      >
        {statusToasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}
