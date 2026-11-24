'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase/client'
import { useToastContext } from '@/context/ToastContext'

const TIMEOUT_MS = 30 * 60 * 1000       // 30 minutes
const WARNING_MS = 25 * 60 * 1000       // 25 minutes (warn 5 min before timeout)
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const

/**
 * REQ-018C: Admin session timeout after 30 minutes of inactivity.
 * Shows a warning toast at 25 minutes.
 * Signs out and redirects to /admin/login after 30 minutes.
 */
export function useAdminSessionTimeout() {
  const router = useRouter()
  const { t } = useTranslation()
  const toast = useToastContext()
  const lastActivityRef = useRef(Date.now())
  const warningShownRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }, [router])

  const resetTimers = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningShownRef.current = false

    if (warningRef.current) {
      clearTimeout(warningRef.current)
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set warning at 25 minutes
    warningRef.current = setTimeout(() => {
      warningShownRef.current = true
      toast.info(t('admin.session.timeoutWarning'), 10000)
    }, WARNING_MS)

    // Set sign-out at 30 minutes
    timeoutRef.current = setTimeout(() => {
      handleSignOut()
    }, TIMEOUT_MS)
  }, [handleSignOut, toast, t])

  useEffect(() => {
    resetTimers()

    function onActivity() {
      // Throttle: only reset if at least 60 seconds since last reset
      if (Date.now() - lastActivityRef.current > 60_000) {
        resetTimers()
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true })
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity)
      }
      if (warningRef.current) clearTimeout(warningRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [resetTimers])
}
