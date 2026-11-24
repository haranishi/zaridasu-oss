import { useState, useCallback, useMemo } from 'react'

let idCounter = 0

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastActions {
  success: (msg: string, duration?: number) => number
  error: (msg: string, duration?: number) => number
  info: (msg: string, duration?: number) => number
}

interface UseToastResult {
  toasts: Toast[]
  toast: ToastActions
  removeToast: (id: number) => void
}

export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success', duration = 3000): number => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast: ToastActions = useMemo(() => ({
    success: (msg: string, duration?: number) => addToast(msg, 'success', duration),
    error:   (msg: string, duration?: number) => addToast(msg, 'error', duration ?? 5000),
    info:    (msg: string, duration?: number) => addToast(msg, 'info', duration),
  }), [addToast])

  return { toasts, toast, removeToast }
}
