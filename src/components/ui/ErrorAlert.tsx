import { AlertTriangle } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'

interface ErrorAlertProps {
  message: string
  className?: string
}

export default function ErrorAlert({ message, className = '' }: ErrorAlertProps) {
  const { dark } = useTheme()

  if (!message) return null

  return (
    // REQ-195 (FR-195-01): role="alert" を内蔵し全使用箇所（AuthModal/ReportModal/AdminLoginPage）へ
    // ステータスメッセージ通知を波及させる。role="alert" は暗黙で aria-live="assertive" を伴うため
    // aria-live は重複指定しない（FR-195-02: 利用側に role="alert" の親は存在せず二重ネストは起きない）。
    <div
      role="alert"
      className={`flex items-start gap-2 text-sm px-3 py-2.5 rounded-xl border ${
        dark
          ? 'bg-red-500/10 border-red-500/20 text-red-400'
          : 'bg-red-50 border-red-200 text-red-700'
      } ${className}`}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
}
