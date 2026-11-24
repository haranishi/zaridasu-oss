import { useEmailResend } from '@/hooks/useEmailResend'

interface EmailVerificationBannerProps {
  email: string
  maskedEmail: string
  dark: boolean
}

export default function EmailVerificationBanner({ email, maskedEmail, dark }: EmailVerificationBannerProps) {
  const { resendEmail, resendLoading, resendCooldownSec, resendMessage, resendError } = useEmailResend()

  return (
    <div className={`rounded-2xl border-2 p-4 ${
      dark
        ? 'bg-amber-900/20 border-amber-600/40 text-amber-200'
        : 'bg-amber-50 border-amber-300 text-amber-900'
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">⚠️</span>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-bold">メールアドレスの確認が完了していません</p>
          <p className={`text-xs ${dark ? 'text-amber-300/70' : 'text-amber-700'}`}>
            {maskedEmail} に送信された確認メールのリンクをクリックしてください。
            確認が完了するまで、コメントといいね機能が制限されます。
          </p>
          {resendMessage && <p className="text-xs text-green-500 font-medium">{resendMessage}</p>}
          {resendError && <p className="text-xs text-red-500 font-medium">{resendError}</p>}
          <button
            onClick={() => resendEmail(email)}
            disabled={resendLoading || resendCooldownSec > 0}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              dark
                ? 'bg-amber-600/30 hover:bg-amber-600/50 text-amber-200'
                : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
            }`}
          >
            {resendLoading
              ? '送信中...'
              : resendCooldownSec > 0
                ? `再送信（${resendCooldownSec}秒後）`
                : '確認メールを再送信'}
          </button>
        </div>
      </div>
    </div>
  )
}
