import { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean
  loadingText?: string
}

export default function LoadingButton({
  loading,
  loadingText,
  children,
  className = '',
  disabled,
  ...rest
}: LoadingButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-1">
          <Loader2 size={16} className="animate-spin" />
          {loadingText && <span>{loadingText}</span>}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
