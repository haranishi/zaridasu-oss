'use client'

import { createContext, useContext } from 'react'
import { useToast } from '@/hooks/useToast'
import ToastContainer from '@/components/ui/Toast'

type ToastFn = (msg: string, duration?: number) => number

interface ToastActions {
  success: ToastFn
  error: ToastFn
  info: ToastFn
}

const noop: ToastFn = (_msg, _duration) => 0
const ToastContext = createContext<ToastActions>({
  success: noop,
  error: noop,
  info: noop,
})

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const { toasts, toast, removeToast } = useToast()
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  return useContext(ToastContext)
}
